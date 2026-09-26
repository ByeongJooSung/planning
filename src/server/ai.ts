/**
 * AI 호출 — 프로젝트·개인·서버 기본 설정에 따라 Anthropic API 또는 OpenAI 호환 API(로컬 LLM 포함)를 부른다.
 * 결과는 생성 프롬프트가 요구한 JSON으로 읽어 돌려준다.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AiProbe, AiResolved } from "./accounts.js";
import { HttpError } from "./accounts.js";

export type Turn = { role: "user" | "assistant"; content: string };
export type AiInputMessages = string | Turn[];

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
const SYSTEM = "당신은 서비스 기획 산출물을 만드는 도우미입니다. 요청한 형식의 JSON만 답합니다. 설명·코드 블록 표시 없이 JSON 하나만 출력하세요.";

export interface AiResult {
  text: string;
  output: unknown;
  model: string;
}

function toTurns(input: AiInputMessages): Turn[] {
  const turns = typeof input === "string" ? [{ role: "user" as const, content: input }] : input;
  if (!turns.length || turns.at(-1)!.role !== "user") throw new HttpError(400, "마지막 메시지는 user 여야 합니다");
  for (const t of turns) if ((t.role !== "user" && t.role !== "assistant") || typeof t.content !== "string") throw new HttpError(400, "메시지 형식 오류");
  const size = turns.reduce((a, t) => a + t.content.length, 0);
  if (size > 400_000) throw new HttpError(413, "보낼 내용이 너무 깁니다. 요청을 줄여 주세요");
  return turns;
}

export async function callAi(cfg: AiResolved, input: AiInputMessages, opts: { signal?: AbortSignal; json?: boolean } = {}): Promise<AiResult> {
  const turns = toTurns(input);
  const text = cfg.provider === "anthropic" ? await callAnthropic(cfg, turns, opts.signal) : await callOpenAiCompatible(cfg, turns, opts.signal);
  if (opts.json === false) return { text, output: null, model: cfg.model };
  return { text, output: parseJson(text), model: cfg.model };
}

async function callAnthropic(cfg: AiResolved, turns: Turn[], signal?: AbortSignal): Promise<string> {
  const client = new Anthropic({ apiKey: cfg.apiKey, ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}), maxRetries: 2 });
  try {
    const stream = client.messages.stream(
      { model: cfg.model || DEFAULT_ANTHROPIC_MODEL, max_tokens: 32000, thinking: { type: "adaptive" }, system: SYSTEM, messages: turns },
      { signal },
    );
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new HttpError(422, "AI가 이 요청을 처리하지 않았습니다. 요청을 바꿔 주세요");
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    if (!text.trim()) throw new HttpError(502, "AI 결과가 비었습니다. 다시 시도해 주세요");
    if (msg.stop_reason === "max_tokens") throw new HttpError(502, "AI 결과가 너무 길어 잘렸습니다. 요청 범위를 줄여 주세요");
    return text;
  } catch (e) {
    throw mapAnthropicError(e);
  }
}

function mapAnthropicError(e: unknown): Error {
  if (e instanceof HttpError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new HttpError(502, "AI API 키가 올바르지 않습니다. AI 설정을 확인하세요");
  if (e instanceof Anthropic.PermissionDeniedError) return new HttpError(502, "이 API 키로는 해당 모델을 쓸 수 없습니다");
  if (e instanceof Anthropic.NotFoundError) return new HttpError(502, "모델을 찾을 수 없습니다. AI 설정의 모델 이름을 확인하세요");
  if (e instanceof Anthropic.RateLimitError) return new HttpError(429, "AI 요청이 많습니다. 잠시 뒤 다시 시도하세요");
  if (e instanceof Anthropic.APIError) return new HttpError(502, `AI API 오류 (${e.status ?? "연결"}): ${e.message.slice(0, 200)}`);
  if (e instanceof Error && e.name === "AbortError") return new HttpError(499, "요청을 멈췄습니다");
  return new HttpError(502, `AI 호출 실패: ${(e as Error).message}`);
}

/** 모델 목록 불러오기 결과 — 성공이든 실패든 무엇을 불렀고 왜 안 됐는지 화면에 그대로 보여 준다 */
export interface ModelProbe {
  ok: boolean;
  models: string[];
  /** 실제로 부른 주소 */
  url: string;
  ms: number;
  status?: number;
  /** 네트워크 오류 코드 (ECONNREFUSED 등) */
  code?: string;
  /** 무엇이 잘못됐나 (한 줄) */
  error?: string;
  /** 어떻게 고치나 */
  hint?: string;
  /** 서버가 보낸 원문 일부 */
  detail?: string;
}

const PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|host\.docker\.internal)/i;
/** Tailscale 등 CGNAT 대역 (100.64.0.0/10) — 같은 tailnet 안에서만 열린다 */
const TAILSCALE_HOST = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|\.ts\.net(:\d+)?$/i;
const TAILSCALE_HINT = "Tailscale 주소(100.x, *.ts.net 내부 주소)는 같은 Tailscale 네트워크에 들어온 기기에서만 열립니다. 인터넷 서비스에서 쓰려면 LM Studio PC에서 `tailscale funnel 1234` 를 실행해 공개 주소(https://<PC이름>.<tailnet>.ts.net)를 만들고 그 주소 + /v1 을 넣으세요. Funnel 이 처음이면 Tailscale 관리 콘솔에서 Funnel 사용을 허용해야 합니다. 또는 `cloudflared tunnel --url http://localhost:1234` 로 나온 주소 + /v1 을 써도 됩니다.";
const TUNNEL_HINT = "LM Studio·Ollama를 인터넷 서비스에서 쓰려면 외부에서 접속 가능한 주소가 필요합니다 — 예: PC에서 `cloudflared tunnel --url http://localhost:1234` 실행 후 나온 https 주소 + /v1, 또는 공유기 포트 포워딩. 같은 네트워크 서버에 이 서비스를 직접 띄우는 방법(planning serve)도 있습니다.";

/** fetch 가 던진 네트워크 오류를 원인·해결 방법으로 */
export function describeNetError(e: unknown, host: string): { code?: string; error: string; hint: string } {
  const err = e as Error & { cause?: { code?: string; message?: string }; code?: string };
  const code = err?.cause?.code ?? err?.code ?? (err?.name === "TimeoutError" || err?.name === "AbortError" ? "TIMEOUT" : undefined);
  const raw = err?.cause?.message ?? err?.message ?? String(e);
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return { code, error: `주소(도메인)를 찾을 수 없습니다: ${host}`, hint: "주소 철자를 확인하세요. 터널 주소라면 터널이 아직 켜져 있는지(재시작하면 주소가 바뀝니다) 확인하세요." };
    case "ECONNREFUSED":
      return { code, error: `서버가 연결을 거부했습니다: ${host}`, hint: "서버가 꺼져 있거나 포트가 다릅니다. LM Studio는 Developer 탭에서 Start Server(기본 포트 1234), Ollama는 11434 포트입니다. " + (PRIVATE_HOST.test(host) ? TUNNEL_HINT : "") };
    case "TIMEOUT":
    case "ETIMEDOUT":
    case "UND_ERR_CONNECT_TIMEOUT":
    case "UND_ERR_HEADERS_TIMEOUT":
      if (TAILSCALE_HOST.test(host.split(":")[0]!)) return { code, error: `응답이 없습니다 (시간 초과): ${host} — Tailscale 내부 주소입니다`, hint: TAILSCALE_HINT };
      return { code, error: `응답이 없습니다 (시간 초과): ${host}`, hint: "방화벽·공유기에서 막혔거나 서버가 멈춰 있습니다. 외부에서 이 주소로 접속되는지 브라우저로 {주소}/models 를 열어 확인해 보세요." };
    case "ECONNRESET":
    case "UND_ERR_SOCKET":
      return { code, error: "연결이 도중에 끊겼습니다", hint: "http/https 를 바꿔 넣었는지 확인하세요 (LM Studio 로컬 서버는 보통 http)." };
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return { code, error: `이 서비스에서 그 주소로 갈 수 없습니다: ${host}`, hint: PRIVATE_HOST.test(host) ? TUNNEL_HINT : "주소가 인터넷에서 접속 가능한지 확인하세요." };
    default:
      if (/bad port/i.test(raw)) return { code: "BAD_PORT", error: `막힌 포트입니다: ${host}`, hint: "보안상 쓸 수 없는 포트입니다. LM Studio 기본 1234, Ollama 11434 처럼 다른 포트를 쓰세요." };
      if (/certificate|CERT_|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(`${code} ${raw}`))
        return { code, error: "HTTPS 인증서를 믿을 수 없습니다", hint: "자체 서명 인증서 대신 정식 인증서를 쓰거나, 터널(cloudflared·ngrok)의 https 주소를 쓰세요." };
      return { code, error: `연결하지 못했습니다 (${raw})`, hint: "주소와 서버 실행 여부를 확인하세요." };
  }
}

/** 연결에서 쓸 수 있는 모델 목록 (GET {주소}/models) — 실패해도 던지지 않고 원인을 담아 돌려준다 */
export async function probeModels(p: AiProbe, env: NodeJS.ProcessEnv = process.env): Promise<ModelProbe> {
  const t0 = Date.now();
  const done = (r: Omit<ModelProbe, "ms">): ModelProbe => ({ ...r, ms: Date.now() - t0 });
  if (p.provider === "anthropic") {
    const url = `${(p.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "")}/v1/models`;
    if (!p.apiKey) return done({ ok: false, models: [], url, error: "Anthropic은 API 키가 있어야 모델 목록을 불러올 수 있습니다", hint: "console.anthropic.com 에서 발급한 sk-ant-… 키를 넣으세요." });
    const client = new Anthropic({ apiKey: p.apiKey, ...(p.baseUrl ? { baseURL: p.baseUrl } : {}), maxRetries: 0, timeout: 20_000 });
    try {
      const ids: string[] = [];
      for await (const m of client.models.list({ limit: 100 })) ids.push(m.id);
      return done({ ok: true, models: ids, url });
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) return done({ ok: false, models: [], url, status, error: "API 키가 올바르지 않습니다 (401)", hint: "키를 다시 복사해 넣으세요. 앞뒤 공백이 섞였는지도 확인하세요." });
      if (status) return done({ ok: false, models: [], url, status, error: `Anthropic API 오류 (${status})`, detail: (e as Error).message.slice(0, 300), hint: "잠시 뒤 다시 시도하세요." });
      return done({ ok: false, models: [], url, ...describeNetError(e, new URL(url).host) });
    }
  }
  const base = (p.baseUrl ?? "").replace(/\/$/, "");
  const url = `${base}/models`;
  let host = "";
  try {
    host = new URL(base).host;
  } catch {
    return done({ ok: false, models: [], url, error: "API 주소가 URL 형식이 아닙니다", hint: "http:// 또는 https:// 로 시작하는 주소를 넣으세요 (예: https://integrate.api.nvidia.com/v1)." });
  }
  // 인터넷 배포(Vercel)에서는 내 PC의 localhost·사설 IP에 닿을 수 없다
  if (env.VERCEL && TAILSCALE_HOST.test(host.split(":")[0]!) && !/\.ts\.net$/i.test(host.split(":")[0]!))
    return done({ ok: false, models: [], url, code: "TAILSCALE_ADDRESS", error: `${host} 는 Tailscale 내부 주소라 인터넷(Vercel)에서 접속할 수 없습니다`, hint: TAILSCALE_HINT });
  if (env.VERCEL && PRIVATE_HOST.test(host))
    return done({ ok: false, models: [], url, code: "PRIVATE_ADDRESS", error: `이 서비스는 인터넷(Vercel)에서 돌고 있어 ${host} 에 접속할 수 없습니다`, hint: TUNNEL_HINT });
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json", "ngrok-skip-browser-warning": "1", ...(p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {}) }, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    return done({ ok: false, models: [], url, ...describeNetError(e, host) });
  }
  const text = await res.text().catch(() => "");
  let body: { data?: { id?: string }[]; models?: { name?: string; id?: string; model?: string }[]; error?: { message?: string } | string; detail?: string } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* 아래에서 처리 */
  }
  const detail = (typeof body?.error === "string" ? body.error : body?.error?.message) ?? body?.detail ?? (body ? undefined : text.replace(/\s+/g, " ").slice(0, 200));
  if (!res.ok) {
    const status = res.status;
    if (status === 401 || status === 403) return done({ ok: false, models: [], url, status, detail, error: `API 키가 필요하거나 올바르지 않습니다 (${status})`, hint: "NVIDIA는 build.nvidia.com 에서 발급한 nvapi-… 키를 넣으세요. LM Studio에서 인증을 켰다면 그 토큰을 넣으세요." });
    if (status === 404) return done({ ok: false, models: [], url, status, detail, error: "주소는 열렸지만 /models 를 찾지 못했습니다 (404)", hint: /\/v1$/.test(base) ? "OpenAI 호환 API 주소가 맞는지 확인하세요." : "주소 끝에 /v1 을 붙여 보세요 (예: http://…:1234/v1)." });
    return done({ ok: false, models: [], url, status, detail, error: `서버 오류 (${status})`, hint: "AI 서버 쪽 로그를 확인하거나 잠시 뒤 다시 시도하세요." });
  }
  if (!body) {
    const html = /<html|<!doctype/i.test(text);
    return done({ ok: false, models: [], url, status: res.status, detail, error: html ? "JSON 대신 웹페이지(HTML)가 왔습니다" : "응답을 읽지 못했습니다 (JSON 아님)", hint: html ? "API 주소가 아니라 웹페이지 주소일 수 있습니다. 주소 끝이 /v1 인지, 터널 경고 페이지가 아닌지 확인하세요." : "OpenAI 호환 API 주소가 맞는지 확인하세요." });
  }
  const ids = [...new Set((body.data ?? body.models ?? []).map((m) => (m as { id?: string }).id || (m as { name?: string }).name || (m as { model?: string }).model || "").filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (!ids.length) return done({ ok: false, models: [], url, status: res.status, error: "연결은 됐지만 모델이 0개입니다", hint: "LM Studio는 모델을 내려받아 두어야 목록에 나옵니다(JIT 로딩을 끈 경우 먼저 Load). Ollama는 ollama pull 로 받아 두세요. 목록 없이도 모델 이름을 직접 입력할 수 있습니다." });
  return done({ ok: true, models: ids, url, status: res.status });
}

/** 모델 이름만 필요할 때 (실패하면 던진다) */
export async function listModels(p: AiProbe): Promise<string[]> {
  const r = await probeModels(p);
  if (!r.ok) throw new HttpError(502, `${r.error}${r.hint ? ` — ${r.hint}` : ""}`);
  return r.models;
}

/** OpenAI 호환 /chat/completions — NVIDIA(integrate.api.nvidia.com), LM Studio, Ollama, vLLM, 외부 호환 API */
async function callOpenAiCompatible(cfg: AiResolved, turns: Turn[], signal?: AbortSignal): Promise<string> {
  const url = `${cfg.baseUrl!.replace(/\/$/, "")}/chat/completions`;
  const post = async (withMax: boolean) => {
    try {
      return await fetch(url, {
        method: "POST",
        signal: signal ?? AbortSignal.timeout(10 * 60_000),
        headers: { "content-type": "application/json", "ngrok-skip-browser-warning": "1", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: "system", content: SYSTEM }, ...turns], temperature: 0.3, ...(withMax ? { max_tokens: cfg.maxTokens ?? 8192 } : {}) }),
      });
    } catch (e) {
      if ((e as Error).name === "AbortError" && signal?.aborted) throw new HttpError(499, "요청을 멈췄습니다");
      const d = describeNetError(e, new URL(url).host);
      throw new HttpError(502, `${d.error} — ${d.hint}`);
    }
  };
  type Body = { choices?: { message?: { content?: string; reasoning_content?: string }; finish_reason?: string }[]; error?: { message?: string } | string; detail?: string } | null;
  // 요청이 몰려 잠깐 거절(429·503·502·504)하면 조금 쉬었다 두 번까지 다시 보낸다 (Retry-After 를 따름)
  const send = async (withMax: boolean) => {
    for (let attempt = 0; ; attempt++) {
      const r = await post(withMax);
      if (![429, 502, 503, 504].includes(r.status) || attempt >= 2 || signal?.aborted) return r;
      const ra = Number(r.headers.get("retry-after"));
      await new Promise((ok) => setTimeout(ok, Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : [3000, 8000][attempt]!, 15000)));
    }
  };
  let res = await send(true);
  let body = (await res.json().catch(() => null)) as Body;
  // 모델마다 출력 한도가 달라 max_tokens 를 거부하면 빼고 한 번 더 보낸다
  const errText = (b: Body) => (typeof b?.error === "string" ? b.error : b?.error?.message) ?? b?.detail ?? "";
  if (!res.ok && (res.status === 400 || res.status === 422) && /max_tokens|max_completion|maximum|token/i.test(errText(body))) {
    res = await send(false);
    body = (await res.json().catch(() => null)) as Body;
  }
  if (!res.ok) {
    const msg = errText(body) || res.statusText;
    if (res.status === 401 || res.status === 403) throw new HttpError(502, "AI API 키가 올바르지 않습니다. AI 설정을 확인하세요");
    if (res.status === 404) throw new HttpError(502, `모델 또는 주소를 찾을 수 없습니다: ${msg}`.slice(0, 240));
    if (res.status === 429 || res.status === 503 || /ResourceExhausted|rate limit|too many requests|overloaded/i.test(msg))
      throw new HttpError(503, `AI 서버가 지금 요청이 몰려 처리하지 못했습니다 (${res.status}${/ResourceExhausted/i.test(msg) ? " ResourceExhausted" : ""}). 자동으로 3번 시도했습니다. 1~2분 뒤 다시 누르거나, AI 드롭다운에서 다른 모델로 바꿔 보세요. NVIDIA 무료 API는 인기 모델에 요청이 몰리면 이렇게 거절합니다. — 원문: ${msg}`.slice(0, 400));
    throw new HttpError(502, `AI API 오류 (${res.status}): ${msg}`.slice(0, 240));
  }
  const choice = body?.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (!text.trim()) throw new HttpError(502, "AI 결과가 비었습니다. 다시 시도해 주세요");
  if (choice?.finish_reason === "length") throw new HttpError(502, "AI 결과가 너무 길어 잘렸습니다. 요청 범위를 줄이거나 모델 컨텍스트를 늘리세요");
  return text;
}

/** 답에서 JSON 하나를 꺼낸다 (코드 블록·앞뒤 설명·<think> 블록 허용) */
export function parseJson(text: string): unknown {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1]!.trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.search(/[{[]/);
    const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        /* 아래에서 오류 */
      }
    }
  }
  throw new HttpError(502, "AI 결과를 JSON으로 읽지 못했습니다. 다시 생성하거나 요청을 줄여 주세요");
}
