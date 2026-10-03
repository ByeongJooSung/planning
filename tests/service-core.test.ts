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

  it("기능 명세 저장·지우기 — 생성 프롬프트의 명세로 쓰인다", () => {
    let s = execute(base(), { op: "req.add", input: { title: "정보공개", description: "민원인이 신청하면 심사자가 승인하고 공개한다" }, autoTasks: true }, now).state;
    s = execute(s, { op: "req.spec", id: "REQ-001", spec: "  입력: 제목(필수, 100자)\r\n승인 시 공개  " }, now).state;
    expect(s.model.requirements[0]!.spec).toBe("입력: 제목(필수, 100자)\n승인 시 공개");
    const flow = deriveProject(s, now).gens["flow:REQ-001"]!;
    expect(flow.specs![0]!.saved).toBe("입력: 제목(필수, 100자)\n승인 시 공개");
    s = execute(s, { op: "req.spec", id: "REQ-001", spec: "" }, now).state;
    expect(s.model.requirements[0]!.spec).toBeUndefined();
    expect(() => execute(s, { op: "req.spec", id: "REQ-999", spec: "x" }, now)).toThrow(/찾을 수 없습니다/);
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

  it("디자인 시스템을 고르지 않았어도 화면설계서 반영 시 기본 컨셉으로 정하고 와이어프레임을 저장한다", () => {
    let r = execute(base(), { op: "screen.add", systemCode: "PUB", name: "공지 목록" }, now);
    const id = r.state.model.ia.nodes.find((n) => n.name === "공지 목록")!.id;
    expect(deriveProject(r.state, now).provisionalDesigns.PUB).toBeTruthy();
    const output = { components: [{ no: 1, label: "검색", kind: "search-bar", ui: { type: "search-bar" } }] };
    r = execute(r.state, { op: "gen.apply", kind: "sb", target: id, output }, now);
    expect(r.state.model.design.systems.find((d) => d.systemCode === "PUB")!.status).toBe("SELECTED");
    expect(r.message).toMatch(/기본 컨셉/);
    expect(deriveProject(r.state, now).provisionalDesigns.PUB).toBeUndefined();
    // 디자인 시스템에 없는 컴포넌트 이름은 가까운 컴포넌트로 바꾸고, 못 찾으면 그 항목만 글로 남긴다
    const odd = { components: [{ no: 1, label: "목록", kind: "list", ui: { component: "Table" } }, { no: 2, label: "입력", component: "text_field" }, { no: 3, label: "?", kind: "zzz", ui: "mystery-widget" }] };
    r = execute(r.state, { op: "gen.apply", kind: "sb", target: id, output: odd }, now);
    const comps = r.state.model.storyboard.screens.find((x) => x.screenId === id)!.components;
    expect(comps.map((c) => c.ui?.component)).toEqual(["data-table", "text-input", undefined]);
    // 그래프 요청: graph·차트 같은 이름은 chart 컴포넌트로 — 예전에 고른 디자인 시스템에도 카탈로그의 새 기본 컴포넌트가 채워진다
    const ds = r.state.model.design.systems.find((d) => d.systemCode === "PUB")!;
    ds.components = ds.components.filter((c) => c.id !== "chart");
    const graph = { components: [{ no: 1, label: "월별 처리 건수", kind: "graph", ui: { component: "graph", props: { type: "bar", labels: ["1월", "2월"], series: [{ name: "접수", values: [3, 5] }] } } }, { no: 2, label: "비율", kind: "chart", ui: { component: "원그래프" } }] };
    r = execute(r.state, { op: "gen.apply", kind: "sb", target: id, output: graph }, now);
    expect(r.state.model.storyboard.screens.find((x) => x.screenId === id)!.components.map((c) => c.ui?.component)).toEqual(["chart", "chart"]);
    expect(r.state.model.design.systems.find((d) => d.systemCode === "PUB")!.components.some((c) => c.id === "chart")).toBe(true);
  });

  it("화면설계서 항목은 이 화면에서만 쓰는 프레임 모양(ui.tree)을 가질 수 있고, 복제·AI 재생성에도 유지된다", () => {
    let r = execute(base(), { op: "screen.add", systemCode: "PUB", name: "공지 목록" }, now);
    const id = r.state.model.ia.nodes.find((n) => n.name === "공지 목록")!.id;
    r = execute(r.state, { op: "gen.apply", kind: "sb", target: id, output: { components: [{ no: 1, label: "목록", kind: "data-table", ui: { component: "data-table", props: {} } }] } }, now);
    const tree = { id: "root", type: "frame", w: "fill", h: "hug", layout: { mode: "column", gap: 8, pad: [8, 8, 8, 8], align: "start", justify: "start", wrap: false }, children: [{ id: "t1", type: "text", text: "직접 그린 표" }] };
    r = execute(r.state, { op: "sb.component", screenId: id, no: 1, input: { label: "목록", kind: "data-table", planner: "", customer: "", ui: { component: "data-table", props: {}, tree } } }, now);
    const sbOf = (st: typeof r.state) => st.model.storyboard.screens.find((x) => x.screenId === id)!;
    expect(sbOf(r.state).components[0]!.ui!.tree).toMatchObject({ id: "root", children: [{ text: "직접 그린 표" }] });
    // 새로 그린 항목: 디자인 시스템에 없는 component("frame")여도 모양이 있으면 통과
    r = execute(r.state, { op: "sb.component", screenId: id, input: { label: "안내 박스", kind: "frame", planner: "", customer: "", ui: { component: "frame", props: {}, tree } } }, now);
    expect(sbOf(r.state).components.map((c) => c.ui?.component)).toEqual(["data-table", "frame"]);
    expect(() => execute(r.state, { op: "sb.component", screenId: id, no: 2, input: { label: "안내 박스", kind: "frame", planner: "", customer: "", ui: { component: "frame", props: {} } } }, now)).toThrow(/디자인 시스템에 없습니다|UNKNOWN_COMPONENT|frame/);
    // 복제: 바로 뒤에 들어가고 번호가 다시 매겨진다
    r = execute(r.state, { op: "sb.dup", screenId: id, no: 1 }, now);
    expect(sbOf(r.state).components.map((c) => `${c.no}:${c.label}`)).toEqual(["1:목록", "2:목록 복사", "3:안내 박스"]);
    expect(sbOf(r.state).components[1]!.ui!.tree).toBeTruthy();
    // AI가 같은 항목을 다시 만들어도 직접 그린 모양은 남는다
    r = execute(r.state, { op: "gen.apply", kind: "sb", target: id, output: { components: [{ no: 1, label: "목록", kind: "data-table", planner: "최신순", ui: { component: "data-table", props: { columns: ["번호"] } } }] } }, now);
    expect(sbOf(r.state).components[0]).toMatchObject({ planner: "최신순", ui: { component: "data-table", tree: { id: "root" } } });
  });

  it("디자인 시스템 단계별 컨셉: 톤앤매너·CSS와 UI·UX를 따로 쓰고, 다른 제안 컨셉에서 한 단계만 가져온다", () => {
    let s = execute(base(), { op: "design.select", systemCode: "PUB", conceptId: "A" }, now).state;
    const d0 = s.model.design.systems.find((x) => x.systemCode === "PUB")!;
    expect(d0.brief.style).toMatchObject({ from: "A" });
    expect(d0.brief.ux).toMatchObject({ from: "A" });
    const rev0 = d0.revision;
    // 톤앤매너: 컨셉 글 + 토큰 + CSS를 한 번에
    s = execute(s, { op: "design.stage", systemCode: "PUB", stage: "style", brief: { name: "차분한 신뢰", summary: "남색 중심, 여백 넓게", keywords: "신뢰, 차분", rules: "강조색은 한 화면에 한 번\n표 머리글은 연한 배경" }, tokens: { color: { primary: "#1F3A93" } }, css: ".wf-btn{letter-spacing:-.01em} @import url(http://x); .a{background:url(http://evil/x.png)} </style><script>" }, now).state;
    const d1 = s.model.design.systems.find((x) => x.systemCode === "PUB")!;
    expect(d1.brief.style).toMatchObject({ name: "차분한 신뢰", keywords: ["신뢰", "차분"], rules: ["강조색은 한 화면에 한 번", "표 머리글은 연한 배경"] });
    expect(d1.tokens!.color.primary).toBe("#1F3A93");
    expect(d1.css).toContain(".wf-btn{letter-spacing:-.01em}");
    expect(d1.css).not.toMatch(/@import|evil|<\/?style|<script/);
    expect(d1.revision).toBeGreaterThan(rev0);
    // 단계를 넘는 값은 막는다
    expect(() => execute(s, { op: "design.stage", systemCode: "PUB", stage: "ux", tokens: { color: { primary: "#000000" } } }, now)).toThrow(/톤앤매너 단계/);
    expect(() => execute(s, { op: "design.stage", systemCode: "PUB", stage: "style", layout: { list: "card" } }, now)).toThrow(/UI·UX 단계/);
    expect(() => execute(s, { op: "design.stage", systemCode: "PUB", stage: "style", brief: { name: "차분한 신뢰" } }, now)).toThrow(/바뀐 내용이 없습니다/);
    // UI·UX: 레이아웃 규칙 + 원칙
    s = execute(s, { op: "design.stage", systemCode: "PUB", stage: "ux", brief: { rules: ["목록 위에 검색 조건"] }, layout: { list: "card" } }, now).state;
    expect(s.model.design.systems.find((x) => x.systemCode === "PUB")!.layout!.list).toBe("card");
    // 컨셉 B의 UI·UX만 가져오면 톤은 그대로
    const before = s.model.design.systems.find((x) => x.systemCode === "PUB")!;
    const B = before.proposals.find((x) => x.id === "B")!;
    s = execute(s, { op: "design.mix", systemCode: "PUB", stage: "ux", conceptId: "B" }, now).state;
    const d2 = s.model.design.systems.find((x) => x.systemCode === "PUB")!;
    expect(d2.layout).toEqual(B.layout);
    expect(d2.tokens!.color.primary).toBe("#1F3A93");
    expect(d2.brief.ux).toMatchObject({ from: "B", rules: ["목록 위에 검색 조건"], name: `B. ${B.name}` });
    // 직접 쓴 이름은 다른 컨셉 톤을 가져와도 지킨다
    s = execute(s, { op: "design.mix", systemCode: "PUB", stage: "style", conceptId: "C" }, now).state;
    expect(s.model.design.systems.find((x) => x.systemCode === "PUB")!.brief.style).toMatchObject({ name: "차분한 신뢰", from: "C" });
    // 컴포넌트 초안: draft 표시 → 편집기에서 저장하면 지워진다
    const tree = { id: "root", type: "frame", children: [{ id: "t1", type: "text", text: "확인" }] };
    s = execute(s, { op: "design.frame.import", systemCode: "PUB", items: [{ id: "button", name: "버튼", tree }], draft: "render" }, now).state;
    expect(s.model.design.systems.find((x) => x.systemCode === "PUB")!.components.find((x) => x.id === "button")).toMatchObject({ draft: "render" });
    s = execute(s, { op: "design.frame", systemCode: "PUB", component: { id: "button", tree } }, now).state;
    expect(s.model.design.systems.find((x) => x.systemCode === "PUB")!.components.find((x) => x.id === "button")!.draft).toBeUndefined();
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

  it("디자인 미세조정: AI가 돌려준 \"30px\"·\"#fff\" 같은 값도 반영한다", () => {
    let s = execute(base(), { op: "design.select", systemCode: "PUB", conceptId: "A" }, now).state;
    s = execute(s, { op: "gen.apply", kind: "ds", target: "PUB", output: { tokens: { font: { scale: { display: "30px", h1: "28" } }, color: { primary: "#0af" } }, componentStyles: { "data-table": { "--w-th-bg": "#123", "--w-row": 40 } } } }, now).state;
    const d = s.model.design.systems.find((x) => x.systemCode === "PUB")!;
    expect(d.tokens!.font.scale.display).toBe(30);
    expect(d.tokens!.font.scale.h1).toBe(28);
    expect(d.tokens!.color.primary).toBe("#00AAFF");
    expect(d.componentStyles["data-table"]).toEqual({ "--w-th-bg": "#112233", "--w-row": "40px" });
    expect(d.revision).toBe(2);
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
