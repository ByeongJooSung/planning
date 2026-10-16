/**
 * Claude 구독(Pro·Max) 토큰으로 생성 — Claude Code CLI(`claude -p`)를 헤드리스로 실행한다.
 *
 * 토큰 발급: 터미널에서 ‘claude setup-token’ → 브라우저 OAuth 로그인 → 장기 토큰(sk-ant-oat01-…).
 * 이 토큰을 CLAUDE_CODE_OAUTH_TOKEN 환경변수로 넘겨 Claude Code가 직접 모델을 부른다.
 * (구독 토큰은 Claude Code 전용 자격이라 Messages API에 바로 쓰지 않고, 공식 CLI를 거친다.)
 *
 * 격리: 빈 작업 폴더·전용 HOME에서 도구 없이(--tools "") 한 번만 답하게 하고, 서버 계정의 설정·MCP·CLAUDE.md는 읽지 않는다.
 * 구독 토큰은 토큰 주인 본인 사용이 전제라 개인 연결과(관리자 전용) 서버 기본에만 쓴다 — 여러 사람이 함께 쓰는 연결은 API 키로.
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HttpError } from "./accounts.js";

export const CLAUDE_CODE_TOKEN = /^sk-ant-oat01-[\w-]{20,}$/;
export const CLAUDE_CODE_DEFAULT_MODEL = "claude-opus-5-5";
/** 구독에서 고를 수 있는 모델 (모델 목록 API가 없어 고정 목록을 보여 준다. 다른 이름도 직접 입력 가능) */
export const CLAUDE_CODE_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1", "claude-opus-5"];
const TIMEOUT_MS = Number(process.env.PLANNING_CLAUDE_TIMEOUT_MS ?? 15 * 60_000);

export type CcTurn = { role: "user" | "assistant"; content: string };

/** 실행 파일: PLANNING_CLAUDE_BIN (테스트·설치 경로가 다를 때) → PATH 의 claude */
export const claudeBin = (env: NodeJS.ProcessEnv = process.env) => env.PLANNING_CLAUDE_BIN || "claude";

/** 자식 프로세스 환경 — 서버의 API 키·다른 자격은 넘기지 않는다 (API 키가 있으면 토큰보다 먼저 쓰이므로) */
function childEnv(token: string, home: string, maxTokens?: number): NodeJS.ProcessEnv {
  const keep = ["PATH", "LANG", "LC_ALL", "TZ", "TMPDIR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "SYSTEMROOT", "APPDATA", "LOCALAPPDATA"];
  const env: NodeJS.ProcessEnv = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
    CLAUDE_CODE_OAUTH_TOKEN: token,
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(maxTokens ?? 32000),
    DISABLE_AUTOUPDATER: "1",
    DISABLE_TELEMETRY: "1",
    DISABLE_ERROR_REPORTING: "1",
  };
}

/** 여러 턴(JSON 다시 요청 등)은 한 번의 요청 글로 이어 붙인다 — 헤드리스 실행은 매번 새 대화다 */
export function flattenTurns(turns: CcTurn[]): string {
  if (turns.length === 1) return turns[0]!.content;
  const body = turns.map((t, i) => {
    const last = i === turns.length - 1;
    return `[${t.role === "user" ? (last ? "사용자 — 이번 요청" : "사용자") : "AI(이전 답)"}]\n${t.content}`;
  });
  return `아래는 지금까지의 대화입니다. 마지막 ‘이번 요청’에 답하세요.\n\n${body.join("\n\n")}`;
}

interface CcResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  api_error_status?: number | null;
  stop_reason?: string | null;
  terminal_reason?: string;
}

function ccError(r: CcResult | null, stderr: string, code: number | null): HttpError {
  const status = r?.api_error_status ?? undefined;
  const msg = (r?.result || stderr || "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (status === 401 || /invalid api key|oauth access token is invalid|token (has )?expired|please run \/login|not logged in/i.test(msg))
    return new HttpError(502, "Claude 구독 토큰이 올바르지 않거나 만료됐습니다. 터미널에서 ‘claude setup-token’으로 새 토큰을 발급해 AI 설정에 다시 넣으세요.");
  if (status === 403) return new HttpError(502, `이 구독 토큰으로는 요청한 모델을 쓸 수 없습니다. 모델을 바꾸거나 구독 플랜을 확인하세요. (${msg})`);
  if (status === 404 || /model .*not (found|available)|invalid model/i.test(msg)) return new HttpError(502, `모델을 찾을 수 없습니다. AI 설정의 모델 이름을 확인하세요. (${msg})`);
  if (status === 429 || /usage limit|rate limit|limit reached/i.test(msg)) return new HttpError(429, `Claude 구독 사용 한도에 닿았습니다. 한도가 풀린 뒤 다시 시도하세요. (${msg})`);
  if (status === 529 || (status && status >= 500)) return new HttpError(502, `Claude 서버 오류 (${status}). 잠시 뒤 다시 시도하세요.`);
  return new HttpError(502, `Claude Code 실행 실패${code != null ? ` (종료 코드 ${code})` : ""}: ${msg || "응답 없음"}`);
}

/**
 * `claude -p` 한 번 실행 → 답 글. 프롬프트는 표준 입력으로 보낸다 (명령줄 길이 제한 회피).
 * 실패는 HttpError 로 바꿔 던진다.
 */
export async function callClaudeCode(o: { token: string; model: string; system: string; turns: CcTurn[]; maxTokens?: number; signal?: AbortSignal }): Promise<string> {
  if (!o.token) throw new HttpError(409, "Claude 구독 토큰이 없습니다. 터미널에서 ‘claude setup-token’을 실행해 받은 sk-ant-oat01-… 토큰을 AI 설정에 넣으세요.");
  const work = await mkdtemp(path.join(os.tmpdir(), "planning-cc-"));
  const home = path.join(work, "home");
  const cwd = path.join(work, "cwd");
  await Promise.all([mkdir(home, { recursive: true }), mkdir(cwd, { recursive: true })]);
  const args = [
    "-p",
    "--output-format", "json",
    "--model", o.model || CLAUDE_CODE_DEFAULT_MODEL,
    "--system-prompt", o.system,
    "--tools", "",
    "--strict-mcp-config",
    "--setting-sources", "",
    "--no-session-persistence",
  ];
  try {
    const { stdout, stderr, code } = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      let child;
      try {
        child = spawn(claudeBin(), args, { cwd, env: childEnv(o.token, home, o.maxTokens), stdio: ["pipe", "pipe", "pipe"] });
      } catch (e) {
        return reject(e);
      }
      let out = "";
      let err = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
      const onAbort = () => child.kill("SIGTERM");
      o.signal?.addEventListener("abort", onAbort, { once: true });
      child.stdout.setEncoding("utf8").on("data", (d: string) => (out += d));
      child.stderr.setEncoding("utf8").on("data", (d: string) => (err = (err + d).slice(-4000)));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (c) => {
        clearTimeout(timer);
        o.signal?.removeEventListener("abort", onAbort);
        resolve({ stdout: out, stderr: err, code: c });
      });
      child.stdin.on("error", () => {});
      child.stdin.end(flattenTurns(o.turns));
    });
    if (o.signal?.aborted) throw new HttpError(499, "요청을 멈췄습니다");
    const r = parseResult(stdout);
    if (!r || r.is_error || r.subtype !== "success") throw ccError(r, stderr, code);
    const text = r.result ?? "";
    if (r.stop_reason === "refusal") throw new HttpError(422, "AI가 이 요청을 처리하지 않았습니다. 요청을 바꿔 주세요");
    if (!text.trim()) throw new HttpError(502, "AI 결과가 비었습니다. 다시 시도해 주세요");
    return text;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      throw new HttpError(501, "이 서버에 Claude Code CLI(claude)가 없습니다. 서버에서 ‘npm install -g @anthropic-ai/claude-code’로 설치하거나 PLANNING_CLAUDE_BIN에 실행 파일 경로를 지정하세요. (Vercel 같은 서버리스 배포에서는 쓸 수 없습니다)");
    throw new HttpError(502, `Claude Code 실행 실패: ${(e as Error).message}`);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** --output-format json 결과 한 줄 (앞에 다른 출력이 섞여도 마지막 result 객체를 찾는다) */
function parseResult(stdout: string): CcResult | null {
  const t = stdout.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as CcResult;
  } catch {
    for (const line of t.split("\n").reverse()) {
      try {
        const v = JSON.parse(line) as CcResult;
        if (v && v.type === "result") return v;
      } catch {
        /* 다음 줄 */
      }
    }
    return null;
  }
}

/** CLI 설치 확인 (‘claude --version’) — 모델 목록 불러오기에서 쓴다 */
export async function claudeVersion(): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let out = "";
    let child;
    try {
      child = spawn(claudeBin(), ["--version"], { stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH ?? "" } });
    } catch (e) {
      return resolve({ ok: false, error: (e as Error).message });
    }
    const timer = setTimeout(() => child.kill("SIGTERM"), 15_000);
    child.stdout.setEncoding("utf8").on("data", (d: string) => (out += d));
    child.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.code === "ENOENT" ? "Claude Code CLI(claude)를 찾을 수 없습니다" : e.message });
    });
    child.on("close", (c) => {
      clearTimeout(timer);
      resolve(c === 0 ? { ok: true, version: out.trim() } : { ok: false, error: `claude --version 실패 (종료 코드 ${c})` });
    });
  });
}
