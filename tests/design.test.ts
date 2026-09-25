import { describe, expect, it } from "vitest";
import { profileOf } from "../src/design/concepts.js";
import { addDesignComponent, proposeDesign, selectDesign } from "../src/design/ops.js";
import { Project } from "../src/model/schema.js";
import { validateModel } from "../src/model/validate.js";
import { SYSTEM_PRESETS } from "../src/project/presets.js";
import { emptyModel } from "../src/project/store.js";

const now = "2026-09-25T00:00:00.000Z";
const model = () => {
  const m = emptyModel(Project.parse({ code: "DS", name: "d", serviceType: "NEW", createdAt: now, updatedAt: now }));
  m.systems = structuredClone(SYSTEM_PRESETS["public-civil"]);
  m.systems.push({ code: "EXT", name: "외부", users: [], channels: [], color: "#7C3AED", hasScreens: false, description: "" });
  m.ia.nodes.push({ id: "ADM_A_010", systemCode: "ADM", parentId: null, name: "심사", kind: "PAGE", loginRequired: true, roles: [], taskIds: [], change: "NEW" });
  return m;
};
const screen = (component: string) => ({
  screenId: "ADM_A_010", systemCode: "ADM", title: "심사", taskIds: [], status: "DRAFT" as const,
  components: [{ no: 1, label: "이력", kind: component, planner: "", customer: "", ui: { component, props: {} } }],
});

describe("디자인 시스템", () => {
  it("시스템 성격에 맞춰 서로 다른 컨셉 3종을 제안한다", () => {
    const m = model();
    expect(m.systems.map(profileOf)).toEqual(["portal", "service", "admin", "portal"]);
    const pub = proposeDesign(m, "PUB");
    const adm = proposeDesign(m, "ADM");
    expect(pub.proposals.map((c) => c.id)).toEqual(["A", "B", "C"]);
    expect(pub.proposals[0]!.layout.nav).toBe("top-mega");
    expect(adm.proposals[0]!.layout.nav).toBe("side");
    expect(new Set(adm.proposals.map((c) => c.tokens.color.primary)).size).toBe(3);
    expect(() => proposeDesign(m, "EXT")).toThrow("화면이 없는");
  });

  it("컨셉을 선택하면 토큰·레이아웃·기본 컴포넌트·아이콘으로 디자인 시스템이 만들어진다", () => {
    const m = model();
    proposeDesign(m, "ADM");
    const d = selectDesign(m, "ADM", "b", { now: new Date(now) });
    expect(d.status).toBe("SELECTED");
    expect(d.selectedId).toBe("B");
    expect(d.layout!.nav).toBe("top");
    for (const id of ["gnb", "search-panel", "data-table", "pagination", "confirm-dialog", "alert-dialog", "toast", "modal", "login-form"])
      expect(d.components.some((c) => c.id === id)).toBe(true);
    expect(d.icons).toContain("search");
    expect(() => proposeDesign(m, "ADM")).toThrow("이미");
  });

  it("와이어프레임은 컨셉 선택 후에만, 디자인 시스템에 있는 컴포넌트로만 그린다", () => {
    const m = model();
    m.storyboard.screens.push(screen("data-table"));
    expect(validateModel(m).map((i) => i.code)).toContain("NO_DESIGN_SYSTEM");

    selectDesign(m, "ADM", "A");
    expect(validateModel(m).filter((i) => i.level === "error")).toEqual([]);

    m.storyboard.screens[0] = screen("review-timeline");
    expect(validateModel(m).map((i) => i.code)).toContain("UNKNOWN_COMPONENT");
    addDesignComponent(m, "ADM", { id: "review-timeline", name: "심사 이력 타임라인", category: "data", addedFor: "SFR-003-T01" });
    expect(validateModel(m).filter((i) => i.level === "error")).toEqual([]);
    expect(() => addDesignComponent(m, "ADM", { id: "review-timeline", name: "x", category: "data" })).toThrow("이미 있는");
    expect(() => addDesignComponent(m, "PUB", { id: "x-y", name: "x", category: "data" })).toThrow("컨셉을 먼저");
  });
});
