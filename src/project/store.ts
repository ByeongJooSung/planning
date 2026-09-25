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
import type { z } from "zod";
import {
  MODEL_FILES,
  Project,
  type ModelFileName,
  type Model,
  type System,
} from "../model/schema.js";
import { validateModel } from "../model/validate.js";
import { SYSTEM_PRESETS, type PresetName } from "./presets.js";

export const PROJECT_SUBDIRS = ["model", "sources", "analysis", "outputs", "changes", "rtm", "history"] as const;

export interface CreateProjectInput {
  code: string;
  name: string;
  serviceType: "NEW" | "EXISTING";
  changeScope?: "NEW_MENU" | "MODIFY" | "RENEWAL" | null;
  submissionTemplate?: "GENERAL" | "PUBLIC";
  requirementIdMode?: "GENERATED" | "ORIGINAL";
  preset?: PresetName;
  systems?: System[];
}

export function projectDir(root: string, code: string): string {
  return path.join(root, code);
}

export async function createProject(root: string, input: CreateProjectInput, now = new Date()): Promise<string> {
  const dir = projectDir(root, input.code);
  if (existsSync(path.join(dir, "project.json"))) throw new Error(`이미 있는 프로젝트입니다: ${input.code}`);
  if (input.serviceType === "EXISTING" && !input.changeScope)
    throw new Error("기존 서비스 프로젝트는 변경 범위(NEW_MENU / MODIFY / RENEWAL)를 지정해야 합니다");
  if (input.serviceType === "NEW" && input.changeScope)
    throw new Error("신규 구축 프로젝트에는 변경 범위를 지정하지 않습니다");

  const ts = now.toISOString();
  const project = Project.parse({
    code: input.code,
    name: input.name,
    serviceType: input.serviceType,
    changeScope: input.changeScope ?? null,
    submissionTemplate: input.submissionTemplate,
    requirementIdMode: input.requirementIdMode,
    stages: initialStages(input),
    createdAt: ts,
    updatedAt: ts,
  });

  const model = emptyModel(project);
  model.systems = structuredClone(input.systems ?? SYSTEM_PRESETS[input.preset ?? "none"]);

  for (const d of PROJECT_SUBDIRS) await mkdir(path.join(dir, d), { recursive: true });
  await saveModel(dir, model, { touch: false });
  return dir;
}

/** 서비스 유형·변경 범위에 따른 단계 초기 상태 (PRD §3.2) */
function initialStages(input: CreateProjectInput): Project["stages"] {
  const stages: Project["stages"] = {
    S0: "COLLECTING",
    S1: "NOT_STARTED",
    S2: "NOT_STARTED",
    S3: "NOT_STARTED",
    S4: "NOT_STARTED",
    S5: "NOT_STARTED",
  };
  if (input.serviceType === "EXISTING") stages.S0A = "NOT_STARTED";
  if (input.changeScope === "MODIFY") stages.S2 = "SKIPPED";
  return stages;
}

export function emptyModel(project: Project): Model {
  return fromFiles(project, {});
}

/** Model ↔ model/*.json 파일 내용 */
export function toFiles(m: Model): Record<ModelFileName, unknown> {
  return {
    "systems.json": { systems: m.systems },
    "sources.json": { sources: m.sources },
    "requirements.json": { requirements: m.requirements },
    "policies.json": m.policies,
    "plan.json": m.plan,
    "ia.json": m.ia,
    "flows.json": { flows: m.flows },
    "storyboard.json": m.storyboard,
    "prototype.json": m.prototype,
    "changes.json": { items: m.changes },
    "rtm-records.json": m.rtmRecords,
  };
}

export function fromFiles(project: unknown, files: Partial<Record<ModelFileName, unknown>>): Model {
  const p = <N extends ModelFileName>(n: N): z.output<(typeof MODEL_FILES)[N]> => {
    try {
      return MODEL_FILES[n].parse(files[n] ?? {}) as z.output<(typeof MODEL_FILES)[N]>;
    } catch (e) {
      throw new Error(`model/${n} 형식 오류: ${(e as Error).message}`);
    }
  };
  return {
    project: Project.parse(project),
    systems: p("systems.json").systems,
    sources: p("sources.json").sources,
    requirements: p("requirements.json").requirements,
    policies: p("policies.json"),
    plan: p("plan.json"),
    ia: p("ia.json"),
    flows: p("flows.json").flows,
    storyboard: p("storyboard.json"),
    prototype: p("prototype.json"),
    changes: p("changes.json").items,
    rtmRecords: p("rtm-records.json"),
  };
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
