import { describe, expect, it } from "vitest";
import "../src/render/viewer/assets/flowlayout.js";
import "../src/render/viewer/assets/flowexport.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const FL = (globalThis as any).FlowLayout;
const FX = (globalThis as any).FlowExport;

type N = { id: string; shape: string; label: string; lane: string; taskIds: string[]; screenId?: string; x?: number; y?: number };
const N = (id: string, shape: string, label: string, lane: string, extra: Partial<N> = {}): N => ({ id, shape, label, lane, taskIds: [], ...extra });
const colors: Record<string, string> = { CVL: "#1E7B4B", ADM: "#C2570C", PUB: "#1F5FBF", EXT: "#6B4FA0" };

const big = () => ({
  id: "PF-BIG",
  kind: "PROCESS",
  title: "복잡한 예",
  lanes: [
    { id: "L1", label: "민원포털 · 민원인", systemCode: "CVL" },
    { id: "L2", label: "심사자 시스템 · 심사자·관리자", systemCode: "ADM" },
    { id: "L3", label: "대국민 포털", systemCode: "PUB" },
    { id: "L4", label: "국가 정보공개 포털 (외부 연계)", systemCode: "EXT" },
  ],
  nodes: [
    N("s", "TERMINATOR", "시작", "L1"),
    N("a", "PROCESS", "로그인", "L1", { screenId: "CVL_MEM_LOGIN_010", taskIds: ["REQ-001-T01"] }),
    N("b", "PROCESS", "정보공개 자료를 등록하고 공개 구분(전체·부분)을 선택한 뒤 첨부파일을 올린다", "L1", { screenId: "CVL_INF_REG_010" }),
    N("c", "DECISION", "필수 항목·첨부 형식이 올바른가?", "L1"),
    N("d", "PROCESS", "입력 오류 안내", "L1"),
    N("e", "DOCUMENT", "공개 신청서", "L2"),
    N("f", "PROCESS", "신청 목록에서 건 선택", "L2", { screenId: "ADM_INF_LST_010" }),
    N("g", "DECISION", "개인정보 포함 여부 및 공개 가능 여부 판단", "L2"),
    N("h", "PROCESS", "반려 사유 입력", "L2"),
    N("i", "IO", "문자·이메일 알림 발송", "L2"),
    N("j", "PROCESS", "승인 처리", "L2"),
    N("k", "SCREEN", "대국민 포털에 공개", "L3", { screenId: "PUB_INF_LST_010" }),
    N("l", "IO", "국가 정보공개 포털 전송", "L4"),
    N("m", "CONNECTOR", "→ 통계 시스템", "L4"),
    N("z", "TERMINATOR", "종료", "L3"),
  ],
  edges: [
    { from: "s", to: "a" }, { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d", label: "아니오" }, { from: "d", to: "b", label: "다시 입력" },
    { from: "c", to: "e", label: "예" }, { from: "e", to: "f" }, { from: "f", to: "g" }, { from: "g", to: "h", label: "반려" }, { from: "h", to: "i" },
    { from: "i", to: "b", label: "보완 후 재신청" }, { from: "g", to: "j", label: "승인" }, { from: "j", to: "k" }, { from: "j", to: "l" }, { from: "k", to: "z" }, { from: "l", to: "m" }, { from: "l", to: "z" },
  ],
});

const overlap = (a: any, b: any) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const onBorder = (p: any, n: any) => p[0] >= n.l - 1 && p[0] <= n.r + 1 && p[1] >= n.t - 1 && p[1] <= n.b + 1;

describe("플로우차트 배치", () => {
  it("도형 크기는 글자 수에 따라 가로·세로가 함께 커지고, 격자(10px)에 맞는다", () => {
    const small = FL.nodeSize({ shape: "PROCESS", label: "등록" });
    const mid = FL.nodeSize({ shape: "PROCESS", label: "자료를 등록하고 공개를 신청한다" });
    const long = FL.nodeSize({ shape: "PROCESS", label: "정보공개 자료를 등록하고 공개 구분(전체·부분)을 선택한 뒤 첨부파일을 올리고 신청서를 제출한다" });
    expect(small.w).toBeLessThan(mid.w);
    expect(long.lines.length).toBeGreaterThan(mid.lines.length);
    expect(long.h).toBeGreaterThan(mid.h); // 줄이 늘면 높이가 커진다
    expect(long.lines.length).toBeGreaterThan(2);
    for (const s of [small, mid, long]) {
      expect(s.w % 10).toBe(0);
      expect(s.h % 10).toBe(0);
      s.lines.forEach((l: string) => expect(FL.measure(l, 13, false)).toBeLessThanOrEqual(200 + 1));
    }
    const dec = FL.nodeSize({ shape: "DECISION", label: "자료를 등록하고 공개를 신청한다" });
    expect(dec.w * dec.h).toBeGreaterThan(mid.w * mid.h); // 마름모는 같은 글자에 더 큰 면적이 필요하다
    expect(dec.h).toBeGreaterThan(mid.h);
    // 줄바꿈(\n)을 지키고, 공백 없는 긴 글자는 글자 단위로 끊는다
    expect(FL.wrap("가\n나", 200, 13, false)).toEqual(["가", "나"]);
    const nb = FL.wrap("가".repeat(40), 100, 13, false);
    expect(nb.length).toBeGreaterThan(3);
    nb.forEach((l: string) => expect(FL.measure(l, 13, false)).toBeLessThanOrEqual(101));
    // 화면 ID가 길면 도형이 넓어진다
    expect(FL.nodeSize({ shape: "PROCESS", label: "로그인", screenId: "CVL_MEM_LOGIN_010_VERY_LONG_ID" }).w).toBeGreaterThan(FL.nodeSize({ shape: "PROCESS", label: "로그인" }).w);
  });

  it("노드는 겹치지 않고 자기 레인 안에 있으며, 연결선은 직각이고 노드 가장자리에서 시작·끝난다", () => {
    const f = big();
    const L = FL.layout(f, { color: (c: string) => colors[c] });
    const ns: any[] = L.order.map((id: string) => L.nodes[id]);
    for (let i = 0; i < ns.length; i++)
      for (let j = i + 1; j < ns.length; j++) expect(overlap(ns[i], ns[j]), `${ns[i]!.id} × ${ns[j]!.id}`).toBe(false);
    ns.forEach((n: any) => {
      const lane = L.lanes[n.lane];
      expect(n.cy).toBeGreaterThanOrEqual(lane.top);
      expect(n.cy).toBeLessThanOrEqual(lane.top + lane.h);
      expect(n.l).toBeGreaterThanOrEqual(L.LW);
      expect(n.r).toBeLessThanOrEqual(L.W);
    });
    expect(L.edges).toHaveLength(f.edges.length);
    L.edges.forEach((e: any) => {
      const a = L.nodes[e.from], b = L.nodes[e.to];
      expect(onBorder(e.pts[0], a), `${e.from}>${e.to} 시작`).toBe(true);
      expect(onBorder(e.pts.at(-1), b), `${e.from}>${e.to} 끝`).toBe(true);
      for (let i = 0; i + 1 < e.pts.length; i++) {
        const p = e.pts[i], q = e.pts[i + 1];
        expect(p[0] === q[0] || p[1] === q[1], `${e.from}>${e.to} 직각`).toBe(true);
      }
      // 다른 노드를 뚫고 지나가지 않는다
      for (let i = 0; i + 1 < e.pts.length; i++) {
        const seg = { l: Math.min(e.pts[i][0], e.pts[i + 1][0]), r: Math.max(e.pts[i][0], e.pts[i + 1][0]), t: Math.min(e.pts[i][1], e.pts[i + 1][1]), b: Math.max(e.pts[i][1], e.pts[i + 1][1]) };
        ns.forEach((n: any) => { if (n.id !== e.from && n.id !== e.to) expect(overlap(seg, n), `${e.from}>${e.to} 가 ${n.id} 를 지남`).toBe(false); });
      }
    });
    // 되돌아가는 연결은 점선(back)으로 표시
    expect(L.edges.filter((e: any) => e.back).map((e: any) => `${e.from}>${e.to}`).sort()).toEqual(["d>b", "i>b"]);
    // 선·라벨이 위로 잘리지 않는다
    L.edges.forEach((e: any) => { e.pts.forEach((p: number[]) => expect(p[1]).toBeGreaterThanOrEqual(0)); if (e.lp) expect(e.lp.y - 13).toBeGreaterThanOrEqual(0); });
  });

  it("같은 열의 갈래는 위아래로 나뉘고, 곧은 흐름은 같은 높이에 놓인다", () => {
    const f = { id: "F", kind: "PROCESS", title: "t", lanes: [{ id: "A", label: "A" }], nodes: [N("1", "TERMINATOR", "시작", "A"), N("2", "DECISION", "가능한가", "A"), N("3", "PROCESS", "예 처리", "A"), N("4", "PROCESS", "아니오 처리", "A"), N("5", "TERMINATOR", "종료", "A")], edges: [{ from: "1", to: "2" }, { from: "2", to: "3", label: "예" }, { from: "2", to: "4", label: "아니오" }, { from: "3", to: "5" }, { from: "4", to: "5" }] };
    const L = FL.layout(f, {});
    expect(L.nodes["1"].cy).toBe(L.nodes["2"].cy);
    expect(L.nodes["2"].cy).toBe(L.nodes["3"].cy); // 첫 분기는 곧게
    expect(L.nodes["4"].cy).toBeGreaterThan(L.nodes["3"].cy); // 둘째 분기는 아래 칸
    expect(L.nodes["3"].rank).toBe(L.nodes["4"].rank);
  });

  it("캔버스에서 옮긴 위치(x,y)는 그대로 쓰고, 레인이 넘치면 넓힌다", () => {
    const f = big();
    const base = FL.layout(f, {});
    (f.nodes[1] as any).x = 300;
    (f.nodes[1] as any).y = 60;
    const L = FL.layout(f, {});
    expect(L.nodes["a"].cx).toBe(L.left0 + 300);
    expect(L.nodes["a"].cy).toBe(L.lanes[0].top + 60 + (L.lanes[0].h - base.lanes[0].h > 0 ? L.lanes[0].h - base.lanes[0].h : 0) * 0 + (L.nodes["a"].cy - (L.lanes[0].top + 60)));
    (f.nodes[1] as any).y = 400;
    const L2 = FL.layout(f, {});
    expect(L2.lanes[0].h).toBeGreaterThan(base.lanes[0].h);
  });

  it("SVG: 노드·연결선·레인에 편집용 data 속성이 있고, 내보내기 모드는 CSS 변수를 쓰지 않는다", () => {
    const f = big();
    const scr = FL.svg(f, { mode: "screen", color: (c: string) => colors[c] });
    expect(scr).toContain('data-nid="b"');
    expect(scr).toContain('data-eid="0"');
    expect(scr).toContain('data-lid="L1"');
    expect(scr).toContain("var(--");
    const ex = FL.svg(f, { mode: "export", color: (c: string) => colors[c] });
    expect(ex).not.toContain("var(--");
    expect(ex).toContain("정보공개 자료를 등록하고");
    expect(ex.startsWith("<svg xmlns")).toBe(true);
  });
});

describe("플로우차트 내보내기", () => {
  const f = big();
  const b = FX.build(f, { color: (c: string) => colors[c], project: "샘플", date: "2026-09-29" });

  it("독립 SVG: 제목·범례를 담고 고정 색만 쓴다", () => {
    expect(b.svg).toContain("복잡한 예");
    expect(b.svg).toContain("되돌아가는 흐름");
    expect(b.svg).not.toContain("var(--");
    expect(b.w).toBeGreaterThan(b.layout.W);
  });

  it("PPTX: 유효한 zip(CRC 일치)이고 도형·연결선·글자가 들어 있다", () => {
    const zip: Uint8Array = FX.pptx(f, b, { project: "샘플" });
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // 끝 디렉터리 → 중앙 디렉터리 순회
    const eocd = zip.length - 22;
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const names: string[] = [];
    const files: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
      expect(dv.getUint32(p, true)).toBe(0x02014b50);
      const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), lo = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(zip.slice(p + 46, p + 46 + nl));
      const dataStart = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      const data = zip.slice(dataStart, dataStart + size);
      expect(FX.crc32(data), name).toBe(crc);
      names.push(name);
      files[name] = new TextDecoder().decode(data);
      p += 46 + nl;
    }
    expect(names).toEqual(expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/slides/slide1.xml", "ppt/slideMasters/slideMaster1.xml", "ppt/slideLayouts/slideLayout1.xml", "ppt/theme/theme1.xml"]));
    const slide = files["ppt/slides/slide1.xml"]!;
    expect((slide.match(/name="Node\//g) ?? []).length).toBe(f.nodes.length);
    expect((slide.match(/name="Edge\//g) ?? []).length).toBe(f.edges.length);
    expect(slide).toContain("flowChartDecision");
    expect(slide).toContain("flowChartTerminator");
    expect(slide).toContain('<a:tailEnd type="triangle"');
    expect(slide).toContain("정보공개 자료를 등록하고");
    // 모든 XML이 짝이 맞는다 (태그 균형의 간이 검사)
    Object.entries(files).forEach(([n, x]) => {
      expect(x.startsWith("<?xml"), n).toBe(true);
      // 여는 태그와 닫는 태그가 짝이 맞는다
      const stack: string[] = [];
      for (const m of x.replace(/<\?xml[^>]*\?>/, "").matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g)) {
        if (m[4]) continue;
        if (m[1]) expect(stack.pop(), n).toBe(m[2]);
        else stack.push(m[2]!);
      }
      expect(stack, n).toEqual([]);
    });
    expect(files["ppt/presentation.xml"]).toMatch(/<p:sldSz cx="\d+" cy="\d+"\/>/);
  });

  it("PDF: JPEG를 한 쪽에 채운 올바른 xref", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf: Uint8Array = FX.buildPdf(jpeg, 100, 50, 400, 200);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const offs = [...text.slice(start).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    expect(offs).toHaveLength(5);
    offs.forEach((o, i) => expect(text.slice(o, o + 7)).toBe(`${i + 1} 0 obj`));
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/MediaBox [0 0 300 150]");
  });

  it("Figma 프롬프트: 모든 레인·노드·연결선 좌표와 글자가 들어 있다", () => {
    const t: string = FX.figmaPrompt(f, b, { project: "샘플" });
    f.nodes.forEach((n) => expect(t).toContain(`Node/${n.id} `));
    f.edges.forEach((e) => expect(t).toContain(`Edge/${e.from}→${e.to}`));
    f.lanes.forEach((l) => expect(t).toContain(`Lane/${l.id}`));
    expect(t).toContain("Noto Sans KR");
    expect(t).toContain("되돌아감");
    expect(t).toContain("↵"); // 줄바꿈 위치 표시
  });
});
