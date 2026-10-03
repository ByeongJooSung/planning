/*
 * 디자인 시스템 프레임 편집기 (피그마식, 전체 화면)
 *  - 도구: 선택 · 프레임 · 텍스트 · 사각형 · 원 · 선 · 아이콘 · 인스턴스(다른 컴포넌트)
 *  - 프레임은 오토 레이아웃(가로·세로, 간격, 패딩, 정렬, 줄바꿈) 또는 위치 지정(x·y)
 *  - 크기: 고정(px) · 내용에 맞춤(hug) · 채우기(fill). 색·글자 크기·모서리는 디자인 토큰에 연결
 *  - 텍스트를 props 이름(예: label)에 연결하면 화면설계서에서 그 값으로 바뀐다
 *  - 끌어서 옮기기(위치 지정 부모) · 순서 바꾸기(오토 레이아웃 부모) · 모서리 손잡이로 크기 · 되돌리기
 * FrameEdit.open(o) — o: {ds, comp:{id,name,category,description,tree,frameW}, comps, categories, editable, title, save(doc)→Promise(id), toast, onClose}
 */
(function (root) {
  "use strict";
  var F = root.Frames;
  var S = null;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var TYPE = { frame: "프레임", text: "텍스트", rect: "사각형", ellipse: "원", line: "선", icon: "아이콘", instance: "인스턴스" };
  var TOOLS = [["select", "선택", "V"], ["frame", "프레임", "F"], ["text", "텍스트", "T"], ["rect", "사각형", "R"], ["ellipse", "원", "O"], ["line", "선", "L"], ["icon", "아이콘", "I"], ["instance", "인스턴스", "C"]];
  var SIZES = ["display", "h1", "h2", "h3", "body", "small", "caption"];
  var SIZE_LABEL = { display: "디스플레이", h1: "제목 1", h2: "제목 2", h3: "제목 3", body: "본문", small: "작게", caption: "캡션" };

  function svg(name) {
    var a = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';
    var p = {
      select: '<path d="M5 3 L5 19 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18 13.5 Z" ' + a + "/>",
      frame: '<path d="M7 3v18M17 3v18M3 7h18M3 17h18" ' + a + "/>",
      text: '<path d="M5 6V4h14v2M12 4v16M9 20h6" ' + a + "/>",
      rect: '<rect x="4" y="6" width="16" height="12" rx="2" ' + a + "/>",
      ellipse: '<circle cx="12" cy="12" r="8" ' + a + "/>",
      line: '<path d="M4 20 L20 4" ' + a + "/>",
      icon: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z" ' + a + "/>",
      instance: '<path d="M12 3l9 9-9 9-9-9z" ' + a + '/><path d="M12 8l4 4-4 4-4-4z" ' + a + "/>"
    }[name];
    return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' + p + "</svg>";
  }

  // ── 열기·닫기 ───────────────────────────────
  function starter() {
    return { id: "root", type: "frame", name: "컴포넌트", w: "hug", h: "hug", layout: { mode: "row", gap: 8, pad: [10, 16, 10, 16], align: "center", justify: "start", wrap: false }, fill: "primary", radius: "md", children: [{ id: "t1", type: "text", name: "라벨", text: "버튼", size: "body", weight: 600, color: "onPrimary", bind: "label" }] };
  }
  function open(o) {
    if (S) close(true);
    var c = o.comp || {};
    var doc = { id: c.id || "", name: c.name || "", category: c.category || "content", description: c.description || "", frameW: c.frameW || 360,
      vars: [{ name: "기본", tree: c.tree ? clone(c.tree) : starter() }].concat((c.variantTrees || []).map(clone)) };
    S = { o: o, doc: doc, vi: 0, saved: JSON.stringify(doc), undo: [], redo: [], sel: doc.vars[0].tree.id, multi: [], hover: null, tool: "select", z: 1, tab: "props", drag: null, ai: { draft: "", busy: false, err: "", mode: "edit" } };
    var el = document.createElement("div");
    el.className = "fe fx";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", o.mode === "item" ? "화면설계서 항목 프레임 편집기" : "디자인 시스템 프레임 편집기");
    el.innerHTML = frame();
    document.body.appendChild(el);
    document.documentElement.classList.add("fe-open");
    S.el = el;
    S.view = el.querySelector(".fx-view");
    ["click", "input", "change", "dblclick", "pointerdown", "keydown"].forEach(function (t) { el.addEventListener(t, stop); });
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    el.addEventListener("focusin", onFocus);
    el.addEventListener("dblclick", onDbl);
    S.view.addEventListener("pointerdown", onDown);
    S.view.addEventListener("pointermove", onHover);
    S.view.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("resize", onResize);
    render();
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (S) drawOverlay(); });
  }
  function stop(ev) { ev.stopPropagation(); }
  function dirty() { return S && JSON.stringify(S.doc) !== S.saved; }
  function close(force) {
    if (!S) return;
    if (!force && dirty() && !window.confirm("저장하지 않은 변경이 있습니다. 닫을까요?")) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("beforeunload", onUnload);
    window.removeEventListener("resize", onResize);
    S.el.remove();
    document.documentElement.classList.remove("fe-open");
    var cb = S.o.onClose;
    S = null;
    if (cb) cb();
  }
  function onUnload(ev) { if (dirty()) { ev.preventDefault(); ev.returnValue = ""; } }
  function onResize() { if (S) drawOverlay(); }

  // ── 변경·되돌리기 ───────────────────────────
  function snap() { S.undo.push(JSON.stringify(S.doc)); if (S.undo.length > 150) S.undo.shift(); S.redo = []; }
  /** 지금 편집 중인 변형의 트리 */
  function T() { return S.doc.vars[S.vi].tree; }
  function setT(t) { S.doc.vars[S.vi].tree = t; }
  /** 선택한 노드 ID들 (기본 선택 + Shift로 더한 것) */
  function sels() { var out = S.sel ? [S.sel] : []; (S.multi || []).forEach(function (id) { if (out.indexOf(id) < 0 && F.find(T(), id)) out.push(id); }); return out; }
  function mut(fn) { snap(); fn(T()); render(); }
  function undo() { if (!S.undo.length) return; S.redo.push(JSON.stringify(S.doc)); S.doc = JSON.parse(S.undo.pop()); fixSel(); S.forceSide = true; render(); }
  function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.doc)); S.doc = JSON.parse(S.redo.pop()); fixSel(); S.forceSide = true; render(); }
  function fixSel() { if (S.vi >= S.doc.vars.length) S.vi = 0; if (!S.sel || !F.find(T(), S.sel)) S.sel = T().id; S.multi = (S.multi || []).filter(function (id) { return F.find(T(), id); }); }
  function cur() { var f = S.sel && F.find(T(), S.sel); return f ? f.node : null; }
  function parentOf(id) { var f = F.find(T(), id); return f ? f.parent : null; }
  function modeOf(n) { return n && n.layout ? n.layout.mode : "none"; }

  // ── 그리기 ──────────────────────────────────
  function frame() {
    var o = S.o, ed = o.editable !== false;
    var tools = TOOLS.map(function (t) { return '<button class="fe-t" data-fx-tool="' + t[0] + '" title="' + t[1] + " (" + t[2] + ')">' + svg(t[0]) + "<span>" + t[1] + "</span></button>"; }).join("");
    var item = o.mode === "item";
    return '<header class="fe-h"><div class="fe-title"><span class="fe-eyebrow">' + (item ? "화면설계서 항목" : "디자인 시스템") + " · 프레임 편집기 " + esc(o.title || "") + "</span>" +
      (ed ? '<input class="fe-title-in" data-fx-doc="name" aria-label="' + (item ? "항목명" : "컴포넌트 이름") + '" placeholder="' + (item ? "항목명 (예: 신청 목록)" : "컴포넌트 이름 (예: 기본 버튼)") + '" value="' + esc(S.doc.name) + '">' : "<b>" + esc(S.doc.name) + "</b>") +
      '</div><span class="fe-state" id="fx-state"></span><span class="fe-sp"></span>' +
      (ed ? '<button class="fe-b" data-fx-act="undo" title="되돌리기 (Ctrl+Z)">↶</button><button class="fe-b" data-fx-act="redo" title="다시 (Ctrl+Shift+Z)">↷</button><span class="fe-sep"></span>' : "") +
      '<button class="fe-b" data-fx-act="zout" title="축소">−</button><button class="fe-b fx-zv" data-fx-act="z100">100%</button><button class="fe-b" data-fx-act="zin" title="확대">+</button><button class="fe-b" data-fx-act="fit">맞춤</button>' +
      '<span class="fe-sep"></span>' + (ed && o.save ? '<button class="fe-b fe-primary" data-fx-act="save" title="저장 (Ctrl+S)">저장</button>' : "") +
      '<button class="fe-b fe-close" data-fx-act="close">닫기 ✕</button></header>' +
      '<div class="fe-body fx-body"><aside class="fe-tools" aria-label="도구">' + (ed ? tools : "") + "</aside>" +
      '<aside class="fx-layers" aria-label="레이어"><div class="fx-lh">레이어</div><div class="fx-ltree"></div></aside>' +
      '<div class="fx-mid"><div class="fx-vbar" aria-label="변형"></div><div class="fx-view" tabindex="0" aria-label="캔버스"><div class="fx-canvas"><div class="fx-scale"></div><div class="fx-ov"></div><textarea class="fx-inline" hidden aria-label="텍스트 편집"></textarea></div></div></div>' +
      '<aside class="fe-side"><div class="fe-tabs" role="tablist"><button data-fx-tab="props" role="tab">속성</button><button data-fx-tab="ai" role="tab">✦ AI</button><button data-fx-tab="export" role="tab">Figma</button></div><div class="fe-panel"></div></aside></div>' +
      '<footer class="fe-f" id="fx-hint"></footer>';
  }
  function renderVbar() {
    var b = S.el.querySelector(".fx-vbar"), ed = S.o.editable !== false;
    if (S.o.mode === "item") { b.hidden = true; return; }
    b.innerHTML = '<span class="fx-vl">변형</span>' + S.doc.vars.map(function (v, i) { return '<button class="fx-vt" data-fx-v="' + i + '" aria-pressed="' + (i === S.vi) + '">' + esc(v.name) + "</button>"; }).join("") +
      (ed ? '<button class="fx-vt add" data-fx-act="vadd" title="지금 변형을 복제해 새 변형 만들기">+ 변형</button>' : "") +
      (ed && S.vi > 0 ? '<span class="fx-vedit"><input data-fx-vname value="' + esc(S.doc.vars[S.vi].name) + '" aria-label="변형 이름" maxlength="40"><button class="fe-b danger" data-fx-act="vdel">이 변형 삭제</button></span>' : "") +
      '<span class="fx-vhint">화면설계서에서 항목 props의 variant로 고릅니다 (예: 기본 · 비활성 · 오류)</span>';
  }
  function render() {
    if (!S) return;
    renderVbar();
    renderCanvas();
    renderLayers();
    renderSide();
    var st = S.el.querySelector("#fx-state");
    if (st) { st.textContent = dirty() ? "● 저장 안 됨" : "저장됨"; st.className = "fe-state" + (dirty() ? " on" : ""); }
    S.el.querySelectorAll("[data-fx-tool]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-fx-tool") === S.tool)); });
    S.el.querySelectorAll("[data-fx-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-fx-tab") === S.tab)); });
    var u = S.el.querySelector('[data-fx-act="undo"]'), r = S.el.querySelector('[data-fx-act="redo"]');
    if (u) u.disabled = !S.undo.length;
    if (r) r.disabled = !S.redo.length;
    var hint = S.el.querySelector("#fx-hint");
    if (hint) hint.textContent = S.tool !== "select" ? "선택한 프레임 안(또는 선택한 요소 다음)에 " + TYPE[S.tool] + "을(를) 넣으려면 캔버스나 레이어를 누르세요 · Esc 취소" :
      "누르면 선택 · 끌어서 옮기기(위치 지정) / 순서 바꾸기(오토 레이아웃) · 모서리 손잡이로 크기 · 두 번 눌러 글자 고치기 · Shift+A 오토 레이아웃 · Ctrl+D 복제 · Esc 상위 선택";
  }
  function renderCanvas() {
    var sc = S.el.querySelector(".fx-scale"), o = S.o;
    var rootFill = T().w === "fill";
    sc.innerHTML = '<div class="wf fx-wf ' + (o.cls || "") + '" style="' + o.vars + '"><div class="fx-board"' + (rootFill ? ' style="width:' + S.doc.frameW + 'px"' : "") + ">" + F.html(T(), { ids: true, ds: o.ds, comps: o.comps, props: {} }) + "</div></div>";
    sc.style.transform = "scale(" + S.z + ")";
    var wf = sc.firstElementChild;
    var cv = S.el.querySelector(".fx-canvas");
    cv.style.width = Math.ceil(wf.offsetWidth * S.z + 160) + "px";
    cv.style.height = Math.ceil(wf.offsetHeight * S.z + 160) + "px";
    var zv = S.el.querySelector(".fx-zv");
    if (zv) zv.textContent = Math.round(S.z * 100) + "%";
    drawOverlay();
  }
  function elOf(id) { return S.el.querySelector('.fx-scale [data-fid="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'); }
  function boxOf(id) {
    var e = elOf(id), cv = S.el.querySelector(".fx-canvas");
    if (!e) return null;
    var r = e.getBoundingClientRect(), c = cv.getBoundingClientRect();
    return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
  }
  function drawOverlay() {
    if (!S) return;
    var ov = S.el.querySelector(".fx-ov"), h = "", n = cur();
    if (S.hover && S.hover !== S.sel) { var hb = boxOf(S.hover); if (hb) h += '<div class="fx-hov" style="left:' + hb.x + "px;top:" + hb.y + "px;width:" + hb.w + "px;height:" + hb.h + 'px"></div>'; }
    sels().slice(1).forEach(function (id) { var mb = boxOf(id); if (mb) h += '<div class="fx-sel multi" style="left:' + mb.x + "px;top:" + mb.y + "px;width:" + mb.w + "px;height:" + mb.h + 'px"></div>'; });
    if (n) {
      var b = boxOf(n.id);
      if (b) {
        var ed = S.o.editable !== false;
        h += '<div class="fx-sel" style="left:' + b.x + "px;top:" + b.y + "px;width:" + b.w + "px;height:" + b.h + 'px"><span class="fx-tag">' + esc(n.name || TYPE[n.type]) + " · " + Math.round(b.w / S.z) + "×" + Math.round(b.h / S.z) + "</span>" +
          (ed && n.type !== "line" ? '<i class="fx-hd e" data-fx-rs="e"></i><i class="fx-hd s" data-fx-rs="s"></i><i class="fx-hd se" data-fx-rs="se"></i>' : "") + "</div>";
        // 오토 레이아웃 프레임: 패딩·간격 보조선
        if (n.type === "frame" && modeOf(n) !== "none") {
          var p = n.layout.pad || [0, 0, 0, 0], z = S.z;
          h += '<div class="fx-pad" style="left:' + (b.x + p[3] * z) + "px;top:" + (b.y + p[0] * z) + "px;width:" + Math.max(0, b.w - (p[1] + p[3]) * z) + "px;height:" + Math.max(0, b.h - (p[0] + p[2]) * z) + 'px"></div>';
        }
      }
    }
    if (S.drag && S.drag.kind === "reorder" && S.drag.line) { var l = S.drag.line; h += '<div class="fx-ins" style="left:' + l.x + "px;top:" + l.y + "px;width:" + l.w + "px;height:" + l.h + 'px"></div>'; }
    ov.innerHTML = h;
  }
  function fit() {
    if (!S) return;
    var v = S.view;
    S.z = 1;
    renderCanvas();
    var wf = S.el.querySelector(".fx-wf"); // 다시 그린 뒤의 요소로 재야 한다
    if (!wf) return;
    var z = Math.min(2, (v.clientWidth - 200) / Math.max(1, wf.offsetWidth), (v.clientHeight - 200) / Math.max(1, wf.offsetHeight));
    S.z = Math.max(0.25, Math.round(z * 20) / 20);
    renderCanvas();
  }
  function zoomTo(z) { S.z = Math.max(0.25, Math.min(4, z)); renderCanvas(); }

  // ── 레이어 ─────────────────────────────────
  function renderLayers() {
    var box = S.el.querySelector(".fx-ltree"), ed = S.o.editable !== false;
    var rows = [];
    (function walk(n, d, parent) {
      var kids = n.children || [];
      rows.push('<div class="fx-lr' + (n.id === S.sel ? " on" : sels().indexOf(n.id) >= 0 ? " on2" : "") + (n.hidden ? " hid" : "") + '" data-fx-sel="' + esc(n.id) + '" style="padding-left:' + (8 + d * 14) + 'px"><span class="fx-li">' + svg(n.type === "frame" && modeOf(n) === "row" ? "frame" : n.type) + "</span><span class=\"fx-ln\">" + esc(n.name || (n.type === "text" ? (n.text || "").slice(0, 20) : TYPE[n.type])) + "</span>" +
        (n.bind ? '<em class="fx-bind">{' + esc(n.bind) + "}</em>" : "") + (n.type === "frame" && modeOf(n) !== "none" ? '<em class="fx-al">' + (modeOf(n) === "row" ? "→" : "↓") + "</em>" : "") +
        (n.hidden ? '<em class="fx-hid">숨김</em>' : "") + (ed && parent ? '<span class="fx-lb"><button data-fx-act="hide" data-fx-id="' + esc(n.id) + '" title="' + (n.hidden ? "보이기" : "숨기기") + '">' + (n.hidden ? "◌" : "◉") + '</button><button data-fx-act="up" data-fx-id="' + esc(n.id) + '" title="위로">↑</button><button data-fx-act="down" data-fx-id="' + esc(n.id) + '" title="아래로">↓</button><button data-fx-act="outdent" data-fx-id="' + esc(n.id) + '" title="상위 프레임 밖으로">⇤</button><button data-fx-act="indent" data-fx-id="' + esc(n.id) + '" title="바로 위 프레임 안으로">⇥</button></span>' : "") + "</div>");
      kids.forEach(function (c) { walk(c, d + 1, n); });
    })(T(), 0, null);
    box.innerHTML = rows.join("");
  }

  // ── 속성 패널 ───────────────────────────────
  function opt(v, t, curv) { return '<option value="' + esc(v) + '"' + (String(v) === String(curv == null ? "" : curv) ? " selected" : "") + ">" + esc(t) + "</option>"; }
  function colorCtl(key, val, label, allowNone) {
    var isHex = /^#[0-9A-Fa-f]{6}$/.test(val || "");
    var tokens = Object.keys(F.COLOR_VAR).map(function (k) { return opt(k, F.COLOR_LABEL[k] + " (" + k + ")", isHex ? "" : val); }).join("");
    return '<div class="fx-color"><label>' + esc(label) + '<select data-fx="' + key + '">' + (allowNone ? opt("", "(없음)", val || "") : "") + opt("transparent", "투명", val) + tokens + opt("#custom", "직접 지정 #색", isHex ? "#custom" : "") + "</select></label>" +
      '<input type="color" data-fx="' + key + '#hex" value="' + esc(isHex ? val : hexOfToken(val)) + '" title="직접 색 지정"' + (isHex ? "" : ' class="dim"') + "></div>";
  }
  function hexOfToken(v) { var t = S.o.ds && S.o.ds.tokens && S.o.ds.tokens.color; return t && t[v] ? t[v] : "#888888"; }
  function sizeCtl(key, val, label) {
    var mode = val === "hug" || val === "fill" ? val : val == null ? "hug" : "fixed";
    return '<label class="fx-size">' + esc(label) + '<span><select data-fx="' + key + ':mode">' + opt("hug", "내용에 맞춤", mode) + opt("fill", "채우기", mode) + opt("fixed", "고정", mode) + '</select><input type="number" min="0" data-fx="' + key + ':px" value="' + (typeof val === "number" ? val : "") + '"' + (mode === "fixed" ? "" : " disabled") + ' placeholder="px"></span></label>';
  }
  function renderSide() {
    var p = S.el.querySelector(".fe-panel"), n = cur(), ed = S.o.editable !== false;
    if (document.activeElement && p.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== "color" && !S.forceSide) return;
    S.forceSide = false;
    var h = "";
    if (S.tab === "export") h = exportPanel();
    else if (S.tab === "ai") h = aiPanel();
    else if (!n) h = docPanel();
    else if (sels().length > 1) h = multiPanel();
    else {
      var par = parentOf(n.id), pm = modeOf(par), isRoot = n.id === T().id;
      h = '<h3>' + esc(TYPE[n.type]) + ' <small class="mono">' + esc(n.id) + "</small></h3>" +
        '<label>이름<input data-fx="name" value="' + esc(n.name || "") + '" placeholder="' + esc(TYPE[n.type]) + '"></label>';
      if (n.type !== "line") h += '<div class="fx-row2">' + sizeCtl("w", n.w, "너비") + (n.type === "text" || n.type === "icon" ? "" : sizeCtl("h", n.h, "높이")) + "</div>";
      if (par && pm === "none") h += '<div class="fx-row2"><label>X<input type="number" data-fx="x" value="' + (n.x || 0) + '"></label><label>Y<input type="number" data-fx="y" value="' + (n.y || 0) + '"></label></div>';
      if (n.type === "frame") {
        var L = n.layout || { mode: "none", gap: 0, pad: [0, 0, 0, 0], align: "start", justify: "start", wrap: false };
        h += '<div class="fx-sec"><b>오토 레이아웃</b><div class="fx-seg">' + [["none", "없음"], ["row", "→ 가로"], ["column", "↓ 세로"]].map(function (m) { return '<button data-fx-mode="' + m[0] + '" aria-pressed="' + (L.mode === m[0]) + '">' + m[1] + "</button>"; }).join("") + "</div>" +
          (L.mode !== "none" ? '<div class="fx-row2"><label>간격<input type="number" min="0" data-fx="gap" value="' + (L.gap || 0) + '"></label><label class="fe-chk"><input type="checkbox" data-fx="wrap"' + (L.wrap ? " checked" : "") + "> 줄바꿈</label></div>" +
            '<label>정렬 (주축)<span class="fx-seg sm">' + [["start", "시작"], ["center", "가운데"], ["end", "끝"], ["between", "양끝"]].map(function (m) { return '<button data-fx-justify="' + m[0] + '" aria-pressed="' + (L.justify === m[0]) + '">' + m[1] + "</button>"; }).join("") + "</span></label>" +
            '<label>정렬 (교차축)<span class="fx-seg sm">' + [["start", "시작"], ["center", "가운데"], ["end", "끝"], ["stretch", "늘이기"]].map(function (m) { return '<button data-fx-align="' + m[0] + '" aria-pressed="' + (L.align === m[0]) + '">' + m[1] + "</button>"; }).join("") + "</span></label>" : "") +
          '<label>패딩 (위·오른쪽·아래·왼쪽)<span class="fx-pad4">' + [0, 1, 2, 3].map(function (i) { return '<input type="number" min="0" data-fx="pad' + i + '" value="' + ((L.pad || [0, 0, 0, 0])[i] || 0) + '">'; }).join("") + "</span></label>" +
          '<label class="fe-chk"><input type="checkbox" data-fx="clip"' + (n.clip ? " checked" : "") + "> 넘치는 내용 자르기</label></div>";
      }
      if (n.type === "frame" || n.type === "rect" || n.type === "ellipse") {
        h += '<div class="fx-sec"><b>채우기 · 테두리</b>' + colorCtl("fill", n.fill, "채우기", true) + colorCtl("stroke", n.stroke, "테두리", true) +
          '<div class="fx-row2"><label>테두리 두께<input type="number" min="0" max="20" data-fx="strokeW" value="' + (n.strokeW == null ? (n.stroke ? 1 : 0) : n.strokeW) + '"></label>' +
          (n.type !== "ellipse" ? '<label>모서리<select data-fx="radius">' + opt("", "없음", n.radius == null ? "" : "x") + opt("sm", "토큰 sm", n.radius) + opt("md", "토큰 md", n.radius) + opt("lg", "토큰 lg", n.radius) + opt("full", "둥글게(full)", n.radius) + opt("#px", "직접(px)", typeof n.radius === "number" ? "#px" : "") + "</select></label>" : "") + "</div>" +
          (typeof n.radius === "number" ? '<label>모서리(px)<input type="number" min="0" data-fx="radiusPx" value="' + n.radius + '"></label>' : "") +
          '<div class="fx-row2"><label>그림자<select data-fx="shadow">' + opt("none", "없음", n.shadow || "none") + opt("soft", "약하게", n.shadow) + opt("strong", "강하게", n.shadow) + '</select></label><label>불투명도<input type="number" min="0" max="100" data-fx="opacity" value="' + Math.round((n.opacity == null ? 1 : n.opacity) * 100) + '"></label></div></div>';
      }
      if (n.type === "line") h += '<div class="fx-sec"><b>선</b>' + colorCtl("stroke", n.stroke || "border", "색", false) + '<label>두께<input type="number" min="1" max="20" data-fx="strokeW" value="' + (n.strokeW || 1) + '"></label></div>';
      if (n.type === "text") {
        var isTok = typeof n.size !== "number";
        h += '<div class="fx-sec"><b>텍스트</b><label>내용<textarea rows="3" data-fx="text">' + esc(n.text || "") + "</textarea></label>" +
          '<div class="fx-row2"><label>크기<select data-fx="size">' + SIZES.map(function (k) { return opt(k, SIZE_LABEL[k] + " (" + k + ")", isTok ? n.size || "body" : ""); }).join("") + opt("#px", "직접(px)", isTok ? "" : "#px") + "</select></label>" +
          '<label>굵기<select data-fx="weight">' + [[400, "보통"], [500, "중간"], [600, "약간 굵게"], [700, "굵게"]].map(function (w) { return opt(w[0], w[1], n.weight || 400); }).join("") + "</select></label></div>" +
          (isTok ? "" : '<label>크기(px)<input type="number" min="6" max="200" data-fx="sizePx" value="' + n.size + '"></label>') +
          colorCtl("color", n.color || "text", "글자 색", false) +
          '<label>정렬<span class="fx-seg sm">' + [["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]].map(function (m) { return '<button data-fx-talign="' + m[0] + '" aria-pressed="' + ((n.talign || "left") === m[0]) + '">' + m[1] + "</button>"; }).join("") + "</span></label>" +
          '<label>props 연결 <small>(화면설계서에서 이 이름의 값으로 바뀜)</small><input data-fx="bind" value="' + esc(n.bind || "") + '" placeholder="예: label, title, count"></label></div>';
      }
      if (n.type === "icon") {
        var names = Object.keys((root.Wire && root.Wire.iconLabel) || {});
        h += '<div class="fx-sec"><b>아이콘</b><label>모양<select data-fx="icon">' + names.map(function (k) { return opt(k, root.Wire.iconLabel[k] + " (" + k + ")", n.icon); }).join("") + "</select></label>" + colorCtl("color", n.color || "text", "색", false) + "</div>";
      }
      if (n.type === "instance") {
        var others = (S.o.comps || []).filter(function (c) { return c.id !== S.doc.id; });
        var refc = others.find(function (c) { return c.id === n.ref; }), vnames = refc && refc.variantTrees ? refc.variantTrees.map(function (v) { return v.name; }) : [];
        var rb = refc ? F.binds(F.treeOf(refc, n.variant)) : [];
        h += '<div class="fx-sec"><b>인스턴스</b><label>컴포넌트<select data-fx="ref">' + others.map(function (c) { return opt(c.id, c.name + " (" + c.id + ")" + (c.tree ? " ✎" : ""), n.ref); }).join("") + "</select></label>" +
          (vnames.length ? '<label>변형<select data-fx="variant">' + opt("", "기본", n.variant || "") + vnames.map(function (v) { return opt(v, v, n.variant); }).join("") + "</select></label>" : "") +
          (rb.length ? '<b class="fx-sub">글자 덮어쓰기</b>' + rb.map(function (k) { return '<label>' + esc(k) + '<input data-fx-prop="' + esc(k) + '" value="' + esc((n.props || {})[k] || "") + '" placeholder="원본 글자 그대로"></label>'; }).join("") : '<p class="fe-note">원본에 props 연결된 텍스트가 없어 글자를 덮어쓸 수 없습니다.</p>') +
          colorCtl("fill", n.fill, "채우기 덮어쓰기", true) +
          '<p class="fe-note">원본 컴포넌트를 고치면 덮어쓰지 않은 부분은 함께 바뀝니다.</p></div>';
      }
      if (!isRoot) h += '<label class="fe-chk"><input type="checkbox" data-fx="hidden"' + (n.hidden ? " checked" : "") + "> 숨김 (이 변형에서 안 보이게)</label>";
      if (ed) h += '<div class="fx-acts">' + (isRoot ? "" : '<button class="fe-b" data-fx-act="dup">복제 (Ctrl+D)</button>') + '<button class="fe-b" data-fx-act="wrap">프레임으로 감싸기 (Ctrl+Alt+G)</button>' + (isRoot ? "" : '<button class="fe-b" data-fx-act="parent">상위 선택 (Esc)</button><button class="fe-b danger" data-fx-act="del">삭제 (Delete)</button>') + "</div>";
      if (isRoot) h += docPanel();
    }
    p.innerHTML = h;
  }
  function multiPanel() {
    var ids = sels(), ed = S.o.editable !== false;
    var abs = ids.every(function (id) { var f = F.find(T(), id); return f && f.parent && modeOf(f.parent) === "none"; });
    return "<h3>" + ids.length + "개 선택</h3><p class=\"fe-note\">" + ids.map(function (id) { var f = F.find(T(), id); return esc(f ? f.node.name || TYPE[f.node.type] : id); }).join(", ") + "</p>" +
      (ed ? '<div class="fx-acts"><button class="fe-b fe-primary" data-fx-act="group">프레임으로 묶기 (Ctrl+G)</button><button class="fe-b" data-fx-act="dup">모두 복제</button><button class="fe-b danger" data-fx-act="del">모두 삭제</button></div>' +
        (abs ? '<div class="fx-sec"><b>정렬</b><div class="fx-seg sm"><button data-fx-act="al-l">왼쪽</button><button data-fx-act="al-c">가운데</button><button data-fx-act="al-r">오른쪽</button></div><div class="fx-seg sm"><button data-fx-act="al-t">위</button><button data-fx-act="al-m">가운데</button><button data-fx-act="al-b">아래</button></div></div>' : '<p class="fe-note">정렬은 위치 지정 프레임 안 요소에 씁니다. 오토 레이아웃 안에서는 부모 프레임의 정렬을 바꾸세요.</p>') +
        '<div class="fx-sec"><b>한꺼번에 바꾸기</b>' + colorCtl("m:fill", "", "채우기", true) + colorCtl("m:color", "", "글자 색", true) + "</div>" : "") +
      '<p class="fe-note">Shift+누르기로 더하거나 뺍니다.</p>';
  }
  function aiPanel() {
    var ai = S.o.ai || {}, A = S.ai, ed = S.o.editable !== false;
    return "<h3>✦ AI로 그리기·고치기</h3>" +
      '<p class="fe-note">디자인 토큰·쓸 수 있는 컴포넌트·아이콘·노드 규칙을 함께 보내, 오토 레이아웃과 토큰을 쓰는 컴포넌트를 그립니다. 결과는 캔버스에 바로 들어가고(되돌리기 가능) 저장해야 반영됩니다.</p>' +
      '<div class="fx-seg sm"><button data-fx-aimode="new" aria-pressed="' + (A.mode === "new") + '">새로 그리기</button><button data-fx-aimode="edit" aria-pressed="' + (A.mode !== "new") + '">지금 모양 고치기</button></div>' +
      (A.mode !== "new" && S.sel && S.sel !== T().id ? '<label class="fm-check fx-only"><input type="checkbox" data-fx-aionly' + (A.only ? " checked" : "") + '> 선택한 요소만 고치기 — <b>' + esc((cur() || {}).name || TYPE[(cur() || {}).type] || S.sel) + '</b> <span class="fe-note">이 요소 안만 바뀌고 나머지는 그대로 둡니다</span></label>' : "") +
      '<label>요청<textarea rows="5" data-fx-ai placeholder="' + (A.mode === "new" ? "예: 공지 알림 카드 — 아이콘·제목·날짜·더보기 버튼, 변형: 기본·중요(빨간 테두리)" : "예: 버튼 높이를 48로, 비활성 변형 추가") + '">' + esc(A.draft) + "</textarea></label>" +
      (A.busy ? '<div class="fe-busy"><span class="fe-spin"></span>AI가 그리는 중… <button class="fe-b" data-fx-act="ai-stop">멈춤</button></div>' :
        (ed ? '<button class="fe-b wide fe-primary" data-fx-act="ai-run"' + (ai.available ? "" : ' disabled title="AI 연결이 없습니다 — 아래 claude.ai로 만들기를 쓰거나 AI 설정에서 연결을 등록하세요"') + ">✦ AI로 " + (A.mode === "new" ? "그리기" : "고치기") + (ai.label ? " · " + esc(ai.label) : "") + "</button>" : "")) +
      (A.err ? '<p class="fe-err" role="alert">' + esc(A.err) + "</p>" : "") +
      (ed ? '<details class="gen-claude"><summary><span class="cl-logo">✳</span> Claude 구독(claude.ai)으로 만들기</summary><ol class="cl-steps"><li><button class="fe-b" data-fx-act="ai-copy">① 프롬프트 복사 · claude.ai 열기</button></li><li><label>② Claude 답 붙여 넣기<textarea rows="4" class="fx-paste" placeholder="Claude가 준 JSON(코드 블록 포함) 그대로"></textarea></label><button class="fe-b" data-fx-act="ai-paste">붙여 넣은 결과 적용</button></li></ol></details>' : "");
  }
  function itemPanel() {
    return (S.o.note ? '<p class="fe-note fx-warn">' + esc(S.o.note) + "</p>" : "") +
      '<div class="fx-sec"><b>화면설계서 항목</b>' + (T().w === "fill" ? '<label>미리보기 폭(px)<input type="number" min="40" max="1920" data-fx-doc="frameW" value="' + S.doc.frameW + '"></label>' : "") +
      '<div class="fe-help"><b>쓰는 법</b><ol><li>이 화면의 이 항목 모양만 바뀝니다. 디자인 시스템 컴포넌트는 그대로입니다.</li><li>글자는 두 번 눌러 바로 고치고, 표·목록의 행·열은 프레임을 복제(Ctrl+D)하거나 지워 늘리고 줄입니다.</li><li>‘인스턴스’ 도구로 디자인 시스템 컴포넌트(버튼·뱃지 등)를 넣을 수 있습니다.</li><li>저장하면 화면설계서·프로토타입에 바로 반영되고, 설명 번호·Description은 그대로 남습니다.</li></ol></div></div>';
  }
  function docPanel() {
    if (S.o.mode === "item") return itemPanel();
    var d = S.doc, binds = [];
    S.doc.vars.forEach(function (v) { F.walk(v.tree, function (n) { if (n.bind && binds.indexOf(n.bind) < 0) binds.push(n.bind); }); });
    return (S.o.note ? '<p class="fe-note fx-warn">' + esc(S.o.note) + "</p>" : "") + '<div class="fx-sec"><b>컴포넌트</b><label>분류<select data-fx-doc="category">' + (S.o.categories || []).map(function (c) { return opt(c[0], c[1], d.category); }).join("") + "</select></label>" +
      '<label>설명<textarea rows="2" data-fx-doc="description" placeholder="언제 쓰는 컴포넌트인지">' + esc(d.description) + "</textarea></label>" +
      (T().w === "fill" ? '<label>미리보기 폭(px)<input type="number" min="40" max="1920" data-fx-doc="frameW" value="' + d.frameW + '"></label>' : "") +
      '<p class="fe-note">ID: <span class="mono">' + esc(d.id || "(저장하면 정해짐)") + "</span>" + (binds.length ? " · props: " + binds.map(function (b) { return "<code>" + esc(b) + "</code>"; }).join(" ") : " · props 연결 없음") + "</p>" +
      '<div class="fe-help"><b>쓰는 법</b><ol><li>왼쪽 도구로 프레임·텍스트·도형을 넣으면 선택한 프레임 안에 들어갑니다.</li><li>프레임의 오토 레이아웃(가로·세로)·간격·패딩·정렬로 배치하고, 크기는 내용에 맞춤·채우기·고정 중에 고릅니다.</li><li>색·글자 크기·모서리는 토큰으로 고르면 디자인 시스템 토큰을 바꿀 때 함께 바뀝니다.</li><li>텍스트의 ‘props 연결’에 label처럼 이름을 주면 화면설계서 항목 값으로 글자가 바뀝니다.</li><li>저장하면 화면설계서·프로토타입에서 이 컴포넌트를 고를 수 있습니다.</li></ol></div></div>';
  }
  function exportPanel() {
    return "<h3>Figma · 내보내기</h3>" +
      '<button class="fe-b wide" data-fx-act="x-script">Figma 플러그인 스크립트 복사 <small>Figma ▸ 플러그인 ▸ Scripter에 붙여 넣고 실행 — 오토 레이아웃·토큰 변수 그대로</small></button>' +
      '<button class="fe-b wide" data-fx-act="x-plugin">Figma 플러그인 내려받기 (.zip) <small>Figma 데스크톱 ▸ 플러그인 ▸ 개발 ▸ manifest에서 가져오기</small></button>' +
      '<button class="fe-b wide" data-fx-act="x-prompt">Figma AI 프롬프트 복사 <small>Figma MCP가 연결된 Claude에 붙여 넣기</small></button>' +
      '<button class="fe-b wide" data-fx-act="x-json">노드 JSON 복사</button>' +
      '<p class="fe-note">저장하지 않은 지금 모양 그대로 내보냅니다. 인스턴스로 쓴 다른 컴포넌트도 함께 들어갑니다. 디자인 시스템 전체(토큰·모든 컴포넌트)는 디자인 시스템 화면의 ‘Figma로 내보내기’에서 받습니다.</p>';
  }

  // ── 이벤트 ──────────────────────────────────
  function onClick(ev) {
    var b = ev.target.closest && ev.target.closest("button, [data-fx-sel]");
    if (!b || !S) return;
    var tool = b.getAttribute("data-fx-tool"), tab = b.getAttribute("data-fx-tab"), act = b.getAttribute("data-fx-act"), sel = b.getAttribute("data-fx-sel"), vv = b.getAttribute("data-fx-v");
    var am = b.getAttribute("data-fx-aimode");
    if (am) { S.ai.mode = am; S.forceSide = true; renderSide(); return; }
    if (vv != null) { S.vi = Number(vv); S.sel = T().id; S.multi = []; S.forceSide = true; render(); return; }
    if (tool) { S.tool = S.tool === tool && tool !== "select" ? "select" : tool; if (S.tool !== "select" && S.tool !== "instance") { addNode(S.tool); S.tool = "select"; } else if (S.tool === "instance") { addNode("instance"); S.tool = "select"; } render(); return; }
    if (tab) { S.tab = tab; S.forceSide = true; renderSide(); render(); return; }
    if (act) { action(act, b.getAttribute("data-fx-id")); return; }
    var m = b.getAttribute("data-fx-mode"), j = b.getAttribute("data-fx-justify"), a = b.getAttribute("data-fx-align"), ta = b.getAttribute("data-fx-talign");
    if (m || j || a || ta) {
      var n = cur();
      mut(function () {
        if (ta) { n.talign = ta; return; }
        n.layout = n.layout || { mode: "none", gap: 0, pad: [0, 0, 0, 0], align: "start", justify: "start", wrap: false };
        if (m) {
          if (m === "none" && n.layout.mode !== "none") (n.children || []).forEach(function (c, i) { var bx = boxOf(c.id), pb = boxOf(n.id); c.x = bx && pb ? Math.round((bx.x - pb.x) / S.z) : 16; c.y = bx && pb ? Math.round((bx.y - pb.y) / S.z) : 16 + i * 30; });
          if (m !== "none") (n.children || []).forEach(function (c) { delete c.x; delete c.y; });
          n.layout.mode = m;
        }
        if (j) n.layout.justify = j;
        if (a) n.layout.align = a;
      });
      S.forceSide = true; renderSide();
      return;
    }
    if (sel) { if (ev.shiftKey && S.sel && sel !== S.sel) { var mi = S.multi.indexOf(sel); if (mi >= 0) S.multi.splice(mi, 1); else S.multi.push(sel); } else { S.sel = sel; S.multi = []; } S.forceSide = true; render(); }
  }
  function onFocus(ev) { if (ev.target.getAttribute && (ev.target.getAttribute("data-fx") || ev.target.getAttribute("data-fx-doc") || ev.target.hasAttribute("data-fx-vname"))) S.fieldSnap = true; }
  function onInput(ev) {
    var t = ev.target, k = t.getAttribute("data-fx"), dk = t.getAttribute("data-fx-doc");
    if (t.classList.contains("fx-inline")) return;
    if (t.hasAttribute("data-fx-vname")) {
      var nm = t.value.trim();
      if (!nm || S.doc.vars.some(function (v, i) { return i !== S.vi && v.name === nm; })) { t.classList.add("bad"); return; }
      t.classList.remove("bad");
      if (S.fieldSnap) { snap(); S.fieldSnap = false; }
      S.doc.vars[S.vi].name = nm;
      S.el.querySelectorAll(".fx-vt")[S.vi].textContent = nm;
      return;
    }
    if (t.getAttribute("data-fx-ai") != null) { S.ai.draft = t.value; return; }
    if (t.getAttribute("data-fx-aionly") != null) { S.ai.only = t.checked; return; }
    if (t.getAttribute("data-fx-prop") != null) { var inn = cur(); if (inn) { if (S.fieldSnap) { snap(); S.fieldSnap = false; } inn.props = inn.props || {}; if (t.value === "") delete inn.props[t.getAttribute("data-fx-prop")]; else inn.props[t.getAttribute("data-fx-prop")] = t.value; if (!Object.keys(inn.props).length) delete inn.props; renderCanvas(); } return; }
    if (!k && !dk) return;
    if (t.tagName === "SELECT" || t.type === "checkbox") return;
    if (S.fieldSnap) { snap(); S.fieldSnap = false; }
    if (dk) { S.doc[dk] = dk === "frameW" ? Math.max(40, Number(t.value) || 360) : t.value; }
    else apply(k, t.type === "color" ? t.value.toUpperCase() : t.value, t);
    renderCanvas(); renderLayers();
    var st = S.el.querySelector("#fx-state");
    if (st) { st.textContent = dirty() ? "● 저장 안 됨" : "저장됨"; st.className = "fe-state" + (dirty() ? " on" : ""); }
  }
  function onChange(ev) {
    var t = ev.target, k = t.getAttribute("data-fx"), dk = t.getAttribute("data-fx-doc");
    if (!(t.tagName === "SELECT" || t.type === "checkbox" || t.type === "color")) return;
    if (dk) { snap(); S.doc[dk] = t.value; render(); return; }
    if (!k) return;
    if (t.type === "color") { S.forceSide = true; renderSide(); return; }
    mut(function () { apply(k, t.type === "checkbox" ? t.checked : t.value, t); });
    S.forceSide = true; renderSide();
  }
  /** 속성 하나 적용 */
  function apply(k, v, t) {
    var n = cur();
    if (!n) return;
    var num = function (x) { var y = Number(x); return isFinite(y) ? y : 0; };
    if (k === "name") { if (v) n.name = v; else delete n.name; return; }
    if (/^[wh]:mode$/.test(k)) { var ax = k[0]; if (v === "fixed") { var bx = boxOf(n.id); n[ax] = bx ? Math.round((ax === "w" ? bx.w : bx.h) / S.z) : 100; } else n[ax] = v; return; }
    if (/^[wh]:px$/.test(k)) { n[k[0]] = Math.max(0, num(v)); return; }
    if (k === "x" || k === "y") { n[k] = Math.round(num(v)); return; }
    if (k === "gap") { n.layout.gap = Math.max(0, num(v)); return; }
    if (/^pad[0-3]$/.test(k)) { n.layout = n.layout || { mode: "none", gap: 0, pad: [0, 0, 0, 0], align: "start", justify: "start", wrap: false }; n.layout.pad = (n.layout.pad || [0, 0, 0, 0]).slice(); n.layout.pad[Number(k[3])] = Math.max(0, num(v)); return; }
    if (k === "wrap") { n.layout.wrap = !!v; return; }
    if (k === "clip") { if (v) n.clip = true; else delete n.clip; return; }
    if (/^m:(fill|color)(#hex)?$/.test(k)) {
      var key = k.slice(2).replace("#hex", ""), val = /#hex$/.test(k) ? String(v).toUpperCase() : v === "#custom" ? (S.el.querySelector('[data-fx="m:' + key + '#hex"]') || {}).value : v;
      sels().forEach(function (id) { var f = F.find(T(), id); if (!f) return; var x = f.node; if (key === "fill" && /frame|rect|ellipse|instance/.test(x.type)) { if (val) x.fill = val; else delete x.fill; } if (key === "color" && /text|icon/.test(x.type)) { if (val) x.color = val; else delete x.color; } });
      return;
    }
    if (k === "fill" || k === "stroke" || k === "color") {
      if (v === "#custom") { var hx = S.el.querySelector('[data-fx="' + k + '#hex"]'); n[k] = hx ? hx.value.toUpperCase() : "#888888"; }
      else if (v) n[k] = v; else delete n[k];
      if (k === "stroke" && n.stroke && n.strokeW == null) n.strokeW = 1;
      return;
    }
    if (/#hex$/.test(k)) { n[k.split("#")[0]] = String(v).toUpperCase(); return; }
    if (k === "strokeW") { n.strokeW = Math.max(0, num(v)); return; }
    if (k === "radius") { if (v === "") delete n.radius; else if (v === "#px") n.radius = 8; else n.radius = v; return; }
    if (k === "radiusPx") { n.radius = Math.max(0, num(v)); return; }
    if (k === "shadow") { if (v === "none") delete n.shadow; else n.shadow = v; return; }
    if (k === "opacity") { var o = Math.max(0, Math.min(100, num(v))) / 100; if (o >= 1) delete n.opacity; else n.opacity = o; return; }
    if (k === "text") { n.text = v; return; }
    if (k === "size") { n.size = v === "#px" ? 16 : v; return; }
    if (k === "sizePx") { n.size = Math.max(6, num(v)); return; }
    if (k === "weight") { n.weight = num(v); return; }
    if (k === "bind") { var b = String(v).trim().replace(/[^a-zA-Z0-9_]/g, ""); if (b && /^[a-zA-Z]/.test(b)) n.bind = b; else delete n.bind; return; }
    if (k === "icon") { n.icon = v; return; }
    if (k === "ref") { n.ref = v; delete n.variant; delete n.props; return; }
    if (k === "variant") { if (v) n.variant = v; else delete n.variant; return; }
    if (k === "hidden") { if (v) n.hidden = true; else delete n.hidden; return; }
  }

  // 노드 넣기: 선택한 프레임 안 끝 / 선택한 요소 다음
  function defaults(type) {
    switch (type) {
      case "frame": return { type: "frame", name: "프레임", w: "hug", h: "hug", layout: { mode: "column", gap: 8, pad: [12, 12, 12, 12], align: "start", justify: "start", wrap: false }, fill: "surface", stroke: "border", strokeW: 1, radius: "md", children: [] };
      case "text": return { type: "text", text: "텍스트", size: "body", weight: 400, color: "text" };
      case "rect": return { type: "rect", w: 120, h: 64, fill: "surfaceAlt", radius: "sm" };
      case "ellipse": return { type: "ellipse", w: 48, h: 48, fill: "accent" };
      case "line": return { type: "line", w: "fill", stroke: "border", strokeW: 1 };
      case "icon": return { type: "icon", icon: "info", w: 20, color: "text" };
      case "instance": var c = (S.o.comps || []).find(function (x) { return x.id !== S.doc.id; }); return { type: "instance", ref: c ? c.id : "" };
    }
  }
  function addNode(type) {
    if (S.o.editable === false) return;
    var d = defaults(type);
    if (type === "instance" && !d.ref) { S.o.toast && S.o.toast("인스턴스로 쓸 다른 컴포넌트가 없습니다", "err"); return; }
    mut(function (tree) {
      var n = cur() || tree, container, idx;
      if (n.type === "frame") { container = n; idx = (n.children || []).length; }
      else { container = parentOf(n.id) || tree; idx = container.children.indexOf(n) + 1; }
      d.id = F.nextId(tree, { frame: "f", text: "t", rect: "r", ellipse: "e", line: "l", icon: "i", instance: "c" }[type]);
      if (modeOf(container) === "none") { var k = (container.children || []).length; d.x = 16 + k * 12; d.y = 16 + k * 12; }
      container.children = container.children || [];
      container.children.splice(idx, 0, d);
      S.sel = d.id;
    });
    S.forceSide = true; renderSide();
    if (type === "text") setTimeout(function () { startInline(S.sel); }, 30);
  }
  function action(act, id) {
    var n = cur();
    switch (act) {
      case "close": return close();
      case "undo": return undo();
      case "redo": return redo();
      case "zin": return zoomTo(S.z * 1.25);
      case "zout": return zoomTo(S.z / 1.25);
      case "z100": return zoomTo(1);
      case "fit": return fit();
      case "save": return save();
      case "parent": { var p = n && parentOf(n.id); if (p) { S.sel = p.id; S.forceSide = true; render(); } return; }
      case "del": return del();
      case "dup": return dup();
      case "wrap": return wrap();
      case "up": case "down": case "outdent": case "indent": return move(act, id || (n && n.id));
      case "vadd": snap(); S.doc.vars.push({ name: uniqueVName(), tree: clone(T()) }); S.vi = S.doc.vars.length - 1; S.sel = T().id; S.multi = []; S.forceSide = true; render(); return;
      case "vdel": if (S.vi === 0) return; if (!window.confirm("‘" + S.doc.vars[S.vi].name + "’ 변형을 지울까요?")) return; snap(); S.doc.vars.splice(S.vi, 1); S.vi = 0; S.sel = T().id; S.forceSide = true; render(); return;
      case "hide": { var hf = F.find(T(), id); if (!hf || !hf.parent) return; mut(function () { if (hf.node.hidden) delete hf.node.hidden; else hf.node.hidden = true; }); return; }
      case "group": return group();
      case "al-l": case "al-c": case "al-r": case "al-t": case "al-m": case "al-b": return align(act);
      case "ai-run": return aiRun();
      case "ai-copy": return aiCopy();
      case "ai-paste": return aiPaste();
      case "ai-stop": if (S.ai.ctl) S.ai.ctl.abort(); return;
      case "x-script": case "x-plugin": case "x-prompt": case "x-json": return doExport(act);
    }
  }
  function uniqueVName() { for (var i = 1; ; i++) { var nm = "변형 " + i; if (!S.doc.vars.some(function (v) { return v.name === nm; })) return nm; } }
  function del() {
    var ids = sels().filter(function (id) { return id !== T().id; });
    if (!ids.length) return;
    var first = F.find(T(), ids[0]), p = first && first.parent;
    mut(function (tree) {
      ids.forEach(function (id) { var f = F.find(tree, id); if (f && f.parent) f.parent.children.splice(f.parent.children.indexOf(f.node), 1); });
      S.sel = p && F.find(tree, p.id) ? (p.children[0] ? p.children[0].id : p.id) : tree.id;
      S.multi = [];
    });
    S.forceSide = true; renderSide();
  }
  /** 여러 개를 골라 같은 부모 안에서 오토 레이아웃 프레임으로 묶기 */
  function group() {
    var ids = sels().filter(function (id) { return id !== T().id; });
    if (ids.length < 2) return wrap();
    var fs = ids.map(function (id) { return F.find(T(), id); });
    var p = fs[0].parent;
    if (fs.some(function (f) { return f.parent !== p; })) { S.o.toast && S.o.toast("같은 프레임 안에 있는 요소끼리만 묶을 수 있습니다", "err"); return; }
    mut(function (tree) {
      var order = p.children.filter(function (c) { return ids.indexOf(c.id) >= 0; });
      var at = p.children.indexOf(order[0]);
      var g = { id: F.nextId(tree, "f"), type: "frame", name: "묶음", w: "hug", h: "hug", layout: { mode: modeOf(p) === "row" ? "row" : "column", gap: 8, pad: [0, 0, 0, 0], align: "start", justify: "start", wrap: false }, children: order };
      if (modeOf(p) === "none") { g.x = Math.min.apply(null, order.map(function (c) { return c.x || 0; })); g.y = Math.min.apply(null, order.map(function (c) { return c.y || 0; })); order.forEach(function (c) { delete c.x; delete c.y; }); }
      p.children = p.children.filter(function (c) { return ids.indexOf(c.id) < 0; });
      p.children.splice(at, 0, g);
      S.sel = g.id; S.multi = [];
    });
    S.forceSide = true; renderSide();
  }
  /** 위치 지정 프레임 안의 여러 요소 정렬 (왼쪽·가운데·오른쪽·위·가운데·아래) */
  function align(act) {
    var ids = sels(), fs = ids.map(function (id) { return F.find(T(), id); }).filter(function (f) { return f && f.parent && modeOf(f.parent) === "none"; });
    if (fs.length < 2) { S.o.toast && S.o.toast("위치 지정 프레임 안의 요소를 두 개 이상 고르세요 (오토 레이아웃은 프레임 정렬을 쓰세요)", "err"); return; }
    var bx = fs.map(function (f) { var b = boxOf(f.node.id); return { f: f, x: f.node.x || 0, y: f.node.y || 0, w: b ? b.w / S.z : 0, h: b ? b.h / S.z : 0 }; });
    var minX = Math.min.apply(null, bx.map(function (b) { return b.x; })), maxX = Math.max.apply(null, bx.map(function (b) { return b.x + b.w; })), minY = Math.min.apply(null, bx.map(function (b) { return b.y; })), maxY = Math.max.apply(null, bx.map(function (b) { return b.y + b.h; }));
    mut(function () {
      bx.forEach(function (b) {
        var n = b.f.node;
        if (act === "al-l") n.x = Math.round(minX); if (act === "al-r") n.x = Math.round(maxX - b.w); if (act === "al-c") n.x = Math.round((minX + maxX) / 2 - b.w / 2);
        if (act === "al-t") n.y = Math.round(minY); if (act === "al-b") n.y = Math.round(maxY - b.h); if (act === "al-m") n.y = Math.round((minY + maxY) / 2 - b.h / 2);
      });
    });
  }
  function reId(n, tree) {
    var used = {};
    F.walk(tree, function (x) { used[x.id] = true; });
    F.walk(n, function (x) { var base = x.id.replace(/\d+$/, "") || "n"; var i = 1; while (used[base + i]) i++; x.id = base + i; used[x.id] = true; });
  }
  function dup() {
    var ids = sels().filter(function (id) { return id !== T().id; });
    if (!ids.length) return;
    mut(function (tree) {
      var made = [];
      ids.forEach(function (id) { var f = F.find(tree, id); if (!f || !f.parent) return; var p = f.parent, c = clone(f.node); reId(c, tree); if (modeOf(p) === "none") { c.x = (c.x || 0) + 16; c.y = (c.y || 0) + 16; } p.children.splice(p.children.indexOf(f.node) + 1, 0, c); made.push(c.id); });
      S.sel = made[0]; S.multi = made.slice(1);
    });
    S.forceSide = true; renderSide();
  }
  /** 선택한 요소를 오토 레이아웃 프레임으로 감싸기 (프레임이면 오토 레이아웃 켜기) */
  function wrap() {
    var n = cur();
    if (!n) return;
    mut(function (tree) {
      if (n.id === tree.id) {
        var inner = clone(tree), id = F.nextId(tree, "f");
        setT({ id: "root", type: "frame", name: "컴포넌트", w: "hug", h: "hug", layout: { mode: "column", gap: 8, pad: [0, 0, 0, 0], align: "start", justify: "start", wrap: false }, children: [Object.assign(inner, { id: id })] });
        S.sel = "root";
        return;
      }
      var p = parentOf(n.id), i = p.children.indexOf(n), f = { id: F.nextId(tree, "f"), type: "frame", name: "프레임", w: "hug", h: "hug", layout: { mode: "row", gap: 8, pad: [0, 0, 0, 0], align: "center", justify: "start", wrap: false }, children: [n] };
      if (modeOf(p) === "none") { f.x = n.x || 0; f.y = n.y || 0; delete n.x; delete n.y; }
      p.children[i] = f;
      S.sel = f.id;
    });
    S.forceSide = true; renderSide();
  }
  function move(act, id) {
    var f = F.find(T(), id);
    if (!f || !f.parent) return;
    var n = f.node, p = f.parent, i = p.children.indexOf(n);
    mut(function (tree) {
      if (act === "up" && i > 0) { p.children.splice(i, 1); p.children.splice(i - 1, 0, n); }
      else if (act === "down" && i < p.children.length - 1) { p.children.splice(i, 1); p.children.splice(i + 1, 0, n); }
      else if (act === "outdent") { var g = F.find(tree, p.id).parent; if (!g) return; p.children.splice(i, 1); g.children.splice(g.children.indexOf(p) + 1, 0, n); if (modeOf(g) === "none") { n.x = (p.x || 0) + 16; n.y = (p.y || 0) + 16; } else { delete n.x; delete n.y; } }
      else if (act === "indent") { var prev = p.children[i - 1]; if (!prev || prev.type !== "frame") { S.o.toast && S.o.toast("바로 위에 프레임이 있어야 안으로 넣을 수 있습니다", "err"); return; } p.children.splice(i, 1); prev.children = prev.children || []; prev.children.push(n); if (modeOf(prev) === "none") { n.x = 16; n.y = 16; } else { delete n.x; delete n.y; } }
      S.sel = n.id;
    });
  }

  // 캔버스: 선택 · 끌기 · 크기
  function pickId(t) { var e = t.closest && t.closest("[data-fid]"); return e ? e.getAttribute("data-fid") : null; }
  function onDown(ev) {
    if (!S || ev.button > 0) return;
    hideInline(true);
    var rs = ev.target.closest && ev.target.closest("[data-fx-rs]");
    var n = cur(), ed = S.o.editable !== false;
    if (rs && n && ed) {
      var b = boxOf(n.id);
      S.drag = { kind: "resize", dir: rs.getAttribute("data-fx-rs"), sx: ev.clientX, sy: ev.clientY, w0: b.w / S.z, h0: b.h / S.z, snapped: false };
      ev.preventDefault();
      return;
    }
    var id = pickId(ev.target);
    if (!id) { S.drag = { kind: "pan", x: ev.clientX, y: ev.clientY, l: S.view.scrollLeft, t: S.view.scrollTop }; return; }
    if (S.tool !== "select") { S.sel = id; addNode(S.tool); S.tool = "select"; render(); return; }
    // 두 번 누르기: 누를 때마다 캔버스를 다시 그려 브라우저 dblclick이 안 오므로 직접 잰다
    var tnow = Date.now(), ld = S.lastDown;
    S.lastDown = { t: tnow, x: ev.clientX, y: ev.clientY };
    if (ld && tnow - ld.t < 450 && Math.abs(ev.clientX - ld.x) < 6 && Math.abs(ev.clientY - ld.y) < 6) { S.lastDown = null; ev.preventDefault(); dblAt(id); return; }
    // 이미 선택한 요소의 자식을 누르면 한 단계씩 안으로 (피그마처럼): 선택이 없거나 다른 가지면 가장 바깥 자식부터
    var pick = deepestUnder(id);
    if (ev.shiftKey && S.sel && pick !== S.sel) { var mi = S.multi.indexOf(pick); if (mi >= 0) S.multi.splice(mi, 1); else S.multi.push(pick); S.forceSide = true; render(); ev.preventDefault(); return; }
    if (S.multi.indexOf(pick) < 0 && pick !== S.sel) S.multi = [];
    S.sel = pick;
    S.forceSide = true;
    render();
    var sn = cur(), p = sn && parentOf(sn.id);
    if (ed && sn && p) {
      var starts = {};
      if (modeOf(p) === "none") sels().forEach(function (sid) { var ff = F.find(T(), sid); if (ff && ff.parent === p) starts[sid] = [ff.node.x || 0, ff.node.y || 0]; });
      S.drag = { kind: modeOf(p) === "none" ? "move" : "reorder", sx: ev.clientX, sy: ev.clientY, x0: sn.x || 0, y0: sn.y || 0, starts: starts, moved: false, id: sn.id };
    }
    ev.preventDefault();
  }
  /** 누른 요소까지의 경로에서, 지금 선택 바로 아래 단계를 고른다 (처음엔 루트의 자식) */
  function deepestUnder(id) {
    var path = [], f = F.find(T(), id);
    while (f) { path.unshift(f.node.id); f = f.parent ? F.find(T(), f.parent.id) : null; }
    var i = path.indexOf(S.sel);
    if (i >= 0 && i < path.length - 1) return path[i + 1];
    if (i === path.length - 1) return id;
    return path.length > 1 ? path[1] : path[0];
  }
  function onHover(ev) {
    if (!S || S.drag) return;
    var id = pickId(ev.target);
    if (id !== S.hover) { S.hover = id; drawOverlay(); }
  }
  function onMove(ev) {
    if (!S || !S.drag) return;
    var d = S.drag, dx = ev.clientX - (d.sx || d.x), dy = ev.clientY - (d.sy || d.y);
    if (d.kind === "pan") { S.view.scrollLeft = d.l - (ev.clientX - d.x); S.view.scrollTop = d.t - (ev.clientY - d.y); return; }
    if (!d.moved && Math.hypot(dx, dy) < 4 && d.kind !== "resize") return;
    if (!d.moved) { snap(); d.moved = true; }
    var n = cur();
    if (!n) return;
    if (d.kind === "resize") {
      if (d.dir !== "s") n.w = Math.max(1, Math.round(d.w0 + dx / S.z));
      if (d.dir !== "e") { if (n.type !== "text" && n.type !== "icon") n.h = Math.max(1, Math.round(d.h0 + dy / S.z)); }
      renderCanvas();
      return;
    }
    if (d.kind === "move") { Object.keys(d.starts).forEach(function (sid) { var ff = F.find(T(), sid); if (ff) { ff.node.x = Math.round(d.starts[sid][0] + dx / S.z); ff.node.y = Math.round(d.starts[sid][1] + dy / S.z); } }); renderCanvas(); return; }
    if (d.kind === "reorder") {
      var p = parentOf(n.id), row = modeOf(p) === "row", sibs = p.children.filter(function (c) { return c.id !== n.id; });
      var idx = 0, line = null, cv = S.el.querySelector(".fx-canvas").getBoundingClientRect();
      sibs.forEach(function (c, i) {
        var e = elOf(c.id);
        if (!e) return;
        var r = e.getBoundingClientRect(), mid = row ? r.left + r.width / 2 : r.top + r.height / 2;
        if ((row ? ev.clientX : ev.clientY) > mid) idx = i + 1;
      });
      var pb = boxOf(p.id), ref = sibs[idx] ? boxOf(sibs[idx].id) : sibs[idx - 1] ? boxOf(sibs[idx - 1].id) : null;
      if (pb) {
        if (row) line = { x: ref ? (sibs[idx] ? ref.x - 2 : ref.x + ref.w + 1) : pb.x + 4, y: pb.y + 2, w: 2, h: pb.h - 4 };
        else line = { x: pb.x + 2, y: ref ? (sibs[idx] ? ref.y - 2 : ref.y + ref.h + 1) : pb.y + 4, w: pb.w - 4, h: 2 };
      }
      d.idx = idx; d.line = line;
      drawOverlay();
    }
  }
  function onUp() {
    if (!S || !S.drag) return;
    var d = S.drag;
    S.drag = null;
    if (d.kind === "reorder" && d.moved && d.idx != null) {
      var n = cur(), p = parentOf(n.id);
      p.children.splice(p.children.indexOf(n), 1);
      p.children.splice(d.idx, 0, n);
    }
    if (d.moved || d.kind === "resize") { S.forceSide = true; render(); } else drawOverlay();
  }
  function onWheel(ev) {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();
    zoomTo(S.z * (ev.deltaY < 0 ? 1.1 : 1 / 1.1));
  }
  function onDbl(ev) {
    if (!S || S.o.editable === false || S.inline) return;
    var id = pickId(ev.target);
    if (id) dblAt(id);
  }
  function dblAt(id) {
    if (!S || S.o.editable === false) return;
    var f = F.find(T(), id);
    if (f && f.node.type === "text") { S.sel = id; render(); startInline(id); }
    else if (f && S.sel === id && f.node.type === "frame" && (f.node.children || []).length) { S.sel = f.node.children[0].id; S.forceSide = true; render(); }
    else if (f) { S.sel = id; S.multi = []; S.forceSide = true; render(); }
  }
  function startInline(id) {
    var f = F.find(T(), id), b = boxOf(id), ta = S.el.querySelector(".fx-inline");
    if (!f || !b || f.node.type !== "text") return;
    ta.style.left = b.x + "px"; ta.style.top = b.y + "px"; ta.style.width = Math.max(120, b.w + 20) + "px"; ta.style.height = Math.max(32, b.h + 10) + "px";
    ta.value = f.node.text || "";
    ta.hidden = false;
    S.inline = { id: id, before: ta.value };
    ta.focus(); ta.select();
  }
  function hideInline(commit) {
    var ta = S && S.el.querySelector(".fx-inline");
    if (!ta || ta.hidden || !S.inline) return;
    var v = ta.value, inl = S.inline;
    ta.hidden = true; S.inline = null;
    if (!commit || v === inl.before) return;
    mut(function (tree) { var f = F.find(tree, inl.id); if (f) f.node.text = v; });
    S.forceSide = true; renderSide();
  }
  function onKey(ev) {
    if (!S) return;
    var t = ev.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT"), mod = ev.ctrlKey || ev.metaKey;
    if (t && t.classList && t.classList.contains("fx-inline")) {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); hideInline(false); }
      else if (ev.key === "Enter" && (mod || !ev.shiftKey) && !ev.shiftKey) { ev.preventDefault(); ev.stopPropagation(); hideInline(true); }
      return;
    }
    if (mod && (ev.key === "s" || ev.key === "S")) { ev.preventDefault(); ev.stopPropagation(); save(); return; }
    if (ev.key === "Escape") {
      ev.preventDefault(); ev.stopPropagation();
      if (S.tool !== "select") { S.tool = "select"; render(); return; }
      var p = cur() && parentOf(cur().id);
      if (p) { S.sel = p.id; S.forceSide = true; render(); } else close();
      return;
    }
    if (typing) return;
    ev.stopPropagation();
    var ed = S.o.editable !== false;
    if (mod && (ev.key === "z" || ev.key === "Z")) { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if (mod && (ev.key === "y" || ev.key === "Y")) { ev.preventDefault(); redo(); return; }
    if (!ed) return;
    if (mod && (ev.key === "d" || ev.key === "D")) { ev.preventDefault(); dup(); return; }
    if (mod && ev.altKey && (ev.key === "g" || ev.key === "G")) { ev.preventDefault(); wrap(); return; }
    if (mod && (ev.key === "g" || ev.key === "G")) { ev.preventDefault(); group(); return; }
    if (mod && (ev.key === "a" || ev.key === "A")) { ev.preventDefault(); var pa = cur() && parentOf(cur().id); var sib = pa ? pa.children : T().children || []; if (sib.length) { S.sel = sib[0].id; S.multi = sib.slice(1).map(function (c) { return c.id; }); S.forceSide = true; render(); } return; }
    if (ev.shiftKey && (ev.key === "A" || ev.key === "a")) {
      ev.preventDefault();
      var n0 = cur();
      if (n0 && n0.type === "frame" && modeOf(n0) === "none") mut(function () { n0.layout = Object.assign({ gap: 8, pad: [0, 0, 0, 0], align: "start", justify: "start", wrap: false }, n0.layout || {}, { mode: "column" }); (n0.children || []).forEach(function (c) { delete c.x; delete c.y; }); });
      else wrap();
      S.forceSide = true; renderSide();
      return;
    }
    if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); del(); return; }
    if (ev.key === "Enter") { ev.preventDefault(); var n1 = cur(); if (n1 && n1.type === "text") startInline(n1.id); else if (n1 && (n1.children || []).length) { S.sel = n1.children[0].id; S.forceSide = true; render(); } return; }
    if (/^Arrow/.test(ev.key)) {
      var n2 = cur(), p2 = n2 && parentOf(n2.id);
      if (!n2 || !p2) return;
      ev.preventDefault();
      if (modeOf(p2) === "none") { var st = ev.shiftKey ? 10 : 1; mut(function () { if (ev.key === "ArrowLeft") n2.x = (n2.x || 0) - st; if (ev.key === "ArrowRight") n2.x = (n2.x || 0) + st; if (ev.key === "ArrowUp") n2.y = (n2.y || 0) - st; if (ev.key === "ArrowDown") n2.y = (n2.y || 0) + st; }); }
      else move(ev.key === "ArrowUp" || ev.key === "ArrowLeft" ? "up" : "down", n2.id);
      S.forceSide = true; renderSide();
      return;
    }
    if (mod) return;
    var k = ev.key.toLowerCase(), map = { v: "select", f: "frame", t: "text", r: "rect", o: "ellipse", l: "line", i: "icon", c: "instance" };
    if (map[k]) { if (map[k] === "select") { S.tool = "select"; render(); } else addNode(map[k]); }
  }

  // ── 저장 · 내보내기 ─────────────────────────
  function save() {
    if (!S.o.save || S.o.editable === false) return;
    if (!String(S.doc.name || "").trim()) { S.o.toast && S.o.toast(S.o.mode === "item" ? "항목명을 입력하세요" : "컴포넌트 이름을 입력하세요", "err"); var ni = S.el.querySelector('[data-fx-doc="name"]'); if (ni) ni.focus(); return; }
    var btn = S.el.querySelector('[data-fx-act="save"]');
    if (btn) { btn.disabled = true; btn.textContent = "저장 중…"; }
    var doc = { id: S.doc.id, name: S.doc.name, category: S.doc.category, description: S.doc.description, frameW: S.doc.frameW, tree: clone(S.doc.vars[0].tree), variantTrees: S.doc.vars.slice(1).map(clone) };
    Promise.resolve(S.o.save(doc)).then(function (id) {
      if (!S) return;
      if (id) S.doc.id = id;
      S.saved = JSON.stringify(S.doc);
      S.o.toast && S.o.toast(S.o.mode === "item" ? "항목 모양을 저장했습니다. 화면설계서에 반영됐습니다" : "컴포넌트를 저장했습니다. 화면설계서에서 고를 수 있습니다");
      S.forceSide = true; render();
    }, function (e) { S && S.o.toast && S.o.toast("저장하지 못했습니다: " + (e && e.message || e), "err"); }).then(function () {
      var b2 = S && S.el.querySelector('[data-fx-act="save"]');
      if (b2) { b2.disabled = false; b2.textContent = "저장"; }
    });
  }
  /** 이 컴포넌트 + 인스턴스로 쓴 컴포넌트들 (지금 편집 중인 모양) */
  function exportComps() {
    var me = { id: S.doc.id || "c-new", name: S.doc.name || "새 컴포넌트", tree: S.doc.vars[0].tree, variantTrees: S.doc.vars.slice(1) };
    var all = (S.o.comps || []).filter(function (c) { return c.id !== me.id; }), out = [], seen = {};
    function need(c) { [c.tree].concat((c.variantTrees || []).map(function (v) { return v.tree; })).forEach(function (tree) { if (tree) F.walk(tree, function (n) { if (n.type === "instance" && n.ref && !seen[n.ref]) { var r = all.find(function (x) { return x.id === n.ref; }); if (r && r.tree) { seen[n.ref] = true; need(r); out.push(r); } } }); }); }
    need(me);
    return out.concat([me]);
  }
  function doExport(act) {
    var o = S.o, comps = exportComps(), title = (o.title || "") + " " + (S.doc.name || "");
    var copy = function (text, msg) { (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error("클립보드를 쓸 수 없습니다"))).then(function () { o.toast && o.toast(msg); }, function (e) { o.toast && o.toast("복사하지 못했습니다: " + e.message, "err"); }); };
    if (act === "x-script") return copy(F.figmaScript(o.ds, comps, { title: title }), "스크립트를 복사했습니다. Figma ▸ 플러그인 ▸ Scripter에 붙여 넣고 실행하세요");
    if (act === "x-prompt") return copy(F.figmaPrompt(o.ds, comps, { title: title }), "Figma 프롬프트를 복사했습니다. Figma MCP가 연결된 Claude에 붙여 넣으세요");
    if (act === "x-json") return copy(JSON.stringify(T(), null, 2), "노드 JSON을 복사했습니다");
    if (act === "x-plugin" && root.FlowExport) {
      var bytes = root.FlowExport.zip(F.figmaPlugin(o.ds, comps, { title: title }));
      root.FlowExport.download(new Blob([bytes], { type: "application/zip" }), "planning-figma-plugin.zip");
    }
  }

  // ── AI ─────────────────────────────────────
  function aiInput() {
    var ta = S.el.querySelector("[data-fx-ai]"), ins = ta ? ta.value.trim() : S.ai.draft;
    S.ai.draft = ins;
    if (!ins && S.ai.mode === "new") { S.ai.err = "무엇을 그릴지 적어 주세요."; S.forceSide = true; renderSide(); return null; }
    var only = S.ai.mode !== "new" && S.ai.only && S.sel && S.sel !== T().id ? F.find(T(), S.sel) : null;
    S.ai.onlyId = only ? S.sel : null;
    var current = S.ai.mode === "new" ? null : only ? { name: only.node.name || TYPE[only.node.type], tree: only.node } : { name: S.doc.name, tree: S.doc.vars[0].tree, variants: S.doc.vars.slice(1) };
    var scopeNote = only ? "\n\n[범위 제한] 위 ‘현재 컴포넌트’는 컴포넌트 ‘" + S.doc.name + "’ 안의 요소 ‘" + (only.node.name || only.node.type) + "’(id " + only.node.id + ")만 떼어 낸 것입니다. 이 요소만 고쳐 같은 형식의 tree 하나로 답하세요(맨 위 id는 " + only.node.id + " 유지, variants 없이). 다른 요소는 건드리지 않습니다." : "";
    return F.aiPrompt(S.o.ds, (S.o.comps || []).filter(function (c) { return c.id !== S.doc.id; }), { instruction: ins + scopeNote + (S.o.aiContext ? "\n\n" + S.o.aiContext : ""), current: current, name: S.doc.name, system: S.o.title });
  }
  /** AI 결과 넣기: {name, category, description, tree, variants:[{name, tree}]} */
  function applyAi(out) {
    var comps = (S.o.comps || []).filter(function (c) { return c.id !== S.doc.id; });
    var o = out && (out.component || out);
    var tree = o && F.sanitize(o.tree || (o.type ? o : null), comps);
    if (!tree) throw new Error("AI 결과에 tree(프레임 노드)가 없습니다");
    // 선택한 요소만 고치기: 그 자리만 바꾼다 (위치 지정 프레임 안이면 좌표 유지)
    if (S.ai.onlyId) {
      var f = F.find(T(), S.ai.onlyId);
      if (!f || !f.parent) throw new Error("고칠 요소를 찾지 못했습니다 — 요소를 다시 고르세요");
      var idx = f.parent.children.indexOf(f.node), old = f.node;
      snap();
      f.parent.children.splice(idx, 1);
      reId(tree, T());
      tree.id = old.id;
      if (old.x != null) tree.x = old.x; if (old.y != null) tree.y = old.y;
      if (old.bind && tree.type === "text" && !tree.bind) tree.bind = old.bind;
      f.parent.children.splice(idx, 0, tree);
      S.sel = tree.id; S.multi = [];
      S.forceSide = true; render();
      S.o.toast && S.o.toast("‘" + (tree.name || TYPE[tree.type]) + "’ 요소만 바꿨습니다. 확인 후 저장하세요 — 되돌리기 가능");
      return;
    }
    tree.id = "root";
    var vars = [{ name: "기본", tree: tree }];
    (S.o.mode === "item" ? [] : Array.isArray(o.variants) ? o.variants : Array.isArray(o.variantTrees) ? o.variantTrees : []).slice(0, 19).forEach(function (v, i) {
      var t = v && F.sanitize(v.tree, comps);
      if (!t) return;
      t.id = "root";
      var nm = String(v.name || "변형 " + (i + 1)).slice(0, 40);
      if (nm === "기본" || vars.some(function (x) { return x.name === nm; })) nm = nm + " " + (i + 2);
      vars.push({ name: nm, tree: t });
    });
    snap();
    S.doc.vars = vars;
    S.vi = 0; S.sel = "root"; S.multi = [];
    if (o.name && (!S.doc.name || S.ai.mode === "new" && S.o.mode !== "item")) S.doc.name = String(o.name).slice(0, 60);
    if (o.category && (S.o.categories || []).some(function (c) { return c[0] === o.category; })) S.doc.category = o.category;
    if (o.description && !S.doc.description) S.doc.description = String(o.description).slice(0, 300);
    var ni = S.el.querySelector('[data-fx-doc="name"]'); if (ni) ni.value = S.doc.name;
    S.forceSide = true; render(); fit();
    S.o.toast && S.o.toast("AI 결과를 캔버스에 넣었습니다" + (S.o.mode === "item" ? "" : " (변형 " + vars.length + "개)") + ". 확인 후 저장하세요 — 되돌리기 가능");
  }
  function aiRun() {
    var ai = S.o.ai;
    if (!ai || !ai.available) return;
    var input = aiInput();
    if (!input) return;
    S.ai.busy = true; S.ai.err = ""; S.ai.ctl = new AbortController();
    S.forceSide = true; renderSide();
    ai.run(input, S.ai.ctl.signal).then(function (out) { if (S) applyAi(out); }).catch(function (e) {
      if (!S) return;
      S.ai.err = e && (e.code === "cancelled" || e.name === "AbortError") ? "" : (e && e.message) || String(e);
    }).then(function () { if (!S) return; S.ai.busy = false; S.ai.ctl = null; S.forceSide = true; renderSide(); });
  }
  function aiCopy() {
    var input = aiInput();
    if (!input) return;
    (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(input) : Promise.reject(new Error("클립보드를 쓸 수 없습니다"))).then(function () { S.o.toast && S.o.toast("프롬프트를 복사했습니다. claude.ai에 붙여 넣으세요"); }, function (e) { S.o.toast && S.o.toast(e.message, "err"); });
    window.open("https://claude.ai/new", "_blank", "noopener");
  }
  function aiPaste() {
    var ta = S.el.querySelector(".fx-paste");
    if (!ta || !ta.value.trim()) { S.ai.err = "Claude 답을 붙여 넣어 주세요."; S.forceSide = true; renderSide(); return; }
    try { applyAi(S.o.parse ? S.o.parse(ta.value) : JSON.parse(ta.value)); S.ai.err = ""; } catch (e) { S.ai.err = e.message; S.forceSide = true; renderSide(); }
  }

  root.FrameEdit = { open: open, close: close, isOpen: function () { return !!S; } };
})(typeof window !== "undefined" ? window : globalThis);
