/**
 * 산출물 작업 상태 — 미진행 · 진행중 · 완료 · 재검토 필요
 *
 * AI가 만들었다고 완료가 아니다. 산출물이 생기면(AI 생성·적용 포함) “진행중”이고,
 * 작업자가 검토 후 “완료”로 표시한다. 완료 뒤에 근거가 바뀌면 “재검토 필요”로 계산된다:
 *   - 화면설계서: 디자인 시스템 개정이 올라감, 연결된 요구사항(설명·Task·기능 명세)이 바뀜, 정보구조도에서 빠짐
 *   - 정보구조도: 이 시스템 Task를 가진 요구사항이 바뀜
 *   - 프로세스 플로우: 요구사항이 바뀜
 * 작업자가 직접 “재검토 필요”로 표시할 수도 있다.
 *
 * 키: ia:<시스템> · sb:<화면ID> · flow:<요구사항ID> · ds:<시스템> (AI 생성 키와 같다)
 */
import type { Model } from "../model/schema.js";

export const WORK_STATUS = ["NOT_STARTED", "IN_PROGRESS", "DONE", "NEEDS_REVIEW"] as const;
export type WorkStatus = (typeof WORK_STATUS)[number];
export const WORK_LABEL: Record<WorkStatus, string> = { NOT_STARTED: "미진행", IN_PROGRESS: "진행중", DONE: "완료", NEEDS_REVIEW: "재검토 필요" };
/** 사람이 표시할 수 있는 상태 */
export const SETTABLE = ["IN_PROGRESS", "DONE", "NEEDS_REVIEW"] as const;

export interface WorkState {
  key: string;
  status: WorkStatus;
  /** 재검토 필요 사유, 미진행 사유 등 */
  reason?: string;
  by?: string;
  at?: string;
  note?: string;
}

export function workKinds(key: string): { kind: string; target: string } {
  const i = key.indexOf(":");
  return { kind: key.slice(0, i), target: key.slice(i + 1) };
}

/** 산출물이 있는가 */
export function hasArtifact(m: Model, key: string): boolean {
  const { kind, target } = workKinds(key);
  if (kind === "ia") return m.ia.nodes.some((n) => n.systemCode === target && n.kind !== "MENU");
  if (kind === "sb") return m.storyboard.screens.some((s) => s.screenId === target);
  if (kind === "flow") return !!flowOfRequirement(m, target);
  if (kind === "ds") return m.design.systems.some((d) => d.systemCode === target && d.status === "SELECTED");
  return false;
}

export function flowOfRequirement(m: Model, reqId: string) {
  return m.flows.find((f) => f.id === `PF-${reqId}`) ?? m.flows.find((f) => f.nodes.some((n) => n.taskIds.some((id) => id.startsWith(`${reqId}-`))));
}

/** 이 산출물의 근거가 되는 요구사항 */
function sourceRequirements(m: Model, key: string): string[] {
  const { kind, target } = workKinds(key);
  if (kind === "flow") return [target];
  if (kind === "ia") return m.requirements.filter((r) => r.tasks.some((t) => t.systemCode === target)).map((r) => r.id);
  if (kind === "sb") {
    const node = m.ia.nodes.find((n) => n.id === target);
    const sb = m.storyboard.screens.find((s) => s.screenId === target);
    const taskIds = new Set([...(node?.taskIds ?? []), ...(sb?.taskIds ?? [])]);
    return m.requirements.filter((r) => r.tasks.some((t) => taskIds.has(t.id))).map((r) => r.id);
  }
  return [];
}

function reviewReason(m: Model, key: string, doneAt: string): string | undefined {
  const { kind, target } = workKinds(key);
  if (kind === "sb") {
    const sb = m.storyboard.screens.find((s) => s.screenId === target)!;
    const node = m.ia.nodes.find((n) => n.id === target);
    if (!node) return "정보구조도에서 빠진 화면입니다";
    const d = m.design.systems.find((x) => x.systemCode === sb.systemCode && x.status === "SELECTED");
    if (d && (sb.designRevision ?? 1) < d.revision) return `디자인 시스템이 r${sb.designRevision ?? 1} → r${d.revision}로 바뀌었습니다`;
  }
  const reqs = new Set(sourceRequirements(m, key));
  const changed = m.rtmRecords.history.filter((h) => reqs.has(h.requirementId) && h.at > doneAt);
  if (changed.length) {
    const ids = [...new Set(changed.map((h) => h.requirementId))];
    return `완료 후 요구사항이 바뀌었습니다: ${ids.slice(0, 3).join(", ")}${ids.length > 3 ? ` 외 ${ids.length - 3}건` : ""} (${changed.at(-1)!.detail || changed.at(-1)!.kind})`;
  }
  return undefined;
}

export function workOf(m: Model, key: string): WorkState {
  const rec = m.rtmRecords.work?.[key];
  if (!hasArtifact(m, key)) return { key, status: "NOT_STARTED" };
  const base = rec ? { by: rec.by || undefined, at: rec.at, note: rec.note || undefined } : {};
  // 예전 데이터: 검토 완료로 표시된 화면설계서
  const legacyDone = !rec && key.startsWith("sb:") && m.storyboard.screens.find((s) => `sb:${s.screenId}` === key)?.status === "REVIEWED";
  const status: WorkStatus = rec?.status ?? (legacyDone ? "DONE" : "IN_PROGRESS");
  if (status === "DONE") {
    const reason = reviewReason(m, key, rec?.at ?? "");
    if (reason) return { key, status: "NEEDS_REVIEW", reason, ...base };
  }
  return { key, status, ...base };
}

export interface SystemWork {
  code: string;
  name: string;
  hasScreens: boolean;
  ds: WorkState;
  ia: WorkState;
  screens: (WorkState & { screenId: string; name: string })[];
  counts: Record<WorkStatus, number>;
  /** 정보구조도·화면설계서가 모두 완료 → 프로토타입 통합본 확정 가능 */
  designDone: boolean;
}

export function systemWork(m: Model): SystemWork[] {
  return m.systems.map((s) => {
    const screens = m.ia.nodes
      .filter((n) => n.systemCode === s.code && n.kind !== "MENU")
      .map((n) => ({ ...workOf(m, `sb:${n.id}`), screenId: n.id, name: n.name }));
    const counts = Object.fromEntries(WORK_STATUS.map((x) => [x, 0])) as Record<WorkStatus, number>;
    for (const x of screens) counts[x.status]++;
    const ia = workOf(m, `ia:${s.code}`);
    return {
      code: s.code,
      name: s.name,
      hasScreens: s.hasScreens,
      ds: workOf(m, `ds:${s.code}`),
      ia,
      screens,
      counts,
      designDone: s.hasScreens && ia.status === "DONE" && screens.length > 0 && screens.every((x) => x.status === "DONE"),
    };
  });
}

export interface WorkBoard {
  items: Record<string, WorkState>;
  systems: SystemWork[];
}

/** 화면에 보낼 전체 작업 상태 */
export function workBoard(m: Model): WorkBoard {
  const keys = new Set<string>();
  for (const s of m.systems) {
    if (s.hasScreens) keys.add(`ia:${s.code}`);
    keys.add(`ds:${s.code}`);
  }
  for (const n of m.ia.nodes) if (n.kind !== "MENU") keys.add(`sb:${n.id}`);
  for (const s of m.storyboard.screens) keys.add(`sb:${s.screenId}`);
  for (const r of m.requirements) if (r.status === "ACTIVE") keys.add(`flow:${r.id}`);
  const items: Record<string, WorkState> = {};
  for (const k of keys) items[k] = workOf(m, k);
  return { items, systems: systemWork(m) };
}
