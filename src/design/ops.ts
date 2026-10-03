/**
 * 디자인 시스템 연산 (PRD §4.6A)
 *  1) propose: 시스템별 컨셉 3종 제안
 *  2) select : 컨셉 선택 → 토큰·레이아웃 규칙·기본 컴포넌트·아이콘으로 디자인 시스템 생성
 *  3) addComponent: 작업 중 새 컴포넌트가 필요하면 먼저 디자인 시스템에 추가하고 스토리보드에서 사용
 */
import { DesignComponent, FNode, StageBrief, type FNodeT, type Model, type SystemDesign } from "../model/schema.js";
import { BASE_COMPONENTS, BASE_ICONS } from "./catalog.js";
import { proposeConcepts } from "./concepts.js";

type Ctx = { now?: Date };

export function getSystemDesign(m: Model, systemCode: string): SystemDesign | undefined {
  return m.design.systems.find((d) => d.systemCode === systemCode);
}

/** 카탈로그에 새로 생긴 기본 컴포넌트(예: 차트)를 이미 고른 디자인 시스템에도 채운다. 바뀐 것이 있으면 true */
export function syncBaseComponents(m: Model): boolean {
  let changed = false;
  for (const d of m.design.systems) {
    if (d.status !== "SELECTED") continue;
    for (const b of BASE_COMPONENTS) {
      if (d.components.some((x) => x.id === b.id)) continue;
      d.components.push({ ...structuredClone(b), origin: "BASE" });
      changed = true;
    }
  }
  return changed;
}

export function proposeDesign(m: Model, systemCode: string): SystemDesign {
  const system = m.systems.find((s) => s.code === systemCode);
  if (!system) throw new Error(`등록되지 않은 시스템입니다: ${systemCode}`);
  if (!system.hasScreens) throw new Error(`${systemCode}는 화면이 없는 시스템이라 디자인 시스템이 필요 없습니다`);
  const existing = getSystemDesign(m, systemCode);
  if (existing?.status === "SELECTED") throw new Error(`${systemCode}는 이미 컨셉 ${existing.selectedId}로 디자인 시스템이 만들어졌습니다`);
  const d: SystemDesign = { systemCode, status: "PROPOSED", proposals: proposeConcepts(system), components: [], icons: [], componentStyles: {}, brief: {}, css: "", revision: 1, history: [] };
  m.design.systems = m.design.systems.filter((x) => x.systemCode !== systemCode).concat(d);
  return d;
}

export function selectDesign(m: Model, systemCode: string, conceptId: string, c: Ctx = {}): SystemDesign {
  const d = getSystemDesign(m, systemCode) ?? proposeDesign(m, systemCode);
  const concept = d.proposals.find((p) => p.id === conceptId.toUpperCase());
  if (!concept) throw new Error(`컨셉 ${conceptId}가 없습니다 (제안: ${d.proposals.map((p) => p.id).join(", ")})`);
  const added = d.components.filter((x) => x.origin === "ADDED");
  // 이미 쓰던 디자인을 다른 컨셉으로 바꾸는 경우: 개정을 올려 화면설계서가 재검토 대상이 되게 하고, 조정한 스타일은 새 컨셉 기준으로 초기화
  const switching = d.status === "SELECTED" && d.selectedId !== concept.id;
  const now = (c.now ?? new Date()).toISOString();
  if (switching) {
    d.revision += 1;
    d.history.push({ rev: d.revision, at: now, note: `컨셉 변경 ${d.selectedId} → ${concept.id} ${concept.name}`, changes: [`컨셉 ${d.selectedId} → ${concept.id}`] });
    d.componentStyles = {};
  }
  d.status = "SELECTED";
  d.selectedId = concept.id;
  d.selectedAt = (c.now ?? new Date()).toISOString();
  d.tokens = structuredClone(concept.tokens);
  d.layout = structuredClone(concept.layout);
  // 단계별 컨셉의 출발점: 고른 컨셉 (이미 쓴 컨셉이 있고 같은 컨셉이면 그대로)
  const seed = (stage: "style" | "ux") => {
    const prev = d.brief?.[stage];
    if (prev && !switching) return prev;
    return StageBrief.parse({ ...(prev ?? {}), name: `${concept.id}. ${concept.name}`, summary: stage === "style" ? concept.summary : concept.fit, from: concept.id, updatedAt: now });
  };
  d.brief = { ...(d.brief ?? {}), style: seed("style"), ux: seed("ux") };
  d.components = [...BASE_COMPONENTS.map((b) => ({ ...structuredClone(b), origin: "BASE" as const })), ...added];
  d.icons = [...BASE_ICONS];
  return d;
}

export function addDesignComponent(m: Model, systemCode: string, input: unknown, c: Ctx = {}): DesignComponent {
  const d = getSystemDesign(m, systemCode);
  if (d?.status !== "SELECTED") throw new Error(`${systemCode} 디자인 시스템이 아직 없습니다. 컨셉을 먼저 선택하세요 (planning design select ${systemCode} <A|B|C>)`);
  const comp = DesignComponent.parse({ ...(input as object), origin: "ADDED", addedAt: (c.now ?? new Date()).toISOString() });
  if (d.components.some((x) => x.id === comp.id)) throw new Error(`이미 있는 컴포넌트입니다: ${comp.id}`);
  d.components.push(comp);
  return comp;
}

/** 프레임 노드 수·깊이 확인 (너무 큰 트리 저장 막기) */
function treeStats(n: FNodeT, depth = 0): { count: number; depth: number; ids: string[] } {
  let count = 1, d = depth;
  const ids = [n.id];
  for (const c of n.children ?? []) {
    const r = treeStats(c, depth + 1);
    count += r.count;
    d = Math.max(d, r.depth);
    ids.push(...r.ids);
  }
  return { count, depth: d, ids };
}

/**
 * 프레임 편집기로 그린 컴포넌트 저장 — 새로 만들거나, 기존 컴포넌트(기본 컴포넌트 포함)의 모양을 바꾼다.
 * 디자인 개정을 올려 이 컴포넌트를 쓰는 화면설계서가 다시 그려지고 재검토 대상이 된다.
 */
export function saveFrameComponent(m: Model, systemCode: string, input: { id?: string; name?: string; category?: string; description?: string; tree?: unknown; frameW?: number; variantTrees?: unknown; draft?: "render" | "ai" }, c: Ctx = {}): DesignComponent {
  const d = getSystemDesign(m, systemCode);
  if (d?.status !== "SELECTED") throw new Error(`${systemCode} 디자인 시스템이 아직 없습니다. 컨셉을 먼저 선택하세요`);
  const tree = FNode.parse(input.tree);
  if (tree.type !== "frame") throw new Error("컴포넌트의 맨 위는 프레임이어야 합니다");
  const st = treeStats(tree);
  if (st.count > 400) throw new Error(`노드가 너무 많습니다 (${st.count}개, 최대 400개)`);
  if (st.depth > 12) throw new Error("프레임을 너무 깊게 겹쳤습니다 (최대 12단계)");
  if (new Set(st.ids).size !== st.ids.length) throw new Error("노드 ID가 겹칩니다");
  // 변형: 이름이 겹치지 않고, 각각 프레임으로 시작
  const variants = input.variantTrees == null ? undefined : (input.variantTrees as unknown[]).map((v) => {
    const o = v as { name?: unknown; tree?: unknown };
    const name = String(o?.name ?? "").trim();
    if (!name) throw new Error("변형 이름을 입력하세요");
    const t = FNode.parse(o.tree);
    if (t.type !== "frame") throw new Error(`변형 ${name}: 맨 위는 프레임이어야 합니다`);
    const vs = treeStats(t);
    if (vs.count > 400 || vs.depth > 12) throw new Error(`변형 ${name}이(가) 너무 큽니다`);
    if (new Set(vs.ids).size !== vs.ids.length) throw new Error(`변형 ${name}: 노드 ID가 겹칩니다`);
    return { name, tree: t };
  });
  if (variants) {
    const names = variants.map((v) => v.name);
    if (new Set(names).size !== names.length) throw new Error("변형 이름이 겹칩니다");
    if (variants.length > 20) throw new Error("변형은 20개까지입니다");
  }
  const now = (c.now ?? new Date()).toISOString();
  const name = String(input.name ?? "").trim();
  let comp = input.id ? d.components.find((x) => x.id === input.id) : undefined;
  if (input.id && !comp && !/^[a-z][a-z0-9-]*$/.test(input.id)) throw new Error("컴포넌트 ID는 영문 소문자·숫자·하이픈");
  // 인스턴스가 자기 자신을 쓰면 무한히 그려진다
  const refs: string[] = [];
  const collect = (n: FNodeT) => { if (n.type === "instance" && n.ref) refs.push(n.ref); (n.children ?? []).forEach(collect); };
  collect(tree);
  for (const v of variants ?? []) collect(v.tree);
  const myId = comp?.id ?? input.id;
  if (myId && refs.includes(myId)) throw new Error("컴포넌트 안에 자기 자신을 넣을 수 없습니다");
  for (const r of refs) if (!d.components.some((x) => x.id === r)) throw new Error(`없는 컴포넌트를 인스턴스로 썼습니다: ${r}`);
  if (comp) {
    if (name) comp.name = name;
    if (input.category) comp.category = DesignComponent.shape.category.parse(input.category);
    if (input.description !== undefined) comp.description = String(input.description);
    comp.tree = tree;
    if (input.frameW) comp.frameW = input.frameW;
    if (variants) { if (variants.length) comp.variantTrees = variants; else delete comp.variantTrees; }
    // 초안 생성기가 만든 모양은 draft로 표시하고, 사람이 편집기에서 저장하면 검토한 것으로 본다
    if (input.draft) comp.draft = input.draft; else delete comp.draft;
  } else {
    if (!name) throw new Error("컴포넌트 이름을 입력하세요");
    let id = input.id || "";
    if (!id) {
      // 한글 이름이면 영문 약어가 없으므로 c-comp-1, c-comp-2 …
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const base = "c-" + (slug || "comp-1");
      id = base;
      for (let i = 2; d.components.some((x) => x.id === id); i++) id = slug ? `${base}-${i}` : `c-comp-${i}`;
    }
    comp = DesignComponent.parse({ id, name, category: input.category ?? "content", description: input.description ?? "", origin: "ADDED", addedFor: input.draft ? "컴포넌트 초안 생성기" : "프레임 편집기", addedAt: now, tree, frameW: input.frameW, ...(variants && variants.length ? { variantTrees: variants } : {}), ...(input.draft ? { draft: input.draft } : {}) });
    d.components.push(comp);
  }
  d.revision += 1;
  d.history.push({ rev: d.revision, at: now, note: `컴포넌트 ${comp.id} ${comp.name} 프레임 편집`, instruction: "프레임 편집기", changes: [`컴포넌트 ${comp.id} 모양 (노드 ${st.count}개)`] });
  return comp;
}

/** 프레임 모양 지우기: 추가 컴포넌트는 (쓰는 곳이 없으면) 통째로, 기본 컴포넌트는 기본 모양으로 되돌린다 */
export function removeFrameComponent(m: Model, systemCode: string, id: string, c: Ctx = {}): string {
  const d = getSystemDesign(m, systemCode);
  const comp = d?.components.find((x) => x.id === id);
  if (!d || !comp) throw new Error(`없는 컴포넌트입니다: ${id}`);
  const now = (c.now ?? new Date()).toISOString();
  const usedIn = m.storyboard.screens.filter((s) => s.systemCode === systemCode && s.components.some((x) => x.ui?.component === id)).map((s) => s.screenId);
  const inTrees = d.components.filter((x) => x.id !== id && x.tree && JSON.stringify(x.tree).includes(`"ref":"${id}"`)).map((x) => x.id);
  let msg: string;
  if (comp.origin === "BASE") {
    delete comp.tree;
    delete comp.frameW;
    delete comp.variantTrees;
    msg = `${id} 기본 모양으로 되돌림`;
  } else {
    if (usedIn.length) throw new Error(`화면설계서에서 쓰는 컴포넌트라 지울 수 없습니다: ${usedIn.join(", ")}`);
    if (inTrees.length) throw new Error(`다른 컴포넌트 안에서 쓰는 컴포넌트입니다: ${inTrees.join(", ")}`);
    d.components = d.components.filter((x) => x.id !== id);
    delete d.componentStyles?.[id];
    msg = `${id} 삭제`;
  }
  d.revision += 1;
  d.history.push({ rev: d.revision, at: now, note: `컴포넌트 ${msg}`, instruction: "프레임 편집기", changes: [msg] });
  return msg;
}

/**
 * 화면설계서 와이어프레임을 저장하려는데 시스템에 디자인 시스템이 아직 없으면 기본 컨셉 A로 정한다.
 * 정했으면 안내 문구를, 이미 있으면 null을 돌려준다 (디자인 시스템 화면에서 언제든 다른 컨셉으로 바꿀 수 있다)
 */
export function ensureDesign(m: Model, systemCode: string, c: Ctx = {}): string | null {
  const sys = m.systems.find((s) => s.code === systemCode);
  if (!sys?.hasScreens) return null;
  const d = getSystemDesign(m, systemCode);
  if (d?.status === "SELECTED") return null;
  const p = d && d.proposals.length ? d : proposeDesign(m, systemCode);
  const first = p.proposals[0]!;
  selectDesign(m, systemCode, first.id, c);
  return `${systemCode} 디자인 시스템이 없어 기본 컨셉 ${first.id}(${first.name})로 정했습니다 — 디자인 시스템 화면에서 바꿀 수 있습니다`;
}

// ── 단계별 컨셉 (톤앤매너·CSS / UI·UX / 컴포넌트) ─────────────────────────

export type DesignStage = "style" | "ux" | "comp";
export const STAGE_LABEL: Record<DesignStage, string> = { style: "톤앤매너·CSS", ux: "UI·UX", comp: "컴포넌트" };

/**
 * 추가 CSS 정리: 이 시스템 와이어프레임 안에서만 쓰는 스타일이므로 외부 자원·스크립트로 이어지는 것은 뺀다
 * (@import, 외부 url(), expression(), </style>, javascript:)
 */
export function sanitizeCss(css: string): string {
  return String(css ?? "")
    .replace(/<\/?\s*style[^>]*>/gi, "")
    .replace(/</g, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/@charset[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "(")
    .replace(/javascript:/gi, "")
    .replace(/url\(\s*(['"]?)(?!data:image\/)[^)]*\1\s*\)/gi, "none")
    .slice(0, 40000)
    .trim();
}

/** 단계 컨셉·CSS 저장. 바뀐 항목 목록을 돌려준다 (톤·레이아웃 값은 applyDesignPatch가 따로 바꾼다) */
export function updateStage(m: Model, systemCode: string, stage: DesignStage, input: { brief?: unknown; css?: string }, c: Ctx = {}): string[] {
  const d = getSystemDesign(m, systemCode);
  if (d?.status !== "SELECTED") throw new Error(`${systemCode} 디자인 시스템이 아직 없습니다. 컨셉을 먼저 선택하세요`);
  const now = (c.now ?? new Date()).toISOString();
  const changes: string[] = [];
  if (input.brief != null) {
    const raw = input.brief as Record<string, unknown>;
    const lines = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n|,(?=\s*\S)/) : []).map((x) => String(x).trim()).filter(Boolean);
    const prev = d.brief[stage];
    const next = StageBrief.parse({
      ...(prev ?? {}),
      ...(raw.name != null ? { name: String(raw.name).trim().slice(0, 80) } : {}),
      ...(raw.summary != null ? { summary: String(raw.summary).trim().slice(0, 800) } : {}),
      ...(raw.keywords != null ? { keywords: lines(raw.keywords).map((x) => x.slice(0, 30)).slice(0, 12) } : {}),
      ...(raw.rules != null ? { rules: lines(raw.rules).map((x) => x.slice(0, 240)).slice(0, 24) } : {}),
      ...(raw.from != null ? { from: String(raw.from) } : {}),
      updatedAt: now,
    });
    const strip = (b?: { updatedAt?: string }) => JSON.stringify({ ...(b ?? {}), updatedAt: undefined });
    if (strip(prev) !== strip(next)) {
      d.brief = { ...d.brief, [stage]: next };
      changes.push(`${STAGE_LABEL[stage]} 컨셉: ${next.name || "(이름 없음)"}`);
    }
  }
  if (input.css != null) {
    if (stage !== "style") throw new Error("추가 CSS는 톤앤매너 단계에서만 씁니다");
    const css = sanitizeCss(input.css);
    if (css !== d.css) {
      changes.push(`추가 CSS ${d.css ? "수정" : "작성"} (${css.length}자)`);
      d.css = css;
    }
  }
  if (changes.length) {
    d.revision += 1;
    d.history.push({ rev: d.revision, at: now, note: `[${STAGE_LABEL[stage]}] 단계 컨셉`, instruction: "단계별 컨셉", changes });
  }
  return changes;
}

/** 다른 제안 컨셉에서 톤앤매너(토큰)나 UI·UX(레이아웃 규칙)만 가져온다 — 단계마다 다른 컨셉을 섞어 쓸 수 있다 */
export function mixDesign(m: Model, systemCode: string, stage: "style" | "ux", conceptId: string, c: Ctx = {}): string[] {
  const d = getSystemDesign(m, systemCode);
  if (d?.status !== "SELECTED" || !d.tokens || !d.layout) throw new Error(`${systemCode} 디자인 시스템이 아직 없습니다. 컨셉을 먼저 선택하세요`);
  const p = d.proposals.find((x) => x.id === String(conceptId).toUpperCase());
  if (!p) throw new Error(`컨셉 ${conceptId}가 없습니다 (제안: ${d.proposals.map((x) => x.id).join(", ")})`);
  const now = (c.now ?? new Date()).toISOString();
  const changes: string[] = [];
  if (stage === "style") {
    if (JSON.stringify(d.tokens) !== JSON.stringify(p.tokens)) changes.push(`톤앤매너(색·글꼴·모서리·간격) → 컨셉 ${p.id} ${p.name}`);
    d.tokens = structuredClone(p.tokens);
    if (Object.keys(d.componentStyles ?? {}).length) { d.componentStyles = {}; changes.push("컴포넌트별 스타일 조정값 초기화 (새 톤 기준)"); }
  } else {
    if (JSON.stringify(d.layout) !== JSON.stringify(p.layout)) changes.push(`UI·UX 구성(메뉴·검색·목록·버튼·밀도) → 컨셉 ${p.id} ${p.name}`);
    d.layout = structuredClone(p.layout);
  }
  const prev = d.brief?.[stage];
  // 작업자가 직접 쓴 이름·설명은 지키고, 컨셉에서 자동으로 채운 것만 새 컨셉 글로 바꾼다
  const auto = !prev || !prev.name || d.proposals.some((x) => prev.name === `${x.id}. ${x.name}`);
  d.brief = { ...(d.brief ?? {}), [stage]: StageBrief.parse({ ...(prev ?? {}), ...(auto ? { name: `${p.id}. ${p.name}`, summary: stage === "style" ? p.summary : p.fit } : {}), from: p.id, updatedAt: now }) };
  if (!changes.length) changes.push(`${STAGE_LABEL[stage]} 컨셉 출발점 → ${p.id}`);
  d.revision += 1;
  d.history.push({ rev: d.revision, at: now, note: `[${STAGE_LABEL[stage]}] 컨셉 ${p.id} 가져오기`, instruction: "단계별 컨셉", changes });
  return changes;
}
