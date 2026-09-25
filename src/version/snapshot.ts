/**
 * 버전 스냅샷 — history/v{버전}/ 에 project.json, model/*.json, rtm.json을 고정 저장한다.
 * 스냅샷을 찍으면 현재 작업 버전은 다음 번호로 올라간다(0.1 → 0.2, --major이면 1.0).
 */
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { MODEL_FILES, type Model, type ModelFileName } from "../model/schema.js";
import { fromFiles, readJson, saveModel, toFiles, writeJson } from "../project/store.js";
import { buildRtm } from "../trace/rtm.js";
import { bumpVersion, compareVersion } from "./versioning.js";

export { bumpVersion, compareVersion } from "./versioning.js";

export interface SnapshotMeta {
  version: string;
  takenAt: string;
  note: string;
}

const snapDir = (dir: string, v: string) => path.join(dir, "history", `v${v}`);

export async function takeSnapshot(
  dir: string,
  m: Model,
  opts: { note?: string; major?: boolean; now?: Date } = {},
): Promise<SnapshotMeta> {
  const now = opts.now ?? new Date();
  const version = m.project.version;
  const target = snapDir(dir, version);
  if (existsSync(target)) throw new Error(`이미 있는 스냅샷입니다: v${version}`);

  await mkdir(path.join(target, "model"), { recursive: true });
  await writeJson(path.join(target, "project.json"), m.project);
  for (const [name, data] of Object.entries(toFiles(m))) await writeJson(path.join(target, "model", name), data);
  await writeJson(path.join(target, "rtm.json"), buildRtm(m, now));
  const meta: SnapshotMeta = { version, takenAt: now.toISOString(), note: opts.note ?? "" };
  await writeJson(path.join(target, "meta.json"), meta);

  m.project.version = bumpVersion(version, opts.major);
  await saveModel(dir, m, { now });
  return meta;
}

export async function listSnapshots(dir: string): Promise<SnapshotMeta[]> {
  const h = path.join(dir, "history");
  if (!existsSync(h)) return [];
  const out: SnapshotMeta[] = [];
  for (const d of await readdir(h)) {
    const f = path.join(h, d, "meta.json");
    if (existsSync(f)) out.push((await readJson(f)) as SnapshotMeta);
  }
  return out.sort((a, b) => compareVersion(a.version, b.version));
}

export async function loadSnapshot(dir: string, version: string): Promise<Model> {
  const v = version.replace(/^v/, "");
  const target = snapDir(dir, v);
  if (!existsSync(target)) throw new Error(`스냅샷이 없습니다: v${v}`);
  const files: Partial<Record<ModelFileName, unknown>> = {};
  for (const name of Object.keys(MODEL_FILES) as ModelFileName[]) {
    const f = path.join(target, "model", name);
    if (existsSync(f)) files[name] = await readJson(f);
  }
  return fromFiles(await readJson(path.join(target, "project.json")), files);
}

