import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileKv, UpstashKv, withKvLock } from "../src/server/kv.js";

/** Upstash REST 흉내: 명령 배열을 받아 FileKv(메모리)로 실행 */
async function fakeUpstash(token: string) {
  const mem = await FileKv.open();
  const exec = async (a: string[]): Promise<unknown> => {
    const [cmd, key, ...rest] = a;
    switch (cmd) {
      case "GET": return mem.get(key!);
      case "MGET": return mem.mget([key!, ...rest]);
      case "SET": {
        const nx = rest.includes("NX");
        const ex = rest.indexOf("EX");
        return (await mem.set(key!, rest[0]!, { nx, ttlSec: ex >= 0 ? Number(rest[ex + 1]) : undefined })) ? "OK" : null;
      }
      case "DEL": return (await mem.del(key!, ...rest), 1);
      case "INCR": return mem.incr(key!);
      case "EXPIRE": return 1;
      case "SADD": return (await mem.sadd(key!, rest[0]!), 1);
      case "SREM": return (await mem.srem(key!, rest[0]!), 1);
      case "SMEMBERS": return mem.smembers(key!);
      case "HSET": return (await mem.hset(key!, rest[0]!, rest[1]!), 1);
      case "HDEL": return (await mem.hdel(key!, rest[0]!), 1);
      case "HGETALL": return Object.entries(await mem.hgetall(key!)).flat();
      default: throw new Error(`unsupported ${cmd}`);
    }
  };
  const server = createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", async () => {
      res.setHeader("content-type", "application/json");
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: "Unauthorized" }));
      }
      try {
        res.end(JSON.stringify({ result: await exec(JSON.parse(b)) }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

let up: { server: Server; url: string };
beforeAll(async () => {
  up = await fakeUpstash("tok");
});
afterAll(() => up.server.close());

describe("UpstashKv", () => {
  it("문자열·집합·해시·NX·잠금", async () => {
    const kv = new UpstashKv(up.url, "tok");
    expect(await kv.set("a", "1")).toBe(true);
    expect(await kv.set("a", "2", { nx: true })).toBe(false);
    expect(await kv.mget(["a", "nope"])).toEqual(["1", null]);
    await kv.sadd("s", "x");
    await kv.sadd("s", "y");
    expect((await kv.smembers("s")).sort()).toEqual(["x", "y"]);
    await kv.hset("h", "f", "v");
    expect(await kv.hgetall("h")).toEqual({ f: "v" });
    expect(await kv.incr("n", 60)).toBe(1);
    let inside = 0;
    await Promise.all([1, 2, 3].map(() => withKvLock(kv, "L", async () => {
      inside++;
      expect(inside).toBe(1);
      await new Promise((r) => setTimeout(r, 30));
      inside--;
    })));
  });
  it("토큰이 틀리면 오류", async () => {
    await expect(new UpstashKv(up.url, "wrong").get("a")).rejects.toThrow(/Redis/);
  });
});

describe("Vercel 함수", () => {
  let base = "";
  let fn: Server;
  beforeAll(async () => {
    process.env.KV_REST_API_URL = up.url;
    process.env.KV_REST_API_TOKEN = "tok";
    const { default: handler } = await import("../src/server/vercel.js");
    fn = createServer((req, res) => void handler(req, res));
    await new Promise<void>((r) => fn.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(fn.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    fn.close();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("샘플 프로젝트를 넣고 첫 가입자가 운영자가 된다", async () => {
    const h = { "content-type": "application/json", "x-planning": "1" };
    expect((await (await fetch(base + "/api/config")).json()).maxUploadMb).toBe(3);
    const r = await fetch(base + "/api/signup", { method: "POST", headers: h, body: JSON.stringify({ email: "first@test.kr", name: "첫 가입", password: "password-1" }) });
    expect(r.status).toBe(200);
    const cookie = r.headers.get("set-cookie")!.split(";")[0]!;
    const list = await (await fetch(base + "/api/projects", { headers: { cookie } })).json();
    expect(list.projects.map((p: { model: { project: { code: string } }; role: string }) => [p.model.project.code, p.role])).toEqual([["PUBINFO", "OWNER"], ["SHOPMY", "OWNER"]]);
    const one = await (await fetch(base + "/api/projects/SHOPMY", { headers: { cookie } })).json();
    expect(one.project.snapshots.length).toBeGreaterThan(0);
    expect(one.project.diff).not.toBeNull();
    const cmd = await fetch(base + "/api/projects/SHOPMY/commands", { method: "POST", headers: { ...h, cookie }, body: JSON.stringify({ cmd: { op: "snapshot", note: "Vercel" } }) });
    expect(cmd.status).toBe(200);
    expect((await cmd.json()).project.snapshots.length).toBe(one.project.snapshots.length + 1);
  });

  it("저장소 연결이 빠지면 안내 화면", async () => {
    const { default: handler } = await import("../src/server/vercel.js");
    const saved = process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_URL;
    const s = createServer((req, res) => void handler(req, res));
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/`);
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("Upstash");
    s.close();
    process.env.KV_REST_API_URL = saved;
  });
});
