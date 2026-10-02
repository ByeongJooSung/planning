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
  function node(n, o, parent, depth) {
    if (!n || depth > 14) return "";
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
      var ref = (o.comps || []).find(function (c) { return c.id === n.ref; });
      st.push("display:block");
      if (ref && ref.tree) inner = node(Object.assign({}, ref.tree, { x: undefined, y: undefined, w: n.w || ref.tree.w, h: n.h || ref.tree.h }), Object.assign({}, o, { ids: false }), null, depth + 1);
      else if (ref && root.Wire && o.ds) inner = root.Wire.component(o.ds, ref.id, o.sample && o.sample[ref.id] || {}, {});
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

  /**
   * Figma 플러그인 스크립트: 토큰을 Figma 변수(Variables)로 만들고, 프레임 컴포넌트를 오토 레이아웃·변수가 연결된 Figma 컴포넌트로 만든다.
   * Figma에서 ‘Scripter’ 플러그인에 붙여 넣어 실행하거나, 함께 내려받는 플러그인(manifest.json + code.js)으로 실행한다.
   */
  function figmaScript(ds, comps, opts) {
    opts = opts || {};
    var t = ds.tokens, data = {
      title: (opts.title || ds.systemCode) + " 디자인 시스템 r" + ds.revision,
      font: fontName(t.font.family),
      colors: {}, sizes: t.font.scale, radius: t.radius,
      comps: comps.filter(function (c) { return c.tree; }).map(function (c) { return { id: c.id, name: c.name, tree: c.tree }; })
    };
    Object.keys(COLOR_VAR).forEach(function (k) { if (t.color[k]) data.colors[k] = hexRgb(t.color[k]); });
    data.icons = {};
    comps.forEach(function (c) { if (c.tree) walk(c.tree, function (n) { if (n.type === "icon" && root.Wire) data.icons[n.icon || "info"] = root.Wire.icon(n.icon || "info", 24).replace('class="wf-ic" ', "").replace(/stroke="currentColor"/, 'stroke="#000000"'); }); });
    return "// Planning Studio → Figma: " + data.title + "\n// Figma ▸ 플러그인 ▸ Scripter 에 붙여 넣고 실행하세요 (또는 함께 받은 플러그인으로 실행)\n" +
      "const DATA = " + JSON.stringify(data) + ";\n" + FIGMA_RUNTIME;
  }
  // 아래 코드는 Figma 플러그인 환경에서 실행된다 (figma.* API)
  var FIGMA_RUNTIME = [
    "(async () => {",
    "  const page = figma.createPage(); page.name = DATA.title; await figma.setCurrentPageAsync(page);",
    "  const col = figma.variables.createVariableCollection(DATA.title); const mode = col.modes[0].modeId; const V = {};",
    "  for (const [k, c] of Object.entries(DATA.colors)) { const v = figma.variables.createVariable('color/' + k, col, 'COLOR'); v.setValueForMode(mode, { r: c.r, g: c.g, b: c.b, a: 1 }); V[k] = v; }",
    "  const N = {};",
    "  for (const [k, n] of Object.entries(DATA.sizes)) { const v = figma.variables.createVariable('font-size/' + k, col, 'FLOAT'); v.setValueForMode(mode, n); N['size:' + k] = v; }",
    "  for (const k of ['sm', 'md', 'lg']) { const v = figma.variables.createVariable('radius/' + k, col, 'FLOAT'); v.setValueForMode(mode, DATA.radius[k]); N['radius:' + k] = v; }",
    "  let FONT = { family: DATA.font, style: 'Regular' }, BOLD = { family: DATA.font, style: 'Bold' };",
    "  try { await figma.loadFontAsync(FONT); await figma.loadFontAsync(BOLD); } catch (e) { FONT = { family: 'Inter', style: 'Regular' }; BOLD = { family: 'Inter', style: 'Bold' }; await figma.loadFontAsync(FONT); await figma.loadFontAsync(BOLD); }",
    "  const hex = (h) => { const v = parseInt(h.slice(1), 16); return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 }; };",
    "  const paint = (c) => { if (!c || c === 'transparent') return []; if (c[0] === '#') return [{ type: 'SOLID', color: hex(c) }]; if (!V[c]) return []; const base = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }; return [figma.variables.setBoundVariableForPaint(base, 'color', V[c])]; };",
    "  const SIZE = (s) => typeof s === 'number' ? s : (DATA.sizes[s || 'body'] || 16);",
    "  const RAD = (r) => r == null ? 0 : r === 'full' ? 999 : typeof r === 'number' ? r : (DATA.radius[r] || 0);",
    "  const AX = { start: 'MIN', center: 'CENTER', end: 'MAX', between: 'SPACE_BETWEEN', stretch: 'MIN' };",
    "  const made = {};",
    "  function sizing(f, n, parentAuto) {",
    "    const auto = f.type === 'FRAME' && f.layoutMode && f.layoutMode !== 'NONE';",
    "    const set = (axis, v) => { const key = axis === 'w' ? 'layoutSizingHorizontal' : 'layoutSizingVertical';",
    "      if (v === 'fill' && parentAuto) f[key] = 'FILL'; else if ((v === 'hug' || v == null) && (auto || f.type === 'TEXT')) f[key] = 'HUG'; else if (typeof v === 'number') { f[key] = 'FIXED'; } };",
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
    "        f.primaryAxisAlignItems = AX[L.justify || 'start']; f.counterAxisAlignItems = AX[L.align || 'start'] === 'SPACE_BETWEEN' ? 'MIN' : AX[L.align || 'start']; if (L.wrap && L.mode === 'row') f.layoutWrap = 'WRAP';",
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
    "    else if (n.type === 'instance' && made[n.ref]) { f = made[n.ref].createInstance(); }",
    "    else { f = figma.createFrame(); f.fills = []; }",
    "    f.name = n.name || n.type;",
    "    if (n.type !== 'line' && n.type !== 'text' && n.type !== 'icon' && n.type !== 'instance' && n.stroke && (n.strokeW == null || n.strokeW > 0)) { f.strokes = paint(n.stroke); f.strokeWeight = n.strokeW || 1; }",
    "    if ('cornerRadius' in f && n.radius != null && n.type !== 'ellipse') { f.cornerRadius = RAD(n.radius); if (typeof n.radius === 'string' && N['radius:' + n.radius]) ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach((k) => f.setBoundVariable(k, N['radius:' + n.radius])); }",
    "    if (n.opacity != null) f.opacity = n.opacity;",
    "    if (n.shadow && n.shadow !== 'none' && 'effects' in f) f.effects = [{ type: 'DROP_SHADOW', color: { r: 0.06, g: 0.09, b: 0.16, a: n.shadow === 'strong' ? 0.22 : 0.12 }, offset: { x: 0, y: n.shadow === 'strong' ? 8 : 2 }, radius: n.shadow === 'strong' ? 24 : 8, spread: 0, visible: true, blendMode: 'NORMAL' }];",
    "    const w = typeof n.w === 'number' ? n.w : (n.type === 'icon' ? 20 : f.width), h = typeof n.h === 'number' ? n.h : (n.type === 'icon' ? (typeof n.w === 'number' ? n.w : 20) : f.height);",
    "    if (n.type !== 'text' && 'resize' in f) { try { f.resize(Math.max(1, w), Math.max(n.type === 'line' ? 0 : 1, h)); } catch (e) {} }",
    "    if (parent) { parent.appendChild(f); if (!parentAuto) { f.x = n.x || 0; f.y = n.y || 0; } }",
    "    if (n.type === 'frame') { const L2 = n.layout || {}; for (const c of n.children || []) build(c, f, f.layoutMode && f.layoutMode !== 'NONE', L2.align === 'stretch'); }",
    "    sizing(f, n, parentAuto);",
    "    if (parentAuto && parentStretch && 'layoutAlign' in f) f.layoutAlign = 'STRETCH';",
    "    return f;",
    "  }",
    "  let x = 0;",
    "  for (const c of DATA.comps) {",
    "    const fr = build(c.tree, null, false, false); fr.name = c.name;",
    "    const comp = figma.createComponentFromNode(fr); comp.name = c.name + ' (' + c.id + ')'; comp.x = x; comp.y = 0; x += comp.width + 80; made[c.id] = comp;",
    "  }",
    "  figma.viewport.scrollAndZoomIntoView(page.children);",
    "  figma.notify('Planning Studio: 변수 ' + (Object.keys(V).length + Object.keys(N).length) + '개, 컴포넌트 ' + DATA.comps.length + '개를 만들었습니다');",
    "  if (typeof figma.closePlugin === 'function' && !globalThis.__scripter) figma.closePlugin();",
    "})();"
  ].join("\n");

  /** 내려받기용 Figma 플러그인 (Figma 데스크톱 ▸ 플러그인 ▸ 개발 ▸ manifest에서 플러그인 가져오기) */
  function figmaPlugin(ds, comps, opts) {
    var manifest = { name: "Planning Studio 디자인 시스템 가져오기", id: "planning-studio-ds-import", api: "1.0.0", main: "code.js", editorType: ["figma"], documentAccess: "dynamic-page" };
    return [{ name: "planning-figma-plugin/manifest.json", data: JSON.stringify(manifest, null, 2) }, { name: "planning-figma-plugin/code.js", data: figmaScript(ds, comps, opts) }];
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

  root.Frames = { html: html, node: node, walk: walk, find: find, nextId: nextId, tokensJson: tokensJson, figmaScript: figmaScript, figmaPlugin: figmaPlugin, figmaPrompt: figmaPrompt, COLOR_VAR: COLOR_VAR, COLOR_LABEL: COLOR_LABEL, SIZE_VAR: SIZE_VAR, color: color, fontName: fontName };
})(typeof window !== "undefined" ? window : globalThis);
