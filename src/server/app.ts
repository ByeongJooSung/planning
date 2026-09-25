/**
 * Planning Studio 웹 서비스 (`planning serve`)
 * - 회원가입·로그인 (세션 쿠키)
 * - 프로젝트별 멤버 권한 OWNER(운영자·생성자) / EDITOR(작업자) / VIEWER(열람자), 이메일 초대
 * - 프로젝트 편집: 서비스 코어 명령(execute)을 서버에서 실행하고 파일 저장소에 저장
 * - AI 생성: 프로젝트·개인·서버 기본 설정으로 Anthropic 또는 OpenAI 호환(로컬 LLM) 호출. 키는 응답에 담지 않는다
 * - 같은 화면(뷰어)을 편집 모드로 제공
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { addKnowledgeFile, removeKnowledgeFile } from "../knowledge/store.js";
import { SUPPORTED_EXT } from "../knowledge/extract.js";
import { createProject, loadModel, projectDir, saveModel } from "../project/store.js";
import { SYSTEM_PRESETS } from "../project/presets.js";
import { collectViewerProject, renderViewer } from "../render/viewer/index.js";
import { execute, type Command } from "../service/core.js";
import { takeSnapshot } from "../version/snapshot.js";
import { Accounts, atLeast, HttpError, ROLES, type AccountsOptions, type Role, type User } from "./accounts.js";
import { callAi, DEFAULT_ANTHROPIC_MODEL, type AiInputMessages } from "./ai.js";

export interface ServeOptions extends AccountsOptions {
  root: string;
  /** 쿠키 Secure 속성 강제 (HTTPS 뒤에서). 기본: X-Forwarded-Proto 가 https 이면 켠다 */
  secureCookie?: boolean;
  /** false면 새 회원가입을 막는다 (초대받은 이메일은 가입 가능) */
  openSignup?: boolean;
  /** 테스트용 AI 호출 대체 */
  aiCaller?: typeof callAi;
}

const COOKIE = "ps_session";
const CODE = /^[A-Z][A-Z0-9_-]{1,19}$/;
const JSON_LIMIT = 30 * 1024 * 1024;

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  user?: User;
  token?: string;
  body?: any;
}

export async function createApp(opts: ServeOptions) {
  const root = path.resolve(opts.root);
  await mkdir(root, { recursive: true });
  const acc = new Accounts(root, opts);
  await acc.init();
  const ai = opts.aiCaller ?? callAi;
  const locks = new Map<string, Promise<unknown>>();
  const shell = await renderViewer({ generatedAt: new Date().toISOString(), projects: [], mode: "server" }, { title: "Planning Studio" });

  /** 프로젝트마다 쓰기를 한 줄로 세운다 */
  function lock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(code) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(code, next.catch(() => undefined));
    return next;
  }

  async function projectCodes(): Promise<string[]> {
    const out: string[] = [];
    for (const d of await readdir(root, { withFileTypes: true })) if (d.isDirectory() && !d.name.startsWith(".") && existsSync(path.join(root, d.name, "project.json"))) out.push(d.name);
    return out.sort();
  }

  /** 운영자가 없는 기존 프로젝트(CLI로 만든 것 등)는 첫 가입자에게 맡긴다 */
  async function claimOrphans(user: User) {
    for (const code of await projectCodes()) if (!acc.hasOwner(code)) await acc.addMember(code, user.id, "OWNER");
  }

  function need(c: Ctx, code: string, role: Role): Role {
    if (!c.user) throw new HttpError(401, "로그인이 필요합니다");
    const r = acc.roleOf(code, c.user.id);
    if (!r || !existsSync(path.join(root, code, "project.json"))) throw new HttpError(404, "프로젝트가 없거나 권한이 없습니다");
    if (!atLeast(r, role)) throw new HttpError(403, role === "OWNER" ? "운영자만 할 수 있습니다" : "편집 권한이 없습니다 (열람자)");
    return r;
  }

  async function projectView(code: string, userId: string, full: boolean) {
    const v = await collectViewerProject(projectDir(root, code));
    const role = acc.roleOf(code, userId);
    const base = full ? v : { ...v, chunks: [], prompts: {}, gens: {} };
    return { ...base, role, ai: acc.aiSource(code, userId) };
  }

  function kvFile(code: string) {
    return path.join(acc.dir, "kv", `${code}.json`);
  }
  async function readKv(code: string): Promise<{ gens: Record<string, unknown>; reviews: Record<string, unknown> }> {
    const f = kvFile(code);
    return existsSync(f) ? JSON.parse(await readFile(f, "utf8")) : { gens: {}, reviews: {} };
  }

  // ── 라우트 ─────────────────────────────────────
  type Handler = (c: Ctx, p: Record<string, string>) => Promise<unknown>;
  const routes: { method: string; re: RegExp; keys: string[]; fn: Handler; auth: boolean }[] = [];
  const on = (method: string, pattern: string, fn: Handler, auth = true) => {
    const keys: string[] = [];
    const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
    routes.push({ method, re, keys, fn, auth });
  };

  // 계정
  on("GET", "/api/config", async () => ({ openSignup: opts.openSignup !== false, users: acc.userCount() > 0, serverAi: acc.hasServerAi(), defaultModel: DEFAULT_ANTHROPIC_MODEL, presets: Object.keys(SYSTEM_PRESETS), roles: ROLES, uploadExt: SUPPORTED_EXT }), false);
  on("POST", "/api/signup", async (c) => {
    const b = c.body ?? {};
    const invited = acc.invitesFor(b.email ?? "").length > 0;
    if (opts.openSignup === false && acc.userCount() > 0 && !invited) throw new HttpError(403, "초대받은 이메일만 가입할 수 있습니다");
    const first = acc.userCount() === 0;
    const user = await acc.signup(b);
    if (first) await claimOrphans(user);
    await startSession(c, user);
    return { user: acc.publicUser(user) };
  }, false);
  on("POST", "/api/login", async (c) => {
    limitLogin(c);
    const user = acc.login(c.body?.email, c.body?.password);
    await startSession(c, user);
    return { user: acc.publicUser(user) };
  }, false);
  on("POST", "/api/logout", async (c) => {
    await acc.endSession(c.token);
    setCookie(c, "", 0);
    return { ok: true };
  }, false);
  on("GET", "/api/me", async (c) => ({
    user: acc.publicUser(c.user!),
    ai: acc.aiPublic(acc.userAi(c.user!.id), true),
    invites: acc.invitesFor(c.user!.email).map((i) => ({ ...i, projectName: projectName(i.project) })),
  }));
  on("POST", "/api/me/password", async (c) => (await acc.changePassword(c.user!.id, c.body?.current, c.body?.next), { ok: true }));
  on("PUT", "/api/me/ai", async (c) => (await acc.setUserAi(c.user!.id, c.body ?? {}), { ai: acc.aiPublic(acc.userAi(c.user!.id), true) }));
  on("DELETE", "/api/me/ai", async (c) => (await acc.clearUserAi(c.user!.id), { ai: null }));
  on("POST", "/api/me/ai/test", async (c) => testAi(c, null));

  // 초대
  on("POST", "/api/invites/:id/accept", async (c, p) => {
    const inv = await acc.accept(c.user!, { id: p.id });
    return { project: inv.project, role: inv.role };
  });
  on("POST", "/api/invites/:id/decline", async (c, p) => (await acc.declineInvite(c.user!, p.id!), { ok: true }));
  on("POST", "/api/invite-links/:token/accept", async (c, p) => {
    const inv = await acc.accept(c.user!, { token: p.token });
    return { project: inv.project, role: inv.role };
  });
  on("GET", "/api/invite-links/:token", async (_c, p) => {
    const inv = acc.inviteByToken(p.token!);
    if (!inv) throw new HttpError(404, "초대가 없거나 기한이 지났습니다");
    return { email: inv.email, role: inv.role, projectName: projectName(inv.project), hasAccount: !!acc.findByEmail(inv.email) };
  }, false);

  // 프로젝트
  on("GET", "/api/projects", async (c) => {
    const mine = acc.projectsOf(c.user!.id);
    const out = [];
    for (const m of mine) if (existsSync(path.join(root, m.project, "project.json"))) out.push(await projectView(m.project, c.user!.id, false));
    return { projects: out };
  });
  on("POST", "/api/projects", async (c) => {
    const b = c.body ?? {};
    const code = String(b.code ?? "").trim().toUpperCase();
    if (!CODE.test(code)) throw new HttpError(400, "프로젝트 코드는 영문 대문자로 시작하는 2~20자 (영문 대문자·숫자·-·_) 입니다");
    if (existsSync(path.join(root, code))) throw new HttpError(409, `이미 있는 프로젝트 코드입니다: ${code}`);
    if (!String(b.name ?? "").trim()) throw new HttpError(400, "프로젝트 이름을 입력하세요");
    await lock(code, async () => {
      try {
        await createProject(root, {
          code,
          name: String(b.name).trim(),
          serviceType: b.serviceType === "EXISTING" ? "EXISTING" : "NEW",
          changeScope: b.serviceType === "EXISTING" ? b.changeScope : null,
          submissionTemplate: b.submissionTemplate === "PUBLIC" ? "PUBLIC" : "GENERAL",
          preset: b.preset in SYSTEM_PRESETS ? b.preset : "none",
        });
      } catch (e) {
        await rm(path.join(root, code), { recursive: true, force: true });
        throw new HttpError(400, (e as Error).message);
      }
    });
    await acc.addMember(code, c.user!.id, "OWNER");
    return { code };
  });
  on("GET", "/api/projects/:code", async (c, p) => {
    need(c, p.code!, "VIEWER");
    return { project: await projectView(p.code!, c.user!.id, true) };
  });
  on("DELETE", "/api/projects/:code", async (c, p) => {
    need(c, p.code!, "OWNER");
    if (c.body?.confirm !== p.code) throw new HttpError(400, "확인용으로 프로젝트 코드를 정확히 입력하세요");
    await lock(p.code!, async () => {
      const trash = path.join(acc.dir, "trash");
      await mkdir(trash, { recursive: true });
      await rename(path.join(root, p.code!), path.join(trash, `${p.code}-${Date.now()}`));
    });
    await acc.dropProject(p.code!);
    return { ok: true };
  });
  on("POST", "/api/projects/:code/commands", async (c, p) => {
    need(c, p.code!, "EDITOR");
    const cmd = c.body?.cmd as Command;
    if (!cmd || typeof cmd.op !== "string") throw new HttpError(400, "명령이 없습니다");
    if (cmd.op === "kb.add") throw new HttpError(400, "참조자료는 업로드 API로 올립니다");
    const dir = projectDir(root, p.code!);
    const result = await lock(p.code!, async () => {
      const model = await loadModel(dir);
      if (cmd.op === "snapshot") {
        const meta = await takeSnapshot(dir, model, { note: cmd.note, major: cmd.major });
        return { message: `v${meta.version} 스냅샷을 찍었습니다 · 작업 버전 v${model.project.version}` };
      }
      if (cmd.op === "kb.rm") {
        await removeKnowledgeFile(dir, model, cmd.sourceId);
        await saveModel(dir, model);
        return { message: `${cmd.sourceId}를 삭제했습니다` };
      }
      let r;
      try {
        r = execute({ model, chunks: [], snapshots: [] }, cmd);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      await saveModel(dir, r.state.model);
      return { message: r.message, detail: r.detail };
    });
    return { ...result, project: await projectView(p.code!, c.user!.id, true) };
  });
  on("POST", "/api/projects/:code/sources", async (c, p) => {
    need(c, p.code!, "EDITOR");
    const files = (c.body?.files ?? []) as { name: string; data: string; title?: string }[];
    if (!Array.isArray(files) || !files.length) throw new HttpError(400, "올릴 파일이 없습니다");
    const dir = projectDir(root, p.code!);
    const messages: string[] = [];
    await lock(p.code!, async () => {
      const tmp = await mkdtemp(path.join(os.tmpdir(), "planning-up-"));
      try {
        const model = await loadModel(dir);
        for (const f of files) {
          const name = path.basename(String(f.name ?? "")).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
          if (!name) continue;
          const fp = path.join(tmp, name);
          await writeFile(fp, Buffer.from(String(f.data ?? ""), "base64"));
          const r = await addKnowledgeFile(dir, model, fp, { title: f.title });
          const s = r.source;
          messages.push(r.duplicateOf ? `${name}: 이미 올린 자료 (${r.duplicateOf})` : `${s.id} ${s.title}: ${s.index?.status === "INDEXED" ? `조각 ${s.index.chunks}개 색인` : s.index?.message ?? "보관만 함"}`);
        }
        await saveModel(dir, model);
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
    return { message: messages.join("\n"), project: await projectView(p.code!, c.user!.id, true) };
  });

  // 생성 결과·디자인 댓글 (프로젝트 KV)
  on("GET", "/api/projects/:code/kv", async (c, p) => (need(c, p.code!, "VIEWER"), readKv(p.code!)));
  on("PUT", "/api/projects/:code/kv/:coll/:id", async (c, p) => {
    const coll = p.coll!;
    if (coll !== "gens" && coll !== "reviews") throw new HttpError(404, "없는 저장소입니다");
    need(c, p.code!, coll === "gens" ? "EDITOR" : "VIEWER");
    const doc = c.body?.doc;
    if (!doc || typeof doc !== "object") throw new HttpError(400, "문서가 없습니다");
    if (JSON.stringify(doc).length > 2_000_000) throw new HttpError(413, "문서가 너무 큽니다");
    await lock(`kv:${p.code}`, async () => {
      const kv = await readKv(p.code!);
      kv[coll][decodeURIComponent(p.id!)] = doc;
      await mkdir(path.dirname(kvFile(p.code!)), { recursive: true });
      await writeFile(kvFile(p.code!), JSON.stringify(kv));
    });
    return { ok: true };
  });

  // AI 생성
  on("POST", "/api/projects/:code/generate", async (c, p) => {
    need(c, p.code!, "EDITOR");
    const cfg = acc.resolveAi(p.code!, c.user!.id);
    if (!cfg) throw new HttpError(409, "AI 설정이 없습니다. 프로젝트 운영자에게 프로젝트 AI 설정을 요청하거나, 내 계정의 AI 설정을 등록하세요");
    const ctl = new AbortController();
    c.res.on("close", () => { if (!c.res.writableEnded) ctl.abort(); });
    const r = await ai(cfg, c.body?.input as AiInputMessages, { signal: ctl.signal });
    return { output: r.output, source: cfg.source, model: r.model };
  });

  // 멤버·초대 (운영자)
  on("GET", "/api/projects/:code/members", async (c, p) => {
    const role = need(c, p.code!, "VIEWER");
    return { members: acc.members(p.code!), invites: role === "OWNER" ? acc.invitesOf(p.code!) : [], me: { role, usePersonalAi: acc.membership(p.code!, c.user!.id)?.usePersonalAi ?? false } };
  });
  on("POST", "/api/projects/:code/invites", async (c, p) => {
    need(c, p.code!, "OWNER");
    const { invite, token } = await acc.invite(p.code!, c.body?.email, c.body?.role ?? "EDITOR", c.user!.id);
    return { invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt }, link: `${origin(c)}/invite/${token}` };
  });
  on("DELETE", "/api/projects/:code/invites/:id", async (c, p) => (need(c, p.code!, "OWNER"), await acc.cancelInvite(p.code!, p.id!), { ok: true }));
  on("PATCH", "/api/projects/:code/members/:uid", async (c, p) => {
    if (p.uid === "me") {
      need(c, p.code!, "VIEWER");
      await acc.setUsePersonalAi(p.code!, c.user!.id, !!c.body?.usePersonalAi);
      return { ok: true, ai: acc.aiSource(p.code!, c.user!.id) };
    }
    need(c, p.code!, "OWNER");
    if (!ROLES.includes(c.body?.role)) throw new HttpError(400, "권한 값이 올바르지 않습니다");
    await acc.setRole(p.code!, p.uid!, c.body.role);
    return { ok: true };
  });
  on("DELETE", "/api/projects/:code/members/:uid", async (c, p) => {
    const self = p.uid === "me" || p.uid === c.user!.id;
    need(c, p.code!, self ? "VIEWER" : "OWNER");
    await acc.removeMember(p.code!, self ? c.user!.id : p.uid!);
    return { ok: true };
  });

  // 프로젝트 AI 설정 — 운영자만 보고 바꾼다. 다른 멤버에게는 종류·모델만 보인다 (키·주소 숨김)
  on("GET", "/api/projects/:code/ai", async (c, p) => {
    const role = need(c, p.code!, "VIEWER");
    return {
      project: acc.aiPublic(acc.projectAi(p.code!), role === "OWNER"),
      personal: acc.aiPublic(acc.userAi(c.user!.id), true),
      serverDefault: acc.hasServerAi(),
      usePersonalAi: acc.membership(p.code!, c.user!.id)?.usePersonalAi ?? false,
      effective: acc.aiSource(p.code!, c.user!.id),
      canManage: role === "OWNER",
    };
  });
  on("PUT", "/api/projects/:code/ai", async (c, p) => {
    need(c, p.code!, "OWNER");
    await acc.setProjectAi(p.code!, c.body ?? {}, c.user!.id);
    return { project: acc.aiPublic(acc.projectAi(p.code!), true) };
  });
  on("DELETE", "/api/projects/:code/ai", async (c, p) => (need(c, p.code!, "OWNER"), await acc.clearProjectAi(p.code!), { project: null }));
  on("POST", "/api/projects/:code/ai/test", async (c, p) => (need(c, p.code!, "EDITOR"), testAi(c, p.code!)));

  async function testAi(c: Ctx, code: string | null) {
    const cfg = code && c.body?.scope !== "personal" ? acc.resolveAi(code, c.user!.id) : acc.resolveAi(null, c.user!.id);
    if (!cfg) throw new HttpError(409, "AI 설정이 없습니다");
    const t0 = Date.now();
    const r = await ai(cfg, '연결 확인입니다. {"ok":true} 만 답하세요.', { json: true });
    return { ok: true, source: cfg.source, provider: cfg.provider, model: cfg.model, ms: Date.now() - t0, reply: JSON.stringify(r.output).slice(0, 80) };
  }

  function projectName(code: string) {
    try {
      const f = path.join(root, code, "project.json");
      return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as { name: string }).name : code;
    } catch {
      return code;
    }
  }

  // ── 세션·쿠키·요청 처리 ─────────────────────────
  async function startSession(c: Ctx, user: User) {
    const token = await acc.createSession(user.id);
    setCookie(c, token, 30 * 86400);
  }
  function setCookie(c: Ctx, value: string, maxAge: number) {
    const secure = opts.secureCookie ?? c.req.headers["x-forwarded-proto"] === "https";
    c.res.setHeader("Set-Cookie", `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`);
  }
  const attempts = new Map<string, { n: number; at: number }>();
  function limitLogin(c: Ctx) {
    const k = `${c.req.socket.remoteAddress}|${String(c.body?.email ?? "").toLowerCase()}`;
    const now = Date.now();
    const a = attempts.get(k);
    if (a && now - a.at < 15 * 60_000) {
      if (a.n >= 10) throw new HttpError(429, "로그인 시도가 많습니다. 15분 뒤 다시 시도하세요");
      a.n++;
    } else attempts.set(k, { n: 1, at: now });
  }
  function origin(c: Ctx) {
    const proto = (c.req.headers["x-forwarded-proto"] as string) ?? "http";
    return process.env.PUBLIC_URL?.replace(/\/$/, "") || `${proto}://${c.req.headers.host}`;
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://x");
    const c: Ctx = { req, res, url };
    try {
      if (!url.pathname.startsWith("/api/")) {
        if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "허용되지 않는 요청");
        if (url.pathname === "/healthz") return send(res, 200, "ok", "text/plain");
        if (url.pathname === "/" || url.pathname.startsWith("/invite/") || url.pathname.startsWith("/p/")) return send(res, 200, shell, "text/html; charset=utf-8");
        throw new HttpError(404, "없는 페이지입니다");
      }
      const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!route) throw new HttpError(404, "없는 API입니다");
      // 다른 사이트에서 보낸 요청 차단: 쓰기 요청은 이 앱만 붙이는 헤더가 있어야 한다
      if (req.method !== "GET" && req.headers["x-planning"] !== "1") throw new HttpError(403, "잘못된 요청 출처");
      c.token = parseCookie(req.headers.cookie)[COOKIE];
      c.user = acc.sessionUser(c.token);
      if (route.auth && !c.user) throw new HttpError(401, "로그인이 필요합니다");
      if (req.method !== "GET") c.body = await readBody(req);
      const m = url.pathname.match(route.re)!;
      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
      const out = await route.fn(c, params);
      send(res, 200, JSON.stringify(out ?? {}), "application/json; charset=utf-8");
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (res.headersSent) return res.end();
      send(res, status, JSON.stringify({ error: status === 500 ? "서버 오류가 났습니다" : (e as Error).message }), "application/json; charset=utf-8");
    }
  }

  const server: Server = createServer((req, res) => void handle(req, res));
  server.requestTimeout = 0; // AI 생성은 몇 분 걸릴 수 있다
  server.headersTimeout = 60_000;
  return { server, accounts: acc, root };
}

function send(res: ServerResponse, status: number, body: string, type: string) {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
    "x-frame-options": "DENY",
  });
  res.end(body);
}

function parseCookie(h: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (h ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (d: Buffer) => {
      size += d.length;
      if (size > JSON_LIMIT) {
        reject(new HttpError(413, "요청이 너무 큽니다 (30MB 이하)"));
        req.destroy();
      } else chunks.push(d);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "JSON 형식이 아닙니다"));
      }
    });
    req.on("error", reject);
  });
}
