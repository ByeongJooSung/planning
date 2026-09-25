import { describe, expect, it } from "vitest";
import { buildShopMy } from "../scripts/build-examples.js";
import { loadModel } from "../src/project/store.js";
import { buildRtm } from "../src/trace/rtm.js";
import { diffModels, isEmptyDiff, renderDiffMarkdown } from "../src/version/diff.js";
import { bumpVersion, listSnapshots, loadSnapshot, takeSnapshot } from "../src/version/snapshot.js";
import { tempRoot } from "./helpers.js";

describe("스냅샷·Diff — 기존 서비스 수정 샘플", () => {
  it("스냅샷 후 버전이 오르고, CR 반영 내용을 Diff로 보여 준다", async () => {
    const dir = await buildShopMy(await tempRoot());
    const current = await loadModel(dir);
    expect(current.project.version).toBe("0.2");
    expect((await listSnapshots(dir)).map((s) => s.version)).toEqual(["0.1"]);

    const base = await loadSnapshot(dir, "v0.1");
    const d = diffModels(base, current);
    expect(d.requirements!.added).toEqual(["REQ-003"]);
    expect(d.tasks!.added).toEqual(["REQ-003-T01"]);
    expect(d.changeRequests!.added).toEqual(["CR-001"]);
    expect(d.iaNodes!.changed[0]).toMatchObject({ id: "USR_MY_ORD_010", fields: [{ path: "taskIds" }] });
    expect(d.project).toBeUndefined(); // 버전 번호·수정 시각은 비교하지 않는다
    expect(renderDiffMarkdown(d, "t")).toContain("- 추가 `REQ-003`");
    expect(isEmptyDiff(diffModels(current, current))).toBe(true);
  });

  it("MODIFY 프로젝트: S2는 패스지만 영향 화면은 추적되고, KEPT 화면은 근거 없음으로 보지 않는다", async () => {
    const m = await loadModel(await buildShopMy(await tempRoot()));
    const rtm = buildRtm(m);
    expect(m.project.stages.S2).toBe("SKIPPED");
    expect(rtm.orphans).toEqual([]);
    expect(rtm.rows.find((r) => r.requirementId === "REQ-003")!.crIds).toEqual(["CR-001"]);
    expect(rtm.rows.find((r) => r.requirementId === "REQ-001")!.tasks[0]!.status).toBe("DESIGNED");
    // CR로 추가된 REQ-003은 아직 기획안에 없음(S1). 관리자 화면은 스토리보드 미작성(S4). S3는 미시작이라 검사 안 함.
    expect(rtm.gaps.map((g) => `${g.stage}:${g.ref}`)).toEqual(["S1:REQ-003-T01", "S4:REQ-002-T01"]);
  });

  it("같은 버전 스냅샷을 두 번 찍을 수 없고, 주 버전을 올릴 수 있다", async () => {
    const dir = await buildShopMy(await tempRoot());
    const m = await loadModel(dir);
    const meta = await takeSnapshot(dir, m, { major: true });
    expect(meta.version).toBe("0.2");
    expect(m.project.version).toBe("1.0");
    m.project.version = "0.2";
    await expect(takeSnapshot(dir, m)).rejects.toThrow("이미 있는");
    expect(bumpVersion("1.9")).toBe("1.10");
  });
});
