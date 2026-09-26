/**
 * AI 생성 결과 반영 (PRD §4.10B)
 *
 * 생성·미세조정 결과(JSON)는 모두 “대상 전체”를 담는다. 반영은 대상 단위로 교체한다.
 *   ia     : 한 시스템의 메뉴·화면 노드 전체
 *   sb     : 한 화면의 화면설계서(템플릿 + 번호별 구성)
 *   flow   : 한 요구사항의 프로세스 플로우
 *   ds     : 디자인 시스템 패치(바뀐 토큰·레이아웃·추가 컴포넌트) → 개정 번호가 오르고,
 *            이 디자인 시스템을 쓰는 화면설계서·프로토타입은 컴포넌트 단위로 한꺼번에 다시 그려진다.
 */
import { z } from "zod";
import {
  ComponentSpec,
  DesignComponent,
  DesignTokens,
  Flow,
  IANode,
  LayoutRules,
  type Model,
  type StoryboardScreen,
} from "../model/schema.js";
import { validateModel } from "../model/validate.js";
import { isValidStyleValue, scopeOf, styleVarsOf } from "../design/catalog.js";

export const GEN_KINDS = ["ia", "sb", "flow", "ds"] as const;
export type GenKind = (typeof GEN_KINDS)[number];

export const IaOutput = z.object({
  nodes: z.array(IANode.omit({ systemCode: true }).extend({ systemCode: z.string().optional() })).min(1),
});
export const SbOutput = z.object({
  template: z.enum(["login", "dashboard", "main", "list", "detail", "form", "popup"]).optional(),
  components: z.array(ComponentSpec).min(1),
});
export const FlowOutput = Flow;
export const DesignPatch = z.object({
  tokens: z.record(z.string(), z.unknown()).optional(),
  layout: LayoutRules.partial().optional(),
  componentStyles: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  components: z
    .object({ add: z.array(DesignComponent.pick({ id: true, name: true, category: true, description: true, variants: true })).default([]) })
    .optional(),
  summary: z.string().optional(),
});
export type DesignPatch = z.infer<typeof DesignPatch>;

export interface ApplyResult {
  summary: string;
  changes: string[];
  /** 다시 그려지는 화면 (디자인 시스템 변경 시) */
  affectedScreens: string[];
}

type Ctx = { now?: Date; instruction?: string; /** 디자인 조정 범위 (DESIGN_SCOPES id 또는 cmp:<컴포넌트ID>) */ scope?: string };

/** 모델 사본에 적용해 무결성을 확인한 뒤 원본에 반영한다 */
function commit(m: Model, work: Model) {
  const errors = validateModel(work).filter((i) => i.level === "error");
  if (errors.length) throw new Error(`반영할 수 없습니다:\n- ${errors.map((e) => e.message).join("\n- ")}`);
  Object.assign(m, work);
}

export function applyGenerated(m: Model, kind: GenKind, target: string, output: unknown, c: Ctx = {}): ApplyResult {
  switch (kind) {
    case "ia":
      return applyIa(m, target, output);
    case "sb":
      return applyStoryboard(m, target, output);
    case "flow":
      return applyFlow(m, target, output);
    case "ds":
      return applyDesignPatch(m, target, output, c);
  }
}

export function applyIa(m: Model, systemCode: string, output: unknown): ApplyResult {
  const out = IaOutput.parse(output);
  if (!m.systems.some((s) => s.code === systemCode && s.hasScreens)) throw new Error(`화면이 있는 시스템이 아닙니다: ${systemCode}`);
  const work = structuredClone(m);
  const before = work.ia.nodes.filter((n) => n.systemCode === systemCode);
  const after = out.nodes.map((n) => IANode.parse({ ...n, systemCode }));
  const ids = new Set(after.map((n) => n.id));
  const removed = before.filter((n) => !ids.has(n.id));
  const beforeIds = new Set(before.map((n) => n.id));
  work.ia.nodes = [...work.ia.nodes.filter((n) => n.systemCode !== systemCode), ...after];
  for (const n of removed) if (n.kind !== "MENU" && !work.ia.retiredIds.includes(n.id)) work.ia.retiredIds.push(n.id);
  commit(m, work);
  const added = after.filter((n) => !beforeIds.has(n.id)).map((n) => n.id);
  return {
    summary: `${systemCode} 정보구조도: 노드 ${after.length}개 (추가 ${added.length}, 삭제 ${removed.length})`,
    changes: [...added.map((id) => `추가 ${id}`), ...removed.map((n) => `삭제 ${n.id}`)],
    affectedScreens: [],
  };
}

export function applyStoryboard(m: Model, screenId: string, output: unknown): ApplyResult {
  const out = SbOutput.parse(output);
  const node = m.ia.nodes.find((n) => n.id === screenId);
  if (!node || node.kind === "MENU") throw new Error(`정보구조도에 없는 화면입니다: ${screenId}`);
  const work = structuredClone(m);
  const ds = work.design.systems.find((d) => d.systemCode === node.systemCode);
  const prev = work.storyboard.screens.find((s) => s.screenId === screenId);
  const next: StoryboardScreen = {
    screenId,
    systemCode: node.systemCode,
    title: prev?.title ?? node.name,
    template: out.template ?? prev?.template,
    taskIds: prev?.taskIds ?? [],
    components: out.components,
    status: "DRAFT",
    designRevision: ds?.status === "SELECTED" ? ds.revision : undefined,
  };
  work.storyboard.screens = prev ? work.storyboard.screens.map((s) => (s.screenId === screenId ? next : s)) : [...work.storyboard.screens, next];
  commit(m, work);
  return { summary: `${screenId} 화면설계서 ${prev ? "교체" : "작성"}: 구성 ${out.components.length}개`, changes: [], affectedScreens: [screenId] };
}

export function applyFlow(m: Model, requirementId: string, output: unknown): ApplyResult {
  const flow = FlowOutput.parse(output);
  const work = structuredClone(m);
  const prev = work.flows.find((f) => f.id === flow.id);
  work.flows = prev ? work.flows.map((f) => (f.id === flow.id ? flow : f)) : [...work.flows, flow];
  commit(m, work);
  return { summary: `${requirementId} 프로세스 플로우 ${flow.id}: 노드 ${flow.nodes.length}개`, changes: [], affectedScreens: [] };
}

function flatten(o: unknown, prefix = ""): Record<string, unknown> {
  if (o && typeof o === "object" && !Array.isArray(o))
    return Object.assign({}, ...Object.entries(o as Record<string, unknown>).map(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k)));
  return { [prefix]: o };
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) out[k] = deepMerge(out[k], v);
  return out as T;
}

/** 패치가 바꾸는 경로 (tokens.color.primary, componentStyles.data-table.--w-th-bg, components.add) */
export function patchPaths(patch: DesignPatch): string[] {
  const out: string[] = [];
  const walk = (o: unknown, pre: string) => {
    if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) walk(v, `${pre}.${k}`);
    else out.push(pre);
  };
  if (patch.tokens) walk(patch.tokens, "tokens");
  if (patch.layout) walk(patch.layout, "layout");
  if (patch.componentStyles) walk(patch.componentStyles, "componentStyles");
  if (patch.components?.add?.length) out.push("components.add");
  return out;
}

/** 조정 범위 밖을 바꾸는 경로 */
export function outOfScope(patch: DesignPatch, scopeId: string): string[] {
  const scope = scopeOf(scopeId);
  return patchPaths(patch).filter((p) => !scope.allowed.some((a) => p === a || p.startsWith(`${a}.`)));
}

/** 디자인 시스템 미세조정. 토큰·레이아웃·컴포넌트 스타일은 바뀐 값만, 컴포넌트는 추가만 받는다 */
/**
 * AI가 돌려준 값을 기준 값의 형태에 맞춘다 — 로컬·소형 모델은 "30px", "30", "#fff" 처럼 돌려주기도 한다.
 * 기준이 숫자면 숫자로, 기준이 색이면 #RRGGBB 로 바꾼다.
 */
export function coerceLike(base: unknown, patch: unknown): unknown {
  if (patch === null || patch === undefined) return patch;
  if (typeof base === "number" && typeof patch === "string") {
    const m = patch.trim().match(/^(-?\d+(?:\.\d+)?)\s*(px|rem)?$/i);
    if (m) return m[2]?.toLowerCase() === "rem" ? Math.round(Number(m[1]) * 16) : Number(m[1]);
    return patch;
  }
  if (typeof base === "string" && /^#[0-9A-Fa-f]{6}$/.test(base) && typeof patch === "string") return normHex(patch);
  if (base && typeof base === "object" && !Array.isArray(base) && patch && typeof patch === "object" && !Array.isArray(patch)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) out[k] = coerceLike((base as Record<string, unknown>)[k], v);
    return out;
  }
  return patch;
}
function normHex(v: string): string {
  const t = v.trim();
  const short = t.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  const full = t.match(/^#?([0-9a-f]{6})$/i);
  return full ? `#${full[1]!.toUpperCase()}` : t;
}
/** 컴포넌트 스타일 변수: 숫자로 오면 형식(px·number)에 맞춰 글자로, 색은 #RRGGBB 로 */
function coerceStyles(styles: unknown): unknown {
  if (!styles || typeof styles !== "object") return styles;
  const out: Record<string, Record<string, unknown>> = {};
  for (const [cid, vars] of Object.entries(styles as Record<string, Record<string, unknown>>)) {
    const allowed = new Map(styleVarsOf(cid).map((x) => [x.name, x.type]));
    out[cid] = {};
    for (const [name, v] of Object.entries(vars ?? {})) {
      const type = allowed.get(name);
      let val: unknown = v;
      if (type === "px") val = typeof v === "number" ? `${v}px` : /^\s*\d+(\.\d+)?\s*$/.test(String(v)) ? `${String(v).trim()}px` : String(v).replace(/\s+/g, "");
      else if (type === "color") val = normHex(String(v));
      else if (type) val = String(v).replace(/px$/i, "").trim();
      out[cid]![name] = val;
    }
  }
  return out;
}
export function normalizeDesignPatch(output: unknown, base: { tokens?: unknown }): unknown {
  if (!output || typeof output !== "object") return output;
  const o = output as Record<string, unknown>;
  return { ...o, ...(o.tokens ? { tokens: coerceLike(base.tokens, o.tokens) } : {}), ...(o.componentStyles ? { componentStyles: coerceStyles(o.componentStyles) } : {}) };
}

export function applyDesignPatch(m: Model, systemCode: string, output: unknown, c: Ctx = {}): ApplyResult {
  const cur = m.design.systems.find((x) => x.systemCode === systemCode);
  const patch = DesignPatch.parse(normalizeDesignPatch(output, { tokens: cur?.tokens }));
  const work = structuredClone(m);
  const d = work.design.systems.find((x) => x.systemCode === systemCode);
  if (d?.status !== "SELECTED" || !d.tokens || !d.layout) throw new Error(`${systemCode} 디자인 시스템이 아직 없습니다. 컨셉을 먼저 선택하세요`);
  if (c.scope) {
    const bad = outOfScope(patch, c.scope);
    if (bad.length) throw new Error(`‘${scopeOf(c.scope).label}’ 범위에서 바꿀 수 없는 값입니다: ${bad.join(", ")}`);
  }
  const tokens = DesignTokens.parse(deepMerge(d.tokens, patch.tokens ?? {}));
  const layout = LayoutRules.parse({ ...d.layout, ...(patch.layout ?? {}) });
  const before = flatten({ tokens: d.tokens, layout: d.layout });
  const after = flatten({ tokens, layout });
  const changes = Object.keys(after)
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => `${k}: ${String(before[k])} → ${String(after[k])}`);
  const now = (c.now ?? new Date()).toISOString();
  const known = new Set([...d.components.map((x) => x.id), ...(patch.components?.add ?? []).map((x) => x.id)]);
  const styles = structuredClone(d.componentStyles ?? {});
  for (const [cid, vars] of Object.entries(patch.componentStyles ?? {})) {
    if (!known.has(cid)) throw new Error(`디자인 시스템에 없는 컴포넌트입니다: ${cid}`);
    const allowed = new Map(styleVarsOf(cid).map((x) => [x.name, x]));
    for (const [name, value] of Object.entries(vars)) {
      const sv = allowed.get(name);
      if (!sv) throw new Error(`${cid}에서 조정할 수 없는 스타일 변수입니다: ${name} (가능: ${[...allowed.keys()].join(", ")})`);
      if (!isValidStyleValue(sv.type, value)) throw new Error(`${cid} ${name} 값 형식 오류: ${value} (${sv.type === "color" ? "#RRGGBB" : sv.type === "px" ? "숫자px" : "숫자"})`);
      const prev = styles[cid]?.[name];
      if (prev !== value) {
        (styles[cid] ??= {})[name] = value;
        changes.push(`componentStyles.${cid}.${name}: ${prev ?? "기본값"} → ${value}`);
      }
    }
  }
  for (const add of patch.components?.add ?? []) {
    if (d.components.some((x) => x.id === add.id)) continue;
    d.components.push(DesignComponent.parse({ ...add, origin: "ADDED", addedFor: "디자인 미세조정", addedAt: now }));
    changes.push(`컴포넌트 추가 ${add.id}`);
  }
  if (!changes.length) throw new Error("바뀐 내용이 없습니다");
  d.tokens = tokens;
  d.layout = layout;
  d.componentStyles = styles;
  d.revision += 1;
  d.history.push({ rev: d.revision, at: now, note: [c.scope ? `[${scopeOf(c.scope).label}]` : "", patch.summary ?? ""].filter(Boolean).join(" "), instruction: c.instruction, changes });
  commit(m, work);
  const affectedScreens = m.storyboard.screens.filter((s) => s.systemCode === systemCode).map((s) => s.screenId);
  return { summary: `${systemCode} 디자인 시스템 r${d.revision}: 변경 ${changes.length}건 · 다시 그려지는 화면 ${affectedScreens.length}개`, changes, affectedScreens };
}

/** 디자인 변경 뒤 아직 다시 검토하지 않은 화면 (화면의 designRevision < 현재 개정) */
export function screensNeedingReview(m: Model): { screenId: string; systemCode: string; from?: number; to: number }[] {
  const out: { screenId: string; systemCode: string; from?: number; to: number }[] = [];
  for (const s of m.storyboard.screens) {
    const d = m.design.systems.find((x) => x.systemCode === s.systemCode);
    if (d?.status === "SELECTED" && (s.designRevision ?? 1) < d.revision) out.push({ screenId: s.screenId, systemCode: s.systemCode, from: s.designRevision, to: d.revision });
  }
  return out;
}
