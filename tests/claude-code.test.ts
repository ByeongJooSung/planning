import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Accounts, type AiResolved } from "../src/server/accounts.js";
import { callAi, probeModels, serverAiFromEnv } from "../src/server/ai.js";
import { flattenTurns } from "../src/server/claude-code.js";
import { FileKv } from "../src/server/kv.js";

const TOKEN = "sk-ant-oat01-" + "a".repeat(40);
let dir = "";
let log = "";

/** claude CLI 대역: 받은 인자·환경·표준 입력을 파일에 남기고, FAKE_MODE 에 따라 결과 JSON을 낸다 */
const FAKE = `#!/usr/bin/env node
const fs = require("node:fs");
if (process.argv[2] === "--version") { console.log("9.9.9 (Claude Code)"); process.exit(0); }
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  fs.writeFileSync(process.env.FAKE_LOG || ${JSON.stringify("")}, JSON.stringify({ args: process.argv.slice(2), env: process.env, cwd: process.cwd(), input }));
  const mode = fs.readFileSync(__dirname + "/mode", "utf8").trim();
  const base = { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn" };
  if (mode === "401") return console.log(JSON.stringify({ ...base, is_error: true, api_error_status: 401, result: "Failed to authenticate. API Error: 401 OAuth access token is invalid." }));
  if (mode === "429") return console.log(JSON.stringify({ ...base, is_error: true, api_error_status: 429, result: "Claude usage limit reached" }));
  if (mode === "crash") { process.stderr.write("boom"); process.exit(3); }
  console.log(JSON.stringify({ ...base, result: '\`\`\`json\\n{"ok":true,"len":' + input.length + '}\\n\`\`\`' }));
});
`;

const setMode = (m: string) => writeFile(path.join(dir, "mode"), m);
const cfg = (over: Partial<AiResolved> = {}): AiResolved => ({ source: "personal", provider: "claude-code", model: "claude-opus-5-5", apiKey: TOKEN, ...over });
const env0 = { ...process.env };

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "planning-ccbin-"));
  // 패키지가 ESM이라 .cjs 로 둔다
  const bin = path.join(dir, "claude.cjs");
  await writeFile(bin, FAKE.replace(`process.env.FAKE_LOG || ""`, `process.env.FAKE_LOG || ${JSON.stringify(path.join(dir, "log.json"))}`));
  await chmod(bin, 0o755);
  log = path.join(dir, "log.json");
  process.env.PLANNING_CLAUDE_BIN = bin;
  process.env.ANTHROPIC_API_KEY_SHOULD_NOT_LEAK = "x";
});
afterEach(() => {
  process.env.ANTHROPIC_API_KEY = env0.ANTHROPIC_API_KEY;
  if (env0.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
});
afterAll(async () => {
  delete process.env.PLANNING_CLAUDE_BIN;
  delete process.env.ANTHROPIC_API_KEY_SHOULD_NOT_LEAK;
  await rm(dir, { recursive: true, force: true });
});

const readLog = async () => JSON.parse(await (await import("node:fs/promises")).readFile(log, "utf8"));

describe("Claude 구독 토큰 (Claude Code CLI)", () => {
  it("토큰을 CLAUDE_CODE_OAUTH_TOKEN 으로 넘겨 claude -p 를 도구 없이 실행하고 JSON 결과를 읽는다", async () => {
    await setMode("ok");
    process.env.ANTHROPIC_API_KEY = "sk-ant-api-SERVER";
    const r = await callAi(cfg(), "요구사항으로 화면을 만들어 줘");
    expect(r.output).toEqual({ ok: true, len: "요구사항으로 화면을 만들어 줘".length });
    const l = await readLog();
    expect(l.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
    // 서버의 API 키·다른 환경변수는 넘기지 않는다 (API 키가 있으면 토큰보다 먼저 쓰인다)
    expect(l.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(l.env.ANTHROPIC_API_KEY_SHOULD_NOT_LEAK).toBeUndefined();
    expect(l.env.HOME).not.toBe(os.homedir());
    expect(l.args.slice(0, 5)).toEqual(["-p", "--output-format", "json", "--model", "claude-opus-5-5"]);
    expect(l.args).toContain("--system-prompt");
    expect(l.args[l.args.indexOf("--tools") + 1]).toBe("");
    expect(l.args).toEqual(expect.arrayContaining(["--strict-mcp-config", "--no-session-persistence"]));
    expect(l.input).toBe("요구사항으로 화면을 만들어 줘");
  });

  it("여러 턴은 한 요청 글로 이어 붙인다", () => {
    const t = flattenTurns([{ role: "user", content: "A" }, { role: "assistant", content: "B" }, { role: "user", content: "C" }]);
    expect(t).toMatch(/\[사용자\]\nA[\s\S]*\[AI\(이전 답\)\]\nB[\s\S]*\[사용자 — 이번 요청\]\nC$/);
  });

  it("만료·잘못된 토큰, 한도, 실행 실패, CLI 없음은 알아볼 수 있는 오류로", async () => {
    await setMode("401");
    await expect(callAi(cfg(), "x")).rejects.toMatchObject({ status: 502, message: expect.stringContaining("claude setup-token") });
    await setMode("429");
    await expect(callAi(cfg(), "x")).rejects.toMatchObject({ status: 429 });
    await setMode("crash");
    await expect(callAi(cfg(), "x")).rejects.toMatchObject({ status: 502, message: expect.stringContaining("boom") });
    const bin = process.env.PLANNING_CLAUDE_BIN;
    process.env.PLANNING_CLAUDE_BIN = path.join(dir, "없는-claude");
    try {
      await expect(callAi(cfg(), "x")).rejects.toMatchObject({ status: 501 });
      expect(await probeModels({ provider: "claude-code" })).toMatchObject({ ok: false, models: [] });
    } finally {
      process.env.PLANNING_CLAUDE_BIN = bin;
    }
    await expect(callAi(cfg({ apiKey: undefined }), "x")).rejects.toMatchObject({ status: 409 });
  });

  it("모델 목록: CLI 설치를 확인하고 구독 모델을 보여 준다", async () => {
    const r = await probeModels({ provider: "claude-code" });
    expect(r).toMatchObject({ ok: true, url: expect.stringContaining("9.9.9") });
    expect(r.models).toContain("claude-opus-5-5");
  });

  it("환경변수: API 키가 우선, 없으면 CLAUDE_CODE_OAUTH_TOKEN (관리자 전용), 서버리스는 쓰지 않음", () => {
    expect(serverAiFromEnv({ ANTHROPIC_API_KEY: "k", CLAUDE_CODE_OAUTH_TOKEN: TOKEN })).toMatchObject({ provider: "anthropic" });
    expect(serverAiFromEnv({ CLAUDE_CODE_OAUTH_TOKEN: TOKEN, PLANNING_AI_MODEL: "claude-sonnet-5-5" })).toEqual({ provider: "claude-code", model: "claude-sonnet-5-5", apiKey: TOKEN, adminsOnly: true });
    expect(serverAiFromEnv({ CLAUDE_CODE_OAUTH_TOKEN: TOKEN }, { claudeCode: false })).toBeNull();
    expect(serverAiFromEnv({})).toBeNull();
  });

  it("연결 저장: 개인 연결에만, 토큰 형식 확인 · 서버 기본 토큰은 관리자에게만", async () => {
    const kv = await FileKv.open(path.join(dir, "kv.json"));
    const acc = new Accounts(kv, { secret: "test-secret", serverAi: serverAiFromEnv({ CLAUDE_CODE_OAUTH_TOKEN: TOKEN }) });
    const admin = (await acc.signup({ email: "a@x.kr", name: "관리자", password: "pass-12345678" })).user;
    const member = (await acc.signup({ email: "b@x.kr", name: "멤버", password: "pass-12345678" })).user;
    const conn = { label: "내 구독", provider: "claude-code" as const, preset: "claude-code", apiKey: TOKEN, models: ["claude-opus-5-5"] };
    await expect(acc.saveConn("project", "PUBINFO", conn, admin.id)).rejects.toMatchObject({ status: 400 });
    await expect(acc.saveConn("personal", member.id, { ...conn, apiKey: "sk-ant-api03-xxxx" }, member.id)).rejects.toMatchObject({ status: 400 });
    await expect(acc.saveConn("personal", member.id, { ...conn, apiKey: "" }, member.id)).rejects.toMatchObject({ status: 400 });

    // 서버 기본(환경변수 토큰)은 관리자(첫 가입자)에게만
    expect(await acc.resolveAi(null, admin.id)).toMatchObject({ source: "server", provider: "claude-code", apiKey: TOKEN });
    expect(await acc.resolveAi(null, member.id)).toBeNull();

    const saved = await acc.saveConn("personal", member.id, conn, member.id);
    expect(saved.keyEnc).not.toContain(TOKEN);
    expect(acc.aiSetPublic(await acc.aiSet("personal", member.id), true).conns[0]).toMatchObject({ provider: "claude-code", hasKey: true });
    expect(await acc.resolveAi(null, member.id)).toMatchObject({ source: "personal", provider: "claude-code", apiKey: TOKEN, model: "claude-opus-5-5" });
    // 다시 저장할 때 토큰을 비우면 그대로 둔다
    await acc.saveConn("personal", member.id, { ...conn, id: saved.id, apiKey: "", models: ["claude-sonnet-5-5"] }, member.id);
    expect(await acc.resolveAi(null, member.id)).toMatchObject({ apiKey: TOKEN });
  });
});
