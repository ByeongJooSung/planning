/**
 * Planning Studio 웹 서비스
 * - 회원가입·로그인 (세션 쿠키)
 * - 프로젝트별 멤버 권한 OWNER(운영자·생성자) / EDITOR(작업자) / VIEWER(열람자), 이메일 초대
 * - 프로젝트 편집: 서비스 코어 명령(execute)을 실행하고 저장소(파일 또는 Redis)에 차이만 저장
 * - AI 생성: 프로젝트·개인·서버 기본 설정으로 Anthropic 또는 OpenAI 호환(로컬 LLM) 호출. 키는 응답에 담지 않는다
 * - 같은 화면(뷰어)을 편집 모드로 제공
 *
 * 실행 형태: createLocalApp → planning serve (파일 저장소), src/server/vercel.ts → Vercel 함수 (Upstash Redis)
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { extractSegments, SUPPORTED_EXT, UnsupportedFormatError } from "../knowledge/extract.js";
import type { Segment } from "../knowledge/extract-text.js";
import { buildNewProject } from "../project/model-files.js";
import { SYSTEM_PRESETS } from "../project/presets.js";
import { ASSET_DIR, renderViewer } from "../render/viewer/index.js";
import { deriveProject, execute, type Command, type ProjectState } from "../service/core.js";
import { Accounts, atLeast, HttpError, ROLES, type AiResolved, type Role, type User } from "./accounts.js";
import { callAi, DEFAULT_ANTHROPIC_MODEL, listModels, type AiInputMessages } from "./ai.js";
import { newToken } from "./crypto.js";
import { FileKv, type Kv } from "./kv.js";
import { FsRepo, type ProjectRepo } from "./repo.js";

export interface AppOptions {
  kv: Kv;
  repo: ProjectRepo;
  /** AI 키 암호화 비밀값 */
  secret: string;
  /** 서버 기본 AI (프로젝트·개인 설정이 없을 때) */
  serverAi?: Omit<AiResolved, "source"> | null;
  /** 쿠키 Secure 속성 강제. 기본: X-Forwarded-Proto 가 https 이면 켠다 */
  secureCookie?: boolean;
  /** false면 초대받은 이메일만 가입 (첫 가입자 예외) */
  openSignup?: boolean;
  /** 한 번에 올릴 수 있는 참조자료 크기(MB). Vercel 함수는 요청 본문이 4.5MB까지다 */
  maxUploadMb?: number;
  /** 서비스 관리자 이메일 (PLANNING_ADMINS). 첫 가입자는 항상 관리자 */
  admins?: string[];
  /** 첫 요청 전에 한 번 실행 (샘플 프로젝트 넣기 등) */
  init?: () => Promise<void>;
  /** 테스트용 AI 호출 대체 */
  aiCaller?: typeof callAi;
  /** 테스트용 모델 목록 대체 */
  modelLister?: typeof listModels;
  now?: () => Date;
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const COOKIE = "ps_session";
const CODE = /^[A-Z][A-Z0-9_-]{1,19}$/;
const KV_PREFIX = { gens: "gens", reviews: "reviews" } as const;

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  user?: User;
  token?: string;
  body?: any;
}

export async function createApp(opts: AppOptions): Promise<{ handle: Handler; accounts: Accounts }> {
  const { kv, repo } = opts;
  const acc = new Accounts(kv, { secret: opts.secret, serverAi: opts.serverAi, now: opts.now, admins: opts.admins });
  const ai = opts.aiCaller ?? callAi;
  const models = opts.modelLister ?? listModels;
  const maxUploadMb = opts.maxUploadMb ?? 22;
  const bodyLimit = Math.ceil(maxUploadMb * 1.4 + 2) * 1024 * 1024; // base64 부풀림 + 여유
  const shell = await renderViewer({ generatedAt: new Date().toISOString(), projects: [], mode: "server" }, { title: "Planning Studio" });
  let ready: Promise<void> | null = null;
  // 설치형 앱(PWA): manifest · 서비스 워커 · 아이콘
  const manifest = JSON.stringify({
    name: "Planning Studio — 서비스 기획 산출물",
    short_name: "Planning Studio",
    description: "요구사항에서 기획안·정보구조도·다이어그램·화면설계서·프로토타입까지 프로젝트 단위로 만들고 함께 관리합니다.",
    lang: "ko",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    background_color: "#f3f5f8",
    theme_color: "#1f5e8c",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "전체 프로젝트", url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "내 계정 · AI 설정", url: "/account", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  });
  const sw = await readFile(path.join(ASSET_DIR, "sw.js"), "utf8");
  const icons = new Map<string, Buffer>();
  for (const f of ["icon.svg", "icon-maskable.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "favicon-32.png"]) icons.set(f, await readFile(path.join(ASSET_DIR, "icons", f)));

  /** 운영자가 없는 기존 프로젝트(CLI로 만든 것·샘플)는 첫 가입자에게 맡긴다 */
  async function claimOrphans(user: User) {
    for (const code of await repo.list()) if (!(await acc.hasOwner(code))) await acc.addMember(code, user.id, "OWNER");
  }

  async function need(c: Ctx, code: string, role: Role): Promise<Role> {
    if (!c.user) throw new HttpError(401, "로그인이 필요합니다");
    const r = await acc.roleOf(code, c.user.id);
    if (!r || !(await repo.exists(code))) throw new HttpError(404, "프로젝트가 없거나 권한이 없습니다");
    if (!atLeast(r, role)) throw new HttpError(403, role === "OWNER" ? "운영자만 할 수 있습니다" : "편집 권한이 없습니다 (열람자)");
    return r;
  }

  async function projectView(code: string, userId: string, full: boolean, state?: ProjectState) {
    const st = state ?? (await repo.load(code, full ? "last" : "none"));
    const v = deriveProject(st);
    const base = full ? v : { ...v, chunks: [], prompts: {}, gens: {} };
    return { ...base, role: await acc.roleOf(code, userId), ai: await acc.aiSource(code, userId) };
  }

  /** 명령 실행 → 저장. 실패하면 아무것도 저장하지 않는다 */
  async function run(code: string, cmd: Command, files?: { path: string; data: Buffer }[]) {
    return repo.lock(code, async () => {
      const prev = await repo.load(code, "last");
      let r;
      try {
        r = execute(prev, cmd, opts.now?.() ?? new Date());
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      await repo.save(code, prev, r.state, files);
      return { ...r, prev };
    });
  }

  const projectName = async (code: string) => {
    try {
      return (await repo.load(code, "none")).model.project.name;
    } catch {
      return code;
    }
  };

  // ── 라우트 ─────────────────────────────────────
  type Route = (c: Ctx, p: Record<string, string>) => Promise<unknown>;
  const routes: { method: string; re: RegExp; keys: string[]; fn: Route; auth: boolean }[] = [];
  const on = (method: string, pattern: string, fn: Route, auth = true) => {
    const keys: string[] = [];
    const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
    routes.push({ method, re, keys, fn, auth });
  };

  // 계정
  on("GET", "/api/config", async () => ({
    openSignup: opts.openSignup !== false,
    users: (await acc.userCount()) > 0,
    serverAi: acc.hasServerAi(),
    defaultModel: DEFAULT_ANTHROPIC_MODEL,
    presets: Object.keys(SYSTEM_PRESETS),
    roles: ROLES,
    uploadExt: SUPPORTED_EXT,
    maxUploadMb,
  }), false);
  on("POST", "/api/signup", async (c) => {
    const b = c.body ?? {};
    if (opts.openSignup === false && (await acc.userCount()) > 0 && !(await acc.invitesFor(b.email ?? "")).length) throw new HttpError(403, "초대받은 이메일만 가입할 수 있습니다");
    const { user, first } = await acc.signup(b);
    if (first) await claimOrphans(user);
    await startSession(c, user);
    return { user: acc.publicUser(user) };
  }, false);
  on("POST", "/api/login", async (c) => {
    await acc.loginAttempt(`${clientIp(c)}|${String(c.body?.email ?? "").toLowerCase()}`);
    const user = await acc.login(c.body?.email, c.body?.password);
    await startSession(c, user);
    return { user: acc.publicUser(user) };
  }, false);
  on("POST", "/api/logout", async (c) => {
    await acc.endSession(c.token);
    setCookie(c, "", 0);
    return { ok: true };
  }, false);
  on("GET", "/api/me", async (c) => {
    const invites = await acc.invitesFor(c.user!.email);
    return {
      user: { ...acc.publicUser(c.user!), isAdmin: await acc.isAdmin(c.user!) },
      ai: acc.aiSetPublic(await acc.aiSet("personal", c.user!.id), true),
      invites: await Promise.all(invites.map(async (i) => ({ ...i, projectName: await projectName(i.project) }))),
    };
  });
  on("POST", "/api/me/password", async (c) => (await acc.changePassword(c.user!.id, c.body?.current, c.body?.next), { ok: true }));
  // 개인 AI 연결 — 여러 개 저장, 기본 연결·모델 선택
  const mine = async (c: Ctx) => ({ ai: acc.aiSetPublic(await acc.aiSet("personal", c.user!.id), true) });
  on("PUT", "/api/me/ai/conns", async (c) => (await acc.saveConn("personal", c.user!.id, c.body ?? {}, c.user!.id), mine(c)));
  on("DELETE", "/api/me/ai/conns/:id", async (c, p) => (await acc.deleteConn("personal", c.user!.id, p.id!), mine(c)));
  on("PUT", "/api/me/ai/active", async (c) => (await acc.setActive("personal", c.user!.id, c.body ?? {}), mine(c)));
  on("POST", "/api/me/ai/models", async (c) => ({ models: await models(await acc.probeFor("personal", c.user!.id, c.body ?? {})) }));
  on("POST", "/api/me/ai/test", async (c) => testAi(c, null));

  // 서비스 관리자 — 회원 목록·정리
  const needAdmin = async (c: Ctx) => {
    if (!(await acc.isAdmin(c.user!))) throw new HttpError(403, "서비스 관리자만 할 수 있습니다");
  };
  on("GET", "/api/admin/users", async (c) => (await needAdmin(c), { users: await acc.listUsers(), me: c.user!.id }));
  on("DELETE", "/api/admin/users/:id", async (c, p) => {
    await needAdmin(c);
    if (p.id === c.user!.id) throw new HttpError(400, "자기 계정은 여기서 삭제할 수 없습니다");
    const target = await acc.getUser(p.id!);
    if (target && (await acc.isAdmin(target))) throw new HttpError(400, "서비스 관리자 계정은 삭제할 수 없습니다");
    return await acc.deleteUser(p.id!);
  });

  // 상태 — 함수 리전과 저장소 왕복 시간 (배포 리전 맞추기용, 비밀값 없음)
  on("GET", "/api/health", async () => {
    const t0 = Date.now();
    await kv.get("sys:ping");
    const t1 = Date.now();
    await kv.get("sys:ping");
    return { ok: true, region: process.env.VERCEL_REGION ?? "local", kvMs: [t1 - t0, Date.now() - t1] };
  }, false);

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
    const inv = await acc.inviteByToken(p.token!);
    if (!inv) throw new HttpError(404, "초대가 없거나 기한이 지났습니다");
    return { email: inv.email, role: inv.role, projectName: await projectName(inv.project), hasAccount: !!(await acc.findByEmail(inv.email)) };
  }, false);

  // 프로젝트
  on("GET", "/api/projects", async (c) => {
    const out = [];
    for (const code of await acc.projectsOf(c.user!.id)) if (await repo.exists(code)) out.push(await projectView(code, c.user!.id, false));
    return { projects: out };
  });
  on("POST", "/api/projects", async (c) => {
    const b = c.body ?? {};
    const code = String(b.code ?? "").trim().toUpperCase();
    if (!CODE.test(code)) throw new HttpError(400, "프로젝트 코드는 영문 대문자로 시작하는 2~20자 (영문 대문자·숫자·-·_) 입니다");
    if (!String(b.name ?? "").trim()) throw new HttpError(400, "프로젝트 이름을 입력하세요");
    let model;
    try {
      model = buildNewProject({
        code,
        name: String(b.name).trim(),
        serviceType: b.serviceType === "EXISTING" ? "EXISTING" : "NEW",
        changeScope: b.serviceType === "EXISTING" ? b.changeScope || null : null,
        submissionTemplate: b.submissionTemplate === "PUBLIC" ? "PUBLIC" : "GENERAL",
        preset: b.preset in SYSTEM_PRESETS ? b.preset : "none",
      });
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    try {
      await repo.create(model);
    } catch (e) {
      throw new HttpError(409, (e as Error).message);
    }
    await acc.addMember(code, c.user!.id, "OWNER");
    return { code };
  });
  on("GET", "/api/projects/:code", async (c, p) => {
    await need(c, p.code!, "VIEWER");
    return { project: await projectView(p.code!, c.user!.id, true) };
  });
  on("DELETE", "/api/projects/:code", async (c, p) => {
    await need(c, p.code!, "OWNER");
    if (c.body?.confirm !== p.code) throw new HttpError(400, "확인용으로 프로젝트 코드를 정확히 입력하세요");
    await repo.lock(p.code!, () => repo.remove(p.code!));
    await acc.dropProject(p.code!);
    await kv.del(`${KV_PREFIX.gens}:${p.code}`, `${KV_PREFIX.reviews}:${p.code}`);
    return { ok: true };
  });
  on("POST", "/api/projects/:code/commands", async (c, p) => {
    await need(c, p.code!, "EDITOR");
    const cmd = c.body?.cmd as Command;
    if (!cmd || typeof cmd.op !== "string") throw new HttpError(400, "명령이 없습니다");
    if (cmd.op === "kb.add") throw new HttpError(400, "참조자료는 업로드 API로 올립니다");
    const r = await run(p.code!, cmd);
    return { message: r.message, detail: r.detail, project: await projectView(p.code!, c.user!.id, true, r.state) };
  });
  on("POST", "/api/projects/:code/sources", async (c, p) => {
    await need(c, p.code!, "EDITOR");
    const files = (c.body?.files ?? []) as { name: string; data: string; title?: string }[];
    if (!Array.isArray(files) || !files.length) throw new HttpError(400, "올릴 파일이 없습니다");
    const messages: string[] = [];
    let state: ProjectState | undefined;
    for (const f of files) {
      const name = path.basename(String(f.name ?? "")).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
      if (!name) continue;
      const data = Buffer.from(String(f.data ?? ""), "base64");
      let segments: Segment[] | undefined, error: string | undefined, unsupported = false;
      try {
        segments = await extractSegments(name, data);
      } catch (e) {
        unsupported = e instanceof UnsupportedFormatError;
        error = (e as Error).message;
      }
      const cmd: Command = { op: "kb.add", fileName: name, title: f.title, size: data.length, sha256: createHash("sha256").update(data).digest("hex"), segments, error, unsupported };
      // 원본 경로는 명령 결과(새 참조자료 ID)로 정해진다
      const r = await repo.lock(p.code!, async () => {
        const prev = await repo.load(p.code!, "last");
        const res = execute(prev, cmd, opts.now?.() ?? new Date());
        const d = res.detail as { id: string; duplicateOf?: string };
        const src = res.state.model.sources.find((s) => s.id === d.id)!;
        await repo.save(p.code!, prev, res.state, d.duplicateOf ? [] : [{ path: src.location, data }]);
        return res;
      });
      messages.push(r.message);
      state = r.state;
    }
    return { message: messages.join("\n"), project: await projectView(p.code!, c.user!.id, true, state) };
  });

  // 생성 결과·디자인 댓글 (프로젝트 KV: 해시 gens:{코드}, reviews:{코드})
  on("GET", "/api/projects/:code/kv", async (c, p) => {
    await need(c, p.code!, "VIEWER");
    const parse = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, JSON.parse(v)]));
    return { gens: parse(await kv.hgetall(`${KV_PREFIX.gens}:${p.code}`)), reviews: parse(await kv.hgetall(`${KV_PREFIX.reviews}:${p.code}`)) };
  });
  on("PUT", "/api/projects/:code/kv/:coll/:id", async (c, p) => {
    const coll = p.coll as keyof typeof KV_PREFIX;
    if (!(coll in KV_PREFIX)) throw new HttpError(404, "없는 저장소입니다");
    await need(c, p.code!, coll === "gens" ? "EDITOR" : "VIEWER");
    const doc = c.body?.doc;
    if (!doc || typeof doc !== "object") throw new HttpError(400, "문서가 없습니다");
    const s = JSON.stringify(doc);
    if (s.length > 2_000_000) throw new HttpError(413, "문서가 너무 큽니다");
    await kv.hset(`${KV_PREFIX[coll]}:${p.code}`, p.id!, s);
    return { ok: true };
  });

  // AI 생성
  on("POST", "/api/projects/:code/generate", async (c, p) => {
    await need(c, p.code!, "EDITOR");
    const cfg = await acc.resolveAi(p.code!, c.user!.id);
    if (!cfg) throw new HttpError(409, "AI 설정이 없습니다. 프로젝트 운영자에게 프로젝트 AI 설정을 요청하거나, 내 계정의 AI 설정을 등록하세요");
    const ctl = new AbortController();
    c.res.on("close", () => {
      if (!c.res.writableEnded) ctl.abort();
    });
    const r = await ai(cfg, c.body?.input as AiInputMessages, { signal: ctl.signal });
    return { output: r.output, source: cfg.source, model: r.model };
  });

  // 멤버·초대 (운영자)
  on("GET", "/api/projects/:code/members", async (c, p) => {
    const role = await need(c, p.code!, "VIEWER");
    return {
      members: await acc.members(p.code!),
      invites: role === "OWNER" ? await acc.invitesOf(p.code!) : [],
      me: { role },
    };
  });
  on("POST", "/api/projects/:code/invites", async (c, p) => {
    await need(c, p.code!, "OWNER");
    const { invite, token } = await acc.invite(p.code!, c.body?.email, c.body?.role ?? "EDITOR", c.user!.id);
    return { invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt }, link: `${origin(c)}/invite/${token}` };
  });
  on("DELETE", "/api/projects/:code/invites/:id", async (c, p) => (await need(c, p.code!, "OWNER"), await acc.cancelInvite(p.code!, p.id!), { ok: true }));
  on("PATCH", "/api/projects/:code/members/:uid", async (c, p) => {
    if (p.uid === "me") {
      await need(c, p.code!, "VIEWER");
      await acc.setChoice(p.code!, c.user!.id, c.body?.aiChoice ?? null);
      return { ok: true, ai: await acc.aiSource(p.code!, c.user!.id) };
    }
    await need(c, p.code!, "OWNER");
    if (!ROLES.includes(c.body?.role)) throw new HttpError(400, "권한 값이 올바르지 않습니다");
    await acc.setRole(p.code!, p.uid!, c.body.role);
    return { ok: true };
  });
  on("DELETE", "/api/projects/:code/members/:uid", async (c, p) => {
    const self = p.uid === "me" || p.uid === c.user!.id;
    await need(c, p.code!, self ? "VIEWER" : "OWNER");
    await acc.removeMember(p.code!, self ? c.user!.id : p.uid!);
    return { ok: true };
  });

  // 프로젝트 AI 연결 — 운영자가 여러 개 저장하고 기본을 정한다. 멤버는 이름·종류·모델만 보고(주소·키 숨김) 골라 쓸 수 있다
  on("GET", "/api/projects/:code/ai", async (c, p) => {
    const role = await need(c, p.code!, "VIEWER");
    return {
      project: acc.aiSetPublic(await acc.aiSet("project", p.code!), role === "OWNER"),
      personal: acc.aiSetPublic(await acc.aiSet("personal", c.user!.id), true),
      choice: await acc.choiceOf(p.code!, c.user!.id),
      serverDefault: acc.hasServerAi(),
      effective: await acc.aiSource(p.code!, c.user!.id),
      canManage: role === "OWNER",
    };
  });
  const projAi = async (code: string) => ({ project: acc.aiSetPublic(await acc.aiSet("project", code), true) });
  on("PUT", "/api/projects/:code/ai/conns", async (c, p) => (await need(c, p.code!, "OWNER"), await acc.saveConn("project", p.code!, c.body ?? {}, c.user!.id), projAi(p.code!)));
  on("DELETE", "/api/projects/:code/ai/conns/:id", async (c, p) => (await need(c, p.code!, "OWNER"), await acc.deleteConn("project", p.code!, p.id!), projAi(p.code!)));
  on("PUT", "/api/projects/:code/ai/active", async (c, p) => (await need(c, p.code!, "OWNER"), await acc.setActive("project", p.code!, c.body ?? {}), projAi(p.code!)));
  on("POST", "/api/projects/:code/ai/models", async (c, p) => (await need(c, p.code!, "OWNER"), { models: await models(await acc.probeFor("project", p.code!, c.body ?? {})) }));
  on("POST", "/api/projects/:code/ai/test", async (c, p) => (await need(c, p.code!, "EDITOR"), testAi(c, p.code!)));

  /** 연결 확인 — body 에 {scope, conn, model} 이 있으면 그 조합을, 없으면 지금 쓰는 설정을 부른다 */
  async function testAi(c: Ctx, code: string | null) {
    const b = c.body ?? {};
    const pick = b.conn && b.model ? { scope: (b.scope === "project" ? "project" : "personal") as "project" | "personal", conn: String(b.conn), model: String(b.model) } : null;
    if (pick?.scope === "project" && !code) throw new HttpError(400, "프로젝트 연결은 프로젝트 화면에서 확인하세요");
    const cfg = await acc.resolveAi(code, c.user!.id, pick);
    if (!cfg) throw new HttpError(409, "AI 설정이 없습니다");
    const t0 = Date.now();
    const r = await ai(cfg, '연결 확인입니다. {"ok":true} 만 답하세요.', { json: true });
    return { ok: true, source: cfg.source, provider: cfg.provider, model: cfg.model, label: cfg.label ?? "", ms: Date.now() - t0, reply: JSON.stringify(r.output).slice(0, 80) };
  }

  // ── 세션·쿠키·요청 처리 ─────────────────────────
  async function startSession(c: Ctx, user: User) {
    setCookie(c, await acc.createSession(user.id), 30 * 86400);
  }
  function setCookie(c: Ctx, value: string, maxAge: number) {
    const secure = opts.secureCookie ?? c.req.headers["x-forwarded-proto"] === "https";
    c.res.setHeader("Set-Cookie", `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`);
  }
  function clientIp(c: Ctx) {
    return String(c.req.headers["x-forwarded-for"] ?? "").split(",")[0]!.trim() || c.req.socket?.remoteAddress || "";
  }
  function origin(c: Ctx) {
    const proto = (c.req.headers["x-forwarded-proto"] as string) ?? "http";
    const host = (c.req.headers["x-forwarded-host"] as string) ?? c.req.headers.host;
    return process.env.PUBLIC_URL?.replace(/\/$/, "") || `${proto}://${host}`;
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://x");
    const c: Ctx = { req, res, url };
    try {
      if (!url.pathname.startsWith("/api/")) {
        if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "허용되지 않는 요청");
        if (url.pathname === "/healthz") return send(res, 200, "ok", "text/plain");
        if (url.pathname === "/manifest.webmanifest") return send(res, 200, manifest, "application/manifest+json; charset=utf-8", "public, max-age=3600");
        if (url.pathname === "/sw.js") return send(res, 200, sw, "text/javascript; charset=utf-8", "no-cache");
        if (url.pathname === "/favicon.ico") return sendBuf(res, icons.get("favicon-32.png")!, "image/png");
        const icon = url.pathname.startsWith("/icons/") ? icons.get(url.pathname.slice(7)) : undefined;
        if (icon) return sendBuf(res, icon, url.pathname.endsWith(".svg") ? "image/svg+xml" : "image/png");
        if (url.pathname === "/" || url.pathname === "/account" || url.pathname === "/admin" || url.pathname.startsWith("/invite/") || url.pathname.startsWith("/p/")) return send(res, 200, shell, "text/html; charset=utf-8");
        throw new HttpError(404, "없는 페이지입니다");
      }
      if (opts.init) ready ??= opts.init().catch((e) => {
        ready = null;
        throw e;
      });
      await ready;
      const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!route) throw new HttpError(404, "없는 API입니다");
      // 다른 사이트에서 보낸 요청 차단: 쓰기 요청은 이 앱만 붙이는 헤더가 있어야 한다
      if (req.method !== "GET" && req.headers["x-planning"] !== "1") throw new HttpError(403, "잘못된 요청 출처");
      c.token = parseCookie(req.headers.cookie)[COOKIE];
      c.user = await acc.sessionUser(c.token);
      if (route.auth && !c.user) throw new HttpError(401, "로그인이 필요합니다");
      if (req.method !== "GET") c.body = await readBody(req, bodyLimit);
      const m = url.pathname.match(route.re)!;
      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
      const out = await route.fn(c, params);
      send(res, 200, JSON.stringify(out ?? {}), "application/json; charset=utf-8");
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (res.headersSent) return void res.end();
      send(res, status, JSON.stringify({ error: status === 500 ? "서버 오류가 났습니다" : (e as Error).message }), "application/json; charset=utf-8");
    }
  }

  return { handle, accounts: acc };
}

/** planning serve — 파일 저장소 + 파일 KV (<root>/.service/) */
export async function createLocalApp(o: Omit<AppOptions, "kv" | "repo" | "secret"> & { root: string; secret?: string }) {
  const root = path.resolve(o.root);
  const dir = path.join(root, ".service");
  await mkdir(dir, { recursive: true });
  let secret = o.secret;
  if (!secret) {
    const kf = path.join(dir, "secret.key");
    if (!existsSync(kf)) {
      await writeFile(kf, newToken(), { mode: 0o600 });
      await chmod(kf, 0o600);
    }
    secret = (await readFile(kf, "utf8")).trim();
  }
  const kv = await FileKv.open(path.join(dir, "kv.json"));
  const app = await createApp({ ...o, kv, repo: new FsRepo(root), secret });
  const server = createServer((req, res) => void app.handle(req, res));
  server.requestTimeout = 0; // AI 생성은 몇 분 걸릴 수 있다
  server.headersTimeout = 60_000;
  return { ...app, server, root };
}

function sendBuf(res: ServerResponse, body: Buffer, type: string) {
  res.writeHead(200, { "content-type": type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" });
  res.end(body);
}

function send(res: ServerResponse, status: number, body: string, type: string, cache = "no-store") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": cache,
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

function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
  // Vercel 런타임은 본문을 미리 읽어 req.body 로 줄 수 있다 (읽는 순간 파싱 — 형식이 틀리면 예외)
  let pre: unknown;
  try {
    pre = (req as IncomingMessage & { body?: unknown }).body;
  } catch {
    return Promise.reject(new HttpError(400, "JSON 형식이 아닙니다"));
  }
  if (pre != null) {
    if (Buffer.isBuffer(pre) || typeof pre === "string") {
      const text = pre.toString();
      if (text.length > limit) return Promise.reject(new HttpError(413, "요청이 너무 큽니다"));
      try {
        return Promise.resolve(text ? JSON.parse(text) : {});
      } catch {
        return Promise.reject(new HttpError(400, "JSON 형식이 아닙니다"));
      }
    }
    return Promise.resolve(pre);
  }
  if (req.readableEnded) return Promise.resolve({});
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (d: Buffer) => {
      size += d.length;
      if (size > limit) {
        reject(new HttpError(413, `요청이 너무 큽니다 (${Math.floor(limit / 1024 / 1024)}MB 이하)`));
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
