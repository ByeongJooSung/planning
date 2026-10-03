import { describe, expect, it } from "vitest";
import { covMatch, screenReqLines, specLines } from "../src/ai/coverage.js";
import { normalizeStoryboardOutput } from "../src/ai/apply.js";
import { execute, newProjectState } from "../src/service/core.js";

const now = new Date("2026-10-03T01:00:00Z");

describe("기능 요구사항 충족 점검", () => {
  it("명세 글을 요구 줄로 나누고(머리말·짧은 줄 제외), 항목 글자와 겹치면 반영으로 본다", () => {
    const lines = specLines("[SRC-001 제안요청서 · SFR-002]\n- 제목은 필수, 100자 이내\n1) 첨부파일은 PDF·HWP만, 20MB 이하\n## 머리말\n짧음\n공개 구분(전체·부분)을 선택한다");
    expect(lines).toEqual(["제목은 필수, 100자 이내", "첨부파일은 PDF·HWP만, 20MB 이하", "공개 구분(전체·부분)을 선택한다"]);
    const comps = [
      { no: 1, label: "제목", planner: "필수 · 최대 100자", customer: "자료 제목을 입력한다", validation: { messages: [{ text: "제목을 입력해 주세요." }] } },
      { no: 2, label: "첨부파일", planner: "PDF·HWP, 20MB", customer: "" },
      { no: 3, label: "하단 버튼", planner: "", customer: "임시저장·공개 신청" },
    ];
    expect(covMatch(lines[0]!, comps)).toEqual([1]);
    expect(covMatch(lines[1]!, comps)).toEqual([2]);
    expect(covMatch(lines[2]!, comps)).toEqual([]);
  });

  it("화면의 요구 줄은 연결 Task의 요구사항 명세와 Task 문장으로 만들고, AI coverage는 정리되어 저장되며 직접 지정은 유지된다", () => {
    let s = execute(newProjectState({ code: "SVC", name: "서비스", serviceType: "NEW", preset: "public-civil" }, now), { op: "req.add", input: { title: "정보공개", description: "민원인이 신청하면 심사자가 승인하고 공개한다" }, autoTasks: true }, now).state;
    s = execute(s, { op: "req.spec", id: "REQ-001", spec: "- 제목은 필수, 100자 이내\n- 첨부파일은 PDF만" }, now).state;
    const task = s.model.requirements[0]!.tasks.find((t) => t.systemCode === "PUB") ?? s.model.requirements[0]!.tasks[0]!;
    s = execute(s, { op: "screen.add", systemCode: task.systemCode, name: "자료 등록", taskIds: [task.id] }, now).state;
    const sid = s.model.ia.nodes.find((n) => n.name === "자료 등록")!.id;
    const lines = screenReqLines(s.model, {}, sid);
    expect(lines.map((l) => l.source)).toEqual(["spec", "spec", "task"]);
    expect(lines[0]!.text).toBe("제목은 필수, 100자 이내");
    // AI 결과의 coverage: 글자 번호·requirement 키·없는 번호 정리
    const norm = normalizeStoryboardOutput({ components: [{ no: 1, label: "제목", kind: "text-input", ui: { component: "text-input" } }, { no: 2, label: "첨부", kind: "file-upload", ui: { component: "file-upload" } }], coverage: [{ requirement: "제목은 필수, 100자 이내", items: ["1", 9] }, { req: "첨부파일은 PDF만", by: 2, reason: "" }, { req: "", by: [1] }] }) as { coverage: unknown[] };
    expect(norm.coverage).toEqual([{ req: "제목은 필수, 100자 이내", by: [1] }, { req: "첨부파일은 PDF만", by: [2] }]);
    s = execute(s, { op: "gen.apply", kind: "sb", target: sid, output: { components: [{ no: 1, label: "제목", kind: "text-input", ui: { component: "text-input" } }, { no: 2, label: "첨부", kind: "file-upload", ui: { component: "file-upload" } }], coverage: [{ req: "제목은 필수, 100자 이내", by: [1] }] } }, now).state;
    const sbOf = () => s.model.storyboard.screens.find((x) => x.screenId === sid)!;
    expect(sbOf().coverage).toEqual([{ req: "제목은 필수, 100자 이내", by: [1] }]);
    // 직접 지정 → 다시 생성해도 남는다, 해제도 된다
    s = execute(s, { op: "sb.coverage", screenId: sid, req: lines[2]!.text, by: [2], note: "" }, now).state;
    s = execute(s, { op: "gen.apply", kind: "sb", target: sid, output: { components: [{ no: 1, label: "제목", kind: "text-input", ui: { component: "text-input" } }, { no: 2, label: "첨부", kind: "file-upload", ui: { component: "file-upload" } }] } }, now).state;
    expect(sbOf().coverage).toEqual([{ req: lines[2]!.text, by: [2], manual: true }]);
    s = execute(s, { op: "sb.coverage", screenId: sid, req: lines[2]!.text, by: null }, now).state;
    expect(sbOf().coverage).toBeUndefined();
    expect(() => execute(s, { op: "sb.coverage", screenId: sid, req: " ", by: [1] }, now)).toThrow(/비어/);
  });
});
