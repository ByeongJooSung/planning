import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiParseError, callAi, extractJson, listModels, parseJson, probeModels, stripThink } from "../src/server/ai.js";

/** NVIDIA·LM Studio 처럼 동작하는 OpenAI 호환 서버 */
let base = "";
let srv: Server;
const seen: { auth?: string; body?: any }[] = [];
let busy = 0;
let sloppy = 0;
beforeAll(async () => {
  srv = createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      const body = b ? JSON.parse(b) : undefined;
      seen.push({ auth: req.headers.authorization, body });
      if (req.url === "/v1/models") return res.end(JSON.stringify({ object: "list", data: [{ id: "qwen/qwen2.5" }, { id: "meta/llama-3.1-70b-instruct" }] }));
      if (req.url === "/html/models") {
        res.setHeader("content-type", "text/html");
        return res.end("<!doctype html><html><body>ngrok warning</body></html>");
      }
      if (req.url === "/empty/v1/models") return res.end(JSON.stringify({ data: [] }));
      if (req.url === "/auth/v1/models") {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: { message: "Unauthorized" } }));
      }
      if (req.url === "/busy/v1/chat/completions") {
        busy++;
        if (busy <= 2) {
          res.statusCode = 503;
          res.setHeader("retry-after", "1");
          return res.end(JSON.stringify({ error: "ResourceExhausted: Worker local total request limit reached (74/16)" }));
        }
        return res.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] }));
      }
      if (req.url === "/sloppy/v1/chat/completions") {
        sloppy++;
        const content = sloppy === 1 ? "요청하신 화면을 정리하면 다음과 같습니다. 제목, 버튼, 목록" : '{"ok":true}';
        return res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }));
      }
      if (req.url === "/never/v1/chat/completions") {
        return res.end(JSON.stringify({ choices: [{ message: { content: "죄송하지만 형식을 맞추기 어렵습니다" }, finish_reason: "stop" }] }));
      }
      if (req.url === "/cut/v1/chat/completions") {
        return res.end(JSON.stringify({ choices: [{ message: { content: "<think>음… 먼저 구조를 생각해 보면" }, finish_reason: "length" }] }));
      }
      if (req.url === "/down/v1/chat/completions") {
        res.statusCode = 503;
        res.setHeader("retry-after", "1");
        return res.end(JSON.stringify({ error: "ResourceExhausted: Worker local total request limit reached (74/16)" }));
      }
      if (req.url === "/v1/chat/completions") {
        if (body.max_tokens > 4096) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: { message: "max_tokens must be less than or equal to 4096" } }));
        }
        return res.end(JSON.stringify({ choices: [{ message: { content: '<think>생각</think>\n```json\n{"ok":true}\n```' }, finish_reason: "stop" }] }));
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`;
});
afterAll(() => srv.close());

describe("OpenAI 호환 호출", () => {
  it("모델 목록 (키 선택)", async () => {
    expect(await listModels({ provider: "openai-compatible", baseUrl: base })).toEqual(["meta/llama-3.1-70b-instruct", "qwen/qwen2.5"]);
    expect(seen.at(-1)!.auth).toBeUndefined();
    await listModels({ provider: "openai-compatible", baseUrl: base, apiKey: "nvapi-x" });
    expect(seen.at(-1)!.auth).toBe("Bearer nvapi-x");
  });
  it("max_tokens 를 거부하면 빼고 다시 보낸다, <think>·코드 블록을 걸러 JSON을 읽는다", async () => {
    const r = await callAi({ source: "project", provider: "openai-compatible", baseUrl: base, model: "qwen/qwen2.5" }, "hi");
    expect(r.output).toEqual({ ok: true });
    expect(seen.at(-2)!.body.max_tokens).toBe(8192);
    expect(seen.at(-1)!.body.max_tokens).toBeUndefined();
    await callAi({ source: "project", provider: "openai-compatible", baseUrl: base, model: "m", maxTokens: 2048 }, "hi");
    expect(seen.at(-1)!.body.max_tokens).toBe(2048);
  });
  it("연결 안 되는 주소", async () => {
    await expect(listModels({ provider: "openai-compatible", baseUrl: "http://127.0.0.1:59999/v1" })).rejects.toThrow(/연결을 거부/);
  });
  it("모델 불러오기 결과: 성공·실패 원인과 해결 방법", async () => {
    const ok = await probeModels({ provider: "openai-compatible", baseUrl: base }, {});
    expect(ok).toMatchObject({ ok: true, url: `${base}/models`, status: 200 });
    expect(ok.models).toHaveLength(2);
    const root = base.replace(/\/v1$/, "");
    const no404 = await probeModels({ provider: "openai-compatible", baseUrl: root }, {});
    expect(no404).toMatchObject({ ok: false, status: 404 });
    expect(no404.hint).toMatch(/\/v1/);
    expect(await probeModels({ provider: "openai-compatible", baseUrl: `${root}/html` }, {})).toMatchObject({ ok: false, error: expect.stringMatching(/HTML/) });
    expect(await probeModels({ provider: "openai-compatible", baseUrl: `${root}/empty/v1` }, {})).toMatchObject({ ok: false, error: expect.stringMatching(/0개/) });
    expect(await probeModels({ provider: "openai-compatible", baseUrl: `${root}/auth/v1` }, {})).toMatchObject({ ok: false, status: 401, error: expect.stringMatching(/키/) });
    const refused = await probeModels({ provider: "openai-compatible", baseUrl: "http://127.0.0.1:59999/v1" }, {});
    expect(refused).toMatchObject({ ok: false, code: "ECONNREFUSED" });
    expect(refused.hint).toMatch(/Start Server/);
    // 인터넷 배포(Vercel)에서는 localhost 를 부르기 전에 막고 터널 방법을 알려 준다
    const onVercel = await probeModels({ provider: "openai-compatible", baseUrl: "http://localhost:1234/v1" }, { VERCEL: "1" });
    expect(onVercel).toMatchObject({ ok: false, code: "PRIVATE_ADDRESS" });
    expect(onVercel.hint).toMatch(/cloudflared/);
    const ts = await probeModels({ provider: "openai-compatible", baseUrl: "http://100.115.248.12:1234/v1" }, { VERCEL: "1" });
    expect(ts).toMatchObject({ ok: false, code: "TAILSCALE_ADDRESS" });
    expect(ts.hint).toMatch(/tailscale funnel 1234/);
    // Funnel 공개 주소(*.ts.net)는 막지 않는다
    expect((await probeModels({ provider: "openai-compatible", baseUrl: "https://pc.tail1234.ts.net/v1" }, { VERCEL: "1" })).code).not.toBe("TAILSCALE_ADDRESS");
    expect(await probeModels({ provider: "openai-compatible", baseUrl: "not a url" }, {})).toMatchObject({ ok: false, error: expect.stringMatching(/URL/) });
  });
  it("요청이 몰려 503이면 두 번까지 다시 보내고, 계속 실패하면 알기 쉽게 알린다", async () => {
    const root = base.replace(/\/v1$/, "");
    const r = await callAi({ source: "project", provider: "openai-compatible", baseUrl: `${root}/busy/v1`, model: "m" }, "hi");
    expect(r.output).toEqual({ ok: true });
    expect(busy).toBe(3);
    await expect(callAi({ source: "project", provider: "openai-compatible", baseUrl: `${root}/down/v1`, model: "m" }, "hi")).rejects.toThrow(/요청이 몰려.*다른 모델/);
  }, 20000);
  it("parseJson", () => {
    expect(parseJson('설명\n{"a":1}\n끝')).toEqual({ a: 1 });
  });
  it("추론형 모델 답에서 JSON을 찾아 읽는다", () => {
    const ok = (t: string) => {
      const r = extractJson(t);
      expect(r.ok, t).toBe(true);
      return (r as { value: unknown }).value;
    };
    // 여는 태그 없이 닫는 </think> 만 오는 경우 (nemotron 등)
    expect(ok('먼저 요구를 보면 {"x": 1} 같은 모양이 좋겠다.</think>\n{"a":1}')).toEqual({ a: 1 });
    expect(ok('<think>{"draft":true}</think>\n결과입니다:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    // 설명 글 사이에 낀 JSON, 문자열 안 괄호
    expect(ok('다음과 같습니다.\n{"a":"괄호 } 포함","b":[1,2]}\n이상입니다.')).toEqual({ a: "괄호 } 포함", b: [1, 2] });
    // 끝 쉼표·주석·굽은 따옴표·문자열 안 줄바꿈
    expect(ok('{\n  // 제목\n  "a": [1, 2,],\n  "b": "줄\n바꿈",\n}')).toEqual({ a: [1, 2], b: "줄\n바꿈" });
    expect(ok("{\u201ca\u201d: 1}")).toEqual({ a: 1 });
    // 작은 조각보다 큰 결과 블록을 고른다
    expect(ok('예: {"k":1}\n최종:\n{"screens":[{"id":"S1"}],"notes":"n"}')).toEqual({ screens: [{ id: "S1" }], notes: "n" });
    const fail = (t: string) => (extractJson(t) as { reason: string }).reason;
    expect(fail("<think>아직 생각 중")).toMatch(/생각 과정만/);
    expect(fail("")).toMatch(/빈 답/);
    expect(fail("그냥 글로만 답합니다")).toMatch(/글로만/);
    expect(fail('{"a": [1, 2, {"b": "끊')).toMatch(/끊김/);
    expect(stripThink("a<think>b</think>c")).toBe("ac");
    expect(stripThink("x</think>y")).toBe("y");
  });
  it("JSON을 못 읽으면 한 번 다시 요청하고, 그래도 안 되면 원문을 담아 알린다", async () => {
    const root = base.replace(/\/v1$/, "");
    const r = await callAi({ source: "project", provider: "openai-compatible", baseUrl: `${root}/sloppy/v1`, model: "m" }, "hi");
    expect(r).toMatchObject({ output: { ok: true }, repaired: true });
    const msgs = seen.at(-1)!.body.messages;
    expect(msgs.at(-2).role).toBe("assistant");
    expect(msgs.at(-1).content).toMatch(/JSON 객체 하나만/);
    const e = await callAi({ source: "project", provider: "openai-compatible", baseUrl: `${root}/never/v1`, model: "m" }, "hi").catch((x) => x);
    expect(e).toBeInstanceOf(AiParseError);
    expect(e.message).toMatch(/글로만/);
    expect(e.raw).toMatch(/다시 요청한 답/);
    // 추론형 모델이 생각만 하다 토큰 한도에 닿으면 다시 요청하지 않고 원인·해결을 알린다
    const n = seen.length;
    const cut = await callAi({ source: "project", provider: "openai-compatible", baseUrl: `${root}/cut/v1`, model: "m", maxTokens: 4096 }, "hi").catch((x) => x);
    expect(cut).toBeInstanceOf(AiParseError);
    expect(cut.message).toMatch(/생각 과정.*최대 출력 토큰\(지금 4096\)/);
    expect(cut.raw).toMatch(/<think>/);
    expect(seen.length - n).toBe(1);
  });
});
