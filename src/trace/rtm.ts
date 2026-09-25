/**
 * 추적성 · 요구사항 추적표(RTM) 계산 — PRD §3.4, §4.2B
 *
 * 추적 단위는 Task이다.
 *   REQ → Task → 기획안 섹션·기능 → IA 화면 → 플로우 노드 → 스토리보드 화면 → 프로토타입 화면
 * 요구사항 상태는 소속 Task 상태에서 계산한다.
 */
import type { Model, Requirement, StageId, Task } from "../model/schema.js";

export const TRACE_STATUS = ["NOT_STARTED", "IN_DESIGN", "DESIGNED", "REVIEWED", "EXCLUDED"] as const;
export type TraceStatus = (typeof TRACE_STATUS)[number];

export const STATUS_LABEL: Record<TraceStatus, string> = {
  NOT_STARTED: "미착수",
  IN_DESIGN: "설계중",
  DESIGNED: "설계완료",
  REVIEWED: "검토완료",
  EXCLUDED: "제외",
};

export interface TaskTrace {
  taskId: string;
  requirementId: string;
  systemCode: string;
  actor: string;
  action: string;
  /** 화면이 없어도 되는 Task (사유가 있거나, 화면 없는 시스템 소속) */
  screenless: boolean;
  planSections: string[];
  features: string[];
  screens: string[];
  flowNodes: string[];
  storyboard: string[];
  prototype: string[];
  status: TraceStatus;
  reviewer?: string;
}

export interface RequirementTrace {
  requirementId: string;
  originalId?: string;
  title: string;
  type: Requirement["type"];
  priority: Requirement["priority"];
  sources: string[];
  status: TraceStatus;
  excludeReason?: string;
  tasks: TaskTrace[];
  crIds: string[];
  note?: string;
}

export interface MatrixCell {
  taskIds: string[];
  screens: string[];
  /** 셀의 Task가 모두 화면 없는 Task */
  screenless: boolean;
  status: TraceStatus | null;
}

export interface Gap {
  stage: StageId;
  kind: "NO_TASKS" | "NO_PLAN" | "NO_SCREEN" | "NO_FLOW" | "NO_STORYBOARD" | "NO_PROTOTYPE";
  ref: string;
  message: string;
}

export interface Orphan {
  kind: "FEATURE" | "SCREEN" | "STORYBOARD" | "PROTOTYPE";
  ref: string;
  message: string;
}

export interface Rtm {
  project: { code: string; name: string; version: string };
  generatedAt: string;
  systems: { code: string; name: string }[];
  rows: RequirementTrace[];
  matrix: Record<string, Record<string, MatrixCell>>;
  reverse: Record<string, { systemCode: string; name: string; requirementIds: string[]; taskIds: string[] }>;
  coverage: {
    requirements: Record<TraceStatus, number> & { total: number };
    tasks: Record<TraceStatus, number> & { total: number };
    bySystem: Record<string, { total: number; designed: number; rate: number }>;
    /** 설계완료 이상 Task 비율 (제외 Task 빼고) */
    designedRate: number;
  };
  gaps: Gap[];
  orphans: Orphan[];
}

const RANK: Record<TraceStatus, number> = { NOT_STARTED: 0, IN_DESIGN: 1, DESIGNED: 2, REVIEWED: 3, EXCLUDED: 4 };

export function buildRtm(m: Model, now = new Date()): Rtm {
  const systemByCode = new Map(m.systems.map((s) => [s.code, s]));
  const reviews = new Map(m.rtmRecords.reviews.map((r) => [r.taskId, r]));
  const active = m.requirements.filter((r) => r.status !== "DELETED");

  const screenNodes = m.ia.nodes.filter((n) => n.kind !== "MENU");
  const sbByScreen = new Map(m.storyboard.screens.map((s) => [s.screenId, s]));
  const protoScreens = new Set(m.prototype.screens.map((p) => p.screenId));

  const traceTask = (req: Requirement, t: Task): TaskTrace => {
    const has = (ids: string[]) => ids.includes(t.id);
    const screens = uniq([
      ...screenNodes.filter((n) => has(n.taskIds)).map((n) => n.id),
      ...m.storyboard.screens.filter((s) => has(s.taskIds)).map((s) => s.screenId),
    ]);
    const storyboard = screens.filter((id) => sbByScreen.has(id));
    const tr: TaskTrace = {
      taskId: t.id,
      requirementId: req.id,
      systemCode: t.systemCode,
      actor: t.actor,
      action: t.action,
      screenless: Boolean(t.noScreenReason) || systemByCode.get(t.systemCode)?.hasScreens === false,
      planSections: m.plan.sections.filter((s) => has(s.taskIds) || s.requirementIds.includes(req.id)).map((s) => s.id),
      features: m.plan.features.filter((f) => has(f.taskIds)).map((f) => f.id),
      screens,
      flowNodes: m.flows.flatMap((f) => f.nodes.filter((n) => has(n.taskIds)).map((n) => `${f.id}/${n.id}`)),
      storyboard,
      prototype: screens.filter((id) => protoScreens.has(id)),
      status: "NOT_STARTED",
    };
    tr.status = taskStatus(req, tr, reviews.has(t.id));
    const rv = reviews.get(t.id);
    if (rv) tr.reviewer = `${rv.reviewer} (${rv.reviewedAt.slice(0, 10)})`;
    return tr;
  };

  const rows: RequirementTrace[] = active.map((req) => {
    const tasks = req.tasks.map((t) => traceTask(req, t));
    return {
      requirementId: req.id,
      originalId: req.originalId,
      title: req.title,
      type: req.type,
      priority: req.priority,
      sources: req.sources.map((s) => (s.locator ? `${s.sourceId} ${s.locator}` : s.sourceId)),
      status: requirementStatus(req, tasks),
      excludeReason: req.excludeReason,
      tasks,
      crIds: uniq([
        ...m.changes.filter((c) => c.requirementIds.includes(req.id)).map((c) => c.id),
        ...m.rtmRecords.history.filter((h) => h.requirementId === req.id && h.crId).map((h) => h.crId!),
      ]),
      note: m.rtmRecords.notes[req.id],
    };
  });

  // 요구사항 × 시스템 매트릭스
  const matrix: Rtm["matrix"] = {};
  for (const row of rows) {
    matrix[row.requirementId] = {};
    for (const s of m.systems) {
      const ts = row.tasks.filter((t) => t.systemCode === s.code);
      matrix[row.requirementId]![s.code] = {
        taskIds: ts.map((t) => t.taskId),
        screens: uniq(ts.flatMap((t) => t.screens)),
        screenless: ts.length > 0 && ts.every((t) => t.screenless),
        status: ts.length ? minStatus(ts.map((t) => t.status)) : null,
      };
    }
  }

  // 역추적: 화면 ID → 요구사항·Task
  const reverse: Rtm["reverse"] = {};
  for (const n of screenNodes) reverse[n.id] = { systemCode: n.systemCode, name: n.name, requirementIds: [], taskIds: [] };
  for (const row of rows)
    for (const t of row.tasks)
      for (const sid of t.screens) {
        const e = reverse[sid];
        if (!e) continue;
        if (!e.requirementIds.includes(row.requirementId)) e.requirementIds.push(row.requirementId);
        e.taskIds.push(t.taskId);
      }

  const allTasks = rows.flatMap((r) => r.tasks);
  const countBy = (xs: TraceStatus[]) => {
    const c = Object.fromEntries(TRACE_STATUS.map((s) => [s, 0])) as Record<TraceStatus, number>;
    for (const x of xs) c[x]++;
    return { ...c, total: xs.length };
  };
  const done = (s: TraceStatus) => s === "DESIGNED" || s === "REVIEWED";
  const bySystem: Rtm["coverage"]["bySystem"] = {};
  for (const s of m.systems) {
    const ts = allTasks.filter((t) => t.systemCode === s.code && t.status !== "EXCLUDED");
    const designed = ts.filter((t) => done(t.status)).length;
    bySystem[s.code] = { total: ts.length, designed, rate: ratio(designed, ts.length) };
  }
  const countable = allTasks.filter((t) => t.status !== "EXCLUDED");

  return {
    project: { code: m.project.code, name: m.project.name, version: m.project.version },
    generatedAt: now.toISOString(),
    systems: m.systems.map((s) => ({ code: s.code, name: s.name })),
    rows,
    matrix,
    reverse,
    coverage: {
      requirements: countBy(rows.map((r) => r.status)),
      tasks: countBy(allTasks.map((t) => t.status)),
      bySystem,
      designedRate: ratio(countable.filter((t) => done(t.status)).length, countable.length),
    },
    gaps: findGaps(m, rows),
    orphans: findOrphans(m, allTasks),
  };
}

function taskStatus(req: Requirement, t: TaskTrace, reviewed: boolean): TraceStatus {
  if (req.status === "EXCLUDED") return "EXCLUDED";
  const designed = t.screenless ? t.flowNodes.length > 0 : t.screens.length > 0 && t.storyboard.length === t.screens.length;
  if (designed) return reviewed ? "REVIEWED" : "DESIGNED";
  const anyLink = t.planSections.length + t.features.length + t.screens.length + t.flowNodes.length + t.storyboard.length > 0;
  return anyLink ? "IN_DESIGN" : "NOT_STARTED";
}

function requirementStatus(req: Requirement, tasks: TaskTrace[]): TraceStatus {
  if (req.status === "EXCLUDED") return "EXCLUDED";
  if (!tasks.length) return "NOT_STARTED";
  return minStatus(tasks.map((t) => t.status));
}

/** 가장 늦은 상태. 단, 일부라도 진행됐으면 미착수 대신 설계중 */
function minStatus(xs: TraceStatus[]): TraceStatus {
  const live = xs.filter((x) => x !== "EXCLUDED");
  if (!live.length) return "EXCLUDED";
  const min = live.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));
  if (min === "NOT_STARTED" && live.some((x) => x !== "NOT_STARTED")) return "IN_DESIGN";
  return min;
}

/** 단계별 누락: 시작된 단계(미시작이 아닌 단계)만 검사한다. MODIFY로 패스한 S2도 영향 화면은 등록해야 하므로 검사한다. */
function findGaps(m: Model, rows: RequirementTrace[]): Gap[] {
  const started = (s: StageId) => {
    const st = m.project.stages[s];
    return st !== undefined && st !== "NOT_STARTED";
  };
  const gaps: Gap[] = [];
  for (const r of rows) {
    if (r.status === "EXCLUDED") continue;
    if (!r.tasks.length) {
      gaps.push({ stage: "S0", kind: "NO_TASKS", ref: r.requirementId, message: `${r.requirementId} 시스템별 Task가 분해되지 않았습니다` });
      continue;
    }
    for (const t of r.tasks) {
      if (started("S1") && !t.planSections.length && !t.features.length)
        gaps.push({ stage: "S1", kind: "NO_PLAN", ref: t.taskId, message: `${t.taskId} 기획안(섹션·기능)에 반영되지 않았습니다` });
      if (started("S2") && !t.screenless && !t.screens.length)
        gaps.push({ stage: "S2", kind: "NO_SCREEN", ref: t.taskId, message: `${t.taskId} [${t.systemCode}] 연결된 화면 ID가 없습니다` });
      if (started("S3") && !t.flowNodes.length)
        gaps.push({ stage: "S3", kind: "NO_FLOW", ref: t.taskId, message: `${t.taskId} 플로우 노드에 연결되지 않았습니다` });
      if (started("S4") && !t.screenless) {
        const missing = t.screens.filter((s) => !t.storyboard.includes(s));
        if (!t.screens.length || missing.length)
          gaps.push({
            stage: "S4",
            kind: "NO_STORYBOARD",
            ref: t.taskId,
            message: t.screens.length
              ? `${t.taskId} 스토리보드 미작성 화면: ${missing.join(", ")}`
              : `${t.taskId} 연결된 화면이 없어 스토리보드를 작성할 수 없습니다`,
          });
      }
      if (started("S5") && !t.screenless) {
        const missing = t.screens.filter((s) => !t.prototype.includes(s));
        if (!t.screens.length || missing.length)
          gaps.push({
            stage: "S5",
            kind: "NO_PROTOTYPE",
            ref: t.taskId,
            message: t.screens.length
              ? `${t.taskId} 프로토타입 미반영 화면: ${missing.join(", ")}`
              : `${t.taskId} 연결된 화면이 없어 프로토타입에 반영할 수 없습니다`,
          });
      }
    }
  }
  const order: StageId[] = ["S0", "S0A", "S1", "S2", "S3", "S4", "S5"];
  return gaps.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
}

/** 근거 없는 산출물: 어떤 Task에도 연결되지 않은 기능·화면 */
function findOrphans(m: Model, tasks: TaskTrace[]): Orphan[] {
  const linkedScreens = new Set(tasks.flatMap((t) => t.screens));
  const out: Orphan[] = [];
  for (const f of m.plan.features)
    if (!f.taskIds.length) out.push({ kind: "FEATURE", ref: f.id, message: `기능 ${f.id} ${f.name}: 연결된 요구사항이 없습니다` });
  for (const n of m.ia.nodes)
    if (n.kind !== "MENU" && n.change !== "DELETED" && n.change !== "KEPT" && !linkedScreens.has(n.id))
      out.push({ kind: "SCREEN", ref: n.id, message: `화면 ${n.id} ${n.name}: 연결된 요구사항이 없습니다` });
  for (const s of m.storyboard.screens)
    if (!linkedScreens.has(s.screenId) && m.ia.nodes.find((n) => n.id === s.screenId)?.change !== "KEPT")
      out.push({ kind: "STORYBOARD", ref: s.screenId, message: `스토리보드 ${s.screenId}: 연결된 요구사항이 없습니다` });
  return out;
}

/** 단계를 확정할 수 있는지 (PRD §3.4: 미매핑 요구사항·Task가 있으면 확정 불가) */
export function stageBlockers(rtm: Rtm, stage: StageId): Gap[] {
  const order: StageId[] = ["S0", "S0A", "S1", "S2", "S3", "S4", "S5"];
  const idx = order.indexOf(stage);
  return rtm.gaps.filter((g) => order.indexOf(g.stage) <= idx);
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];
const ratio = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10);
