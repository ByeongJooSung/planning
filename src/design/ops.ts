/**
 * 디자인 시스템 연산 (PRD §4.6A)
 *  1) propose: 시스템별 컨셉 3종 제안
 *  2) select : 컨셉 선택 → 토큰·레이아웃 규칙·기본 컴포넌트·아이콘으로 디자인 시스템 생성
 *  3) addComponent: 작업 중 새 컴포넌트가 필요하면 먼저 디자인 시스템에 추가하고 스토리보드에서 사용
 */
import { DesignComponent, type Model, type SystemDesign } from "../model/schema.js";
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
