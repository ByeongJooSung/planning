import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callAi, listModels, parseJson } from "../src/server/ai.js";

/** NVIDIA·LM Studio 처럼 동작하는 OpenAI 호환 서버 */
let base = "";
let srv: Server;
const seen: { auth?: string; body?: any }[] = [];
beforeAll(async () => {
  srv = createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      const body = b ? JSON.parse(b) : undefined;
      seen.push({ auth: req.headers.authorization, body });
      if (req.url === "/v1/models") return res.end(JSON.stringify({ object: "list", data: [{ id: "qwen/qwen2.5" }, { id: "meta/llama-3.1-70b-instruct" }] }));
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
    await expect(listModels({ provider: "openai-compatible", baseUrl: "http://127.0.0.1:1/v1" })).rejects.toThrow(/연결하지 못했습니다/);
  });
  it("parseJson", () => {
    expect(parseJson('설명\n{"a":1}\n끝')).toEqual({ a: 1 });
  });
});
