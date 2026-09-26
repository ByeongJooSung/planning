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

/** 연결에서 쓸 수 있는 모델 이름 목록 (GET /models) */
export async function listModels(p: AiProbe): Promise<string[]> {
  if (p.provider === "anthropic") {
    const client = new Anthropic({ apiKey: p.apiKey, ...(p.baseUrl ? { baseURL: p.baseUrl } : {}), maxRetries: 1, timeout: 20_000 });
    const ids: string[] = [];
    try {
      for await (const m of client.models.list({ limit: 100 })) ids.push(m.id);
    } catch (e) {
      throw mapAnthropicError(e);
    }
    return ids;
  }
  let res: Response;
  try {
    res = await fetch(`${p.baseUrl!.replace(/\/$/, "")}/models`, { headers: p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {}, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new HttpError(502, `AI 서버에 연결하지 못했습니다 (${(e as Error).message}). 주소가 이 서비스에서 접속 가능한지 확인하세요 — localhost 주소는 서비스가 도는 서버 자신을 뜻합니다`);
  }
  const body = (await res.json().catch(() => null)) as { data?: { id?: string }[]; models?: { name?: string; id?: string }[]; error?: { message?: string } | string } | null;
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new HttpError(502, "API 키가 필요하거나 올바르지 않습니다");
    const msg = typeof body?.error === "string" ? body.error : body?.error?.message;
    throw new HttpError(502, `모델 목록을 받지 못했습니다 (${res.status}${msg ? `: ${msg}` : ""})`.slice(0, 240));
  }
  const ids = (body?.data ?? body?.models ?? []).map((m) => ("id" in m && m.id) || ("name" in m && m.name) || "").filter(Boolean) as string[];
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

/** OpenAI 호환 /chat/completions — NVIDIA(integrate.api.nvidia.com), LM Studio, Ollama, vLLM, 외부 호환 API */
async function callOpenAiCompatible(cfg: AiResolved, turns: Turn[], signal?: AbortSignal): Promise<string> {
  const url = `${cfg.baseUrl!.replace(/\/$/, "")}/chat/completions`;
  const post = async (withMax: boolean) => {
    try {
      return await fetch(url, {
        method: "POST",
        signal: signal ?? AbortSignal.timeout(10 * 60_000),
        headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: "system", content: SYSTEM }, ...turns], temperature: 0.3, ...(withMax ? { max_tokens: cfg.maxTokens ?? 8192 } : {}) }),
      });
    } catch (e) {
      throw new HttpError(502, `AI 서버에 연결하지 못했습니다 (${(e as Error).message}). 주소와 서버 실행 여부를 확인하세요`);
    }
  };
  type Body = { choices?: { message?: { content?: string; reasoning_content?: string }; finish_reason?: string }[]; error?: { message?: string } | string; detail?: string } | null;
  let res = await post(true);
  let body = (await res.json().catch(() => null)) as Body;
  // 모델마다 출력 한도가 달라 max_tokens 를 거부하면 빼고 한 번 더 보낸다
  const errText = (b: Body) => (typeof b?.error === "string" ? b.error : b?.error?.message) ?? b?.detail ?? "";
  if (!res.ok && (res.status === 400 || res.status === 422) && /max_tokens|max_completion|maximum|token/i.test(errText(body))) {
    res = await post(false);
    body = (await res.json().catch(() => null)) as Body;
  }
  if (!res.ok) {
    const msg = errText(body) || res.statusText;
    if (res.status === 401 || res.status === 403) throw new HttpError(502, "AI API 키가 올바르지 않습니다. AI 설정을 확인하세요");
    if (res.status === 404) throw new HttpError(502, `모델 또는 주소를 찾을 수 없습니다: ${msg}`.slice(0, 240));
    if (res.status === 429) throw new HttpError(429, "AI 요청이 많습니다. 잠시 뒤 다시 시도하세요");
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
