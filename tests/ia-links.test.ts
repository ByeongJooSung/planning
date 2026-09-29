import { beforeAll, describe, expect, it } from "vitest";
import { buildPubInfo } from "../scripts/build-examples.js";
import { loadChunks } from "../src/knowledge/store.js";
import { loadModel } from "../src/project/store.js";
import { deriveProject, execute, type ProjectState } from "../src/service/core.js";
import { buildRtm } from "../src/trace/rtm.js";
import { tempRoot } from "./helpers.js";

let base: ProjectState;
const now = new Date("2026-09-29T10:00:00Z");
beforeAll(async () => {
  const dir = await buildPubInfo(await tempRoot());
  base = { model: await loadModel(dir), chunks: await loadChunks(dir), snapshots: [] };
});
const screensOf = (s: ProjectState, taskId: string) => buildRtm(s.model).rows.flatMap((r) => r.tasks).find((t) => t.taskId === taskId)!.screens;

describe("화면 ↔ Task 수동 연결 · 화면 추가", () => {
  it("Task 하나에 화면 여러 개를 연결하고, 뺀 화면에서는 떨어진다", () => {
    let s = execute(base, { op: "task.screens", taskId: "SFR-002-T01", screenIds: ["CVL_INF_REG_010", "CVL_INF_STS_010"] }, now).state;
    expect(screensOf(s, "SFR-002-T01").sort()).toEqual(["CVL_INF_REG_010", "CVL_INF_STS_010"]);
    s = execute(s, { op: "task.screens", taskId: "SFR-002-T01", screenIds: ["CVL_INF_STS_010"] }, now).state;
    expect(screensOf(s, "SFR-002-T01")).toEqual(["CVL_INF_STS_010"]);
    // 화면설계서 쪽 연결도 함께 맞춘다 (추적표에 남지 않게)
    expect(s.model.storyboard.screens.find((x) => x.screenId === "CVL_INF_REG_010")?.taskIds ?? []).not.toContain("SFR-002-T01");
    expect(() => execute(s, { op: "task.screens", taskId: "NOPE", screenIds: [] }, now)).toThrow(/없는 Task/);
    expect(() => execute(s, { op: "task.screens", taskId: "SFR-002-T01", screenIds: ["M-CVL-INF"] }, now)).toThrow(/없는 화면/);
  });

  it("화면 쪽에서 Task를 붙이고 떼기, Task 없는 화면도 AI 생성 프롬프트가 있다", () => {
    let s = execute(base, { op: "screen.tasks", screenId: "CVL_MEM_JOIN_010", taskIds: [] }, now).state;
    expect(s.model.ia.nodes.find((n) => n.id === "CVL_MEM_JOIN_010")!.taskIds).toEqual([]);
    expect(deriveProject(s, now).gens["sb:CVL_MEM_JOIN_010"]).toBeDefined();
    s = execute(s, { op: "screen.tasks", screenId: "CVL_MEM_JOIN_010", taskIds: ["SFR-001-T01", "SFR-001-T02"] }, now).state;
    expect(screensOf(s, "SFR-001-T02")).toEqual(expect.arrayContaining(["CVL_MEM_JOIN_010", "CVL_MEM_LOGIN_010"]));
    expect(() => execute(s, { op: "screen.tasks", screenId: "CVL_MEM_JOIN_010", taskIds: ["X-T99"] }, now)).toThrow(/없는 Task/);
  });

  it("화면 추가: 화면 ID 규칙으로 ID를 만들고 폐기·중복 ID는 막는다, 팝업은 부모 화면 접미사", () => {
    let r = execute(base, { op: "screen.add", systemCode: "CVL", parentId: "M-CVL-INF", name: "공개 신청 내역", taskIds: ["SFR-002-T01"] }, now);
    const id = (r.detail as { id: string }).id;
    expect(id).toMatch(/^CVL_INF_\d{3}$/);
    expect(screensOf(r.state, "SFR-002-T01")).toContain(id);
    r = execute(r.state, { op: "screen.add", systemCode: "CVL", parentId: "CVL_INF_REG_010", name: "첨부 미리보기", kind: "POPUP" }, now);
    expect((r.detail as { id: string }).id).toBe("CVL_INF_REG_010_P01");
    expect(() => execute(r.state, { op: "screen.add", systemCode: "CVL", name: "x", id: "CVL_INF_REG_010" }, now)).toThrow(/이미 있는/);
    expect(() => execute(r.state, { op: "screen.add", systemCode: "EXT", name: "x" }, now)).toThrow(/화면이 있는 시스템/);
  });
});

describe("정보구조도 캔버스 저장", () => {
  const cvl = () => base.model.ia.nodes.filter((n) => n.systemCode === "CVL");

  it("새 노드에 ID를 붙이고(부모 참조 포함), 이름·순서·부모를 바꿔 저장한다", () => {
    const nodes = cvl().map((n) => (n.id === "CVL_INF_STS_010" ? { ...n, name: "처리 현황 조회" } : n));
    nodes.push({ id: "new:m1", systemCode: "CVL", parentId: null, name: "고객센터", kind: "MENU", loginRequired: false, roles: [], taskIds: [], change: "NEW" });
    nodes.push({ id: "new:s1", systemCode: "CVL", parentId: "new:m1", name: "자주 묻는 질문", kind: "PAGE", loginRequired: false, roles: [], taskIds: [], change: "NEW" });
    const r = execute(base, { op: "ia.save", systemCode: "CVL", nodes }, now);
    const ia = r.state.model.ia.nodes.filter((n) => n.systemCode === "CVL");
    const menu = ia.find((n) => n.name === "고객센터")!;
    const faq = ia.find((n) => n.name === "자주 묻는 질문")!;
    expect(menu.id).toMatch(/^M-CVL-N\d+$/);
    expect(faq.parentId).toBe(menu.id);
    expect(faq.id).toMatch(/^CVL_GEN_\d{3}$/);
    expect(ia.find((n) => n.id === "CVL_INF_STS_010")!.name).toBe("처리 현황 조회");
    expect(r.state.model.rtmRecords.work["ia:CVL"]).toMatchObject({ status: "IN_PROGRESS" });
  });

  it("화면설계서가 있는 화면을 지우려면 확인이 필요하고, 확인하면 화면설계서도 지우고 ID는 폐기한다", () => {
    const nodes = cvl().filter((n) => n.id !== "CVL_INF_REG_010");
    expect(() => execute(base, { op: "ia.save", systemCode: "CVL", nodes }, now)).toThrow(/화면설계서가 있는 화면/);
    const r = execute(base, { op: "ia.save", systemCode: "CVL", nodes, dropStoryboards: true }, now);
    expect(r.state.model.storyboard.screens.some((x) => x.screenId === "CVL_INF_REG_010")).toBe(false);
    expect(r.state.model.ia.retiredIds).toContain("CVL_INF_REG_010");
  });
});

describe("화면설계서 만들기·순서·삭제", () => {
  it("빈 화면설계서 → 항목 추가 → 순서 바꾸기(설명 번호 위치 유지) → 삭제", () => {
    let s = execute(base, { op: "sb.create", screenId: "CVL_MEM_JOIN_010" }, now).state;
    expect(s.model.storyboard.screens.find((x) => x.screenId === "CVL_MEM_JOIN_010")!.components).toEqual([]);
    expect(() => execute(s, { op: "sb.create", screenId: "CVL_MEM_JOIN_010" }, now)).toThrow(/이미/);
    s = execute(s, { op: "sb.component", screenId: "CVL_MEM_JOIN_010", input: { label: "아이디", kind: "text-input" } }, now).state;
    s = execute(s, { op: "sb.component", screenId: "CVL_MEM_JOIN_010", input: { label: "비밀번호", kind: "text-input" } }, now).state;
    s = execute(s, { op: "sb.marker", screenId: "CVL_MEM_JOIN_010", no: 2, pos: { x: 100, y: 200 } }, now).state;
    s = execute(s, { op: "sb.reorder", screenId: "CVL_MEM_JOIN_010", order: [2, 1] }, now).state;
    const c = s.model.storyboard.screens.find((x) => x.screenId === "CVL_MEM_JOIN_010")!.components;
    expect(c.map((x) => [x.no, x.label])).toEqual([[1, "비밀번호"], [2, "아이디"]]);
    expect(c[0]!.marker).toEqual({ x: 100, y: 200 });
    expect(() => execute(s, { op: "sb.reorder", screenId: "CVL_MEM_JOIN_010", order: [1] }, now)).toThrow(/순서/);
    s = execute(s, { op: "sb.delete", screenId: "CVL_MEM_JOIN_010" }, now).state;
    expect(s.model.storyboard.screens.some((x) => x.screenId === "CVL_MEM_JOIN_010")).toBe(false);
  });
});
