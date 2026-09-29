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
  DesignConcept,
  LayoutRules,
  type Model,
  type StoryboardScreen,
} from "../model/schema.js";
import { validateModel } from "../model/validate.js";
import { isValidStyleValue, scopeOf, styleVarsOf } from "../design/catalog.js";
import { baseConcept } from "../design/concepts.js";

export const GEN_KINDS = ["ia", "sb", "flow", "ds", "dsc"] as const;
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
  try {
    return applyKind(m, kind, target, output, c);
  } catch (e) {
    if (e instanceof z.ZodError) throw new Error(`AI 결과 형식이 맞지 않아 반영하지 못했습니다: ${zodText(e)}`);
    throw e;
  }
}

/** zod 오류 → 사람이 읽는 문장 (예: "3번째 항목 options.values: 목록이어야 함") */
export function zodText(e: z.ZodError): string {
  return e.issues
    .slice(0, 5)
    .map((i) => {
      const path = i.path.map((x) => (typeof x === "number" ? `${x + 1}번째` : String(x))).join(".");
      const what = i.code === "invalid_type" ? `${TYPE_KO[String((i as { expected?: string }).expected)] ?? String((i as { expected?: string }).expected)}이어야 합니다` : i.message;
      return `${path || "(전체)"}: ${what}`;
    })
    .join(" / ");
}
const TYPE_KO: Record<string, string> = { array: "목록", string: "글자", number: "숫자", object: "객체", boolean: "참/거짓" };

function applyKind(m: Model, kind: GenKind, target: string, output: unknown, c: Ctx): ApplyResult {
  switch (kind) {
    case "ia":
      return applyIa(m, target, output);
    case "sb":
      return applyStoryboard(m, target, output);
    case "flow":
      return applyFlow(m, target, output);
    case "ds":
      return applyDesignPatch(m, target, output, c);
    case "dsc":
      return applyConcepts(m, target, output);
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
  const out = SbOutput.parse(normalizeStoryboardOutput(output));
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
    // 캔버스에서 옮긴 설명 번호 위치는 같은 번호·항목이면 유지
    components: out.components.map((c) => {
      const was = prev?.components.find((x) => x.no === c.no && x.label === c.label);
      return was?.marker && !c.marker ? { ...c, marker: was.marker } : c;
    }),
    status: "DRAFT",
    designRevision: ds?.status === "SELECTED" ? ds.revision : undefined,
  };
  work.storyboard.screens = prev ? work.storyboard.screens.map((s) => (s.screenId === screenId ? next : s)) : [...work.storyboard.screens, next];
  commit(m, work);
  return { summary: `${screenId} 화면설계서 ${prev ? "교체" : "작성"}: 구성 ${out.components.length}개`, changes: [], affectedScreens: [screenId] };
}

// ── 형식 보정: 모델마다 조금씩 다른 모양으로 답하므로 뜻이 분명한 차이는 받아들인다 ──

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => str(x) ?? "").filter(Boolean).join("\n");
  if (isObj(v)) return str(v.label ?? v.name ?? v.text ?? v.value ?? v.title) ?? JSON.stringify(v);
  return undefined;
}
function int(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : NaN;
  return Number.isFinite(n) && String(v).trim() !== "" ? Math.round(n) : undefined;
}
function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return /^(true|y|yes|1|필수|예)$/i.test(v.trim()) ? true : /^(false|n|no|0|선택|아니오)$/i.test(v.trim()) ? false : undefined;
  return undefined;
}
const TIMING = ["ON_INPUT", "ON_BLUR", "ON_SUBMIT"];
const TEMPLATES = ["login", "dashboard", "main", "list", "detail", "form", "popup"];

function normOptions(v: unknown): Obj | undefined {
  let values: unknown = undefined;
  let def: unknown;
  let note: unknown;
  if (Array.isArray(v)) values = v;
  else if (typeof v === "string") values = v.split(/[,/|·]\s*/);
  else if (isObj(v)) {
    values = v.values ?? v.items ?? v.options ?? v.choices ?? v.list;
    if (typeof values === "string") values = values.split(/[,/|·]\s*/);
    def = v.default ?? v.defaultValue ?? v.value;
    note = v.note ?? v.description;
  } else return undefined;
  const list = Array.isArray(values) ? values.map(str).filter((x): x is string => !!x && !!x.trim()) : [];
  const d = str(def);
  if (!list.length && d) list.push(d);
  if (!list.length) return undefined;
  return { values: list, ...(d ? { default: d } : {}), ...(str(note) ? { note: str(note) } : {}) };
}

function normValidation(v: unknown): Obj | undefined {
  if (v == null) return undefined;
  if (typeof v === "boolean" || typeof v === "string") return { required: bool(v) ?? false };
  if (!isObj(v)) return undefined;
  const out: Obj = { required: bool(v.required) ?? false };
  for (const k of ["minLength", "maxLength"]) {
    const n = int(v[k]);
    if (n !== undefined) out[k] = n;
  }
  for (const k of ["format", "allowedChars"]) if (str(v[k])) out[k] = str(v[k]);
  const timing = (Array.isArray(v.timing) ? v.timing : v.timing ? [v.timing] : []).map((x) => String(x).toUpperCase().replace(/^(INPUT|BLUR|SUBMIT)$/, "ON_$1")).filter((x) => TIMING.includes(x));
  out.timing = [...new Set(timing)];
  const msgs = Array.isArray(v.messages) ? v.messages : isObj(v.messages) ? Object.entries(v.messages).map(([condition, text]) => ({ condition, text })) : typeof v.messages === "string" ? [v.messages] : [];
  out.messages = msgs
    .map((x) => (isObj(x) ? { condition: str(x.condition ?? x.when ?? x.case) ?? "", text: str(x.text ?? x.message ?? x.msg) ?? "" } : { condition: "", text: str(x) ?? "" }))
    .filter((x) => x.text);
  return out;
}

function normUi(v: unknown, kind: string | undefined): Obj | undefined {
  if (typeof v === "string") return v.trim() ? { component: v.trim(), props: {} } : undefined;
  if (!isObj(v)) return undefined;
  const component = str(v.component ?? v.id ?? v.type) ?? kind;
  if (!component) return undefined;
  const link = str(v.link);
  return { component, props: isObj(v.props) ? v.props : {}, ...(link && link.trim() ? { link: link.trim() } : {}) };
}

/** 화면설계서 결과 보정 — options 가 배열·값 없이 오거나, 번호가 글자로 오는 경우 등 */
export function normalizeStoryboardOutput(output: unknown): unknown {
  if (!isObj(output)) return output;
  const comps = Array.isArray(output.components) ? output.components : Array.isArray(output.items) ? output.items : undefined;
  if (!comps) return output;
  const components = comps.filter(isObj).map((c, i) => {
    const kind = str(c.kind ?? c.type) ?? (isObj(c.ui) ? str(c.ui.component) : undefined) ?? "text";
    const out: Obj = {
      no: int(c.no) && int(c.no)! > 0 ? int(c.no) : i + 1,
      label: str(c.label ?? c.name ?? c.title) ?? `${i + 1}번 항목`,
      kind,
      planner: str(c.planner) ?? "",
      customer: str(c.customer) ?? "",
    };
    const options = normOptions(c.options);
    if (options) out.options = options;
    const validation = normValidation(c.validation);
    if (validation) out.validation = validation;
    const ui = normUi(c.ui, str(c.kind));
    if (ui) out.ui = ui;
    return out;
  });
  const template = str(output.template)?.toLowerCase();
  return { ...(template && TEMPLATES.includes(template) ? { template } : {}), components };
}

/** 플로우 결과 보정 — 빠진 배열·라벨, 글자가 아닌 값 */
export function normalizeFlowOutput(output: unknown): unknown {
  if (!isObj(output)) return output;
  const nodes = Array.isArray(output.nodes) ? output.nodes.filter(isObj).map((n) => ({ ...n, id: str(n.id), label: str(n.label) ?? "", taskIds: Array.isArray(n.taskIds) ? n.taskIds.map(String) : n.taskIds ? [String(n.taskIds)] : [] })) : output.nodes;
  const edges = Array.isArray(output.edges) ? output.edges.filter(isObj).map((e) => ({ ...e, from: str(e.from), to: str(e.to), label: str(e.label) ?? "" })) : output.edges;
  const lanes = Array.isArray(output.lanes) ? output.lanes.filter(isObj).map((l) => ({ ...l, id: str(l.id), label: str(l.label ?? l.name) ?? "" })) : output.lanes;
  return { ...output, ...(nodes ? { nodes } : {}), ...(edges ? { edges } : {}), ...(lanes ? { lanes } : {}) };
}

export function applyFlow(m: Model, requirementId: string, output: unknown, opts: { keepPos?: boolean } = {}): ApplyResult {
  const norm = normalizeFlowOutput(output) as { nodes?: Record<string, unknown>[] };
  // AI 결과의 좌표는 뜻이 없으므로 자동 배치에 맡긴다 (캔버스에서 직접 옮긴 위치만 보존)
  if (!opts.keepPos && Array.isArray(norm?.nodes)) for (const n of norm.nodes) (delete n.x, delete n.y);
  const flow = FlowOutput.parse(norm);
  const ids = new Set(flow.nodes.map((n) => n.id));
  if (ids.size !== flow.nodes.length) throw new Error("노드 ID가 중복됩니다");
  const laneIds = new Set(flow.lanes.map((l) => l.id));
  for (const n of flow.nodes) if (n.lane && !laneIds.has(n.lane)) throw new Error(`노드 ${n.id}의 레인 ${n.lane}이 없습니다`);
  for (const e of flow.edges) if (!ids.has(e.from) || !ids.has(e.to)) throw new Error(`없는 노드를 잇는 연결입니다: ${e.from} → ${e.to}`);
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

// ── 디자인 컨셉 AI 제안 ─────────────────────────────────────────────

function lum(hex: string): number {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
/** 배경 위에서 4.5:1 이상이 되는 글자색 (흰색·거의 검정 중 더 나은 쪽) */
function readableOn(bg: string): string {
  return contrast("#FFFFFF", bg) >= contrast("#1E2124", bg) ? "#FFFFFF" : "#1E2124";
}

const FONT_OK = /Noto Sans KR|Gothic A1|IBM Plex Sans KR|Nanum Gothic|Malgun Gothic|sans-serif/;

/** 컨셉 하나를 검증·보정한다. 빠진 값은 기준 컨셉에서 채우고, 접근성 대비가 모자란 글자색은 고친다 */
function cleanConcept(raw: unknown, base: DesignConcept, id: string, notes: string[]): DesignConcept | null {
  if (!isObj(raw)) return null;
  const t = coerceLike(base.tokens, isObj(raw.tokens) ? raw.tokens : {}) as Record<string, unknown>;
  if (isObj(t.color)) for (const [k, v] of Object.entries(t.color)) if (!/^#[0-9A-Fa-f]{6}$/.test(String(v))) delete (t.color as Record<string, unknown>)[k];
  if (isObj(t.font)) {
    if (typeof t.font.family !== "string" || !FONT_OK.test(t.font.family)) delete t.font.family;
    if (isObj(t.font.scale)) for (const [k, v] of Object.entries(t.font.scale)) if (typeof v !== "number" || v < 8 || v > 96) delete (t.font.scale as Record<string, unknown>)[k];
    if (typeof t.font.weightBold !== "number") delete t.font.weightBold;
  }
  if (!["none", "soft", "strong"].includes(String(t.shadow))) delete t.shadow;
  for (const k of ["radius", "control", "grid"] as const) if (isObj(t[k])) for (const [kk, v] of Object.entries(t[k] as object)) if (typeof v !== "number" || v < 0 || v > 4000) delete (t[k] as Record<string, unknown>)[kk];
  if (typeof t.spacing !== "number" || t.spacing <= 0 || t.spacing > 64) delete t.spacing;
  const tokens = DesignTokens.parse(deepMerge(base.tokens, t));
  const rawLayout = isObj(raw.layout) ? raw.layout : {};
  const layout = LayoutRules.parse(
    Object.fromEntries(Object.entries(base.layout).map(([k, def]) => [k, (LAYOUT_OPTIONS[k] ?? []).includes(String(rawLayout[k])) ? rawLayout[k] : def])),
  );
  // 접근성: 글자·배경 대비
  const c = tokens.color;
  const fix = (key: "text" | "onPrimary" | "onNav" | "textMuted", bg: string, min: number, label: string) => {
    if (contrast(c[key], bg) < min) {
      const was = c[key];
      c[key] = readableOn(bg);
      notes.push(`${id}: ${label} 대비 부족(${was}) → ${c[key]}로 보정`);
    }
  };
  fix("text", c.bg, 4.5, "본문 글자/배경");
  fix("text", c.surface, 4.5, "본문 글자/면");
  fix("onPrimary", c.primary, 4.5, "주 색 위 글자");
  fix("onNav", c.nav, 4.5, "메뉴 글자");
  fix("textMuted", c.surface, 3, "보조 글자");
  const str1 = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : d);
  return DesignConcept.parse({ id, name: str1(raw.name, `${base.name} 변형`).slice(0, 30), summary: str1(raw.summary, base.summary), fit: str1(raw.fit, base.fit), tokens, layout });
}
const LAYOUT_OPTIONS: Record<string, string[]> = { nav: ["top", "top-mega", "side"], logo: ["left", "center"], search: ["header", "hero", "panel"], list: ["table", "card"], pagination: ["numbered", "numbered-size", "more"], button: ["square", "rounded", "pill"], density: ["comfortable", "compact"], footer: ["full", "simple", "none"] };

/** AI가 제안한 컨셉을 반영한다. 선택 전에는 제안 전체를 대체(A·B·C), 이미 선택했으면 후보로만 추가(현재 디자인 유지) */
export function applyConcepts(m: Model, systemCode: string, output: unknown): ApplyResult {
  const system = m.systems.find((s) => s.code === systemCode);
  if (!system) throw new Error(`등록되지 않은 시스템입니다: ${systemCode}`);
  if (!system.hasScreens) throw new Error(`${systemCode}는 화면이 없는 시스템입니다`);
  const list = isObj(output) ? (output.concepts ?? output.proposals ?? output.items) : output;
  if (!Array.isArray(list) || !list.length) throw new Error("AI 결과에 concepts 목록이 없습니다");
  const base = baseConcept(system);
  const work = structuredClone(m);
  let d = work.design.systems.find((x) => x.systemCode === systemCode);
  const selected = d?.status === "SELECTED";
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const used = new Set(d?.proposals.map((p) => p.id) ?? []);
  const nextId = () => letters.split("").find((l) => !used.has(l)) ?? `X${used.size}`;
  const notes: string[] = [];
  const out: DesignConcept[] = [];
  for (const raw of list.slice(0, 3)) {
    try {
      const id = selected ? nextId() : letters[out.length]!;
      const cc = cleanConcept(raw, base, id, notes);
      if (cc) {
        out.push(cc);
        used.add(id);
      }
    } catch (e) {
      notes.push(`${out.length + 1}번째 컨셉을 읽지 못했습니다: ${e instanceof z.ZodError ? zodText(e) : (e as Error).message}`);
    }
  }
  if (!out.length) throw new Error(`쓸 수 있는 컨셉이 없습니다. ${notes.join(" / ")}`);
  if (d) d.proposals = selected ? [...d.proposals, ...out] : out;
  else {
    d = { systemCode, status: "PROPOSED", proposals: out, components: [], icons: [], componentStyles: {}, revision: 1, history: [] };
    work.design.systems.push(d);
  }
  commit(m, work);
  return {
    summary: `${systemCode} 디자인 컨셉 ${out.length}종 ${selected ? "후보로 추가" : "제안"}: ${out.map((c) => `${c.id} ${c.name}`).join(", ")}`,
    changes: [...out.map((c) => `${c.id} ${c.name} — ${c.summary}`), ...notes],
    affectedScreens: [],
  };
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
