import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { DesignConcept } from "../src/model/schema.js";
import { cleanStyle, compose, FONTS, FRAMES, recommendedConcepts, TONES, STYLE_OPTIONS } from "../src/design/library.js";

// 브라우저와 같은 방식(window 전역)으로 불러온다
const win: { DesignLib?: { compose: (f: unknown, t: unknown, s: unknown, fonts: unknown) => unknown } } = {};
vm.runInNewContext(readFileSync(new URL("../src/render/viewer/assets/designlib.js", import.meta.url), "utf8"), { window: win });
const lib = win.DesignLib!;

describe("디자인 라이브러리 (프레임 × 톤앤매너)", () => {
  it("프레임 10종 · 톤 20종, ID가 겹치지 않는다", () => {
    expect(FRAMES).toHaveLength(10);
    expect(TONES).toHaveLength(20);
    expect(new Set(FRAMES.map((f) => f.id)).size).toBe(10);
    expect(new Set(TONES.map((t) => t.id)).size).toBe(20);
  });

  it("모든 조합이 스키마를 통과하고, 브라우저 조합 결과와 같다", () => {
    for (const f of FRAMES) for (const t of TONES) {
      const ts = compose(f.id, t.id);
      expect(() => DesignConcept.parse(ts)).not.toThrow();
      expect(lib.compose(f, t, {}, FONTS)).toEqual(ts);
    }
  });

  it("세부 스타일을 바꿔도 서버·브라우저 결과가 같다", () => {
    const style = { density: "compact", button: "pill", tableHead: "dark", stat: "gradient", tabs: "fill", searchStyle: "table", navMark: "bar", headerFill: "nav", list: "card", pagination: "more", font: "noto", radius: 10 } as const;
    const ts = compose("F04", "T01", style);
    expect(ts.layout).toMatchObject({ density: "compact", button: "pill", tableHead: "dark", stat: "gradient", tabs: "fill", headerFill: "nav" });
    expect(ts.tokens.control.height).toBe(36);
    expect(ts.tokens.font.family).toContain("Noto Sans KR");
    expect(lib.compose(FRAMES.find((f) => f.id === "F04"), TONES.find((t) => t.id === "T01"), style, FONTS)).toEqual(ts);
  });

  it("허용되지 않은 세부 스타일 값은 버린다", () => {
    expect(cleanStyle({ density: "compact", button: "<script>", stat: "nope", radius: 99, extra: 1 })).toEqual({ density: "compact", radius: 24 });
    expect(STYLE_OPTIONS.map((o) => o.key)).toContain("headerFill");
  });

  it("성격별 추천 조합은 A부터 차례로 붙는다", () => {
    const adm = recommendedConcepts("admin");
    expect(adm.map((c) => c.id)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(adm[0]).toMatchObject({ frameId: "F07", toneId: "T02" });
    expect(adm[0]!.layout.nav).toBe("side-header");
  });

  it("없는 프레임·톤은 오류", () => {
    expect(() => compose("F99", "T01")).toThrow("프레임");
    expect(() => compose("F01", "T99")).toThrow("톤");
  });
});
