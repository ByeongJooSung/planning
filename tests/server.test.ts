import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { createApp, createLocalApp } from "../src/server/app.js";
import { parseAiSet, type AiProbe, type AiResolved } from "../src/server/accounts.js";
import { FileKv } from "../src/server/kv.js";
import { KvRepo } from "../src/server/repo.js";

const MODES = ["local", "serverless"] as const;
describe.each(MODES)("웹 서비스 (%s)", (mode) => {
let base = "";
let root = "";
let close: () => void;
const calls: AiResolved[] = [];
const probes: AiProbe[] = [];
const storeFile = () => path.join(root, ".service", mode === "local" ? "kv.json" : "kv-serverless.json");

class Client {
  cookie = "";
  async req(method: string, url: string, body?: unknown) {
    const res = await fetch(base + url, {
      method,
      headers: { "content-type": "application/json", "x-planning": "1", ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0]!;
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, raw: text };
  }
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "planning-srv-"));
  const modelProber = async (p: AiProbe) => {
    probes.push(p);
    return { ok: true, models: ["m-a", "m-b"], url: `${p.baseUrl}/models`, ms: 1 };
  };
  const aiCaller = async (cfg: AiResolved) => {
    calls.push(cfg);
    return { text: "{}", output: { ok: true, provider: cfg.provider }, model: cfg.model };
  };
  let server;
  if (mode === "local") server = (await createLocalApp({ root, secret: "test-secret", aiCaller, modelProber, version: "v-test", eventsWindowMs: 300 })).server;
  else {
    const kv = await FileKv.open(storeFile());
    const app = await createApp({ kv, repo: new KvRepo(kv), secret: "test-secret-serverless", aiCaller, modelProber, version: "v-test", eventsWindowMs: 300 });
    server = createServer((req, res) => void app.handle(req, res));
  }
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(async () => {
  close();
  await rm(root, { recursive: true, force: true });
});

describe("시나리오", () => {
  const owner = new Client();
  const editor = new Client();
  const viewer = new Client();
  const stranger = new Client();

  it("가입·로그인·세션", async () => {
    expect((await owner.req("GET", "/api/me")).status).toBe(401);
    expect((await owner.req("POST", "/api/signup", { email: "Owner@Example.com", name: "운영자", password: "short" })).status).toBe(400);
    const r = await owner.req("POST", "/api/signup", { email: "Owner@Example.com", name: "운영자", password: "password-1" });
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe("owner@example.com");
    expect((await owner.req("GET", "/api/me")).body.user.name).toBe("운영자");
    expect((await new Client().req("POST", "/api/signup", { email: "owner@example.com", name: "x", password: "password-1" })).status).toBe(409);
    const bad = await new Client().req("POST", "/api/login", { email: "owner@example.com", password: "wrong-pass" });
    expect(bad.status).toBe(401);
    for (const c of [editor, viewer, stranger]) {
      const n = c === editor ? "editor" : c === viewer ? "viewer" : "stranger";
      expect((await c.req("POST", "/api/signup", { email: `${n}@example.com`, name: n, password: "password-1" })).status).toBe(200);
    }
  });

  it("쓰기 요청은 앱 헤더가 있어야 한다 (다른 사이트 요청 차단)", async () => {
    const res = await fetch(base + "/api/projects", { method: "POST", headers: { cookie: owner.cookie, "content-type": "application/json" }, body: JSON.stringify({ code: "X1", name: "x" }) });
    expect(res.status).toBe(403);
  });

  it("프로젝트를 만든 사람이 운영자가 된다", async () => {
    const r = await owner.req("POST", "/api/projects", { code: "pubinfo", name: "정보공개", serviceType: "NEW", preset: "public-civil" });
    expect(r.status).toBe(200);
    expect(r.body.code).toBe("PUBINFO");
    const list = await owner.req("GET", "/api/projects");
    expect(list.body.projects[0].role).toBe("OWNER");
    expect(list.body.projects[0].model.systems.length).toBeGreaterThan(0);
    expect((await stranger.req("GET", "/api/projects/PUBINFO")).status).toBe(404);
    expect((await stranger.req("GET", "/api/projects")).body.projects).toEqual([]);
  });

  it("초대 → 수락 → 권한별 동작", async () => {
    const inv = await owner.req("POST", "/api/projects/PUBINFO/invites", { email: "editor@example.com", role: "EDITOR" });
    expect(inv.status).toBe(200);
    expect(inv.body.link).toMatch(/\/invite\//);
    const token = inv.body.link.split("/invite/")[1];
    // 다른 계정은 이 링크로 들어올 수 없다
    expect((await stranger.req("POST", `/api/invite-links/${token}/accept`)).status).toBe(403);
    expect((await editor.req("POST", `/api/invite-links/${token}/accept`)).body).toEqual({ project: "PUBINFO", role: "EDITOR" });

    const inv2 = await owner.req("POST", "/api/projects/PUBINFO/invites", { email: "viewer@example.com", role: "VIEWER" });
    expect(inv2.status).toBe(200);
    const me = await viewer.req("GET", "/api/me");
    expect(me.body.invites).toHaveLength(1);
    expect((await viewer.req("POST", `/api/invites/${me.body.invites[0].id}/accept`)).status).toBe(200);

    // 작업자는 편집, 열람자는 보기만
    const add = await editor.req("POST", "/api/projects/PUBINFO/commands", { cmd: { op: "req.add", input: { title: "정보공개 청구", description: "민원인이 신청하면 심사자가 승인·반려하고 공개한다" }, autoTasks: true } });
    expect(add.status).toBe(200);
    expect(add.body.message).toMatch(/REQ-001/);
    expect(add.body.project.model.requirements[0].tasks.length).toBeGreaterThan(0);
    expect((await viewer.req("POST", "/api/projects/PUBINFO/commands", { cmd: { op: "req.add", input: { title: "x" } } })).status).toBe(403);
    expect((await viewer.req("GET", "/api/projects/PUBINFO")).body.project.role).toBe("VIEWER");
    // 초대·권한 변경은 운영자만
    expect((await editor.req("POST", "/api/projects/PUBINFO/invites", { email: "a@b.cd", role: "EDITOR" })).status).toBe(403);
    const members = await owner.req("GET", "/api/projects/PUBINFO/members");
    expect(members.body.members.map((m: { role: string }) => m.role)).toEqual(["OWNER", "EDITOR", "VIEWER"]);
    // 마지막 운영자는 권한을 낮출 수 없다
    const ownerId = members.body.members[0].userId;
    expect((await owner.req("PATCH", `/api/projects/PUBINFO/members/${ownerId}`, { role: "EDITOR" })).status).toBe(400);
  });

  it("명령 오류는 저장하지 않고 400으로 알린다", async () => {
    const r = await owner.req("POST", "/api/projects/PUBINFO/commands", { cmd: { op: "task.rm", taskId: "NOPE" } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Task가 없습니다/);
  });

  it("참조자료 업로드 → 색인", async () => {
    const data = Buffer.from("정보공개 청구는 접수 후 10일 안에 결정한다.\n\n반려할 때는 사유를 알린다.").toString("base64");
    const r = await editor.req("POST", "/api/projects/PUBINFO/sources", { files: [{ name: "회의록.txt", data }] });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/SRC-001/);
    expect(r.body.project.chunks.length).toBeGreaterThan(0);
  });

  it("AI 연결: 여러 개 저장·모델 목록·빠른 전환, 키와 주소는 노출되지 않는다", async () => {
    expect((await editor.req("POST", "/api/projects/PUBINFO/generate", { input: "hi" })).status).toBe(409);
    const nvidia = { label: "NVIDIA", provider: "openai-compatible", preset: "nvidia", baseUrl: "https://integrate.api.nvidia.com/v1", apiKey: "nvapi-SECRET", models: ["meta/llama-3.1-70b-instruct", "qwen/qwen2.5-coder-32b-instruct"] };
    expect((await editor.req("PUT", "/api/projects/PUBINFO/ai/conns", nvidia)).status).toBe(403);
    const put = await owner.req("PUT", "/api/projects/PUBINFO/ai/conns", nvidia);
    expect(put.status).toBe(200);
    expect(put.raw).not.toMatch(/SECRET/);
    const nv = put.body.project.conns[0];
    expect(nv).toMatchObject({ label: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1", hasKey: true });
    expect(put.body.project.active).toEqual({ conn: nv.id, model: "meta/llama-3.1-70b-instruct" });
    // 키 없는 로컬 연결 (LM Studio)
    const lm = await owner.req("PUT", "/api/projects/PUBINFO/ai/conns", { label: "LM Studio", provider: "openai-compatible", preset: "lmstudio", baseUrl: "http://10.0.0.5:1234/v1", models: ["google/gemma-3-12b"] });
    expect(lm.status).toBe(200);
    const lmId = lm.body.project.conns[1].id;
    expect(lm.body.project.conns[1].hasKey).toBe(false);
    // 모델이 하나도 없으면 저장 불가
    expect((await owner.req("PUT", "/api/projects/PUBINFO/ai/conns", { label: "빈", provider: "openai-compatible", baseUrl: "http://x/v1", models: [] })).status).toBe(400);

    // 모델 목록: 저장된 연결의 키를 다시 쓴다 (운영자만)
    const ml = await owner.req("POST", "/api/projects/PUBINFO/ai/models", { connId: nv.id, provider: "openai-compatible", baseUrl: "https://integrate.api.nvidia.com/v1" });
    expect(ml.body).toMatchObject({ ok: true, models: ["m-a", "m-b"], url: "https://integrate.api.nvidia.com/v1/models" });
    expect(probes.at(-1)).toMatchObject({ apiKey: "nvapi-SECRET" });
    expect((await editor.req("POST", "/api/projects/PUBINFO/ai/models", { provider: "openai-compatible", baseUrl: "http://x/v1" })).status).toBe(403);

    // 멤버에게는 이름·종류·모델만 (주소·키 숨김)
    const seen = await editor.req("GET", "/api/projects/PUBINFO/ai");
    expect(seen.raw).not.toMatch(/SECRET|10\.0\.0\.5|nvidia\.com/);
    expect(seen.body.project.conns.map((c: { label: string }) => c.label)).toEqual(["NVIDIA", "LM Studio"]);
    expect(seen.body.effective).toMatchObject({ source: "project", label: "NVIDIA", model: "meta/llama-3.1-70b-instruct" });

    const gen = await editor.req("POST", "/api/projects/PUBINFO/generate", { input: "화면을 만들어 줘" });
    expect(gen.status).toBe(200);
    expect(calls.at(-1)).toMatchObject({ provider: "openai-compatible", apiKey: "nvapi-SECRET", model: "meta/llama-3.1-70b-instruct" });
    expect((await viewer.req("POST", "/api/projects/PUBINFO/generate", { input: "x" })).status).toBe(403);

    // 운영자가 기본을 바꾸면 모두에게 적용
    await owner.req("PUT", "/api/projects/PUBINFO/ai/active", { conn: nv.id, model: "qwen/qwen2.5-coder-32b-instruct" });
    await editor.req("POST", "/api/projects/PUBINFO/generate", { input: "x" });
    expect(calls.at(-1)).toMatchObject({ model: "qwen/qwen2.5-coder-32b-instruct" });

    // 작업자가 이 프로젝트에서 LM Studio 로 전환 (자기만)
    const sw = await editor.req("PATCH", "/api/projects/PUBINFO/members/me", { aiChoice: { scope: "project", conn: lmId, model: "google/gemma-3-12b" } });
    expect(sw.body.ai).toMatchObject({ label: "LM Studio", model: "google/gemma-3-12b" });
    await editor.req("POST", "/api/projects/PUBINFO/generate", { input: "x" });
    expect(calls.at(-1)).toMatchObject({ baseUrl: "http://10.0.0.5:1234/v1", apiKey: undefined, model: "google/gemma-3-12b" });
    await owner.req("POST", "/api/projects/PUBINFO/generate", { input: "x" });
    expect(calls.at(-1)).toMatchObject({ model: "qwen/qwen2.5-coder-32b-instruct" });

    // 개인 연결로 전환
    const my = await editor.req("PUT", "/api/me/ai/conns", { label: "내 Claude", provider: "anthropic", apiKey: "sk-ant-MINE", models: ["claude-opus-5"] });
    expect(my.raw).not.toMatch(/MINE/);
    await editor.req("PATCH", "/api/projects/PUBINFO/members/me", { aiChoice: { scope: "personal", conn: my.body.ai.conns[0].id, model: "claude-opus-5" } });
    await editor.req("POST", "/api/projects/PUBINFO/generate", { input: "x" });
    expect(calls.at(-1)).toMatchObject({ source: "personal", provider: "anthropic", apiKey: "sk-ant-MINE" });
    // 선택 해제 → 프로젝트 기본
    await editor.req("PATCH", "/api/projects/PUBINFO/members/me", { aiChoice: null });
    expect((await editor.req("GET", "/api/projects/PUBINFO/ai")).body.effective.source).toBe("project");

    // 연결 확인: 특정 조합
    const t = await editor.req("POST", "/api/projects/PUBINFO/ai/test", { scope: "project", conn: lmId, model: "google/gemma-3-12b" });
    expect(t.body).toMatchObject({ ok: true, label: "LM Studio" });

    // 키 없이 다시 저장하면 기존 키 유지, 연결 삭제 시 기본이 다른 연결로
    await owner.req("PUT", "/api/projects/PUBINFO/ai/conns", { ...nvidia, id: nv.id, apiKey: "" });
    await owner.req("POST", "/api/projects/PUBINFO/generate", { input: "x" });
    expect(calls.at(-1)).toMatchObject({ apiKey: "nvapi-SECRET" });
    const del = await owner.req("DELETE", `/api/projects/PUBINFO/ai/conns/${nv.id}`);
    expect(del.body.project.active).toEqual({ conn: lmId, model: "google/gemma-3-12b" });

    // 저장소에도 평문 키가 없다
    const stored = await readFile(storeFile(), "utf8");
    expect(stored).not.toMatch(/SECRET|MINE/);
  });

  it("생성 결과 KV: 작업자는 쓰고 열람자는 댓글만", async () => {
    expect((await editor.req("PUT", "/api/projects/PUBINFO/kv/gens/PUBINFO__ia__PUB", { doc: { versions: [] } })).status).toBe(200);
    expect((await viewer.req("PUT", "/api/projects/PUBINFO/kv/gens/x", { doc: {} })).status).toBe(403);
    expect((await viewer.req("PUT", "/api/projects/PUBINFO/kv/reviews/PUBINFO__PUB", { doc: { items: [] } })).status).toBe(200);
    const kv = await viewer.req("GET", "/api/projects/PUBINFO/kv");
    expect(Object.keys(kv.body.gens)).toEqual(["PUBINFO__ia__PUB"]);
  });

  it("스냅샷·프로젝트 삭제", async () => {
    const s = await editor.req("POST", "/api/projects/PUBINFO/commands", { cmd: { op: "snapshot", note: "기준선" } });
    expect(s.body.project.snapshots).toHaveLength(1);
    expect((await editor.req("DELETE", "/api/projects/PUBINFO", { confirm: "PUBINFO" })).status).toBe(403);
    expect((await owner.req("DELETE", "/api/projects/PUBINFO", { confirm: "WRONG" })).status).toBe(400);
    expect((await owner.req("DELETE", "/api/projects/PUBINFO", { confirm: "PUBINFO" })).status).toBe(200);
    expect((await editor.req("GET", "/api/projects")).body.projects).toEqual([]);
  });

  it("서비스 관리자: 첫 가입자만 회원 목록·삭제", async () => {
    expect((await owner.req("GET", "/api/me")).body.user.isAdmin).toBe(true);
    expect((await editor.req("GET", "/api/me")).body.user.isAdmin).toBe(false);
    expect((await editor.req("GET", "/api/admin/users")).status).toBe(403);
    const list = await owner.req("GET", "/api/admin/users");
    expect(list.body.users.map((u: { email: string }) => u.email)).toContain("stranger@example.com");
    const id = (e: string) => list.body.users.find((u: { email: string }) => u.email === e).id;
    // 혼자 운영하는 프로젝트가 있으면 삭제 불가
    expect((await editor.req("POST", "/api/projects", { code: "EDOWN", name: "작업자 프로젝트" })).status).toBe(200);
    const blocked = await owner.req("DELETE", `/api/admin/users/${id("editor@example.com")}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/EDOWN/);
    // 관리자 자신은 삭제 불가
    expect((await owner.req("DELETE", `/api/admin/users/${id("owner@example.com")}`)).status).toBe(400);
    // 삭제하면 바로 로그아웃되고 같은 이메일로 다시 가입할 수 있다
    expect((await owner.req("DELETE", `/api/admin/users/${id("stranger@example.com")}`)).status).toBe(200);
    expect((await stranger.req("GET", "/api/me")).status).toBe(401);
    expect((await new Client().req("POST", "/api/signup", { email: "stranger@example.com", name: "다시", password: "password-1" })).status).toBe(200);
  });

  it("앱 화면을 서버 모드로 내려준다", async () => {
    const r = await fetch(base + "/");
    const html = await r.text();
    expect(html).toContain('"mode":"server"');
    expect((await fetch(base + "/invite/abc")).status).toBe(200);
    // 새 버전 알림: 화면에 버전이 실리고, 모든 응답 머리와 SSE 로 알려 준다
    expect(html).toContain('"version":"v-test"');
    expect((await fetch(base + "/api/config")).headers.get("x-app-version")).toBe("v-test");
    const head = await fetch(base + "/api/events?once=1", { method: "HEAD" });
    expect(head.status).toBe(204);
    expect(head.headers.get("x-app-version")).toBe("v-test");
    const ev = await fetch(base + "/api/events");
    expect(ev.headers.get("content-type")).toMatch(/text\/event-stream/);
    const text = await ev.text(); // 짧게 열었다 닫힌다 (eventsWindowMs)
    expect(text).toContain("event: version");
    expect(text).toContain('{"version":"v-test"}');
    // 설치형 앱(PWA)
    expect(html).toContain('rel="manifest"');
    const man = await (await fetch(base + "/manifest.webmanifest")).json();
    expect(man).toMatchObject({ display: "standalone", start_url: "/" });
    expect(man.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const i of man.icons) expect((await fetch(base + i.src)).status).toBe(200);
    const sw = await fetch(base + "/sw.js");
    expect(sw.headers.get("content-type")).toMatch(/javascript/);
    expect(await sw.text()).toContain("/api/");
  });
});
});

describe("AI 설정 옮기기", () => {
  it("예전 단일 설정을 연결 하나로 읽는다", () => {
    const set = parseAiSet({ provider: "openai-compatible", model: "llama3.1", baseUrl: "http://h/v1", updatedAt: "t", updatedBy: "u" });
    expect(set.conns).toHaveLength(1);
    expect(set.active).toEqual({ conn: "c_legacy", model: "llama3.1" });
  });
});
