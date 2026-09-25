import { describe, expect, it } from "vitest";
import { deriveProject, execute, newProjectState } from "../src/service/core.js";

const now = new Date("2026-09-25T09:00:00Z");

describe("서비스 코어", () => {
  const base = () => newProjectState({ code: "SVC", name: "서비스", serviceType: "NEW", preset: "public-civil" }, now);

  it("명령은 사본에 적용되고, 실패하면 원래 상태를 건드리지 않는다", () => {
    const s0 = base();
    const r = execute(s0, { op: "req.add", input: { title: "정보공개", description: "민원인이 신청하면 심사자가 승인하고 공개한다" }, autoTasks: true }, now);
    expect(r.state.model.requirements).toHaveLength(1);
    expect(r.state.model.requirements[0]!.tasks.length).toBeGreaterThan(1);
    expect(s0.model.requirements).toHaveLength(0);
    expect(() => execute(r.state, { op: "task.add", requirementId: "REQ-001", input: { systemCode: "NOPE", action: "x" } }, now)).toThrow(/등록되지 않은 시스템/);
  });

  it("스냅샷은 버전을 올리고 Diff 기준이 된다", () => {
    let s = execute(base(), { op: "snapshot", note: "기준선" }, now).state;
    expect(s.model.project.version).toBe("0.2");
    s = execute(s, { op: "link.add", link: { label: "현행", url: "https://example.go.kr" } }, now).state;
    const v = deriveProject(s, now);
    expect(v.snapshots.map((x) => x.version)).toEqual(["0.1"]);
    expect(v.diff?.from).toBe("0.1");
    expect(Object.keys(v.diff!.entries)).toContain("project");
  });

  it("디자인 미세조정 적용 후 되돌리기", () => {
    let s = execute(base(), { op: "design.select", systemCode: "PUB", conceptId: "A" }, now).state;
    const before = structuredClone(s.model.design.systems.find((d) => d.systemCode === "PUB")!);
    s = execute(s, { op: "gen.apply", kind: "ds", target: "PUB", output: { tokens: { color: { primary: "#0B3D91" } } }, scope: "colors" }, now).state;
    const applied = s.model.design.systems.find((d) => d.systemCode === "PUB")!;
    expect(applied.tokens!.color.primary).toBe("#0B3D91");
    expect(applied.revision).toBe(2);
    s = execute(s, { op: "design.revert", systemCode: "PUB", design: before }, now).state;
    const reverted = s.model.design.systems.find((d) => d.systemCode === "PUB")!;
    expect(reverted.tokens!.color.primary).toBe(before.tokens!.color.primary);
    expect(reverted.revision).toBe(3);
    expect(reverted.history.at(-1)!.note).toBe("되돌리기");
  });

  it("참조자료: 문단을 조각으로 색인하고 같은 파일은 한 번만", () => {
    const seg = [{ locator: "문단 1", text: "정보공개 청구는 10일 안에 결정한다." }];
    let r = execute(base(), { op: "kb.add", fileName: "회의록.txt", sha256: "abc", segments: seg }, now);
    expect(r.state.chunks).toHaveLength(1);
    r = execute(r.state, { op: "kb.add", fileName: "회의록 사본.txt", sha256: "abc", segments: seg }, now);
    expect(r.message).toMatch(/이미 올린 자료/);
    r = execute(r.state, { op: "kb.rm", sourceId: "SRC-001" }, now);
    expect(r.state.chunks).toHaveLength(0);
  });
});
