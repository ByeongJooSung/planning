import { beforeAll, describe, expect, it } from "vitest";
import { buildPubInfo } from "../scripts/build-examples.js";
import { loadChunks } from "../src/knowledge/store.js";
import { loadModel } from "../src/project/store.js";
import { deriveProject, execute, type ProjectState } from "../src/service/core.js";
import { tempRoot } from "./helpers.js";

let base: ProjectState;
const now = new Date("2026-09-29T10:00:00Z");
beforeAll(async () => {
  const dir = await buildPubInfo(await tempRoot());
  base = { model: await loadModel(dir), chunks: await loadChunks(dir), snapshots: [] };
});
const node = (s: ProjectState, id: string) => s.model.ia.nodes.find((n) => n.id === id)!;

describe("정보구조도 표(엑셀) · 채널", () => {
  it("기본 채널은 웹·모바일·태블릿, 칸 하나씩 고친다", () => {
    expect(base.model.ia.channels.map((c) => c.id)).toEqual(["WEB", "MOBILE", "TABLET"]);
    let s = execute(base, { op: "ia.cell", id: "CVL_INF_REG_010", field: "devices", value: ["TABLET", "WEB"] }, now).state;
    expect(node(s, "CVL_INF_REG_010").devices).toEqual(["WEB", "TABLET"]);
    s = execute(s, { op: "ia.cell", id: "CVL_INF_REG_010", field: "func", value: "정보공개 자료를 등록한다" }, now).state;
    s = execute(s, { op: "ia.cell", id: "CVL_INF_REG_010", field: "pages", value: "3" }, now).state;
    s = execute(s, { op: "ia.cell", id: "CVL_INF_REG_010", field: "track.publish", value: "DONE" }, now).state;
    const n = node(s, "CVL_INF_REG_010");
    expect([n.func, n.pages, n.track?.publish]).toEqual(["정보공개 자료를 등록한다", 3, "DONE"]);
    expect(() => execute(s, { op: "ia.cell", id: "CVL_INF_REG_010", field: "devices", value: ["TV"] }, now)).toThrow(/없는 채널/);
    expect(() => execute(s, { op: "ia.cell", id: "CVL_INF_REG_010", field: "pages", value: "-1" }, now)).toThrow(/정수/);
    expect(() => execute(s, { op: "ia.cell", id: "CVL_INF_REG_010", field: "kind", value: "MENU" }, now)).toThrow(/고칠 수 없는/);
  });

  it("채널을 바꾸면 지운 채널은 화면 지정에서 빠지고, 캔버스·AI로 구조를 고쳐도 표 항목은 남는다", () => {
    let s = execute(base, { op: "ia.cell", id: "CVL_INF_REG_010", field: "devices", value: ["WEB", "MOBILE"] }, now).state;
    s = execute(s, { op: "ia.cell", id: "CVL_INF_REG_010", field: "note", value: "퍼블 검토 필요" }, now).state;
    s = execute(s, { op: "ia.channels", channels: [{ id: "WEB", label: "웹" }, { id: "APP", label: "앱" }] }, now).state;
    expect(node(s, "CVL_INF_REG_010").devices).toEqual(["WEB"]);
    const nodes = s.model.ia.nodes.filter((n) => n.systemCode === "CVL").map((n) => ({ id: n.id, parentId: n.parentId, name: n.name, kind: n.kind, loginRequired: n.loginRequired, roles: [], taskIds: n.taskIds, change: n.change }));
    s = execute(s, { op: "ia.save", systemCode: "CVL", nodes }, now).state;
    expect(node(s, "CVL_INF_REG_010").note).toBe("퍼블 검토 필요");
    expect(node(s, "CVL_INF_REG_010").devices).toEqual(["WEB"]);
    expect(() => execute(s, { op: "ia.channels", channels: [] }, now)).toThrow();
  });
});

describe("정보구조도 기반 테스트", () => {
  it("화면설계서·Task로 초안을 만들고, 다시 만들어도 직접 쓴 케이스와 결과는 남는다", () => {
    let s = execute(base, { op: "qa.draft", screenId: "CVL_INF_REG_010" }, now).state;
    const drafts = s.model.ia.tests.filter((t) => t.screenId === "CVL_INF_REG_010");
    expect(drafts.length).toBeGreaterThan(2);
    expect(drafts[0]!.id).toBe("TC-CVL_INF_REG_010-01");
    expect(drafts.some((t) => t.type === "예외")).toBe(true);
    s = execute(s, { op: "qa.case", case: { screenId: "CVL_INF_REG_010", title: "첨부 20MB 초과", type: "예외", devices: ["MOBILE"] } }, now).state;
    const mine = s.model.ia.tests.find((t) => t.title === "첨부 20MB 초과")!;
    s = execute(s, { op: "qa.result", id: drafts[0]!.id, device: "WEB", status: "PASS", by: "홍길동" }, now).state;
    s = execute(s, { op: "qa.draft", screenId: "CVL_INF_REG_010" }, now).state;
    const again = s.model.ia.tests.filter((t) => t.screenId === "CVL_INF_REG_010");
    expect(again.find((t) => t.id === mine.id)?.devices).toEqual(["MOBILE"]);
    expect(again.find((t) => t.id === drafts[0]!.id)?.results.WEB?.status).toBe("PASS");
    expect(again.length).toBe(drafts.length + 1);
    expect(() => execute(s, { op: "qa.result", id: mine.id, device: "TV", status: "PASS" }, now)).toThrow(/없는 채널/);
    s = execute(s, { op: "qa.rm", id: mine.id }, now).state;
    expect(s.model.ia.tests.some((t) => t.id === mine.id)).toBe(false);
  });

  it("AI 결과를 넣고, 화면을 지우면 그 화면의 케이스도 지운다 · 화면마다 AI 테스트 프롬프트가 있다", () => {
    expect(deriveProject(base, now).gens["qa:CVL_INF_REG_010"]?.prompt).toMatch(/지원 채널/);
    let s = execute(base, { op: "qa.ai", screenId: "CVL_INF_STS_010", output: { cases: [{ title: "처리 상태 조회", steps: "1. 조회", expected: "상태가 보인다", taskIds: ["NOPE", "SFR-002-T04"] }] } }, now).state;
    const t = s.model.ia.tests.find((x) => x.screenId === "CVL_INF_STS_010")!;
    expect([t.source, t.taskIds]).toEqual(["AI", ["SFR-002-T04"]]);
    const nodes = s.model.ia.nodes.filter((n) => n.systemCode === "CVL" && n.id !== "CVL_INF_STS_010");
    s = execute(s, { op: "ia.save", systemCode: "CVL", nodes, dropStoryboards: true }, now).state;
    expect(s.model.ia.tests.some((x) => x.screenId === "CVL_INF_STS_010")).toBe(false);
  });

  it("시스템별 테스트 기기: 관리자는 웹만, 기기 구분 없이면 결과 한 칸(ALL)", async () => {
    const { caseDevices } = await import("../src/project/qa-ops.js");
    let s = execute(base, { op: "qa.draft", screenId: "ADM_INF_REV_010" }, now).state;
    s = execute(s, { op: "qa.draft", screenId: "CVL_INF_REG_010" }, now).state;
    s = execute(s, { op: "ia.sysChannels", systemCode: "ADM", channels: ["WEB"] }, now).state;
    const adm = s.model.ia.tests.find((t) => t.screenId === "ADM_INF_REV_010")!;
    const cvl = s.model.ia.tests.find((t) => t.screenId === "CVL_INF_REG_010")!;
    expect(caseDevices(s.model, adm)).toEqual(["WEB"]);
    expect(caseDevices(s.model, cvl)).toEqual(["WEB", "MOBILE", "TABLET"]);
    s = execute(s, { op: "ia.sysChannels", systemCode: "CVL", channels: [] }, now).state;
    expect(caseDevices(s.model, cvl)).toEqual(["ALL"]);
    s = execute(s, { op: "qa.result", id: cvl.id, device: "ALL", status: "PASS" }, now).state;
    expect(s.model.ia.tests.find((t) => t.id === cvl.id)!.results.ALL?.status).toBe("PASS");
    expect(deriveProject(s, now).gens["qa:CVL_INF_REG_010"]?.prompt).toMatch(/기기 구분 없이/);
    s = execute(s, { op: "ia.sysChannels", systemCode: "CVL", channels: null }, now).state;
    expect(caseDevices(s.model, cvl)).toEqual(["WEB", "MOBILE", "TABLET"]);
    expect(() => execute(s, { op: "ia.sysChannels", systemCode: "EXT", channels: ["WEB"] }, now)).toThrow(/화면이 있는/);
  });
});

describe("Task·요구사항 고치기", () => {
  it("Task 행위자·처리 내용·시스템·선행을 고치고, ID와 화면 연결은 그대로 둔다", () => {
    const req = base.model.requirements.find((r) => r.id === "SFR-002")!;
    const t = req.tasks[1]!;
    const screens = base.model.ia.nodes.filter((n) => n.taskIds.includes(t.id)).map((n) => n.id);
    let s = execute(base, { op: "task.edit", taskId: t.id, input: { actor: "심사 담당자", action: "자료 검토 후 승인 또는 반려", to: "" } }, now).state;
    const t2 = s.model.requirements.find((r) => r.id === "SFR-002")!.tasks[1]!;
    expect([t2.id, t2.actor, t2.action, t2.transition]).toEqual([t.id, "심사 담당자", "자료 검토 후 승인 또는 반려", undefined]);
    expect(s.model.ia.nodes.filter((n) => n.taskIds.includes(t.id)).map((n) => n.id)).toEqual(screens);
    expect(s.model.rtmRecords.history.at(-1)?.detail).toMatch(/수정/);
    expect(() => execute(s, { op: "task.edit", taskId: t.id, input: { action: " " } }, now)).toThrow(/처리 내용/);
    expect(() => execute(s, { op: "task.edit", taskId: t.id, input: { systemCode: "NOPE" } }, now)).toThrow(/등록되지 않은/);
    expect(() => execute(s, { op: "task.edit", taskId: req.tasks[0]!.id, input: { after: [t.id] } }, now)).toThrow(/순환/);
    s = execute(s, { op: "req.edit", id: "SFR-002", input: { title: "대국민 정보공개 신청·심사" } }, now).state;
    expect(s.model.requirements.find((r) => r.id === "SFR-002")!.title).toBe("대국민 정보공개 신청·심사");
    expect(() => execute(s, { op: "req.edit", id: "SFR-002", input: { title: "" } }, now)).toThrow(/제목/);
  });
});
