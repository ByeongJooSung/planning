/* 디자인 라이브러리 조합 — src/design/library.ts의 compose()와 같은 결과를 브라우저에서 만든다.
   (tests/design-library.test.ts가 모든 프레임 × 톤 조합에서 두 결과가 같은지 확인한다) */
(function (root) {
  "use strict";
  function scale(base) {
    return { display: Math.round(base * 2.4), h1: Math.round(base * 1.75), h2: Math.round(base * 1.4), h3: Math.round(base * 1.2), body: base, small: base - 1, caption: base - 2 };
  }
  function pick(v, d) { return v != null ? v : d; }
  /** frame·tone: 라이브러리 정의 객체, style: 세부 스타일, fonts: 글꼴 키 → font-family */
  function compose(f, t, style, fonts, id) {
    style = style || {};
    var density = pick(style.density, f.density), compact = density === "compact";
    var base = compact ? Math.max(13, t.base - 1) : t.base;
    var radius = pick(style.radius, t.radius);
    var family = style.font && fonts && fonts[style.font] ? fonts[style.font] : t.font;
    var c = t.color, color = {
      primary: c.primary, onPrimary: pick(c.onPrimary, "#FFFFFF"), accent: c.accent, bg: c.bg, surface: pick(c.surface, "#FFFFFF"),
      surfaceAlt: c.surfaceAlt, border: c.border, text: c.text, textMuted: pick(c.textMuted, "#6B7280"), nav: c.nav, onNav: c.onNav,
      success: pick(c.success, "#1E7B4B"), warning: pick(c.warning, "#B45309"), danger: pick(c.danger, "#D92D20"), info: pick(c.info, "#1D6FB8")
    };
    ["navActive", "onNavActive", "header", "onHeader", "tableHead", "onTableHead"].forEach(function (k) { if (c[k]) color[k] = c[k]; });
    var tokens = {
      color: color,
      series: t.series.slice(),
      font: { family: family, scale: scale(base), weightBold: 700 },
      radius: { sm: Math.max(0, Math.round(radius * 0.6)), md: radius, lg: Math.round(radius * 1.5) },
      control: compact ? { height: 36, rowHeight: 42 } : { height: 44, rowHeight: 52 },
      spacing: compact ? 6 : 8,
      grid: { columns: 12, maxWidth: f.maxWidth, gutter: 24 },
      shadow: t.shadow
    };
    var L = f.layout;
    var layout = {
      frame: f.id, nav: L.nav, logo: L.logo, search: L.search,
      list: pick(style.list, L.list), pagination: pick(style.pagination, L.pagination), button: pick(style.button, t.style.button),
      density: density, footer: L.footer,
      tableHead: pick(style.tableHead, t.style.tableHead), stat: pick(style.stat, t.style.stat),
      tabs: pick(style.tabs, pick(L.tabs, "line")), searchStyle: pick(style.searchStyle, pick(L.searchStyle, "card")),
      navMark: pick(style.navMark, t.style.navMark), headerFill: pick(style.headerFill, pick(L.headerFill, "light"))
    };
    return {
      id: id || f.id + "-" + t.id, name: f.name + " · " + t.name, summary: f.summary + ". 톤: " + t.summary, fit: f.fit,
      tokens: tokens, layout: layout, frameId: f.id, toneId: t.id
    };
  }
  var api = { compose: compose };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DesignLib = api;
})(typeof window !== "undefined" ? window : this);
