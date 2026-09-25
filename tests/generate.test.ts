import { beforeAll, describe, expect, it } from "vitest";
import { buildPubInfo } from "../scripts/build-examples.js";
import { applyDesignPatch, applyGenerated, applyIa, screensNeedingReview } from "../src/ai/apply.js";
import { buildGenPrompts, type GenPrompt } from "../src/ai/generate.js";
import { loadChunks } from "../src/knowledge/store.js";
import type { Model } from "../src/model/schema.js";
import { loadModel } from "../src/project/store.js";
import { tempRoot } from "./helpers.js";

let dir: string;
let gens: Record<string, GenPrompt>;
const fresh = () => loadModel(dir);
beforeAll(async () => {
  dir = await buildPubInfo(await tempRoot());
  gens = buildGenPrompts(await fresh(), await loadChunks(dir));
});

describe("AI 생성 프롬프트", () => {
  it("정보구조도(시스템)·화면설계서(모든 화면)·플로우(요구사항)·디자인 미세조정(선택된 시스템)마다 만든다", () => {
    expect(Object.keys(gens)).toEqual(expect.arrayContaining(["ia:PUB", "ia:CVL", "ia:ADM", "sb:ADM_INF_REV_010_P01", "sb:CVL_MEM_LOGIN_010", "flow:SFR-002", "flow:SFR-006", "ds:ADM"]));
    expect(gens["flow:SFR-005"]).toBeUndefined(); // 제외된 요구사항
    expect(gens["ds:ADM"]!.requiresInstruction).toBe(true);
    expect(gens["ds:ADM"]!.prompt.trimEnd().endsWith("## 요청")).toBe(true);
  });
  it("화면설계서 생성 프롬프트에 쓸 수 있는 컴포넌트, props 안내, 관점 규칙, 근거, JSON 형식을 담는다", () => {
    const p = gens["sb:ADM_INF_REV_010_P01"]!.prompt;
    expect(p).toContain("`review-timeline` 심사 이력 타임라인");
    expect(p).toContain("button-group: {\"buttons\"");
    expect(p).toContain("개발자 관점(API, DB, 구현)은 쓰지 않는다");
    expect(p).toContain("부모 화면 ADM_INF_REV_010");
    expect(p).toContain("반드시 JSON 하나만");
    expect(p).toMatch(/\[SRC-00\d /);
  });
  it("정보구조도 생성 프롬프트에 화면 ID 규칙과 이 시스템 Task를 담는다", () => {
    const p = gens["ia:ADM"]!.prompt;
    expect(p).toContain("{system}_{d1}_{d2}_{seq}");
    expect(p).toContain("SFR-006-T02");
    expect(p).not.toContain("SFR-006-T01"); // CVL Task
  });
});

describe("생성 결과 반영", () => {
  it("디자인 미세조정: 개정이 오르고 이력이 남고, 이 디자인을 쓰는 화면이 모두 재검토 대상이 된다", async () => {
    const m = await fresh();
    const r = applyDesignPatch(m, "ADM", { summary: "진한 파랑·둥근 버튼", tokens: { color: { primary: "#123A8C" } }, layout: { button: "rounded" } }, { instruction: "더 진하게" });
    const d = m.design.systems.find((x) => x.systemCode === "ADM")!;
    expect(d.revision).toBe(2);
    expect(d.tokens!.color.primary).toBe("#123A8C");
    expect(d.tokens!.color.accent).toBe("#0F8A6C"); // 안 바꾼 값은 유지
    expect(d.history.at(-1)).toMatchObject({ rev: 2, note: "진한 파랑·둥근 버튼", instruction: "더 진하게" });
    expect(r.changes).toEqual(["tokens.color.primary: #2257A8 → #123A8C", "layout.button: square → rounded"]);
    expect(r.affectedScreens.sort()).toEqual(["ADM_INF_HIS_010", "ADM_INF_REV_010"]);
    expect(screensNeedingReview(m).map((x) => x.screenId).sort()).toEqual(["ADM_INF_HIS_010", "ADM_INF_REV_010"]);
    expect(() => applyDesignPatch(m, "ADM", { tokens: { color: { primary: "blue" } } })).toThrow();
    expect(() => applyDesignPatch(m, "ADM", { layout: { button: "rounded" } })).toThrow("바뀐 내용이 없습니다");
  });

  it("화면설계서 생성 결과는 디자인 시스템에 있는 컴포넌트만 받고, 현재 디자인 개정을 기록한다", async () => {
    const m = await fresh();
    const ok = { template: "popup", components: [{ no: 1, label: "처리 결과", kind: "radio-group", planner: "반려 시 사유 100자 이상", customer: "승인 또는 반려를 고른다", options: { values: ["승인", "반려"], default: "승인" }, ui: { component: "radio-group", props: { label: "처리 결과", options: ["승인", "반려"] } } }] };
    applyGenerated(m, "sb", "ADM_INF_REV_010_P01", ok);
    expect(m.storyboard.screens.find((s) => s.screenId === "ADM_INF_REV_010_P01")).toMatchObject({ systemCode: "ADM", title: "승인·반려 처리", designRevision: 1 });
    const bad = { components: [{ no: 1, label: "x", kind: "x", ui: { component: "not-in-ds", props: {} } }] };
    expect(() => applyGenerated(m, "sb", "ADM_INF_REV_010_P01", bad)).toThrow("디자인 시스템에 없습니다");
  });

  it("정보구조도 생성 결과는 시스템 단위로 교체하고, 빠진 화면 ID는 폐기 목록에 넣는다", async () => {
    const m: Model = await fresh();
    const nodes = m.ia.nodes.filter((n) => n.systemCode === "PUB" && n.id !== "PUB_MAIN_HOME_010").map(({ systemCode: _, ...n }) => n);
    nodes.push({ id: "PUB_INF_SRC_010", parentId: "M-PUB-INF", name: "통합 검색", kind: "PAGE", loginRequired: false, roles: [], taskIds: [], change: "NEW" });
    const r = applyIa(m, "PUB", { nodes });
    expect(r.changes).toEqual(["추가 PUB_INF_SRC_010", "삭제 PUB_MAIN_HOME_010"]);
    expect(m.ia.retiredIds).toContain("PUB_MAIN_HOME_010");
    expect(() => applyIa(m, "PUB", { nodes: [...nodes, { ...nodes[0]!, id: "PUB_MAIN_HOME_010" }] })).toThrow("폐기된 화면 ID");
  });

  it("플로우 생성 결과는 같은 id의 플로우를 교체한다", async () => {
    const m = await fresh();
    const f = structuredClone(m.flows[0]!);
    f.nodes = f.nodes.slice(0, 3);
    f.edges = f.edges.filter((e) => ["n1", "n2", "n3"].includes(e.from) && ["n1", "n2", "n3"].includes(e.to));
    applyGenerated(m, "flow", "SFR-002", f);
    expect(m.flows).toHaveLength(1);
    expect(m.flows[0]!.nodes).toHaveLength(3);
    expect(() => applyGenerated(m, "flow", "SFR-002", { ...f, edges: [{ from: "n1", to: "n9", label: "" }] })).toThrow();
  });
});

describe("디자인 시스템 섹션별 조정 · 컴포넌트 스타일", () => {
  it("컴포넌트 스타일 변수만 바꾸고, 목록에 없는 변수·잘못된 값은 거부한다", async () => {
    const { applyDesignPatch: apply } = await import("../src/ai/apply.js");
    const m = await fresh();
    const r = apply(m, "ADM", { componentStyles: { "data-table": { "--w-th-bg": "#1F2A3C", "--w-th-color": "#FFFFFF", "--w-row": "36px" } } }, { scope: "cmp:data-table", instruction: "머리글 진하게" });
    const d = m.design.systems.find((x) => x.systemCode === "ADM")!;
    expect(d.componentStyles["data-table"]).toEqual({ "--w-th-bg": "#1F2A3C", "--w-th-color": "#FFFFFF", "--w-row": "36px" });
    expect(r.changes[0]).toBe("componentStyles.data-table.--w-th-bg: 기본값 → #1F2A3C");
    expect(d.history.at(-1)!.note).toContain("[컴포넌트 data-table]");
    expect(() => apply(m, "ADM", { componentStyles: { "data-table": { "--w-unknown": "#000000" } } })).toThrow("조정할 수 없는 스타일 변수");
    expect(() => apply(m, "ADM", { componentStyles: { "data-table": { "--w-row": "36" } } })).toThrow("값 형식 오류");
    expect(() => apply(m, "ADM", { componentStyles: { nope: { "--w-gen-bg": "#000000" } } })).toThrow("없는 컴포넌트");
  });

  it("조정 범위 밖의 값이 있으면 반영하지 않는다", async () => {
    const { applyDesignPatch: apply, outOfScope } = await import("../src/ai/apply.js");
    const m = await fresh();
    const patch = { tokens: { color: { primary: "#123456" }, radius: { md: 10 } } };
    expect(outOfScope(patch, "colors")).toEqual(["tokens.radius.md"]);
    expect(() => apply(m, "ADM", patch, { scope: "colors" })).toThrow("‘색상’ 범위에서 바꿀 수 없는 값입니다: tokens.radius.md");
    expect(outOfScope({ componentStyles: { button: { "--w-btn-r": "8px" } } }, "cmp:data-table")).toEqual(["componentStyles.button.--w-btn-r"]);
    expect(outOfScope({ components: { add: [{ id: "x-y", name: "x", category: "data", description: "", variants: [] }] } }, "templates")).toEqual(["components.add"]);
    expect(outOfScope({ components: { add: [{ id: "x-y", name: "x", category: "data", description: "", variants: [] }] } }, "global")).toEqual([]);
  });

  it("디자인 미세조정 프롬프트에 범위·현재 디자인·스타일 변수·댓글을 채운다", async () => {
    const { fillDsPrompt } = await import("../src/ai/generate.js");
    const { scopeOf } = await import("../src/design/catalog.js");
    const m = await fresh();
    const d = m.design.systems.find((x) => x.systemCode === "ADM")!;
    const text = fillDsPrompt(gens["ds:ADM"]!.prompt, { scope: scopeOf("cmp:data-table"), design: d, comments: "- [목록] 1번 · 컴포넌트 data-table\n  댓글: 머리글 진하게" });
    expect(text).toContain("- 컴포넌트 data-table: data-table의 스타일 변수만");
    expect(text).toContain("바꿀 수 있는 경로: componentStyles.data-table");
    expect(text).toContain("--w-th-bg(머리글 배경, color");
    expect(text).not.toContain("--w-btn-r(");
    expect(text).toContain("댓글: 머리글 진하게");
    expect(text).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
});
