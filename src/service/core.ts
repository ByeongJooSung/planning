/**
 * 서비스 코어 — 웹 서비스(서버 모드·브라우저)가 쓰는 명령 실행과 화면 데이터 계산.
 * 파일 시스템을 쓰지 않는다. 저장은 어댑터(서버: 파일 저장소, 브라우저: 아티팩트 DB)가 맡는다.
 *
 *  ProjectState = 모델 + 참조자료 조각 + 스냅샷
 *  execute(state, command) → 사본에 적용 → 무결성 검사 → 새 state
 *  deriveProject(state)    → 화면에 필요한 RTM·Diff·프롬프트 (ViewerProject)
 */
import { buildGenPrompts, type GenPrompt } from "../ai/generate.js";
import { specItems, type SpecItem } from "../ai/spec.js";
import { ComponentSpec } from "../model/schema.js";
import { normalizeStoryboardOutput } from "../ai/apply.js";
import { hasArtifact, SETTABLE, WORK_LABEL, workBoard, workOf, type WorkBoard } from "../trace/work.js";

const WORK_KIND: Record<string, string> = { ia: "정보구조도", sb: "화면설계서", flow: "프로세스 플로우", ds: "디자인 시스템" };
import { applyGenerated, GEN_KINDS, type GenKind } from "../ai/apply.js";
import { buildPrompts, type PromptSet } from "../ai/prompts.js";
import { addDesignComponent, proposeDesign, selectDesign } from "../design/ops.js";
import { toChunks } from "../knowledge/chunk.js";
import type { Segment } from "../knowledge/extract-text.js";
import type { Chunk } from "../knowledge/search.js";
import { nextSourceId } from "../model/ids.js";
import { ProjectLink, StageId, StageStatus, SystemDesign, type Model, type Source } from "../model/schema.js";
import { validateModel } from "../model/validate.js";
import { buildNewProject, type CreateProjectInput } from "../project/model-files.js";
import {
  addRequirement,
  addSystem,
  addTask,
  autoCreateTasks,
  excludeRequirement,
  recordReview,
  removeTask,
  type AddRequirementInput,
  type AddTaskInput,
} from "../project/ops.js";
import { buildRtm, type Rtm } from "../trace/rtm.js";
import { diffModels, type ModelDiff } from "../version/diff.js";
import { bumpVersion, compareVersion } from "../version/versioning.js";

export interface SnapshotMeta {
  version: string;
  takenAt: string;
  note: string;
}
export interface SnapshotRecord {
  meta: SnapshotMeta;
  /** 저장소에서 읽을 때는 마지막 스냅샷(비교 기준)만 모델을 싣는다 */
  model?: Model;
}
export interface ProjectState {
  model: Model;
  chunks: Chunk[];
  snapshots: SnapshotRecord[];
}

export interface ViewerProject {
  model: Model;
  rtm: Rtm;
  snapshots: SnapshotMeta[];
  diff: { from: string; entries: ModelDiff } | null;
  chunks: Chunk[];
  prompts: Record<string, PromptSet>;
  gens: Record<string, GenPrompt>;
  work: WorkBoard;
  /** 요구사항별 기능 명세 (저장본·참조자료 초안) — 추적표·요구사항 화면에서 보고 편집 */
  specs: Record<string, SpecItem>;
}

export type Command =
  | { op: "project.update"; name?: string }
  | { op: "stage.set"; stage: string; status: string }
  | { op: "system.add"; system: unknown }
  | { op: "req.add"; input: AddRequirementInput; autoTasks?: boolean }
  | { op: "req.exclude"; id: string; reason: string }
  /** 작업 상태 표시 — 진행중·완료·재검토 필요 (key: ia:시스템 · sb:화면 · flow:요구사항 · ds:시스템) */
  | { op: "work.set"; key: string; status: string; note?: string; by?: string }
  /** 화면설계서 설명 번호 위치 (null이면 기본 위치로) */
  | { op: "sb.marker"; screenId: string; no: number; pos: { x: number; y: number } | null }
  /** 화면설계서 항목 직접 편집 — no가 있으면 교체, 없으면 끝에 추가. remove면 삭제 후 번호 재정렬 */
  | { op: "sb.component"; screenId: string; no?: number; input?: unknown; remove?: boolean }
  /** 설명(planner·customer·options·validation)만 AI 결과로 갱신 — 항목·와이어프레임은 그대로 */
  | { op: "sb.desc"; screenId: string; components: unknown }
  /** 기능 명세 저장 (빈 문자열이면 지워 참조자료 초안으로 돌아간다) */
  | { op: "req.spec"; id: string; spec: string }
  | { op: "task.add"; requirementId: string; input: AddTaskInput }
  | { op: "task.auto"; requirementId: string }
  | { op: "task.rm"; taskId: string }
  | { op: "task.review"; taskId: string; reviewer: string; note?: string }
  | { op: "link.add"; link: unknown }
  | { op: "link.rm"; url: string }
  | { op: "design.propose"; systemCode: string }
  | { op: "design.select"; systemCode: string; conceptId: string }
  | { op: "design.component"; systemCode: string; input: unknown }
  /** 디자인 미세조정 되돌리기 — 적용 전 디자인 시스템으로 바꾼다 */
  | { op: "design.revert"; systemCode: string; design: unknown }
  | { op: "gen.apply"; kind: string; target: string; output: unknown; instruction?: string; scope?: string }
  | {
      op: "kb.add";
      fileName: string;
      title?: string;
      size?: number;
      sha256?: string;
      /** 추출한 문단. 없으면 error 또는 UNSUPPORTED로 보관만 한다 */
      segments?: Segment[];
      error?: string;
      unsupported?: boolean;
    }
  | { op: "kb.rm"; sourceId: string }
  | { op: "snapshot"; note?: string; major?: boolean };

export interface ExecResult {
  state: ProjectState;
  /** 사람이 읽을 결과 한 줄 */
  message: string;
  /** 명령별 결과 (예: 새 요구사항 ID, 적용 변경 목록) */
  detail?: unknown;
}

export function newProjectState(input: CreateProjectInput, now = new Date()): ProjectState {
  return { model: buildNewProject(input, now), chunks: [], snapshots: [] };
}

/** 명령을 사본에 적용한다. 실패하면 예외를 던지고 원래 state는 그대로다. */
export function execute(state: ProjectState, cmd: Command, now = new Date()): ExecResult {
  const m = structuredClone(state.model);
  let chunks = state.chunks;
  let snapshots = state.snapshots;
  const c = { now };
  let message = "";
  let detail: unknown;

  switch (cmd.op) {
    case "project.update": {
      if (cmd.name !== undefined) {
        if (!cmd.name.trim()) throw new Error("프로젝트 이름을 입력하세요");
        m.project.name = cmd.name.trim();
      }
      message = "프로젝트 정보를 바꿨습니다";
      break;
    }
    case "stage.set": {
      const stage = StageId.parse(cmd.stage);
      if (!(stage in m.project.stages)) throw new Error(`이 프로젝트에 없는 단계입니다: ${stage}`);
      m.project.stages[stage] = StageStatus.parse(cmd.status);
      message = `${stage} 단계를 ${cmd.status}(으)로 바꿨습니다`;
      break;
    }
    case "system.add": {
      const s = addSystem(m, cmd.system);
      message = `시스템 ${s.code} ${s.name}을(를) 추가했습니다`;
      break;
    }
    case "req.add": {
      const r = addRequirement(m, cmd.input, c);
      const tasks = cmd.autoTasks ? autoCreateTasks(m, r.id, c) : [];
      message = `${r.id} ${r.title}을(를) 등록했습니다${tasks.length ? ` · Task ${tasks.length}개 자동 생성` : ""}`;
      detail = { id: r.id, tasks: tasks.map((t) => t.id) };
      break;
    }
    case "req.exclude":
      excludeRequirement(m, cmd.id, cmd.reason, c);
      message = `${cmd.id}을(를) 제외했습니다`;
      break;
    case "req.spec": {
      const r = m.requirements.find((x) => x.id === cmd.id);
      if (!r || r.status === "DELETED") throw new Error(`요구사항을 찾을 수 없습니다: ${cmd.id}`);
      const spec = String(cmd.spec ?? "").replace(/\r\n/g, "\n").trim();
      if (spec.length > 20000) throw new Error("기능 명세는 20,000자 이하로 적어 주세요");
      if ((r.spec ?? "") !== spec) m.rtmRecords.history.push({ requirementId: r.id, at: now.toISOString(), kind: "CHANGED", detail: "기능 명세 변경" });
      if (spec) r.spec = spec;
      else delete r.spec;
      message = spec ? `${r.id} 기능 명세를 저장했습니다` : `${r.id} 기능 명세를 지웠습니다 (참조자료 초안 사용)`;
      break;
    }
    case "work.set": {
      const st = (SETTABLE as readonly string[]).includes(cmd.status) ? (cmd.status as (typeof SETTABLE)[number]) : null;
      if (!st) throw new Error(`상태는 ${SETTABLE.map((x) => WORK_LABEL[x]).join(" · ")} 중 하나입니다`);
      if (!/^(ia|sb|flow|ds):./.test(cmd.key)) throw new Error(`작업 대상이 올바르지 않습니다: ${cmd.key}`);
      if (!hasArtifact(m, cmd.key)) throw new Error("아직 만든 산출물이 없어 상태를 바꿀 수 없습니다 (미진행)");
      m.rtmRecords.work[cmd.key] = { status: st, at: now.toISOString(), by: (cmd.by ?? "").slice(0, 60), note: (cmd.note ?? "").slice(0, 500) };
      // 화면설계서 완료 = 지금 디자인 시스템 개정으로 검토함
      if (st === "DONE" && cmd.key.startsWith("sb:")) {
        const sb = m.storyboard.screens.find((x) => `sb:${x.screenId}` === cmd.key)!;
        const d = m.design.systems.find((x) => x.systemCode === sb.systemCode && x.status === "SELECTED");
        if (d) sb.designRevision = d.revision;
        sb.status = "REVIEWED";
      } else if (cmd.key.startsWith("sb:")) {
        const sb = m.storyboard.screens.find((x) => `sb:${x.screenId}` === cmd.key)!;
        sb.status = "DRAFT";
      }
      message = `${cmd.key.replace(/^(\w+):/, (_, k: string) => `${WORK_KIND[k] ?? k} `)} → ${WORK_LABEL[st]}`;
      detail = workOf(m, cmd.key);
      break;
    }
    case "sb.component": {
      const sb = m.storyboard.screens.find((x) => x.screenId === cmd.screenId);
      if (!sb) throw new Error(`화면설계서가 없습니다: ${cmd.screenId}`);
      if (cmd.remove) {
        const i = sb.components.findIndex((x) => x.no === cmd.no);
        if (i < 0) throw new Error(`${cmd.no}번 항목이 없습니다`);
        sb.components.splice(i, 1);
        sb.components.forEach((x, k) => (x.no = k + 1));
        message = `${cmd.screenId} ${cmd.no}번 항목을 삭제했습니다 (번호 재정렬)`;
      } else {
        const norm = normalizeStoryboardOutput({ components: [cmd.input] }) as { components: unknown[] };
        const c = ComponentSpec.parse({ ...(norm.components[0] as object), no: cmd.no ?? sb.components.length + 1 });
        const i = sb.components.findIndex((x) => x.no === c.no);
        if (i >= 0) {
          const was = sb.components[i]!;
          if (was.marker && !c.marker) c.marker = was.marker;
          sb.components[i] = c;
        } else sb.components.push(c);
        message = `${cmd.screenId} ${c.no}번 ${c.label}을(를) ${i >= 0 ? "수정" : "추가"}했습니다`;
      }
      touchStoryboard(m, sb.screenId, now);
      break;
    }
    case "sb.desc": {
      const sb = m.storyboard.screens.find((x) => x.screenId === cmd.screenId);
      if (!sb) throw new Error(`화면설계서가 없습니다: ${cmd.screenId}`);
      const norm = normalizeStoryboardOutput({ components: cmd.components }) as { components: { no: number; planner: string; customer: string; options?: unknown; validation?: unknown }[] };
      let n = 0;
      for (const d of norm.components) {
        const c = sb.components.find((x) => x.no === d.no);
        if (!c) continue;
        const next = ComponentSpec.parse({ ...c, planner: d.planner || c.planner, customer: d.customer || c.customer, ...(d.options ? { options: d.options } : {}), ...(d.validation ? { validation: d.validation } : {}) });
        Object.assign(c, next);
        n++;
      }
      if (!n) throw new Error("AI 결과에 이 화면의 항목 번호와 맞는 설명이 없습니다");
      touchStoryboard(m, sb.screenId, now);
      message = `${cmd.screenId} 설명 ${n}개를 AI로 다시 썼습니다`;
      detail = { updated: n };
      break;
    }
    case "sb.marker": {
      const sb = m.storyboard.screens.find((x) => x.screenId === cmd.screenId);
      const c = sb?.components.find((x) => x.no === cmd.no);
      if (!c) throw new Error(`화면설계서 ${cmd.screenId}에 ${cmd.no}번 항목이 없습니다`);
      if (cmd.pos) {
        const x = Number(cmd.pos.x), y = Number(cmd.pos.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("위치 값이 올바르지 않습니다");
        c.marker = { x: Math.round(Math.max(-200, Math.min(2120, x))), y: Math.round(Math.max(-200, Math.min(20000, y))) };
      } else delete c.marker;
      message = cmd.pos ? `${cmd.screenId} ${cmd.no}번 설명 위치를 옮겼습니다` : `${cmd.screenId} ${cmd.no}번 설명 위치를 기본으로 되돌렸습니다`;
      break;
    }
    case "task.add": {
      const t = addTask(m, cmd.requirementId, { ...cmd.input, origin: "MANUAL" }, c);
      message = `${t.id} Task를 추가했습니다`;
      detail = { id: t.id };
      break;
    }
    case "task.auto": {
      const tasks = autoCreateTasks(m, cmd.requirementId, c);
      message = tasks.length ? `Task ${tasks.length}개를 자동 생성했습니다` : "제안할 Task가 없습니다 (설명에 행위자·동작을 더 적어 보세요)";
      detail = { tasks: tasks.map((t) => t.id) };
      break;
    }
    case "task.rm":
      removeTask(m, cmd.taskId, c);
      message = `${cmd.taskId}를 삭제했습니다`;
      break;
    case "task.review":
      if (!cmd.reviewer.trim()) throw new Error("검토자를 입력하세요");
      recordReview(m, cmd.taskId, cmd.reviewer.trim(), cmd.note ?? "", c);
      message = `${cmd.taskId} 검토 완료를 기록했습니다`;
      break;
    case "link.add": {
      const l = ProjectLink.parse(cmd.link);
      if (m.project.links.some((x) => x.url === l.url)) throw new Error(`이미 있는 URL입니다: ${l.url}`);
      m.project.links.push(l);
      message = `참조 URL ${l.label}을(를) 추가했습니다`;
      break;
    }
    case "link.rm": {
      const before = m.project.links.length;
      m.project.links = m.project.links.filter((l) => l.url !== cmd.url);
      if (m.project.links.length === before) throw new Error(`등록되지 않은 URL입니다: ${cmd.url}`);
      message = "참조 URL을 삭제했습니다";
      break;
    }
    case "design.propose": {
      const d = proposeDesign(m, cmd.systemCode);
      message = `${cmd.systemCode} 디자인 컨셉 ${d.proposals.length}종을 제안했습니다`;
      break;
    }
    case "design.select": {
      const d = selectDesign(m, cmd.systemCode, cmd.conceptId, c);
      message = `${cmd.systemCode} 디자인 시스템을 만들었습니다 (컨셉 ${d.selectedId} · 컴포넌트 ${d.components.length}개)`;
      break;
    }
    case "design.component": {
      const comp = addDesignComponent(m, cmd.systemCode, cmd.input, c);
      message = `${cmd.systemCode} 디자인 시스템에 ${comp.name} 컴포넌트를 추가했습니다`;
      break;
    }
    case "design.revert": {
      const prev = SystemDesign.parse(cmd.design);
      const i = m.design.systems.findIndex((d) => d.systemCode === cmd.systemCode);
      if (i < 0 || prev.systemCode !== cmd.systemCode) throw new Error(`${cmd.systemCode} 디자인 시스템이 없습니다`);
      const cur = m.design.systems[i]!;
      prev.revision = cur.revision + 1;
      prev.history = [...cur.history, { rev: prev.revision, at: now.toISOString(), note: "되돌리기", changes: [`r${cur.revision} 적용 취소`] }];
      m.design.systems[i] = prev;
      message = `${cmd.systemCode} 디자인 시스템을 되돌렸습니다 (r${prev.revision})`;
      break;
    }
    case "gen.apply": {
      if (!(GEN_KINDS as readonly string[]).includes(cmd.kind)) throw new Error(`생성 종류는 ${GEN_KINDS.join(" | ")} 중 하나입니다`);
      const r = applyGenerated(m, cmd.kind as GenKind, cmd.target, cmd.output, { now, instruction: cmd.instruction, scope: cmd.scope });
      // AI가 만들었다고 완료가 아니다 — 진행중으로 두고 작업자가 검토 후 완료 표시
      const wk = cmd.kind === "flow" ? `flow:${cmd.target}` : `${cmd.kind}:${cmd.target}`;
      m.rtmRecords.work[wk] = { status: "IN_PROGRESS", at: now.toISOString(), by: "AI 적용", note: "" };
      message = r.summary;
      detail = r;
      break;
    }
    case "kb.add": {
      const r = addKnowledge(m, chunks, cmd, now);
      chunks = r.chunks;
      message = r.duplicateOf
        ? `이미 올린 자료입니다 (${r.duplicateOf})`
        : `${r.source.id} ${r.source.title} — ${r.source.index?.status === "INDEXED" ? `조각 ${r.source.index.chunks}개 색인` : r.source.index?.message ?? "보관만 함"}`;
      detail = { id: r.source.id, duplicateOf: r.duplicateOf };
      break;
    }
    case "kb.rm": {
      const src = m.sources.find((s) => s.id === cmd.sourceId);
      if (!src) throw new Error(`참조자료가 없습니다: ${cmd.sourceId}`);
      const users = m.requirements.filter((r) => r.sources.some((s) => s.sourceId === cmd.sourceId)).map((r) => r.id);
      if (users.length) throw new Error(`${cmd.sourceId}를 출처로 쓰는 요구사항이 있습니다: ${users.join(", ")}`);
      m.sources = m.sources.filter((s) => s.id !== cmd.sourceId);
      chunks = chunks.filter((x) => x.sourceId !== cmd.sourceId);
      message = `${cmd.sourceId}를 삭제했습니다`;
      break;
    }
    case "snapshot": {
      const version = m.project.version;
      if (snapshots.some((s) => s.meta.version === version)) throw new Error(`이미 있는 스냅샷입니다: v${version}`);
      const meta: SnapshotMeta = { version, takenAt: now.toISOString(), note: cmd.note ?? "" };
      snapshots = [...snapshots, { meta, model: structuredClone(m) }].sort((a, b) => compareVersion(a.meta.version, b.meta.version));
      m.project.version = bumpVersion(version, cmd.major);
      message = `v${version} 스냅샷을 찍었습니다 · 작업 버전 v${m.project.version}`;
      detail = meta;
      break;
    }
    default:
      throw new Error(`알 수 없는 명령입니다: ${(cmd as { op: string }).op}`);
  }

  const errors = validateModel(m).filter((i) => i.level === "error");
  if (errors.length) throw new Error(`반영할 수 없습니다:\n- ${errors.map((e) => e.message).join("\n- ")}`);
  m.project.updatedAt = now.toISOString();
  return { state: { model: m, chunks, snapshots }, message, detail };
}

function addKnowledge(m: Model, chunks: Chunk[], cmd: Extract<Command, { op: "kb.add" }>, now: Date) {
  const dup = cmd.sha256 ? m.sources.find((s) => s.sha256 === cmd.sha256) : undefined;
  if (dup) return { source: dup, chunks, duplicateOf: dup.id };
  const id = nextSourceId(m.sources);
  const source: Source = {
    id,
    kind: /\.eml$/i.test(cmd.fileName) ? "EMAIL" : "FILE",
    title: cmd.title?.trim() || cmd.fileName.replace(/\.[^.]+$/, ""),
    location: `sources/${id}_${cmd.fileName}`,
    addedAt: now.toISOString(),
    fileName: cmd.fileName,
    size: cmd.size,
    sha256: cmd.sha256,
  };
  let added: Chunk[] = [];
  if (cmd.segments) {
    added = toChunks(id, cmd.segments);
    source.index = { status: "INDEXED", chunks: added.length, chars: added.reduce((a, x) => a + x.text.length, 0) };
  } else {
    source.index = { status: cmd.unsupported ? "UNSUPPORTED" : "FAILED", chunks: 0, chars: 0, message: cmd.error ?? "텍스트를 읽지 못했습니다" };
  }
  m.sources.push(source);
  return { source, chunks: [...chunks.filter((x) => x.sourceId !== id), ...added], duplicateOf: undefined };
}

/** 내용을 고쳤으므로 완료였던 화면설계서는 다시 진행중으로 */
function touchStoryboard(m: Model, screenId: string, now: Date) {
  const key = `sb:${screenId}`;
  const w = m.rtmRecords.work[key];
  if (w?.status === "DONE") m.rtmRecords.work[key] = { status: "IN_PROGRESS", at: now.toISOString(), by: "내용 편집", note: "" };
  const sb = m.storyboard.screens.find((x) => x.screenId === screenId);
  if (sb) sb.status = "DRAFT";
}

/** 화면 데이터 — RTM, 마지막 스냅샷 대비 변경, AI 요청·생성 프롬프트 */
export function deriveProject(state: ProjectState, now = new Date(), opts: { viewerUrl?: string } = {}): ViewerProject {
  const { model, chunks } = state;
  const last = state.snapshots.at(-1);
  return {
    model,
    rtm: buildRtm(model, now),
    snapshots: state.snapshots.map((s) => s.meta),
    diff: last?.model ? { from: last.meta.version, entries: diffModels(last.model, model) } : null,
    chunks,
    prompts: buildPrompts(model, chunks, opts),
    gens: buildGenPrompts(model, chunks, opts),
    work: workBoard(model),
    specs: Object.fromEntries(specItems(model, chunks, model.requirements.filter((r) => r.status !== "DELETED").map((r) => r.id)).map((x) => [x.id, x])),
  };
}

/** 프로젝트 목록 카드용 요약 */
export interface ProjectSummary {
  code: string;
  name: string;
  serviceType: string;
  changeScope: string | null;
  version: string;
  updatedAt: string;
  systems: number;
  requirements: number;
  tasks: number;
}
export function summarize(m: Model): ProjectSummary {
  return {
    code: m.project.code,
    name: m.project.name,
    serviceType: m.project.serviceType,
    changeScope: m.project.changeScope ?? null,
    version: m.project.version,
    updatedAt: m.project.updatedAt,
    systems: m.systems.length,
    requirements: m.requirements.length,
    tasks: m.requirements.reduce((a, r) => a + r.tasks.length, 0),
  };
}
