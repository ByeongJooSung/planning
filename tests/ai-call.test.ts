import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callAi, listModels, parseJson, probeModels } from "../src/server/ai.js";

/** NVIDIA·LM Studio 처럼 동작하는 OpenAI 호환 서버 */
let base = "";
let srv: Server;
const seen: { auth?: string; body?: any }[] = [];
let busy = 0;
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
});
