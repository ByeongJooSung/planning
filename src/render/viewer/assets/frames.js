/*
 * 프레임(피그마식) 컴포넌트 렌더러 · Figma 내보내기
 *  - 노드 트리(프레임·텍스트·사각형·원·선·아이콘·인스턴스)를 HTML(flexbox)로 그린다. 오토 레이아웃 = flex, 위치 지정 = absolute
 *  - 색·글자 크기·모서리는 디자인 토큰 이름으로 쓰면 와이어프레임 CSS 변수(--w-*)로 이어져 토큰을 바꾸면 함께 바뀐다
 *  - Figma: 플러그인 스크립트(오토 레이아웃·변수 그대로), 토큰 JSON(DTCG), Claude + Figma MCP용 프롬프트
 * Frames.html(tree, {ds, props, ids, comps}) · Frames.figmaScript(ds, comps, opts) · Frames.tokensJson(ds) · Frames.figmaPrompt(ds, comp)
 */
(function (root) {
  "use strict";
  var COLOR_VAR = {
    primary: "--w-primary", onPrimary: "--w-on-primary", accent: "--w-accent", bg: "--w-bg", surface: "--w-surface", surfaceAlt: "--w-alt",
    border: "--w-border", text: "--w-text", textMuted: "--w-muted", nav: "--w-nav", onNav: "--w-on-nav", success: "--w-success",
    warning: "--w-warning", danger: "--w-danger", info: "--w-info"
  };
  var COLOR_LABEL = {
    primary: "주 색", onPrimary: "주 색 위 글자", accent: "강조", bg: "화면 배경", surface: "카드·표 배경", surfaceAlt: "보조 배경", border: "테두리",
    text: "글자", textMuted: "보조 글자", nav: "메뉴 배경", onNav: "메뉴 글자", success: "성공", warning: "경고", danger: "위험", info: "정보"
  };
  var SIZE_VAR = { display: "--w-display", h1: "--w-h1", h2: "--w-h2", h3: "--w-h3", body: "--w-body", small: "--w-small", caption: "--w-caption" };
  var RADIUS_VAR = { sm: "--w-r-sm", md: "--w-r-md", lg: "--w-r-lg" };
  var JUSTIFY = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" };
  var ALIGN = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" };
  var SHADOW = { soft: "0 2px 8px rgba(15,23,42,.12)", strong: "0 8px 24px rgba(15,23,42,.22)" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function color(v, fallback) {
    if (!v) return fallback || "";
    if (v === "transparent") return "transparent";
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
    return COLOR_VAR[v] ? "var(" + COLOR_VAR[v] + ")" : fallback || "";
  }
  function fsize(v) { return v == null ? "var(--w-body)" : typeof v === "number" ? v + "px" : SIZE_VAR[v] ? "var(" + SIZE_VAR[v] + ")" : "var(--w-body)"; }
  function radius(v) { return v == null ? "" : v === "full" ? "999px" : typeof v === "number" ? v + "px" : RADIUS_VAR[v] ? "var(" + RADIUS_VAR[v] + ")" : ""; }
  function lay(n) { return n.layout || { mode: "none", gap: 0, pad: [0, 0, 0, 0], align: "start", justify: "start", wrap: false }; }

  /** 노드 하나 → HTML. parent: {mode} (부모 오토 레이아웃 방향) */
  /** 컴포넌트의 변형 트리 고르기 (이름이 없거나 못 찾으면 기본 모양) */
  function treeOf(c, variant) {
    if (!c) return null;
    if (variant && c.variantTrees) { var v = c.variantTrees.find(function (x) { return x.name === variant; }); if (v) return v.tree; }
    return c.tree || null;
  }
  function node(n, o, parent, depth) {
    if (!n || depth > 14) return "";
    if (n.hidden) return o.ids ? '<div class="fr-n fr-hidden" data-fid="' + esc(n.id) + '" style="display:none"></div>' : "";
    var st = [], cls = "fr-n fr-" + n.type, inner = "", pm = parent ? parent.mode : "none";
    var abs = parent && pm === "none";
    if (abs) { st.push("position:absolute", "left:" + (n.x || 0) + "px", "top:" + (n.y || 0) + "px"); }
    // 크기: fill은 부모 방향에 따라 flex / stretch, hug는 내용 크기
    var w = n.w, h = n.h;
    if (typeof w === "number") st.push("width:" + w + "px", "flex-shrink:0");
    if (typeof h === "number") st.push("height:" + h + "px");
    if (w === "fill") { if (pm === "row") st.push("flex:1 1 0", "min-width:0"); else st.push("align-self:stretch", "width:auto"); }
    if (h === "fill") { if (pm === "column") st.push("flex:1 1 0", "min-height:0"); else st.push("align-self:stretch"); }
    if ((w === "hug" || w == null) && n.type === "frame" && !abs) st.push("width:max-content", "max-width:100%");
    if (n.opacity != null && n.opacity < 1) st.push("opacity:" + n.opacity);
    var fill = color(n.fill), stroke = color(n.stroke);
    if (n.type === "frame" || n.type === "rect" || n.type === "ellipse") {
      if (fill) st.push("background:" + fill);
      if (stroke && (n.strokeW == null || n.strokeW > 0)) st.push("border:" + (n.strokeW || 1) + "px solid " + stroke);
      var r = n.type === "ellipse" ? "50%" : radius(n.radius);
      if (r) st.push("border-radius:" + r);
      if (n.shadow && SHADOW[n.shadow]) st.push("box-shadow:" + SHADOW[n.shadow]);
    }
    if (n.type === "frame") {
      var L = lay(n), p = L.pad || [0, 0, 0, 0];
      st.push("padding:" + p.map(function (x) { return x + "px"; }).join(" "));
      if (L.mode === "row" || L.mode === "column") {
        st.push("display:flex", "flex-direction:" + (L.mode === "row" ? "row" : "column"), "gap:" + (L.gap || 0) + "px", "justify-content:" + JUSTIFY[L.justify || "start"], "align-items:" + ALIGN[L.align || "start"]);
        if (L.wrap) st.push("flex-wrap:wrap");
      } else {
        st.push("position:" + (abs ? "absolute" : "relative"));
        if (typeof h !== "number" && h !== "fill") st.push("min-height:" + bboxH(n) + "px");
        if (typeof w !== "number" && w !== "fill") st.push("min-width:" + bboxW(n) + "px");
      }
      if (n.clip) st.push("overflow:hidden");
      inner = (n.children || []).map(function (c) { return node(c, o, { mode: L.mode }, depth + 1); }).join("");
    } else if (n.type === "text") {
      var txt = n.bind && o.props && o.props[n.bind] != null ? String(o.props[n.bind]) : n.text || "";
      st.push("font-size:" + fsize(n.size), "font-weight:" + (n.weight || 400), "color:" + color(n.color, "var(--w-text)"), "white-space:pre-wrap", "line-height:1.45", "margin:0");
      if (n.talign) st.push("text-align:" + n.talign);
      inner = esc(txt);
    } else if (n.type === "line") {
      st.push("border-top:" + (n.strokeW || 1) + "px solid " + (stroke || "var(--w-border)"));
      if (w == null) st.push("align-self:stretch");
      st.push("height:0");
    } else if (n.type === "icon") {
      var sz = typeof w === "number" ? w : 20;
      st.push("color:" + color(n.color, "var(--w-text)"), "display:inline-flex", "line-height:0");
      inner = root.Wire && root.Wire.icon ? root.Wire.icon(n.icon || "info", sz) : "";
    } else if (n.type === "instance") {
      var ref = (o.comps || []).find(function (c) { return c.id === n.ref; }), rt = treeOf(ref, n.variant);
      st.push("display:block");
      // 인스턴스 덮어쓰기: 변형 · 글자(props) · 채우기
      if (rt) inner = node(Object.assign({}, rt, { x: undefined, y: undefined, w: n.w || rt.w, h: n.h || rt.h }, n.fill ? { fill: n.fill } : {}), Object.assign({}, o, { ids: false, props: Object.assign({}, n.props || {}) }), null, depth + 1);
      else if (ref && root.Wire && o.ds) inner = root.Wire.component(o.ds, ref.id, Object.assign({}, n.props || {}, n.variant ? { variant: n.variant } : {}), {});
      else inner = '<div class="fr-missing">없는 컴포넌트: ' + esc(n.ref) + "</div>";
    }
    var idAttr = o.ids ? ' data-fid="' + esc(n.id) + '"' : "";
    var tag = n.type === "text" ? "p" : "div";
    return "<" + tag + ' class="' + cls + '"' + idAttr + ' style="' + st.join(";") + '">' + inner + "</" + tag + ">";
  }
  // 위치 지정 프레임의 최소 크기 (자식 상자 끝까지)
  function bboxW(n) { return Math.max(40, (n.children || []).reduce(function (m, c) { return Math.max(m, (c.x || 0) + (typeof c.w === "number" ? c.w : 80)); }, 0)); }
  function bboxH(n) { return Math.max(24, (n.children || []).reduce(function (m, c) { return Math.max(m, (c.y || 0) + (typeof c.h === "number" ? c.h : 24)); }, 0)); }

  function html(tree, o) { o = o || {}; return '<div class="fr-root">' + node(tree, o, null, 0) + "</div>"; }

  // ── 노드 다루기 (편집기·내보내기 공용) ─────────────
  function walk(n, fn, parent) { fn(n, parent); (n.children || []).forEach(function (c) { walk(c, fn, n); }); }
  function find(tree, id) { var r = null; walk(tree, function (n, p) { if (n.id === id) r = { node: n, parent: p }; }); return r; }
  function nextId(tree, prefix) {
    var ids = {};
    walk(tree, function (n) { ids[n.id] = true; });
    for (var i = 1; ; i++) if (!ids[prefix + i]) return prefix + i;
  }

  /** 트리 안 텍스트의 props 이름들 */
  function binds(tree) { var out = []; if (tree) walk(tree, function (n) { if (n.bind && out.indexOf(n.bind) < 0) out.push(n.bind); }); return out; }

  /**
   * 바깥에서 온 트리(AI 결과·Figma 가져오기)를 저장 규칙에 맞게 다듬는다: 알 수 없는 값은 버리고, 숫자는 범위 안으로, ID는 겹치지 않게
   */
  var TYPES = { frame: 1, text: 1, rect: 1, ellipse: 1, line: 1, icon: 1, instance: 1 };
  function sanitize(t, comps) {
    var used = {}, known = {};
    (comps || []).forEach(function (c) { known[c.id] = c; });
    var num = function (v, lo, hi) { var x = Number(v); return isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x * 100) / 100)) : undefined; };
    var col = function (v) { v = String(v == null ? "" : v).trim(); if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v.toUpperCase(); if (/^#[0-9A-Fa-f]{3}$/.test(v)) return ("#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toUpperCase(); return COLOR_VAR[v] || v === "transparent" ? v : undefined; };
    var sz = function (v, lo) { if (v === "hug" || v === "fill") return v; return num(v, lo || 0, 4000); };
    var d = 0;
    function cl(n, depth) {
      if (!n || typeof n !== "object" || depth > 12) return null;
      var type = TYPES[n.type] ? n.type : n.children ? "frame" : n.text != null ? "text" : null;
      if (!type) return null;
      var id = String(n.id || type[0] + (++d)).replace(/[^\w:-]/g, "").slice(0, 40) || type[0] + (++d);
      while (used[id]) id = id.replace(/_\d+$/, "") + "_" + (++d);
      used[id] = true;
      var o = { id: id, type: type };
      if (n.name) o.name = String(n.name).slice(0, 80);
      var w = sz(n.w), h = sz(n.h);
      if (w != null) o.w = w;
      if (h != null) o.h = h;
      if (n.x != null) o.x = num(n.x, -4000, 4000);
      if (n.y != null) o.y = num(n.y, -4000, 4000);
      if (type === "frame") {
        var L = n.layout || {};
        var mode = { row: "row", column: "column", horizontal: "row", vertical: "column", none: "none" }[String(L.mode || "none").toLowerCase()] || "none";
        var pad = Array.isArray(L.pad) ? L.pad : typeof L.pad === "number" ? [L.pad, L.pad, L.pad, L.pad] : [0, 0, 0, 0];
        if (pad.length === 2) pad = [pad[0], pad[1], pad[0], pad[1]];
        o.layout = { mode: mode, gap: num(L.gap, 0, 400) || 0, pad: [0, 1, 2, 3].map(function (i) { return num(pad[i], 0, 400) || 0; }), align: ["start", "center", "end", "stretch"].indexOf(L.align) >= 0 ? L.align : "start", justify: ["start", "center", "end", "between"].indexOf(L.justify) >= 0 ? L.justify : "start", wrap: !!L.wrap };
        if (n.clip) o.clip = true;
        var kids = (Array.isArray(n.children) ? n.children : []).slice(0, 200).map(function (c) { return cl(c, depth + 1); }).filter(Boolean);
        if (mode !== "none") kids.forEach(function (k) { delete k.x; delete k.y; });
        o.children = kids;
      }
      ["fill", "stroke", "color"].forEach(function (k) { var c = col(n[k]); if (c) o[k] = c; });
      if (n.strokeW != null) o.strokeW = num(n.strokeW, 0, 20);
      if (n.radius != null) o.radius = ["sm", "md", "lg", "full"].indexOf(n.radius) >= 0 ? n.radius : num(n.radius, 0, 999);
      if (n.opacity != null && Number(n.opacity) < 1) o.opacity = num(n.opacity, 0, 1);
      if (n.shadow === "soft" || n.shadow === "strong") o.shadow = n.shadow;
      if (type === "text") {
        o.text = String(n.text == null ? "" : n.text).slice(0, 2000);
        o.size = SIZE_VAR[n.size] ? n.size : num(n.size, 6, 200) || "body";
        if (n.weight) o.weight = Math.max(100, Math.min(900, Math.round(Number(n.weight) / 100) * 100 || 400));
        if (["left", "center", "right"].indexOf(n.talign) >= 0) o.talign = n.talign;
      }
      if (n.bind && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(n.bind)) o.bind = n.bind;
      if (type === "icon") o.icon = root.Wire && root.Wire.iconLabel && root.Wire.iconLabel[n.icon] ? n.icon : "info";
      if (type === "instance") {
        if (!known[n.ref]) return null;
        o.ref = n.ref;
        if (n.variant) o.variant = String(n.variant).slice(0, 40);
        if (n.props && typeof n.props === "object") { o.props = {}; Object.keys(n.props).forEach(function (k) { if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k)) o.props[k] = String(n.props[k]).slice(0, 500); }); }
      }
      if (n.hidden) o.hidden = true;
      return o;
    }
    var r = cl(t, 0);
    if (!r) return null;
    if (r.type !== "frame") r = { id: "root", type: "frame", w: "hug", h: "hug", layout: { mode: "column", gap: 0, pad: [0, 0, 0, 0], align: "start", justify: "start", wrap: false }, children: [r] };
    return r;
  }

  // ── 디자인 토큰 ─────────────────────────────────
  function hexRgb(h) { var v = parseInt(String(h).slice(1), 16); return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 }; }
  function fontName(f) { return String(f || "").split(",")[0].replace(/["']/g, "").trim() || "Inter"; }
  /** 토큰 JSON (Design Tokens Community Group 형식 — Tokens Studio·Figma 변수 가져오기 플러그인에서 읽는다) */
  function tokensJson(ds, name) {
    var t = ds.tokens, out = { $description: (name || ds.systemCode) + " 디자인 토큰 (r" + ds.revision + ")", color: {}, fontSize: {}, radius: {}, size: {}, font: {} };
    Object.keys(COLOR_VAR).forEach(function (k) { if (t.color[k]) out.color[k] = { $type: "color", $value: t.color[k], $description: COLOR_LABEL[k] }; });
    Object.keys(t.font.scale).forEach(function (k) { out.fontSize[k] = { $type: "dimension", $value: t.font.scale[k] + "px" }; });
    ["sm", "md", "lg"].forEach(function (k) { out.radius[k] = { $type: "dimension", $value: t.radius[k] + "px" }; });
    out.size.control = { $type: "dimension", $value: t.control.height + "px" };
    out.size.row = { $type: "dimension", $value: t.control.rowHeight + "px" };
    out.size.spacing = { $type: "dimension", $value: t.spacing + "px" };
    out.size.maxWidth = { $type: "dimension", $value: t.grid.maxWidth + "px" };
    out.font.family = { $type: "fontFamily", $value: fontName(t.font.family) };
    out.font.weightBold = { $type: "fontWeight", $value: t.font.weightBold };
    return JSON.stringify(out, null, 2);
  }

  /** 인스턴스로 쓰는 컴포넌트가 먼저 만들어지도록 순서를 맞춘다 */
  function ordered(comps) {
    var byId = {}, out = [], seen = {};
    comps.forEach(function (c) { byId[c.id] = c; });
    function visit(c, stack) {
      if (seen[c.id] || stack[c.id]) return;
      stack[c.id] = true;
      [c.tree].concat((c.variantTrees || []).map(function (v) { return v.tree; })).forEach(function (t) { if (t) walk(t, function (n) { if (n.type === "instance" && byId[n.ref]) visit(byId[n.ref], stack); }); });
      seen[c.id] = true;
      out.push(c);
    }
    comps.forEach(function (c) { visit(c, {}); });
    return out;
  }
  /**
   * Figma 플러그인 스크립트 (양방향)
   *  - import(기본): 토큰 → Figma 변수, 프레임 컴포넌트 → 오토 레이아웃 Figma 컴포넌트(변형은 Component Set, 인스턴스 덮어쓰기 포함)
   *  - export: Figma에서 고른 프레임·컴포넌트를 이 서비스 JSON으로 바꿔 보여 준다 (디자인 시스템 ▸ Figma에서 가져오기에 붙여 넣기)
   * Figma ‘Scripter’ 플러그인에 붙여 넣어 실행하거나, 함께 내려받는 플러그인(메뉴 2개)으로 실행한다.
   */
  function figmaScript(ds, comps, opts) {
    opts = opts || {};
    var t = ds.tokens, list = ordered(comps.filter(function (c) { return c.tree; }));
    var data = {
      cmd: opts.cmd || "import",
      title: (opts.title || ds.systemCode) + " 디자인 시스템 r" + ds.revision,
      font: fontName(t.font.family),
      colors: {}, sizes: t.font.scale, radius: t.radius,
      comps: opts.cmd === "export" ? [] : list.map(function (c) { return { id: c.id, name: c.name, tree: c.tree, variants: (c.variantTrees || []).map(function (v) { return { name: v.name, tree: v.tree }; }) }; })
    };
    Object.keys(COLOR_VAR).forEach(function (k) { if (t.color[k]) data.colors[k] = hexRgb(t.color[k]); });
    data.icons = {};
    list.forEach(function (c) { [c.tree].concat((c.variantTrees || []).map(function (v) { return v.tree; })).forEach(function (tr) { walk(tr, function (n) { if (n.type === "icon" && root.Wire) data.icons[n.icon || "info"] = root.Wire.icon(n.icon || "info", 24).replace('class="wf-ic" ', "").replace(/stroke="currentColor"/, 'stroke="#000000"'); }); }); });
    var head = data.cmd === "export" ? "// Figma → Planning Studio: 가져올 프레임·컴포넌트를 선택한 뒤 실행하세요 (Scripter)\n" : "// Planning Studio → Figma: " + data.title + "\n// Figma ▸ 플러그인 ▸ Scripter 에 붙여 넣고 실행하세요 (또는 함께 받은 플러그인으로 실행)\n";
    return head + "const DATA = " + JSON.stringify(data) + ";\n" + FIGMA_RUNTIME;
  }
  // 아래 코드는 Figma 플러그인 환경에서 실행된다 (figma.* API)
  var FIGMA_RUNTIME = [
    "const IS_PLUGIN = typeof figma.command === 'string' && figma.command !== '';",
    "const CMD = IS_PLUGIN ? figma.command : DATA.cmd;",
    "async function runImport() {",
    "  const page = figma.createPage(); page.name = DATA.title; await figma.setCurrentPageAsync(page);",
    "  const col = figma.variables.createVariableCollection(DATA.title); const mode = col.modes[0].modeId; const V = {}, N = {};",
    "  for (const [k, c] of Object.entries(DATA.colors)) { const v = figma.variables.createVariable('color/' + k, col, 'COLOR'); v.setValueForMode(mode, { r: c.r, g: c.g, b: c.b, a: 1 }); V[k] = v; }",
    "  for (const [k, n] of Object.entries(DATA.sizes)) { const v = figma.variables.createVariable('font-size/' + k, col, 'FLOAT'); v.setValueForMode(mode, n); N['size:' + k] = v; }",
    "  for (const k of ['sm', 'md', 'lg']) { const v = figma.variables.createVariable('radius/' + k, col, 'FLOAT'); v.setValueForMode(mode, DATA.radius[k]); N['radius:' + k] = v; }",
    "  let FONT = { family: DATA.font, style: 'Regular' }, BOLD = { family: DATA.font, style: 'Bold' };",
    "  try { await figma.loadFontAsync(FONT); await figma.loadFontAsync(BOLD); } catch (e) { FONT = { family: 'Inter', style: 'Regular' }; BOLD = { family: 'Inter', style: 'Bold' }; await figma.loadFontAsync(FONT); await figma.loadFontAsync(BOLD); }",
    "  const hex = (h) => { const v = parseInt(h.slice(1), 16); return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 }; };",
    "  const paint = (c) => { if (!c || c === 'transparent') return []; if (c[0] === '#') return [{ type: 'SOLID', color: hex(c) }]; if (!V[c]) return []; return [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', V[c])]; };",
    "  const SIZE = (s) => typeof s === 'number' ? s : (DATA.sizes[s || 'body'] || 16);",
    "  const RAD = (r) => r == null ? 0 : r === 'full' ? 999 : typeof r === 'number' ? r : (DATA.radius[r] || 0);",
    "  const AX = { start: 'MIN', center: 'CENTER', end: 'MAX', between: 'SPACE_BETWEEN', stretch: 'MIN' };",
    "  const made = {};",
    "  function sizing(f, n, parentAuto) {",
    "    const auto = f.type === 'FRAME' && f.layoutMode && f.layoutMode !== 'NONE';",
    "    const set = (axis, v) => { const key = axis === 'w' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';",
    "      try { if (v === 'fill' && parentAuto) f[key] = 'FILL'; else if ((v === 'hug' || v == null) && (auto || f.type === 'TEXT')) f[key] = 'HUG'; else if (typeof v === 'number') f[key] = 'FIXED'; } catch (e) {} };",
    "    set('w', n.w); set('h', n.h);",
    "  }",
    "  function build(n, parent, parentAuto, parentStretch) {",
    "    let f;",
    "    if (n.type === 'frame') {",
    "      f = figma.createFrame(); f.fills = paint(n.fill);",
    "      const L = n.layout || { mode: 'none' };",
    "      if (L.mode === 'row' || L.mode === 'column') {",
    "        f.layoutMode = L.mode === 'row' ? 'HORIZONTAL' : 'VERTICAL'; f.itemSpacing = L.gap || 0;",
    "        const p = L.pad || [0, 0, 0, 0]; f.paddingTop = p[0]; f.paddingRight = p[1]; f.paddingBottom = p[2]; f.paddingLeft = p[3];",
    "        f.primaryAxisAlignItems = AX[L.justify || 'start']; f.counterAxisAlignItems = L.align === 'stretch' ? 'MIN' : AX[L.align || 'start']; if (L.wrap && L.mode === 'row') f.layoutWrap = 'WRAP';",
    "      }",
    "      f.clipsContent = !!n.clip;",
    "    } else if (n.type === 'text') {",
    "      f = figma.createText(); f.fontName = (n.weight || 400) >= 600 ? BOLD : FONT; f.characters = n.text || ' '; f.fontSize = SIZE(n.size);",
    "      if (typeof n.size === 'string' && N['size:' + n.size]) f.setBoundVariable('fontSize', N['size:' + n.size]);",
    "      f.fills = paint(n.color || 'text'); if (n.talign) f.textAlignHorizontal = n.talign.toUpperCase();",
    "    } else if (n.type === 'rect') { f = figma.createRectangle(); f.fills = paint(n.fill); }",
    "    else if (n.type === 'ellipse') { f = figma.createEllipse(); f.fills = paint(n.fill); }",
    "    else if (n.type === 'line') { f = figma.createLine(); f.strokes = paint(n.stroke || 'border'); f.strokeWeight = n.strokeW || 1; }",
    "    else if (n.type === 'icon') { f = figma.createNodeFromSvg(DATA.icons[n.icon || 'info'] || '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\"/>'); }",
    "    else if (n.type === 'instance' && made[n.ref]) {",
    "      const m = made[n.ref]; f = (m.byName[n.variant] || m.def).createInstance();",
    "      for (const [k, v] of Object.entries(n.props || {})) for (const t of f.findAll((x) => x.type === 'TEXT' && x.name.startsWith('{' + k + '}'))) t.characters = String(v);",
    "      if (n.fill) f.fills = paint(n.fill);",
    "    }",
    "    else { f = figma.createFrame(); f.fills = []; }",
    "    f.name = n.type === 'text' && n.bind ? '{' + n.bind + '}' + (n.name ? ' ' + n.name : '') : (n.name || n.type);",
    "    if (n.type !== 'line' && n.type !== 'text' && n.type !== 'icon' && n.type !== 'instance' && n.stroke && (n.strokeW == null || n.strokeW > 0)) { f.strokes = paint(n.stroke); f.strokeWeight = n.strokeW || 1; }",
    "    if ('cornerRadius' in f && n.radius != null && n.type !== 'ellipse' && n.type !== 'instance') { f.cornerRadius = RAD(n.radius); if (typeof n.radius === 'string' && N['radius:' + n.radius]) ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach((k) => f.setBoundVariable(k, N['radius:' + n.radius])); }",
    "    if (n.opacity != null) f.opacity = n.opacity;",
    "    if (n.hidden) f.visible = false;",
    "    if (n.shadow && n.shadow !== 'none' && 'effects' in f) f.effects = [{ type: 'DROP_SHADOW', color: { r: 0.06, g: 0.09, b: 0.16, a: n.shadow === 'strong' ? 0.22 : 0.12 }, offset: { x: 0, y: n.shadow === 'strong' ? 8 : 2 }, radius: n.shadow === 'strong' ? 24 : 8, spread: 0, visible: true, blendMode: 'NORMAL' }];",
    "    const w = typeof n.w === 'number' ? n.w : (n.type === 'icon' ? 20 : f.width), h = typeof n.h === 'number' ? n.h : (n.type === 'icon' ? (typeof n.w === 'number' ? n.w : 20) : f.height);",
    "    if (n.type !== 'text' && n.type !== 'instance' && 'resize' in f) { try { f.resize(Math.max(1, w), Math.max(n.type === 'line' ? 0 : 1, h)); } catch (e) {} }",
    "    if (parent) { parent.appendChild(f); if (!parentAuto) { f.x = n.x || 0; f.y = n.y || 0; } }",
    "    if (n.type === 'frame') { const L2 = n.layout || {}; for (const c of n.children || []) build(c, f, f.layoutMode && f.layoutMode !== 'NONE', L2.align === 'stretch'); }",
    "    sizing(f, n, parentAuto);",
    "    if (parentAuto && parentStretch && 'layoutAlign' in f) f.layoutAlign = 'STRETCH';",
    "    return f;",
    "  }",
    "  let x = 0;",
    "  for (const c of DATA.comps) {",
    "    if (c.variants && c.variants.length) {",
    "      const all = [{ name: '기본', tree: c.tree }].concat(c.variants), nodes = [], byName = {};",
    "      for (const v of all) { const comp = figma.createComponentFromNode(build(v.tree, null, false, false)); comp.name = '변형=' + v.name; nodes.push(comp); byName[v.name] = comp; }",
    "      const set = figma.combineAsVariants(nodes, page); set.name = c.name + ' (' + c.id + ')'; set.layoutMode = 'HORIZONTAL'; set.itemSpacing = 24; set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 24; set.x = x; set.y = 0; x += set.width + 80;",
    "      made[c.id] = { def: nodes[0], byName };",
    "    } else {",
    "      const comp = figma.createComponentFromNode(build(c.tree, null, false, false)); comp.name = c.name + ' (' + c.id + ')'; comp.x = x; comp.y = 0; x += comp.width + 80;",
    "      made[c.id] = { def: comp, byName: {} };",
    "    }",
    "  }",
    "  figma.viewport.scrollAndZoomIntoView(page.children);",
    "  figma.notify('Planning Studio: 변수 ' + (Object.keys(V).length + Object.keys(N).length) + '개, 컴포넌트 ' + DATA.comps.length + '개를 만들었습니다');",
    "  if (IS_PLUGIN) figma.closePlugin();",
    "}",
    "async function runExport() {",
    "  const sel = figma.currentPage.selection;",
    "  if (!sel.length) { figma.notify('가져올 프레임·컴포넌트를 먼저 선택하세요'); if (IS_PLUGIN) figma.closePlugin(); return; }",
    "  const vname = async (id) => { try { const v = await figma.variables.getVariableByIdAsync(id); return v ? v.name : null; } catch (e) { return null; } };",
    "  const hx = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();",
    "  const AXR = { MIN: 'start', CENTER: 'center', MAX: 'end', SPACE_BETWEEN: 'between', BASELINE: 'start' };",
    "  const idOf = (name) => { const m = /\\(([a-z][a-z0-9-]*)\\)\\s*$/.exec(name || ''); return m ? m[1] : null; };",
    "  const clean = (name) => String(name || '').replace(/\\s*\\([a-z][a-z0-9-]*\\)\\s*$/, '');",
    "  async function color(paints) {",
    "    const p = Array.isArray(paints) ? paints.find((x) => x.visible !== false && x.type === 'SOLID') : null;",
    "    if (!p) return undefined;",
    "    const b = p.boundVariables && p.boundVariables.color; if (b) { const n = await vname(b.id); if (n && n.indexOf('color/') === 0) return n.slice(6); }",
    "    return hx(p.color);",
    "  }",
    "  let seq = 0;",
    "  const sz = (n, axis) => { const s = axis === 'w' ? n.layoutSizingHorizontal : n.layoutSizingVertical; if (s === 'FILL') return 'fill'; if (s === 'HUG') return 'hug'; return Math.round(axis === 'w' ? n.width : n.height); };",
    "  async function conv(n, parentAuto) {",
    "    const o = { id: 'n' + (++seq) };",
    "    if (n.visible === false) o.hidden = true;",
    "    if (!parentAuto) { o.x = Math.round(n.x); o.y = Math.round(n.y); }",
    "    if ('opacity' in n && n.opacity < 1) o.opacity = Math.round(n.opacity * 100) / 100;",
    "    if (n.type === 'TEXT') {",
    "      o.type = 'text'; o.text = n.characters;",
    "      const m = /^\\{([a-zA-Z][a-zA-Z0-9_]*)\\}\\s*(.*)$/.exec(n.name); if (m) { o.bind = m[1]; if (m[2]) o.name = m[2]; } else o.name = n.name;",
    "      const bs = n.boundVariables && n.boundVariables.fontSize; let size = null; if (bs) { const vn = await vname((Array.isArray(bs) ? bs[0] : bs).id); if (vn && vn.indexOf('font-size/') === 0) size = vn.slice(10); }",
    "      o.size = size || (typeof n.fontSize === 'number' ? n.fontSize : 'body');",
    "      const st = n.fontName && n.fontName.style ? n.fontName.style : 'Regular'; o.weight = /black|heavy|extra ?bold/i.test(st) ? 800 : /semi ?bold/i.test(st) ? 600 : /bold/i.test(st) ? 700 : /medium/i.test(st) ? 500 : 400;",
    "      o.color = await color(n.fills); if (n.textAlignHorizontal && n.textAlignHorizontal !== 'JUSTIFIED') o.talign = n.textAlignHorizontal.toLowerCase();",
    "      if (n.textAutoResize === 'HEIGHT' || n.textAutoResize === 'NONE') o.w = sz(n, 'w');",
    "      return o;",
    "    }",
    "    o.name = n.name;",
    "    if (n.type === 'INSTANCE') {",
    "      const main = await n.getMainComponentAsync(); const setN = main && main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;",
    "      const ref = idOf(setN ? setN.name : main && main.name);",
    "      if (ref) { o.type = 'instance'; o.ref = ref; if (setN) { const vm = /=(.+)$/.exec(main.name); if (vm && vm[1] !== '기본') o.variant = vm[1].trim(); }",
    "        const props = {}; for (const t of n.findAll((x) => x.type === 'TEXT')) { const m = /^\\{([a-zA-Z][a-zA-Z0-9_]*)\\}/.exec(t.name); if (m) props[m[1]] = t.characters; } if (Object.keys(props).length) o.props = props;",
    "        o.w = sz(n, 'w'); o.h = sz(n, 'h'); return o; }",
    "    }",
    "    if (n.type === 'RECTANGLE' || n.type === 'ELLIPSE') { o.type = n.type === 'RECTANGLE' ? 'rect' : 'ellipse'; o.w = sz(n, 'w'); o.h = sz(n, 'h'); o.fill = await color(n.fills); }",
    "    else if (n.type === 'LINE') { o.type = 'line'; o.w = sz(n, 'w'); o.stroke = await color(n.strokes); o.strokeW = n.strokeWeight || 1; return o; }",
    "    else if (n.type === 'VECTOR' || n.type === 'BOOLEAN_OPERATION' || n.type === 'STAR' || n.type === 'POLYGON') { o.type = 'icon'; o.icon = 'info'; o.w = Math.round(n.width); o.color = await color(n.strokes && n.strokes.length ? n.strokes : n.fills); return o; }",
    "    else {",
    "      o.type = 'frame'; o.w = sz(n, 'w'); o.h = sz(n, 'h'); o.fill = await color(n.fills);",
    "      const auto = n.layoutMode && n.layoutMode !== 'NONE';",
    "      if (auto) { const kids = n.children || []; o.layout = { mode: n.layoutMode === 'HORIZONTAL' ? 'row' : 'column', gap: n.itemSpacing || 0, pad: [n.paddingTop || 0, n.paddingRight || 0, n.paddingBottom || 0, n.paddingLeft || 0], align: kids.length && kids.every((k) => k.layoutAlign === 'STRETCH') ? 'stretch' : AXR[n.counterAxisAlignItems] || 'start', justify: AXR[n.primaryAxisAlignItems] || 'start', wrap: n.layoutWrap === 'WRAP' }; }",
    "      else o.layout = { mode: 'none', gap: 0, pad: [0, 0, 0, 0], align: 'start', justify: 'start', wrap: false };",
    "      if (n.clipsContent) o.clip = true;",
    "      o.children = []; for (const c of n.children || []) o.children.push(await conv(c, auto));",
    "    }",
    "    if ('strokes' in n && n.strokes && n.strokes.length && n.type !== 'LINE') { o.stroke = await color(n.strokes); o.strokeW = typeof n.strokeWeight === 'number' ? n.strokeWeight : 1; }",
    "    if ('cornerRadius' in n && n.type !== 'ELLIPSE') { const bv = n.boundVariables && n.boundVariables.topLeftRadius; let r = null; if (bv) { const vn = await vname(bv.id); if (vn && vn.indexOf('radius/') === 0) r = vn.slice(7); } const cr = typeof n.cornerRadius === 'number' ? n.cornerRadius : n.topLeftRadius || 0; o.radius = r || (cr >= 999 ? 'full' : cr || undefined); if (o.radius === undefined) delete o.radius; }",
    "    if ('effects' in n) { const sh = (n.effects || []).find((e) => e.type === 'DROP_SHADOW' && e.visible !== false); if (sh) o.shadow = sh.radius >= 16 ? 'strong' : 'soft'; }",
    "    return o;",
    "  }",
    "  async function root(n) { seq = 0; const t = await conv(n, true); t.id = 'root'; delete t.x; delete t.y; if (t.type !== 'frame') return { id: 'root', type: 'frame', w: 'hug', h: 'hug', layout: { mode: 'column', gap: 0, pad: [0, 0, 0, 0], align: 'start', justify: 'start', wrap: false }, children: [t] }; return t; }",
    "  const items = [];",
    "  for (const n of sel) {",
    "    if (n.type === 'COMPONENT_SET') {",
    "      const kids = n.children.filter((c) => c.type === 'COMPONENT'); if (!kids.length) continue;",
    "      const def = kids.find((c) => /=기본$/.test(c.name)) || kids[0];",
    "      items.push({ id: idOf(n.name) || undefined, name: clean(n.name), tree: await root(def), variantTrees: await Promise.all(kids.filter((c) => c !== def).map(async (c) => ({ name: ((/=(.+)$/.exec(c.name) || [])[1] || c.name).trim(), tree: await root(c) }))) });",
    "    } else items.push({ id: idOf(n.name) || undefined, name: clean(n.name), tree: await root(n) });",
    "  }",
    "  const json = JSON.stringify({ planningStudio: 1, items });",
    "  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');",
    "  try {",
    "    figma.showUI('<style>body{font:13px sans-serif;margin:12px}textarea{width:100%;height:230px;font:11px monospace}button{margin-top:8px;padding:6px 12px}</style><b>Planning Studio로 가져오기</b><p>아래 내용을 복사해 디자인 시스템 ▸ Figma에서 가져오기에 붙여 넣으세요.</p><textarea id=t>' + esc(json) + '</textarea><button id=c>복사</button> <button id=x>닫기</button><script>t.select();c.onclick=()=>{t.select();document.execCommand(\"copy\");c.textContent=\"복사했습니다\"};x.onclick=()=>parent.postMessage({pluginMessage:\"close\"},\"*\")<\/script>', { width: 460, height: 380 });",
    "    figma.ui.onmessage = (m) => { if (m === 'close') figma.closePlugin(); };",
    "  } catch (e) { console.log(json); if (typeof print === 'function') print(json); figma.notify('JSON을 콘솔에 출력했습니다 (' + items.length + '개)'); }",
    "}",
    "(CMD === 'export' ? runExport() : runImport()).catch((e) => { figma.notify('오류: ' + (e && e.message || e), { error: true }); if (IS_PLUGIN) figma.closePlugin(); });"
  ].join("\n");

  /** 내려받기용 Figma 플러그인 (Figma 데스크톱 ▸ 플러그인 ▸ 개발 ▸ manifest에서 플러그인 가져오기). 메뉴 2개: 가져오기 · 내보내기 */
  function figmaPlugin(ds, comps, opts) {
    var manifest = { name: "Planning Studio 디자인 시스템", id: "planning-studio-ds", api: "1.0.0", main: "code.js", editorType: ["figma"], documentAccess: "dynamic-page",
      menu: [{ name: "디자인 시스템을 Figma에 만들기", command: "import" }, { name: "선택한 프레임을 Planning Studio로 보내기", command: "export" }] };
    return [{ name: "planning-figma-plugin/manifest.json", data: JSON.stringify(manifest, null, 2) }, { name: "planning-figma-plugin/code.js", data: figmaScript(ds, comps, opts) }];
  }
  /** Figma → 이 서비스: Scripter용 내보내기 스크립트 */
  function figmaExportScript(ds) { return figmaScript(ds, [], { cmd: "export" }); }

  /** AI로 컴포넌트 그리기·고치기 프롬프트 */
  function aiPrompt(ds, comps, o) {
    o = o || {};
    var t = ds.tokens, icons = root.Wire && root.Wire.iconLabel ? Object.keys(root.Wire.iconLabel) : [];
    var usable = comps.filter(function (c) { return c.tree; }).map(function (c) { return "- " + c.id + " " + c.name + (binds(c.tree).length ? " · props: " + binds(c.tree).join(", ") : "") + (c.variantTrees && c.variantTrees.length ? " · 변형: 기본, " + c.variantTrees.map(function (v) { return v.name; }).join(", ") : ""); });
    var base = comps.filter(function (c) { return !c.tree; }).map(function (c) { return c.id; });
    return [
      "# 디자인 시스템 컴포넌트 " + (o.current ? "고치기" : "그리기") + (o.system ? " — " + o.system : ""),
      o.current ? "아래 ‘현재 컴포넌트’를 요청대로 고쳐 같은 JSON 형식 전체를 다시 주세요. 바꾸지 않는 부분은 그대로 둡니다." : "요청한 컴포넌트를 피그마식 프레임 노드 트리로 그려 주세요.",
      "",
      "## 요청",
      o.instruction || "(지시 없음 — 지금 모양을 다듬기)",
      "",
      "## 디자인 토큰 (색·글자 크기·모서리는 이 이름으로 쓴다)",
      "- 색: " + Object.keys(COLOR_VAR).map(function (k) { return k + "(" + COLOR_LABEL[k] + " " + t.color[k] + ")"; }).join(", "),
      "- 글자 크기 size: " + Object.keys(t.font.scale).map(function (k) { return k + "=" + t.font.scale[k] + "px"; }).join(", "),
      "- 모서리 radius: sm=" + t.radius.sm + ", md=" + t.radius.md + ", lg=" + t.radius.lg + ", full(알약) · 입력칸·버튼 높이 " + t.control.height + "px · 기본 간격 " + t.spacing + "px · 글꼴 " + fontName(t.font.family),
      "",
      "## 노드 형식",
      "- 공통: id(트리 안에서 고유, 짧게), type, name(한글 레이어 이름)",
      "- frame: layout {mode: row|column|none, gap, pad:[위,오른쪽,아래,왼쪽], align: start|center|end|stretch, justify: start|center|end|between, wrap}, fill, stroke, strokeW, radius, shadow: soft|strong, clip, children[]. mode none이면 자식에 x·y",
      "- text: text, size(토큰 이름 또는 px), weight(400·500·600·700), color, talign: left|center|right, bind(화면설계서 props와 연결할 이름: label·title·text·placeholder·count 등)",
      "- rect·ellipse: w·h·fill·radius · line: w(fill), stroke · icon: icon(" + icons.join(", ") + "), w, color",
      "- instance: ref(아래 컴포넌트 ID), variant, props{bind 이름: 글자}",
      "- 크기 w·h: 숫자(px) · hug(내용에 맞춤) · fill(남은 공간 채우기)",
      "- hidden: true 면 숨김 (변형마다 보이고 숨길 때)",
      "",
      "## 인스턴스로 쓸 수 있는 컴포넌트",
      usable.join("\n") || "- (프레임으로 그린 컴포넌트 없음)",
      base.length ? "- 기본 컴포넌트(모양은 서비스가 그림): " + base.join(", ") : "",
      "",
      "## 규칙",
      "- 맨 위는 frame. 배치는 오토 레이아웃(row·column)을 우선 쓰고, 겹쳐 놓을 때만 none",
      "- 색·글자 크기·모서리는 토큰 이름을 쓴다(직접 #색은 꼭 필요할 때만). 글자 대비가 충분하게(진한 배경 위는 onPrimary·onNav)",
      "- 바뀌는 글자(제목·라벨·내용·숫자)는 bind로 props에 연결한다",
      "- 요청에 상태가 있으면(기본·비활성·오류·선택됨 등) variants로 나눠 그린다. 기본 모양은 tree, 나머지는 variants[{name, tree}]",
      "- 한국어 UI 문구, 실제 서비스 수준의 여백·정렬",
      "",
      o.current ? "## 현재 컴포넌트\n```json\n" + JSON.stringify(o.current) + "\n```\n" : "",
      "## 출력 형식 (JSON만)",
      '{"name":"컴포넌트 이름","category":"navigation|search|data|form|action|feedback|content|layout","description":"언제 쓰는지","tree":{"id":"root","type":"frame","w":"hug","h":"hug","layout":{"mode":"row","gap":8,"pad":[10,16,10,16],"align":"center","justify":"center","wrap":false},"fill":"primary","radius":"md","children":[{"id":"t1","type":"text","text":"확인","size":"body","weight":600,"color":"onPrimary","bind":"label"}]},"variants":[{"name":"비활성","tree":{"id":"root","type":"frame","…":"…"}}]}'
    ].filter(function (x) { return x !== ""; }).join("\n");
  }

  /** Claude(Figma MCP 연결)에 붙여 넣는 프롬프트 */
  function figmaPrompt(ds, comps, opts) {
    opts = opts || {};
    var list = comps.filter(function (c) { return c.tree; });
    return [
      "# Figma에 디자인 시스템 만들기 — " + (opts.title || ds.systemCode),
      "Figma MCP(use_figma)로 현재 파일에 아래 디자인 토큰을 변수(Variables)로 만들고, 컴포넌트를 오토 레이아웃 Figma 컴포넌트로 만들어 주세요.",
      "",
      "## 규칙",
      "- 토큰: color/* 는 COLOR 변수, font-size/*·radius/* 는 FLOAT 변수. 컴포넌트의 fill·stroke·color 값이 토큰 이름이면 그 변수에 바인딩",
      "- 노드 type → Figma: frame=Frame(layout.mode row=HORIZONTAL, column=VERTICAL, none=절대 위치 x·y), text=Text, rect=Rectangle, ellipse=Ellipse, line=Line, icon=같은 이름 아이콘 벡터, instance=ref 컴포넌트의 인스턴스",
      "- layout: gap=itemSpacing, pad=[위,오른쪽,아래,왼쪽] 패딩, justify(start·center·end·between)=primaryAxisAlignItems, align(start·center·end·stretch)=counterAxisAlignItems(stretch는 자식 layoutAlign STRETCH)",
      "- w·h: 숫자=FIXED, hug=HUG, fill=FILL(오토 레이아웃 부모 안에서)",
      "- radius: sm·md·lg 는 radius 변수, full=999 · size: display·h1·h2·h3·body·small·caption 은 font-size 변수",
      "- 글꼴: " + fontName(ds.tokens.font.family) + " (없으면 Inter)",
      "- 컴포넌트 이름은 ‘이름 (id)’, 한 페이지에 가로로 80px 간격으로 놓기",
      "",
      "## 디자인 토큰",
      "```json",
      tokensJson(ds, opts.title),
      "```",
      "",
      "## 컴포넌트 (" + list.length + "개)",
      "```json",
      JSON.stringify(list.map(function (c) { return { id: c.id, name: c.name, tree: c.tree }; }), null, 1),
      "```"
    ].join("\n");
  }

  root.Frames = { aiPrompt: aiPrompt, figmaExportScript: figmaExportScript, ordered: ordered, treeOf: treeOf, binds: binds, sanitize: sanitize, html: html, node: node, walk: walk, find: find, nextId: nextId, tokensJson: tokensJson, figmaScript: figmaScript, figmaPlugin: figmaPlugin, figmaPrompt: figmaPrompt, COLOR_VAR: COLOR_VAR, COLOR_LABEL: COLOR_LABEL, SIZE_VAR: SIZE_VAR, color: color, fontName: fontName };
})(typeof window !== "undefined" ? window : globalThis);
