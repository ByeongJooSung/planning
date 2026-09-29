import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import { FileKv } from "../src/server/kv.js";
import { KvRepo } from "../src/server/repo.js";

/** 가짜 Google: 로그인·토큰 발급·Gemini(OpenAI 호환) 호출 */
let google: Server;
let gBase = "";
const seen: { path: string; auth?: string; project?: string; form?: Record<string, string>; body?: any }[] = [];
let app: Server;
let base = "";
let root = "";
const SECRET = "GOCSPX-super-secret-value";
const CLIENT = "1234567890-abc.apps.googleusercontent.com";

beforeAll(async () => {
  google = createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      const entry: (typeof seen)[number] = { path: url.pathname, auth: req.headers.authorization, project: req.headers["x-goog-user-project"] as string | undefined };
      if (url.pathname === "/token") {
        entry.form = Object.fromEntries(new URLSearchParams(b));
        seen.push(entry);
        res.setHeader("content-type", "application/json");
        if (entry.form.grant_type === "authorization_code") {
          if (entry.form.code === "nocode") return void ((res.statusCode = 400), res.end(JSON.stringify({ error: "invalid_grant" })));
          const id = Buffer.from(JSON.stringify({ email: "me@example.com" })).toString("base64url");
          return void res.end(JSON.stringify({ access_token: "at-first", refresh_token: "rt-secret-1", expires_in: 3600, id_token: `h.${id}.s` }));
        }
        if (entry.form.refresh_token === "rt-secret-1") return void res.end(JSON.stringify({ access_token: "at-refreshed", expires_in: 3600 }));
        res.statusCode = 400;
        return void res.end(JSON.stringify({ error: "invalid_grant" }));
      }
      entry.body = b ? JSON.parse(b) : undefined;
      seen.push(entry);
      res.setHeader("content-type", "application/json");
      if (req.headers.authorization !== "Bearer at-refreshed") return void ((res.statusCode = 401), res.end(JSON.stringify({ error: { message: "bad token" } })));
      if (url.pathname === "/v1beta/openai/models") return void res.end(JSON.stringify({ data: [{ id: "models/gemini-2.5-flash" }, { id: "models/gemini-2.5-pro" }] }));
      if (url.pathname === "/v1beta/openai/chat/completions") return void res.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] }));
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => google.listen(0, "127.0.0.1", r));
  gBase = `http://127.0.0.1:${(google.address() as AddressInfo).port}`;
  process.env.GOOGLE_OAUTH_AUTH_URL = `${gBase}/auth`;
  process.env.GOOGLE_OAUTH_TOKEN_URL = `${gBase}/token`;
  process.env.PLANNING_ALLOW_ANY_OAUTH_BASE = "1";
  root = await mkdtemp(path.join(os.tmpdir(), "planning-oauth-"));
  const kv = await FileKv.open(path.join(root, "kv.json"));
  const a = await createApp({ kv, repo: new KvRepo(kv), secret: "test-secret-oauth", version: "v-test", eventsWindowMs: 100 });
  app = createServer((req, res) => void a.handle(req, res));
  await new Promise<void>((r) => app.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});
afterAll(async () => {
  app.close();
  google.close();
  delete process.env.GOOGLE_OAUTH_AUTH_URL;
  delete process.env.GOOGLE_OAUTH_TOKEN_URL;
  delete process.env.PLANNING_ALLOW_ANY_OAUTH_BASE;
  await rm(root, { recursive: true, force: true });
});

class Client {
  cookie = "";
  async req(method: string, url: string, body?: unknown, redirect: RequestRedirect = "follow") {
    const res = await fetch(base + url, { method, redirect, headers: { "content-type": "application/json", "x-planning": "1", ...(this.cookie ? { cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0]!;
    const text = await res.text();
    return { status: res.status, location: res.headers.get("location"), body: text && text.startsWith("{") ? JSON.parse(text) : null, raw: text };
  }
}

describe("Google Cloud OAuth (Gemini)", () => {
  it("연결 저장 → Google 로그인 → 토큰 저장 → 모델 불러오기·호출, 비밀값은 어디에도 노출되지 않는다", async () => {
    const me = new Client();
    expect((await me.req("POST", "/api/signup", { email: "o@example.com", name: "나", password: "password-1" })).status).toBe(200);
    const input = { label: "Gemini OAuth", provider: "openai-compatible", preset: "gemini-oauth", baseUrl: `${gBase}/v1beta/openai`, models: ["gemini-2.5-flash"], oauth: { clientId: CLIENT, clientSecret: SECRET, projectId: "my-gemini-123" } };
    // 입력 검사
    expect((await me.req("PUT", "/api/me/ai/conns", { ...input, oauth: { ...input.oauth, projectId: "My Project" } })).status).toBe(400);
    expect((await me.req("PUT", "/api/me/ai/conns", { ...input, oauth: { clientId: CLIENT, projectId: "my-gemini-123" } })).status).toBe(400);
    const saved = await me.req("PUT", "/api/me/ai/conns", input);
    expect(saved.status).toBe(200);
    expect(saved.raw).not.toContain(SECRET);
    const conn = saved.body.ai.conns[0];
    expect(conn).toMatchObject({ preset: "gemini-oauth", hasKey: false, oauth: { hasSecret: true, connected: false, clientId: CLIENT, projectId: "my-gemini-123" } });

    // 연결 전에는 모델 목록·호출 모두 안내 오류
    expect((await me.req("POST", "/api/me/ai/models", { provider: "openai-compatible", baseUrl: input.baseUrl, connId: conn.id })).status).toBe(409);
    const early = await me.req("POST", "/api/me/ai/test", { scope: "personal", conn: conn.id, model: "gemini-2.5-flash" });
    expect(early.status).toBe(409);
    expect(early.body.error).toMatch(/Google 계정을 아직 연결/);

    // 시작: 동의 화면 주소
    const start = await me.req("POST", "/api/oauth/google/start", { scope: "personal", conn: conn.id });
    const u = new URL(start.body.url);
    expect(u.origin + u.pathname).toBe(`${gBase}/auth`);
    expect(u.searchParams.get("client_id")).toBe(CLIENT);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("scope")).toContain("cloud-platform");
    expect(u.searchParams.get("redirect_uri")).toBe(`${base}/api/oauth/google/callback`);
    const state = u.searchParams.get("state")!;

    // 잘못된 state·다른 사용자의 state는 거부
    const bad = await me.req("GET", `/api/oauth/google/callback?code=x&state=${state.slice(0, -3)}abc`, undefined, "manual");
    expect(bad.status).toBe(302);
    expect(bad.location).toMatch(/oauth=error/);
    const other = new Client();
    await other.req("POST", "/api/signup", { email: "x@example.com", name: "남", password: "password-1" });
    const stolen = await other.req("GET", `/api/oauth/google/callback?code=abc&state=${state}`, undefined, "manual");
    expect(decodeURIComponent(stolen.location!)).toMatch(/oauth=error.*다릅니다/);
    // 사용자가 동의 화면에서 취소
    expect((await me.req("GET", `/api/oauth/google/callback?error=access_denied&state=${state}`, undefined, "manual")).location).toMatch(/oauth=error/);

    // 콜백 성공
    const cb = await me.req("GET", `/api/oauth/google/callback?code=abc&state=${state}`, undefined, "manual");
    expect(cb.status).toBe(302);
    expect(cb.location).toBe("/account?oauth=ok");
    const tok = seen.find((x) => x.path === "/token" && x.form?.grant_type === "authorization_code")!;
    expect(tok.form).toMatchObject({ code: "abc", client_id: CLIENT, client_secret: SECRET, redirect_uri: `${base}/api/oauth/google/callback` });

    const after = (await me.req("POST", "/api/me/ai/models", { provider: "openai-compatible", baseUrl: input.baseUrl, connId: conn.id })).body;
    expect(after.ok).toBe(true);
    expect(after.models).toEqual(["gemini-2.5-flash", "gemini-2.5-pro"]);
    const list = seen.filter((x) => x.path === "/v1beta/openai/models").at(-1)!;
    expect(list).toMatchObject({ auth: "Bearer at-refreshed", project: "my-gemini-123" });

    const ok = await me.req("POST", "/api/me/ai/test", { scope: "personal", conn: conn.id, model: "gemini-2.5-flash" });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ok: true, model: "gemini-2.5-flash" });
    const chat = seen.filter((x) => x.path === "/v1beta/openai/chat/completions").at(-1)!;
    expect(chat).toMatchObject({ auth: "Bearer at-refreshed", project: "my-gemini-123" });
    // 액세스 토큰은 캐시해서 재사용 (리프레시 1번)
    expect(seen.filter((x) => x.path === "/token" && x.form?.grant_type === "refresh_token")).toHaveLength(1);

    // 저장된 상태 — 이메일 표시, 시크릿·토큰은 응답에 없음
    const now = await me.req("GET", "/api/me");
    expect(now.raw).not.toContain(SECRET);
    expect(now.raw).not.toContain("rt-secret-1");
    // 저장소에도 평문이 없다
    const stored = await readFile(path.join(root, "kv.json"), "utf8");
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain("rt-secret-1");

    // 연결 해제 → 다시 안내 오류
    const dis = await me.req("POST", `/api/me/ai/conns/${conn.id}/oauth/disconnect`);
    expect(dis.body.ai.conns[0].oauth).toMatchObject({ connected: false, hasSecret: true });
    expect((await me.req("POST", "/api/me/ai/test", { scope: "personal", conn: conn.id, model: "gemini-2.5-flash" })).status).toBe(409);
    // 시크릿을 비워 다시 저장하면 기존 시크릿을 유지
    const again = await me.req("PUT", "/api/me/ai/conns", { ...input, id: conn.id, oauth: { clientId: CLIENT, projectId: "my-gemini-123" } });
    expect(again.status).toBe(200);
  });

  it("주소는 Gemini 도메인만 (토큰이 엉뚱한 곳으로 가지 않게)", async () => {
    delete process.env.PLANNING_ALLOW_ANY_OAUTH_BASE;
    try {
      const me = new Client();
      await me.req("POST", "/api/signup", { email: "z@example.com", name: "z", password: "password-1" });
      const r = await me.req("PUT", "/api/me/ai/conns", { label: "g", provider: "openai-compatible", preset: "gemini-oauth", baseUrl: "https://evil.example.com/v1", models: ["m"], oauth: { clientId: CLIENT, clientSecret: SECRET, projectId: "my-gemini-123" } });
      expect(r.status).toBe(400);
      const ok = await me.req("PUT", "/api/me/ai/conns", { label: "g", provider: "openai-compatible", preset: "gemini-oauth", models: ["m"], oauth: { clientId: CLIENT, clientSecret: SECRET, projectId: "my-gemini-123" } });
      expect(ok.status).toBe(200);
      expect(ok.raw).toContain("generativelanguage.googleapis.com");
    } finally {
      process.env.PLANNING_ALLOW_ANY_OAUTH_BASE = "1";
    }
  });
});
