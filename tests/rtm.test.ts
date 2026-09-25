import { describe, expect, it, beforeAll } from "vitest";
import { buildPubInfo, FIXED_NOW } from "../scripts/build-examples.js";
import type { Model } from "../src/model/schema.js";
import { loadModel } from "../src/project/store.js";
import { renderRtmCsv, renderRtmMarkdown } from "../src/render/rtm-render.js";
import { buildRtm, stageBlockers, type Rtm } from "../src/trace/rtm.js";
import { tempRoot } from "./helpers.js";

let m: Model;
let rtm: Rtm;
beforeAll(async () => {
  m = await loadModel(await buildPubInfo(await tempRoot()));
  rtm = buildRtm(m, FIXED_NOW);
});

const task = (id: string) => rtm.rows.flatMap((r) => r.tasks).find((t) => t.taskId === id)!;
const row = (id: string) => rtm.rows.find((r) => r.requirementId === id)!;

describe("RTM — 대국민 정보공개 샘플", () => {
  it("Task 상태를 연결된 산출물로 계산한다", () => {
    expect(task("SFR-002-T01").status).toBe("REVIEWED"); // 스토리보드 + 검토 확인
    expect(task("SFR-002-T02").status).toBe("DESIGNED");
    expect(task("SFR-002-T03").status).toBe("IN_DESIGN"); // 팝업 스토리보드 미작성
    expect(task("SFR-002-T05").status).toBe("DESIGNED");
    expect(task("SFR-002-T06").status).toBe("DESIGNED"); // 화면 없는 외부 연계: 플로우 노드로 충족
    expect(task("SFR-002-T06").screenless).toBe(true);
    expect(task("SFR-001-T01").status).toBe("IN_DESIGN");
  });

  it("요구사항 상태는 Task 중 가장 늦은 상태, 제외·미분해도 구분한다", () => {
    expect(row("SFR-002").status).toBe("IN_DESIGN");
    expect(row("SFR-004").status).toBe("NOT_STARTED");
    expect(row("SFR-005").status).toBe("EXCLUDED");
    expect(row("SFR-005").excludeReason).toContain("2차 사업");
  });

  it("요구사항 × 시스템 매트릭스에 시스템별 Task와 화면을 담는다", () => {
    const cells = rtm.matrix["SFR-002"]!;
    expect(cells.CVL!.taskIds).toEqual(["SFR-002-T01", "SFR-002-T04"]);
    expect(cells.ADM!.screens).toEqual(["ADM_INF_REV_010", "ADM_INF_REV_010_P01"]);
    expect(cells.ADM!.status).toBe("IN_DESIGN");
    expect(cells.PUB!.status).toBe("DESIGNED");
    expect(cells.EXT!.screenless).toBe(true);
    expect(rtm.matrix["SFR-001"]!.PUB!.status).toBeNull();
  });

  it("화면에서 요구사항을 역추적한다", () => {
    expect(rtm.reverse["PUB_INF_LST_010"]).toMatchObject({ systemCode: "PUB", requirementIds: ["SFR-002"], taskIds: ["SFR-002-T05"] });
    expect(rtm.reverse["PUB_MAIN_HOME_010"]!.requirementIds).toEqual([]);
  });

  it("시스템별 설계완료율을 계산한다 (제외 Task는 빼고)", () => {
    // SFR-006 자동 생성 Task(미착수)가 시스템마다 더해진다
    expect(rtm.coverage.bySystem.PUB).toEqual({ total: 2, designed: 1, rate: 50 });
    expect(rtm.coverage.bySystem.ADM).toEqual({ total: 5, designed: 2, rate: 40 });
    expect(rtm.coverage.tasks.total).toBe(16);
  });

  it("단계별 누락과 근거 없는 산출물을 찾는다", () => {
    const g = (kind: string) => rtm.gaps.filter((x) => x.kind === kind).map((x) => x.ref);
    expect(g("NO_TASKS")).toEqual(["SFR-004"]);
    expect(g("NO_SCREEN")).toEqual(["SFR-006-T01", "SFR-006-T02", "SFR-006-T03", "SFR-006-T04", "SFR-006-T05"]);
    expect(g("NO_STORYBOARD")).toEqual(["SFR-001-T01", "SFR-001-T02", "SFR-002-T03", "SFR-006-T01", "SFR-006-T02", "SFR-006-T03", "SFR-006-T04", "SFR-006-T05"]);
    expect(g("NO_DESIGN_SYSTEM")).toEqual([]); // 세 시스템 모두 컨셉 선택 완료
    expect(g("NO_PROTOTYPE")).toEqual([]); // S5 미시작 단계는 검사하지 않음
    expect(rtm.orphans.map((o) => o.ref).sort()).toEqual(["FN-PUB-900", "PUB_MAIN_HOME_010"]);
  });

  it("누락이 있는 단계는 확정할 수 없다", () => {
    expect(stageBlockers(rtm, "S0").map((g) => g.ref)).toEqual(["SFR-004"]);
    expect(stageBlockers(rtm, "S2").some((g) => g.kind === "NO_STORYBOARD")).toBe(false);
    expect(stageBlockers(rtm, "S4").length).toBe(rtm.gaps.length);
  });

  it("Markdown·CSV로 출력한다", () => {
    const md = renderRtmMarkdown(rtm);
    expect(md).toContain("## 요구사항 × 시스템");
    expect(md).toContain("| SFR-002 대국민 정보공개 |");
    const csv = renderRtmCsv(rtm, "req");
    expect(csv.startsWith("﻿요구사항 ID,")).toBe(true);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(1 + 16 + 2); // 헤더 + Task 16 + Task 없는 요구사항 2
  });
});
