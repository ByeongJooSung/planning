/**
 * 디자인 시스템 연산 (PRD §4.6A)
 *  1) propose: 시스템별 컨셉 3종 제안
 *  2) select : 컨셉 선택 → 토큰·레이아웃 규칙·기본 컴포넌트·아이콘으로 디자인 시스템 생성
 *  3) addComponent: 작업 중 새 컴포넌트가 필요하면 먼저 디자인 시스템에 추가하고 스토리보드에서 사용
 */
import { DesignComponent, FNode, type FNodeT, type Model, type SystemDesign } from "../model/schema.js";
import { BASE_COMPONENTS, BASE_ICONS } from "./catalog.js";
import { proposeConcepts } from "./concepts.js";

type Ctx = { now?: Date };

export function getSystemDesign(m: Model, systemCode: string): SystemDesign | undefined {
  return m.design.systems.find((d) => d.systemCode === systemCode);
}

export function proposeDesign(m: Model, systemCode: string): SystemDesign {
  const system = m.systems.find((s) => s.code === systemCode);
  if (!system) throw new Error(`등록되지 않은 시스템입니다: ${systemCode}`);
  if (!system.hasScreens) throw new Error(`${systemCode}는 화면이 없는 시스템이라 디자인 시스템이 필요 없습니다`);
  const existing = getSystemDesign(m, systemCode);
  if (existing?.status === "SELECTED") throw new Error(`${systemCode}는 이미 컨셉 ${existing.selectedId}로 디자인 시스템이 만들어졌습니다`);
  const d: SystemDesign = { systemCode, status: "PROPOSED", proposals: proposeConcepts(system), components: [], icons: [], componentStyles: {}, revision: 1, history: [] };
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
export function saveFrameComponent(m: Model, systemCode: string, input: { id?: string; name?: string; category?: string; description?: string; tree?: unknown; frameW?: number }, c: Ctx = {}): DesignComponent {
  const d = getSystemDesign(m, systemCode);
  if (d?.status !== "SELECTED") throw new Error(`${systemCode} 디자인 시스템이 아직 없습니다. 컨셉을 먼저 선택하세요`);
  const tree = FNode.parse(input.tree);
  if (tree.type !== "frame") throw new Error("컴포넌트의 맨 위는 프레임이어야 합니다");
  const st = treeStats(tree);
  if (st.count > 400) throw new Error(`노드가 너무 많습니다 (${st.count}개, 최대 400개)`);
  if (st.depth > 12) throw new Error("프레임을 너무 깊게 겹쳤습니다 (최대 12단계)");
  if (new Set(st.ids).size !== st.ids.length) throw new Error("노드 ID가 겹칩니다");
  const now = (c.now ?? new Date()).toISOString();
  const name = String(input.name ?? "").trim();
  let comp = input.id ? d.components.find((x) => x.id === input.id) : undefined;
  if (input.id && !comp && !/^[a-z][a-z0-9-]*$/.test(input.id)) throw new Error("컴포넌트 ID는 영문 소문자·숫자·하이픈");
  // 인스턴스가 자기 자신을 쓰면 무한히 그려진다
  const refs: string[] = [];
  (function walk(n: FNodeT) { if (n.type === "instance" && n.ref) refs.push(n.ref); (n.children ?? []).forEach(walk); })(tree);
  const myId = comp?.id ?? input.id;
  if (myId && refs.includes(myId)) throw new Error("컴포넌트 안에 자기 자신을 넣을 수 없습니다");
  for (const r of refs) if (!d.components.some((x) => x.id === r)) throw new Error(`없는 컴포넌트를 인스턴스로 썼습니다: ${r}`);
  if (comp) {
    if (name) comp.name = name;
    if (input.category) comp.category = DesignComponent.shape.category.parse(input.category);
    if (input.description !== undefined) comp.description = String(input.description);
    comp.tree = tree;
    if (input.frameW) comp.frameW = input.frameW;
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
    comp = DesignComponent.parse({ id, name, category: input.category ?? "content", description: input.description ?? "", origin: "ADDED", addedFor: "프레임 편집기", addedAt: now, tree, frameW: input.frameW });
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
