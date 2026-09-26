import { beforeAll, describe, expect, it } from "vitest";
import { buildPubInfo } from "../scripts/build-examples.js";
import { loadChunks } from "../src/knowledge/store.js";
import { loadModel } from "../src/project/store.js";
import { execute, type ProjectState } from "../src/service/core.js";
import { buildRtm } from "../src/trace/rtm.js";
import { systemWork, workOf } from "../src/trace/work.js";
import { tempRoot } from "./helpers.js";

let base: ProjectState;
const t = (s: string) => new Date(`2026-09-26T${s}:00Z`);
beforeAll(async () => {
  const dir = await buildPubInfo(await tempRoot());
  base = { model: await loadModel(dir), chunks: await loadChunks(dir), snapshots: [] };
});

describe("산출물 작업 상태 (미진행·진행중·완료·재검토 필요)", () => {
  const SID = "CVL_INF_REG_010";
  const sbOut = { template: "form", components: [{ no: 1, label: "제목", kind: "text-input", ui: { component: "text-input", props: { label: "제목" } } }] };

  it("AI 결과를 적용하면 완료가 아니라 진행중이고, RTM도 설계중이 된다", () => {
    expect(workOf(base.model, `sb:${SID}`).status).toBe("DONE");
    const s = execute(base, { op: "gen.apply", kind: "sb", target: SID, output: sbOut }, t("01:00")).state;
    expect(workOf(s.model, `sb:${SID}`)).toMatchObject({ status: "IN_PROGRESS", by: "AI 적용" });
    const task = buildRtm(s.model).rows.flatMap((r) => r.tasks).find((x) => x.screens.includes(SID))!;
    expect(task.status).toBe("IN_DESIGN");
    // 작업자가 완료 표시
    const d = execute(s, { op: "work.set", key: `sb:${SID}`, status: "DONE", by: "홍길동" }, t("02:00")).state;
    expect(workOf(d.model, `sb:${SID}`)).toMatchObject({ status: "DONE", by: "홍길동" });
    expect(buildRtm(d.model).rows.flatMap((r) => r.tasks).find((x) => x.screens.includes(SID))!.status).not.toBe("IN_DESIGN");
  });

  it("완료 뒤 근거가 바뀌면 재검토 필요 — 요구사항 기능 명세 변경, 디자인 시스템 개정", () => {
    let s = execute(base, { op: "work.set", key: `sb:${SID}`, status: "DONE" }, t("02:00")).state;
    const reqId = base.model.requirements.find((r) => r.tasks.some((x) => base.model.ia.nodes.find((n) => n.id === SID)!.taskIds.includes(x.id)))!.id;
    s = execute(s, { op: "req.spec", id: reqId, spec: "새 규칙" }, t("03:00")).state;
    expect(workOf(s.model, `sb:${SID}`)).toMatchObject({ status: "NEEDS_REVIEW", reason: expect.stringContaining(reqId) });
    // 다시 검토하고 완료
    s = execute(s, { op: "work.set", key: `sb:${SID}`, status: "DONE" }, t("04:00")).state;
    expect(workOf(s.model, `sb:${SID}`).status).toBe("DONE");
    // 디자인 개정
    s = execute(s, { op: "gen.apply", kind: "ds", target: "CVL", output: { layout: { button: "pill" } }, scope: "global" }, t("05:00")).state;
    expect(workOf(s.model, `sb:${SID}`)).toMatchObject({ status: "NEEDS_REVIEW", reason: expect.stringMatching(/디자인 시스템이 r\d+ → r\d+/) });
    // 직접 재검토 필요 표시
    s = execute(s, { op: "work.set", key: "ia:CVL", status: "NEEDS_REVIEW", note: "메뉴 재정리" }, t("06:00")).state;
    expect(workOf(s.model, "ia:CVL")).toMatchObject({ status: "NEEDS_REVIEW", note: "메뉴 재정리" });
  });

  it("산출물이 없으면 미진행이고 상태를 바꿀 수 없다, 시스템별 요약", () => {
    expect(workOf(base.model, "sb:NOPE").status).toBe("NOT_STARTED");
    expect(() => execute(base, { op: "work.set", key: "sb:NOPE", status: "DONE" }, t("01:00"))).toThrow(/미진행/);
    expect(() => execute(base, { op: "work.set", key: `sb:${SID}`, status: "WHATEVER" }, t("01:00"))).toThrow(/상태는/);
    const sw = systemWork(base.model);
    const cvl = sw.find((x) => x.code === "CVL")!;
    expect(cvl.designDone).toBe(cvl.screens.every((x) => x.status === "DONE"));
    expect(cvl.counts.DONE + cvl.counts.NOT_STARTED + cvl.counts.IN_PROGRESS + cvl.counts.NEEDS_REVIEW).toBe(cvl.screens.length);
  });

  it("설명 번호 위치를 저장하고, AI로 다시 만들어도 같은 항목이면 유지한다", () => {
    let s = execute(base, { op: "gen.apply", kind: "sb", target: SID, output: sbOut }, t("01:00")).state;
    s = execute(s, { op: "sb.marker", screenId: SID, no: 1, pos: { x: 300.4, y: 520 } }, t("01:10")).state;
    expect(s.model.storyboard.screens.find((x) => x.screenId === SID)!.components[0]!.marker).toEqual({ x: 300, y: 520 });
    s = execute(s, { op: "gen.apply", kind: "sb", target: SID, output: sbOut }, t("01:20")).state;
    expect(s.model.storyboard.screens.find((x) => x.screenId === SID)!.components[0]!.marker).toEqual({ x: 300, y: 520 });
    s = execute(s, { op: "sb.marker", screenId: SID, no: 1, pos: null }, t("01:30")).state;
    expect(s.model.storyboard.screens.find((x) => x.screenId === SID)!.components[0]!.marker).toBeUndefined();
    expect(() => execute(s, { op: "sb.marker", screenId: SID, no: 9, pos: { x: 1, y: 1 } }, t("01:40"))).toThrow(/9번/);
  });
});
