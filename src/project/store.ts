/**
 * 파일 기반 프로젝트 저장소 (PRD §6 프로젝트 폴더 구조)
 *
 * projects/{code}/
 *  ├─ project.json
 *  ├─ sources/  analysis/  outputs/  changes/  rtm/
 *  ├─ model/     systems.json, requirements.json, … (MODEL_FILES)
 *  └─ history/   v{버전}/ 스냅샷
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MODEL_FILES, type ModelFileName, type Model } from "../model/schema.js";
import { validateModel } from "../model/validate.js";
import { buildNewProject, fromFiles, toFiles, type CreateProjectInput } from "./model-files.js";

export { buildNewProject, emptyModel, fromFiles, toFiles, type CreateProjectInput } from "./model-files.js";

export const PROJECT_SUBDIRS = ["model", "sources", "knowledge", "analysis", "outputs", "changes", "rtm", "history"] as const;

export function projectDir(root: string, code: string): string {
  return path.join(root, code);
}

export async function createProject(root: string, input: CreateProjectInput, now = new Date()): Promise<string> {
  const dir = projectDir(root, input.code);
  if (existsSync(path.join(dir, "project.json"))) throw new Error(`이미 있는 프로젝트입니다: ${input.code}`);
  const model = buildNewProject(input, now);
  for (const d of PROJECT_SUBDIRS) await mkdir(path.join(dir, d), { recursive: true });
  await saveModel(dir, model, { touch: false });
  return dir;
}

export async function loadModel(dir: string): Promise<Model> {
  const projectPath = path.join(dir, "project.json");
  if (!existsSync(projectPath)) throw new Error(`프로젝트를 찾을 수 없습니다: ${dir}`);
  const project = await readJson(projectPath);
  const files: Partial<Record<ModelFileName, unknown>> = {};
  for (const name of Object.keys(MODEL_FILES) as ModelFileName[]) {
    const f = path.join(dir, "model", name);
    if (existsSync(f)) files[name] = await readJson(f);
  }
  return fromFiles(project, files);
}

/**
 * 모델을 저장한다. 참조 무결성 오류가 있으면 저장하지 않는다.
 * touch=true이면 updatedAt을 갱신한다.
 */
export async function saveModel(dir: string, m: Model, opts: { touch?: boolean; now?: Date } = {}): Promise<void> {
  const errors = validateModel(m).filter((i) => i.level === "error");
  if (errors.length) throw new Error(`모델 오류로 저장하지 않았습니다:\n- ${errors.map((e) => e.message).join("\n- ")}`);
  if (opts.touch !== false) m.project.updatedAt = (opts.now ?? new Date()).toISOString();

  await mkdir(path.join(dir, "model"), { recursive: true });
  await writeJson(path.join(dir, "project.json"), m.project);
  for (const [name, data] of Object.entries(toFiles(m))) await writeJson(path.join(dir, "model", name), data);
}

export async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`);
  }
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}
