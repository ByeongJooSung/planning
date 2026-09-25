/**
 * 모델 Diff — 엔티티(ID) 단위 추가/삭제/변경과 변경 필드. (PRD F-PRJ-04, F-CR-05의 기반)
 */
import type { Model } from "../model/schema.js";

export interface FieldChange {
  path: string;
  before: unknown;
  after: unknown;
}

export interface EntityDiff {
  added: string[];
  removed: string[];
  changed: { id: string; fields: FieldChange[] }[];
}

export type ModelDiff = Record<string, EntityDiff>;

/** 비교 대상 컬렉션: 이름 → (모델 → [ID, 값][]) */
const COLLECTIONS: Record<string, (m: Model) => [string, unknown][]> = {
  project: (m) => [[m.project.code, omit(m.project, ["updatedAt", "createdAt", "version"])]],
  systems: (m) => m.systems.map((s) => [s.code, s]),
  sources: (m) => m.sources.map((s) => [s.id, s]),
  requirements: (m) => m.requirements.map((r) => [r.id, omit(r, ["tasks"])]),
  tasks: (m) => m.requirements.flatMap((r) => r.tasks.map((t) => [t.id, t] as [string, unknown])),
  stateSets: (m) => m.policies.stateSets.map((s) => [s.id, s]),
  planSections: (m) => m.plan.sections.map((s) => [s.id, s]),
  features: (m) => m.plan.features.map((f) => [f.id, f]),
  iaNodes: (m) => m.ia.nodes.map((n) => [n.id, n]),
  flows: (m) => m.flows.map((f) => [f.id, omit(f, ["nodes", "edges"])]),
  flowNodes: (m) => m.flows.flatMap((f) => f.nodes.map((n) => [`${f.id}/${n.id}`, n] as [string, unknown])),
  flowEdges: (m) =>
    m.flows.flatMap((f) => f.edges.map((e) => [`${f.id}/${e.from}→${e.to}`, e] as [string, unknown])),
  storyboardScreens: (m) => m.storyboard.screens.map((s) => [s.screenId, s]),
  prototypeScreens: (m) => m.prototype.screens.map((s) => [s.screenId, s]),
  changeRequests: (m) => m.changes.map((c) => [c.id, c]),
  designSystems: (m) =>
    m.design.systems.map((d) => [d.systemCode, { status: d.status, selectedId: d.selectedId, tokens: d.tokens, layout: d.layout }]),
  designComponents: (m) =>
    m.design.systems.flatMap((d) => d.components.map((c) => [`${d.systemCode}/${c.id}`, c] as [string, unknown])),
};

export const COLLECTION_LABEL: Record<string, string> = {
  project: "프로젝트 설정",
  systems: "시스템 구분",
  sources: "자료",
  requirements: "요구사항",
  tasks: "Task",
  stateSets: "공통 상태값",
  planSections: "기획안 섹션",
  features: "기능",
  iaNodes: "정보구조도",
  flows: "플로우",
  flowNodes: "플로우 노드",
  flowEdges: "플로우 연결",
  storyboardScreens: "스토리보드 화면",
  prototypeScreens: "프로토타입 화면",
  changeRequests: "변경 요청",
  designSystems: "디자인 시스템",
  designComponents: "디자인 컴포넌트",
};

export function diffModels(before: Model, after: Model): ModelDiff {
  const out: ModelDiff = {};
  for (const [name, pick] of Object.entries(COLLECTIONS)) {
    const a = new Map(pick(before));
    const b = new Map(pick(after));
    const d: EntityDiff = { added: [], removed: [], changed: [] };
    for (const id of b.keys()) if (!a.has(id)) d.added.push(id);
    for (const id of a.keys()) if (!b.has(id)) d.removed.push(id);
    for (const [id, av] of a) {
      if (!b.has(id)) continue;
      const fields = diffValue(av, b.get(id), "");
      if (fields.length) d.changed.push({ id, fields });
    }
    if (d.added.length || d.removed.length || d.changed.length) out[name] = d;
  }
  return out;
}

export function isEmptyDiff(d: ModelDiff): boolean {
  return Object.keys(d).length === 0;
}

/** 객체는 필드별로 내려가고, 배열·원시값은 통째로 비교한다. */
function diffValue(a: unknown, b: unknown, path: string): FieldChange[] {
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) => diffValue(a[k], b[k], path ? `${path}.${k}` : k));
  }
  return equal(a, b) ? [] : [{ path: path || "(값)", before: a, after: b }];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function omit<T extends object>(o: T, keys: string[]): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as Partial<T>;
}

export function renderDiffMarkdown(d: ModelDiff, title: string): string {
  const lines = [`# ${title}`, ""];
  if (isEmptyDiff(d)) return lines.concat("변경 사항이 없습니다.", "").join("\n");
  const fmt = (v: unknown) => (v === undefined ? "(없음)" : typeof v === "string" ? v : JSON.stringify(v));
  for (const [name, e] of Object.entries(d)) {
    lines.push(`## ${COLLECTION_LABEL[name] ?? name}`, "");
    for (const id of e.added) lines.push(`- 추가 \`${id}\``);
    for (const id of e.removed) lines.push(`- 삭제 \`${id}\``);
    for (const c of e.changed) {
      lines.push(`- 변경 \`${c.id}\``);
      for (const f of c.fields) lines.push(`  - ${f.path}: ${fmt(f.before)} → ${fmt(f.after)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
