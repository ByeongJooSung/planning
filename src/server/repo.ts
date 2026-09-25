/**
 * 프로젝트 저장소 — 웹 서비스가 프로젝트 상태(모델·참조자료 조각·스냅샷·원본 파일)를 읽고 쓰는 곳.
 *  - FsRepo : 파일 저장소(<root>/<코드>/). CLI와 같은 폴더 구조 — planning serve 기본
 *  - KvRepo : 키-값 저장소(Upstash Redis) — Vercel 같은 서버리스 배포
 * 편집 규칙은 서비스 코어(execute)가 맡고, 저장소는 이전 상태와 새 상태의 차이만 쓴다.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadChunks, saveChunks } from "../knowledge/store.js";
import type { Model, ModelFileName } from "../model/schema.js";
import { fromFiles, toFiles } from "../project/model-files.js";
import { loadModel, PROJECT_SUBDIRS, saveModel } from "../project/store.js";
import type { ProjectState, SnapshotMeta, SnapshotRecord } from "../service/core.js";
import { listSnapshots, loadSnapshot, writeSnapshot } from "../version/snapshot.js";
import { compareVersion } from "../version/versioning.js";
import { withKvLock, type Kv } from "./kv.js";

/** 스냅샷 모델을 어디까지 읽을지: last=비교 기준(마지막)만, all=전부(옮기기용), none=목록만 */
export type SnapLoad = "last" | "all" | "none";

export interface ProjectRepo {
  list(): Promise<string[]>;
  exists(code: string): Promise<boolean>;
  create(model: Model): Promise<void>;
  load(code: string, snaps?: SnapLoad): Promise<ProjectState>;
  /** prev → next 차이를 쓴다. files: 참조자료 원본(sources/…) */
  save(code: string, prev: ProjectState, next: ProjectState, files?: { path: string; data: Buffer }[]): Promise<void>;
  remove(code: string): Promise<void>;
  lock<T>(code: string, fn: () => Promise<T>): Promise<T>;
}

const newSnaps = (prev: ProjectState, next: ProjectState) =>
  next.snapshots.filter((s) => s.model && !prev.snapshots.some((p) => p.meta.version === s.meta.version));
const removedSources = (prev: ProjectState, next: ProjectState) =>
  prev.model.sources.filter((s) => !next.model.sources.some((n) => n.id === s.id)).map((s) => s.location).filter((l) => l.startsWith("sources/"));
const safePath = (p: string) => {
  const norm = path.posix.normalize(p);
  if (!norm.startsWith("sources/") || norm.includes("..")) throw new Error(`저장할 수 없는 경로입니다: ${p}`);
  return norm;
};

// ── 파일 저장소 ───────────────────────────────────
export class FsRepo implements ProjectRepo {
  private locks = new Map<string, Promise<unknown>>();
  constructor(readonly root: string) {}

  private dir(code: string) {
    return path.join(this.root, code);
  }
  async list() {
    if (!existsSync(this.root)) return [];
    const out: string[] = [];
    for (const d of await readdir(this.root, { withFileTypes: true })) if (d.isDirectory() && !d.name.startsWith(".") && existsSync(path.join(this.root, d.name, "project.json"))) out.push(d.name);
    return out.sort();
  }
  async exists(code: string) {
    return existsSync(path.join(this.dir(code), "project.json"));
  }
  async create(model: Model) {
    const dir = this.dir(model.project.code);
    if (existsSync(dir)) throw new Error(`이미 있는 프로젝트 코드입니다: ${model.project.code}`);
    for (const d of PROJECT_SUBDIRS) await mkdir(path.join(dir, d), { recursive: true });
    await saveModel(dir, model, { touch: false });
  }
  async load(code: string, snaps: SnapLoad = "last"): Promise<ProjectState> {
    const dir = this.dir(code);
    const model = await loadModel(dir);
    const chunks = await loadChunks(dir);
    const metas = await listSnapshots(dir);
    const snapshots: SnapshotRecord[] = [];
    for (let i = 0; i < metas.length; i++) {
      const want = snaps === "all" || (snaps === "last" && i === metas.length - 1);
      snapshots.push({ meta: metas[i]!, model: want ? await loadSnapshot(dir, metas[i]!.version) : undefined });
    }
    return { model, chunks, snapshots };
  }
  async save(code: string, prev: ProjectState, next: ProjectState, files: { path: string; data: Buffer }[] = []) {
    const dir = this.dir(code);
    for (const f of files) {
      const p = path.join(dir, safePath(f.path));
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, f.data);
    }
    for (const s of newSnaps(prev, next)) await writeSnapshot(dir, s.meta, s.model!);
    await saveModel(dir, next.model, { touch: false });
    if (next.chunks !== prev.chunks) await saveChunks(dir, next.chunks);
    for (const loc of removedSources(prev, next)) await rm(path.join(dir, safePath(loc)), { force: true });
  }
  async remove(code: string) {
    const trash = path.join(this.root, ".service", "trash");
    await mkdir(trash, { recursive: true });
    await rename(this.dir(code), path.join(trash, `${code}-${Date.now()}`));
  }
  lock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(code) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(code, next.catch(() => undefined));
    return next;
  }
}

// ── 키-값 저장소 ──────────────────────────────────
const P = {
  list: "prj:list",
  model: (c: string) => `prj:${c}:model`,
  chunks: (c: string) => `prj:${c}:chunks`,
  snaps: (c: string) => `prj:${c}:snaps`,
  snap: (c: string, v: string) => `prj:${c}:snap:${v}`,
  file: (c: string, p: string) => `prj:${c}:file:${p}`,
  lock: (c: string) => `prj:${c}:lock`,
};
type Stored = { project: unknown; files: Partial<Record<ModelFileName, unknown>> };
const pack = (m: Model): string => JSON.stringify({ project: m.project, files: toFiles(m) } satisfies Stored);
const unpack = (s: string): Model => {
  const d = JSON.parse(s) as Stored;
  return fromFiles(d.project, d.files);
};

export class KvRepo implements ProjectRepo {
  constructor(private kv: Kv) {}

  async list() {
    return (await this.kv.smembers(P.list)).sort();
  }
  async exists(code: string) {
    return (await this.kv.get(P.model(code))) != null;
  }
  async create(model: Model) {
    const code = model.project.code;
    if (!(await this.kv.set(P.model(code), pack(model), { nx: true }))) throw new Error(`이미 있는 프로젝트 코드입니다: ${code}`);
    await this.kv.sadd(P.list, code);
  }
  async load(code: string, snaps: SnapLoad = "last"): Promise<ProjectState> {
    const [m, c] = await this.kv.mget([P.model(code), P.chunks(code)]);
    if (!m) throw new Error(`프로젝트를 찾을 수 없습니다: ${code}`);
    const metas = Object.values(await this.kv.hgetall(P.snaps(code)))
      .map((s) => JSON.parse(s) as SnapshotMeta)
      .sort((a, b) => compareVersion(a.version, b.version));
    const want = metas.filter((_, i) => snaps === "all" || (snaps === "last" && i === metas.length - 1));
    const bodies = await this.kv.mget(want.map((x) => P.snap(code, x.version)));
    const models = new Map(want.map((x, i) => [x.version, bodies[i] ? unpack(bodies[i]!) : undefined]));
    return {
      model: unpack(m),
      chunks: c ? (JSON.parse(c) as ProjectState["chunks"]) : [],
      snapshots: metas.map((meta) => ({ meta, model: models.get(meta.version) })),
    };
  }
  async save(code: string, prev: ProjectState, next: ProjectState, files: { path: string; data: Buffer }[] = []) {
    for (const f of files) await this.kv.set(P.file(code, safePath(f.path)), f.data.toString("base64"));
    for (const s of newSnaps(prev, next)) {
      await this.kv.set(P.snap(code, s.meta.version), pack(s.model!));
      await this.kv.hset(P.snaps(code), s.meta.version, JSON.stringify(s.meta));
    }
    await this.kv.set(P.model(code), pack(next.model));
    if (next.chunks !== prev.chunks) await this.kv.set(P.chunks(code), JSON.stringify(next.chunks));
    const gone = removedSources(prev, next).map((l) => P.file(code, safePath(l)));
    if (gone.length) await this.kv.del(...gone);
  }
  async remove(code: string) {
    const st = await this.load(code, "none");
    // 30일 동안 휴지통에 모델·조각을 남긴다 (원본 파일은 지움)
    await this.kv.set(`trash:${code}:${Date.now()}`, JSON.stringify({ model: pack(st.model), chunks: st.chunks }), { ttlSec: 30 * 86400 });
    const keys = [P.model(code), P.chunks(code), P.snaps(code), ...st.snapshots.map((s) => P.snap(code, s.meta.version)), ...st.model.sources.filter((s) => s.location.startsWith("sources/")).map((s) => P.file(code, s.location))];
    await this.kv.del(...keys);
    await this.kv.srem(P.list, code);
  }
  lock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    return withKvLock(this.kv, P.lock(code), fn);
  }
}

/** 파일 저장소의 프로젝트를 다른 저장소로 옮긴다 (없는 코드만) — 서버리스 첫 실행 때 샘플 넣기 */
export async function copyProjects(from: ProjectRepo, to: ProjectRepo): Promise<string[]> {
  const done: string[] = [];
  for (const code of await from.list()) {
    if (await to.exists(code)) continue;
    const st = await from.load(code, "all");
    await to.create(st.model);
    await to.save(code, { ...st, chunks: [], snapshots: [] }, st);
    done.push(code);
  }
  return done;
}
