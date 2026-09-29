/**
 * 모델 변경 연산. 요구사항·Task가 바뀌면 RTM 변경 이력(rtmRecords.history)에 남긴다. (PRD F-RTM-06)
 * 모든 연산은 모델을 제자리에서 바꾸고, 저장은 호출자가 한다.
 */
import { nextRequirementId, nextTaskId, resolveTaskRef } from "../model/ids.js";
import { Priority, Requirement, RequirementType, System, Task, type Model } from "../model/schema.js";
import { resolveSuggestionOrder, suggestTasks } from "./suggest.js";

type Ctx = { now?: Date; crId?: string };
const ts = (c: Ctx) => (c.now ?? new Date()).toISOString();

export function findRequirement(m: Model, id: string) {
  const r = m.requirements.find((r) => r.id === id || r.originalId === id);
  if (!r) throw new Error(`요구사항이 없습니다: ${id}`);
  return r;
}

export function addSystem(m: Model, input: unknown): System {
  const s = System.parse(input);
  if (m.systems.some((x) => x.code === s.code)) throw new Error(`이미 있는 시스템 코드입니다: ${s.code}`);
  m.systems.push(s);
  return s;
}

export interface AddRequirementInput {
  title: string;
  description?: string;
  originalId?: string;
  type?: Requirement["type"];
  priority?: Requirement["priority"];
  sources?: { sourceId: string; locator?: string }[];
}

export function addRequirement(m: Model, input: AddRequirementInput, c: Ctx = {}): Requirement {
  let id: string;
  if (m.project.requirementIdMode === "ORIGINAL") {
    if (!input.originalId) throw new Error("요구사항 ID 체계가 ORIGINAL이면 원본 ID(--original-id)가 필요합니다");
    id = input.originalId;
  } else {
    id = nextRequirementId(m.requirements);
  }
  if (m.requirements.some((r) => r.id === id)) throw new Error(`이미 있는 요구사항 ID입니다: ${id}`);
  const req = Requirement.parse({ ...input, id });
  m.requirements.push(req);
  m.rtmRecords.history.push({ requirementId: id, at: ts(c), crId: c.crId, kind: "ADDED", detail: req.title });
  return req;
}

export interface AddTaskInput {
  systemCode: string;
  action: string;
  actor?: string;
  /** "T01" 또는 전체 ID */
  after?: string[];
  transition?: { stateSetId?: string; from?: string; to: string };
  noScreenReason?: string;
  origin?: "AUTO" | "MANUAL";
  suggestReason?: string;
}

export function addTask(m: Model, requirementId: string, input: AddTaskInput, c: Ctx = {}): Task {
  const req = findRequirement(m, requirementId);
  if (!m.systems.some((s) => s.code === input.systemCode))
    throw new Error(`등록되지 않은 시스템입니다: ${input.systemCode} (등록: ${m.systems.map((s) => s.code).join(", ") || "없음"})`);
  const task = Task.parse({
    ...input,
    id: nextTaskId(req),
    after: (input.after ?? []).map((a) => resolveTaskRef(req, a)),
  });
  req.tasks.push(task);
  m.rtmRecords.history.push({
    requirementId: req.id,
    at: ts(c),
    crId: c.crId,
    kind: "TASKS_CHANGED",
    detail: `${task.id} ${task.origin === "AUTO" ? "자동 생성" : "추가"} [${task.systemCode}] ${task.action}`,
  });
  return task;
}

/** Task 고치기 — AI가 만든 Task의 행위자·처리 내용·시스템이 요구사항과 어긋날 때 직접 바로잡는다 (ID는 그대로) */
export interface EditTaskInput {
  systemCode?: string;
  actor?: string;
  action?: string;
  after?: string[];
  /** 처리 후 자료 상태. 빈 문자열이면 지운다 */
  to?: string;
  /** 화면이 없는 사유. 빈 문자열이면 지운다 */
  noScreenReason?: string;
}
export function editTask(m: Model, taskId: string, input: EditTaskInput, c: Ctx = {}): Task {
  const req = m.requirements.find((r) => r.tasks.some((t) => t.id === taskId));
  if (!req) throw new Error(`Task가 없습니다: ${taskId}`);
  const t = req.tasks.find((x) => x.id === taskId)!;
  const before = `[${t.systemCode}] ${t.actor ? t.actor + ": " : ""}${t.action}`;
  if (input.systemCode !== undefined) {
    if (!m.systems.some((s) => s.code === input.systemCode)) throw new Error(`등록되지 않은 시스템입니다: ${input.systemCode}`);
    t.systemCode = input.systemCode;
  }
  if (input.actor !== undefined) t.actor = String(input.actor).trim();
  if (input.action !== undefined) {
    const a = String(input.action).trim();
    if (!a) throw new Error("처리 내용을 입력하세요");
    t.action = a;
  }
  if (input.after !== undefined) {
    const after = input.after.filter(Boolean).map((a) => resolveTaskRef(req, a));
    if (after.includes(taskId)) throw new Error("자기 자신을 선행 Task로 둘 수 없습니다");
    // 순환 막기: 새 선행을 따라가다 이 Task로 돌아오면 안 된다
    const byId = new Map(req.tasks.map((x) => [x.id, x]));
    const seen = new Set<string>();
    const stack = [...after];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === taskId) throw new Error("선행 Task가 순환합니다");
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(byId.get(id)?.after ?? []));
    }
    t.after = after;
  }
  if (input.to !== undefined) {
    const to = String(input.to).trim();
    if (to) t.transition = { ...(t.transition ?? {}), to };
    else delete t.transition;
  }
  if (input.noScreenReason !== undefined) {
    const r = String(input.noScreenReason).trim();
    if (r) t.noScreenReason = r;
    else delete t.noScreenReason;
  }
  // 직접 고친 Task는 자동 제안 근거가 더는 맞지 않을 수 있다
  if (t.origin === "AUTO") t.suggestReason = t.suggestReason ? `${t.suggestReason} (직접 수정됨)` : "직접 수정됨";
  const after = `[${t.systemCode}] ${t.actor ? t.actor + ": " : ""}${t.action}`;
  if (after !== before) m.rtmRecords.history.push({ requirementId: req.id, at: ts(c), crId: c.crId, kind: "TASKS_CHANGED", detail: `${taskId} 수정: ${before} → ${after}` });
  return t;
}

/** 요구사항 제목·설명·유형·우선순위 고치기 */
export function editRequirement(m: Model, id: string, input: { title?: string; description?: string; type?: string; priority?: string }, c: Ctx = {}) {
  const req = findRequirement(m, id);
  const changed: string[] = [];
  if (input.title !== undefined) {
    const v = String(input.title).trim();
    if (!v) throw new Error("요구사항 제목을 입력하세요");
    if (v !== req.title) changed.push(`제목: ${req.title} → ${v}`);
    req.title = v;
  }
  if (input.description !== undefined && input.description !== req.description) {
    req.description = String(input.description);
    changed.push("설명");
  }
  if (input.type !== undefined && input.type !== req.type) {
    req.type = RequirementType.parse(input.type);
    changed.push(`유형 ${req.type}`);
  }
  if (input.priority !== undefined && input.priority !== req.priority) {
    req.priority = Priority.parse(input.priority);
    changed.push(`우선순위 ${req.priority}`);
  }
  if (changed.length) m.rtmRecords.history.push({ requirementId: req.id, at: ts(c), crId: c.crId, kind: "CHANGED", detail: changed.join(" · ") });
  return req;
}

export function removeTask(m: Model, taskId: string, c: Ctx = {}): void {
  const req = m.requirements.find((r) => r.tasks.some((t) => t.id === taskId));
  if (!req) throw new Error(`Task가 없습니다: ${taskId}`);
  const referrers = m.requirements.flatMap((r) => r.tasks).filter((t) => t.after.includes(taskId));
  if (referrers.length) throw new Error(`${taskId}를 선행으로 쓰는 Task가 있습니다: ${referrers.map((t) => t.id).join(", ")}`);
  req.tasks = req.tasks.filter((t) => t.id !== taskId);
  m.rtmRecords.history.push({ requirementId: req.id, at: ts(c), crId: c.crId, kind: "TASKS_CHANGED", detail: `${taskId} 삭제` });
}

export function excludeRequirement(m: Model, id: string, reason: string, c: Ctx = {}): void {
  if (!reason.trim()) throw new Error("제외 사유를 입력해야 합니다");
  const req = findRequirement(m, id);
  req.status = "EXCLUDED";
  req.excludeReason = reason;
  m.rtmRecords.history.push({ requirementId: req.id, at: ts(c), crId: c.crId, kind: "EXCLUDED", detail: reason });
}

/** 검토 완료 확인 (RTM 상태 REVIEWED는 사람이 확인해야 한다 — PRD F-RTM-04) */
export function recordReview(m: Model, taskId: string, reviewer: string, note = "", c: Ctx = {}): void {
  if (!m.requirements.some((r) => r.tasks.some((t) => t.id === taskId))) throw new Error(`Task가 없습니다: ${taskId}`);
  m.rtmRecords.reviews = m.rtmRecords.reviews.filter((r) => r.taskId !== taskId);
  m.rtmRecords.reviews.push({ taskId, reviewer, reviewedAt: ts(c), note });
}

/** 요구사항에서 시스템별 Task를 자동 생성한다 (규칙 기반 제안을 그대로 적용) */
export function autoCreateTasks(m: Model, requirementId: string, c: Ctx = {}): Task[] {
  const req = findRequirement(m, requirementId);
  const suggestions = suggestTasks(m, req);
  const inputs = resolveSuggestionOrder(suggestions, req.tasks.length);
  return inputs.map((input, i) => addTask(m, req.id, { ...input, origin: "AUTO", suggestReason: suggestions[i]!.reason }, c));
}
