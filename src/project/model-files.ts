/**
 * 프로젝트 모델 ↔ 파일 변환과 새 프로젝트 모델 만들기 — 파일 시스템을 쓰지 않는 순수 함수.
 * CLI(파일 저장소), 서버 모드, 브라우저(웹 서비스)가 함께 쓴다.
 */
import type { z } from "zod";
import { MODEL_FILES, Project, type Model, type ModelFileName, type System } from "../model/schema.js";
import { validateModel } from "../model/validate.js";
import { SYSTEM_PRESETS, type PresetName } from "./presets.js";

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

/** 입력을 검사해 새 프로젝트 모델을 만든다 */
export function buildNewProject(input: CreateProjectInput, now = new Date()): Model {
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
  const errors = validateModel(model).filter((i) => i.level === "error");
  if (errors.length) throw new Error(errors.map((e) => e.message).join("\n"));
  return model;
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
    "design.json": m.design,
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
    design: p("design.json"),
  };
}

