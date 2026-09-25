/**
 * 키-값 저장소 — 계정·세션·멤버·초대·AI 설정과 (서버리스 배포 시) 프로젝트 데이터를 담는다.
 *  - FileKv    : 한 프로세스용. 메모리에 두고 JSON 파일 하나에 원자적으로 쓴다 (planning serve 기본)
 *  - UpstashKv : Upstash Redis REST (Vercel Marketplace의 Upstash for Redis). 여러 인스턴스가 함께 쓴다
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Kv {
  get(key: string): Promise<string | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
  /** nx: 없을 때만 쓴다. 쓰면 true */
  set(key: string, value: string, opts?: { ttlSec?: number; nx?: boolean }): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  incr(key: string, ttlSec?: number): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  hset(key: string, field: string, value: string): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
}

type Entry = { v: string | string[] | Record<string, string>; exp?: number };

/** 메모리 + 파일 (file 없으면 메모리만 — 테스트용) */
export class FileKv implements Kv {
  private data = new Map<string, Entry>();
  private writing: Promise<void> = Promise.resolve();
  private constructor(private file?: string) {}

  static async open(file?: string): Promise<FileKv> {
    const kv = new FileKv(file);
    if (file && existsSync(file)) for (const [k, e] of Object.entries(JSON.parse(await readFile(file, "utf8")) as Record<string, Entry>)) kv.data.set(k, e);
    return kv;
  }

  private live(key: string): Entry | undefined {
    const e = this.data.get(key);
    if (e?.exp && e.exp <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }
  private persist(): Promise<void> {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    const now = Date.now();
    const snapshot = JSON.stringify(Object.fromEntries([...this.data].filter(([, e]) => !e.exp || e.exp > now)));
    this.writing = this.writing.then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, snapshot, { mode: 0o600 });
      await rename(tmp, file);
    });
    return this.writing;
  }
  async get(key: string) {
    const e = this.live(key);
    return typeof e?.v === "string" ? e.v : null;
  }
  async mget(keys: string[]) {
    return Promise.all(keys.map((k) => this.get(k)));
  }
  async set(key: string, value: string, opts: { ttlSec?: number; nx?: boolean } = {}) {
    if (opts.nx && this.live(key)) return false;
    this.data.set(key, { v: value, exp: opts.ttlSec ? Date.now() + opts.ttlSec * 1000 : undefined });
    await this.persist();
    return true;
  }
  async del(...keys: string[]) {
    for (const k of keys) this.data.delete(k);
    await this.persist();
  }
  async incr(key: string, ttlSec?: number) {
    const e = this.live(key);
    const n = (typeof e?.v === "string" ? Number(e.v) : 0) + 1;
    this.data.set(key, { v: String(n), exp: e?.exp ?? (ttlSec ? Date.now() + ttlSec * 1000 : undefined) });
    return n;
  }
  private setOf(key: string): string[] {
    const e = this.live(key);
    return Array.isArray(e?.v) ? e.v : [];
  }
  async sadd(key: string, member: string) {
    const s = this.setOf(key);
    if (!s.includes(member)) this.data.set(key, { v: [...s, member] });
    await this.persist();
  }
  async srem(key: string, member: string) {
    const s = this.setOf(key).filter((m) => m !== member);
    if (s.length) this.data.set(key, { v: s });
    else this.data.delete(key);
    await this.persist();
  }
  async smembers(key: string) {
    return [...this.setOf(key)];
  }
  private hashOf(key: string): Record<string, string> {
    const e = this.live(key);
    return e && typeof e.v === "object" && !Array.isArray(e.v) ? e.v : {};
  }
  async hset(key: string, field: string, value: string) {
    this.data.set(key, { v: { ...this.hashOf(key), [field]: value } });
    await this.persist();
  }
  async hdel(key: string, field: string) {
    const h = { ...this.hashOf(key) };
    delete h[field];
    if (Object.keys(h).length) this.data.set(key, { v: h });
    else this.data.delete(key);
    await this.persist();
  }
  async hgetall(key: string) {
    return { ...this.hashOf(key) };
  }
}

/** Upstash Redis REST — https://upstash.com/docs/redis/features/restapi */
export class UpstashKv implements Kv {
  constructor(private url: string, private token: string, private fetcher: typeof fetch = fetch) {
    this.url = url.replace(/\/$/, "");
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): UpstashKv | null {
    const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
    const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
    return url && token ? new UpstashKv(url, token) : null;
  }

  private async cmd<T>(...args: (string | number)[]): Promise<T> {
    const res = await this.fetcher(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(args.map(String)),
    });
    const body = (await res.json().catch(() => null)) as { result?: T; error?: string } | null;
    if (!res.ok || !body || body.error) throw new Error(`저장소(Redis) 오류: ${body?.error ?? res.status}`);
    return body.result as T;
  }

  get(key: string) {
    return this.cmd<string | null>("GET", key);
  }
  async mget(keys: string[]) {
    return keys.length ? this.cmd<(string | null)[]>("MGET", ...keys) : [];
  }
  async set(key: string, value: string, opts: { ttlSec?: number; nx?: boolean } = {}) {
    const args: (string | number)[] = ["SET", key, value];
    if (opts.nx) args.push("NX");
    if (opts.ttlSec) args.push("EX", Math.max(1, Math.round(opts.ttlSec)));
    return (await this.cmd<string | null>(...args)) === "OK";
  }
  async del(...keys: string[]) {
    if (keys.length) await this.cmd("DEL", ...keys);
  }
  async incr(key: string, ttlSec?: number) {
    const n = await this.cmd<number>("INCR", key);
    if (n === 1 && ttlSec) await this.cmd("EXPIRE", key, ttlSec);
    return n;
  }
  async sadd(key: string, member: string) {
    await this.cmd("SADD", key, member);
  }
  async srem(key: string, member: string) {
    await this.cmd("SREM", key, member);
  }
  async smembers(key: string) {
    return (await this.cmd<string[]>("SMEMBERS", key)) ?? [];
  }
  async hset(key: string, field: string, value: string) {
    await this.cmd("HSET", key, field, value);
  }
  async hdel(key: string, field: string) {
    await this.cmd("HDEL", key, field);
  }
  async hgetall(key: string) {
    const flat = (await this.cmd<string[]>("HGETALL", key)) ?? [];
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]!] = flat[i + 1]!;
    return out;
  }
}

/** 여러 인스턴스에서도 프로젝트 쓰기를 한 줄로 세우는 잠금 (SET NX + 만료) */
export async function withKvLock<T>(kv: Kv, key: string, fn: () => Promise<T>, ttlSec = 60): Promise<T> {
  const token = Math.random().toString(36).slice(2);
  const until = Date.now() + 20_000;
  while (!(await kv.set(key, token, { nx: true, ttlSec }))) {
    if (Date.now() > until) throw new Error("다른 사람이 저장 중입니다. 잠시 뒤 다시 시도하세요");
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 150));
  }
  try {
    return await fn();
  } finally {
    if ((await kv.get(key)) === token) await kv.del(key);
  }
}
