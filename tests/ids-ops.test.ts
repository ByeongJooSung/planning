import { describe, expect, it } from "vitest";
import { formatPopupId, formatScreenId, isScreenIdAvailable } from "../src/model/screen-id.js";
import { validateModel } from "../src/model/validate.js";
import { addRequirement, addTask, excludeRequirement, removeTask } from "../src/project/ops.js";
import { SYSTEM_PRESETS } from "../src/project/presets.js";
import { emptyModel } from "../src/project/store.js";
import { Project } from "../src/model/schema.js";

const now = "2026-09-25T00:00:00.000Z";
const model = (idMode: "GENERATED" | "ORIGINAL" = "GENERATED") => {
  const m = emptyModel(Project.parse({ code: "TT", name: "t", serviceType: "NEW", requirementIdMode: idMode, createdAt: now, updatedAt: now }));
  m.systems = structuredClone(SYSTEM_PRESETS["public-civil"]);
  return m;
};

describe("ID", () => {
  it("요구사항·Task ID를 순서대로 부여하고 삭제된 번호를 재사용하지 않는다", () => {
    const m = model();
    expect(addRequirement(m, { title: "a" }).id).toBe("REQ-001");
    const r2 = addRequirement(m, { title: "b" });
    r2.status = "DELETED";
    expect(addRequirement(m, { title: "c" }).id).toBe("REQ-003");
    expect(addTask(m, "REQ-001", { systemCode: "CVL", action: "x" }).id).toBe("REQ-001-T01");
    const t2 = addTask(m, "REQ-001", { systemCode: "ADM", action: "y", after: ["T01"] });
    expect(t2.id).toBe("REQ-001-T02");
    expect(t2.after).toEqual(["REQ-001-T01"]);
  });

  it("ORIGINAL 모드는 RFP 원본 ID를 그대로 쓰고, 원본 ID가 없으면 거부한다", () => {
    const m = model("ORIGINAL");
    expect(() => addRequirement(m, { title: "a" })).toThrow("원본 ID");
    expect(addRequirement(m, { title: "a", originalId: "SFR-001" }).id).toBe("SFR-001");
    expect(addTask(m, "SFR-001", { systemCode: "PUB", action: "x" }).id).toBe("SFR-001-T01");
  });

  it("화면 ID 규칙으로 화면·팝업 ID를 만든다", () => {
    const m = model();
    const cvl = m.systems.find((s) => s.code === "CVL")!;
    expect(formatScreenId(m.project, { system: cvl, depthCodes: ["inf", "reg"], index: 0 })).toBe("CVL_INF_REG_010");
    expect(formatScreenId(m.project, { system: cvl, depthCodes: ["inf"], index: 1 })).toBe("CVL_INF_020");
    expect(formatPopupId(m.project, "CVL_INF_REG_010", 0)).toBe("CVL_INF_REG_010_P01");
    expect(isScreenIdAvailable("A", ["B"], ["A"])).toBe(false);
  });
});

describe("변경 연산", () => {
  it("등록되지 않은 시스템에는 Task를 만들 수 없다", () => {
    const m = model();
    addRequirement(m, { title: "a" });
    expect(() => addTask(m, "REQ-001", { systemCode: "ZZZ", action: "x" })).toThrow("등록되지 않은 시스템");
  });

  it("다른 Task가 선행으로 쓰는 Task는 삭제할 수 없다", () => {
    const m = model();
    addRequirement(m, { title: "a" });
    addTask(m, "REQ-001", { systemCode: "CVL", action: "x" });
    addTask(m, "REQ-001", { systemCode: "ADM", action: "y", after: ["T01"] });
    expect(() => removeTask(m, "REQ-001-T01")).toThrow("선행");
    removeTask(m, "REQ-001-T02");
    removeTask(m, "REQ-001-T01");
    expect(m.requirements[0]!.tasks).toHaveLength(0);
  });

  it("요구사항·Task 변경을 RTM 이력에 남긴다", () => {
    const m = model();
    addRequirement(m, { title: "a" }, { crId: "CR-001" });
    addTask(m, "REQ-001", { systemCode: "CVL", action: "x" });
    excludeRequirement(m, "REQ-001", "범위 제외");
    expect(m.rtmRecords.history.map((h) => h.kind)).toEqual(["ADDED", "TASKS_CHANGED", "EXCLUDED"]);
    expect(m.rtmRecords.history[0]!.crId).toBe("CR-001");
    expect(() => excludeRequirement(m, "REQ-001", " ")).toThrow("사유");
  });
});

describe("무결성 검사", () => {
  it("Task 선후행 순환과 상태값 세트에 없는 값을 찾는다", () => {
    const m = model();
    m.policies.stateSets.push({ id: "ST", name: "s", values: ["신청", "승인"] });
    addRequirement(m, { title: "a" });
    addTask(m, "REQ-001", { systemCode: "CVL", action: "x", transition: { stateSetId: "ST", to: "공개" } });
    addTask(m, "REQ-001", { systemCode: "ADM", action: "y", after: ["T01"] });
    m.requirements[0]!.tasks[0]!.after = ["REQ-001-T02"];
    const codes = validateModel(m).map((i) => i.code);
    expect(codes).toContain("TASK_CYCLE");
    expect(codes).toContain("UNKNOWN_STATE");
  });
});
