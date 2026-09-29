/*
 * 플로우차트 캔버스 편집기 (전체 화면)
 *  - 도구: 선택 · 연결 · 도형 7종 추가 · 레인 추가 · 자동 정렬 · 확대/축소/맞춤 · 되돌리기/다시
 *  - 도형을 끌어 옮기면(레인 이동 포함) 위치가 저장되고, 두 번 누르면 글자를 바로 고친다
 *  - AI 탭: 지금 캔버스를 바탕으로 AI가 도구(도형·연결·레인)로 그리거나 고친다
 *  - 내보내기: SVG · PNG · PDF · PPTX(편집 가능) · Figma(AI 프롬프트, 붙여넣기용 SVG)
 * FlowEdit.open(opts) — opts: {flow, title, editable, systems:[{code,name,color}], screens:[{id,name,systemCode}], tasks:[{id,label,systemCode}],
 *   color(code), project, save(flow)→Promise, ai:{available, label, run(input, signal)→Promise(output), prompt()→string, refine}, toast(msg, tone), onClose()}
 */
(function (root) {
  "use strict";
  var FL = root.FlowLayout, FX = root.FlowExport;
  var SHAPES = [["TERMINATOR", "시작·종료"], ["PROCESS", "처리"], ["DECISION", "판단"], ["DOCUMENT", "문서"], ["IO", "입출력·연계"], ["SCREEN", "화면"], ["CONNECTOR", "연결점"]];
  var SHAPE_OK = {};
  SHAPES.forEach(function (s) { SHAPE_OK[s[0]] = s[1]; });
  var esc = function (s) { return FL.esc(s); };
  var S = null; // 열려 있는 편집기 상태

  function icon(sh) {
    var a = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"';
    var p = {
      TERMINATOR: '<rect x="2" y="6" width="20" height="12" rx="6" ' + a + "/>",
      PROCESS: '<rect x="3" y="5" width="18" height="14" rx="3" ' + a + "/>",
      DECISION: '<path d="M12 3 L21 12 L12 21 L3 12 Z" ' + a + "/>",
      DOCUMENT: '<path d="M4 4 H20 V17 Q16 14 12 17 T4 17 Z" ' + a + "/>",
      IO: '<path d="M7 5 H21 L17 19 H3 Z" ' + a + "/>",
      SCREEN: '<rect x="3" y="4" width="18" height="16" rx="2" ' + a + '/><path d="M3 9 H21" ' + a + "/>",
      CONNECTOR: '<rect x="2" y="7" width="20" height="10" rx="5" ' + a + ' stroke-dasharray="3 2"/>',
      select: '<path d="M5 3 L5 19 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18 13.5 Z" ' + a + "/>",
      connect: '<circle cx="5" cy="12" r="2.5" ' + a + '/><circle cx="19" cy="12" r="2.5" ' + a + '/><path d="M7.5 12 H16.5 M13.5 9 L16.5 12 L13.5 15" ' + a + "/>",
      lane: '<rect x="3" y="4" width="18" height="16" rx="1.5" ' + a + '/><path d="M3 10 H21 M3 15 H21 M8 4 V20" ' + a + "/>",
    }[sh];
    return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' + p + "</svg>";
  }

  // ── 문서 정리 ────────────────────────────────
  var isObj = function (v) { return v && typeof v === "object" && !Array.isArray(v); };
  function sanitize(f, base, keepPos, systems) {
    f = isObj(f) ? f : {};
    base = base || {};
    var codes = {};
    (systems || []).forEach(function (s) { codes[s.code] = true; });
    var lanes = (Array.isArray(f.lanes) ? f.lanes : []).filter(isObj).map(function (l, i) {
      var o = { id: String(l.id || "L" + (i + 1)), label: String(l.label || l.name || "레인 " + (i + 1)) };
      if (l.systemCode && codes[l.systemCode]) o.systemCode = l.systemCode;
      return o;
    });
    var laneIds = {};
    lanes = lanes.filter(function (l) { if (laneIds[l.id]) return false; laneIds[l.id] = true; return true; });
    var seen = {}, nodes = (Array.isArray(f.nodes) ? f.nodes : []).filter(isObj).map(function (n, i) {
      var id = String(n.id || "n" + (i + 1));
      while (seen[id]) id += "_";
      seen[id] = true;
      var o = { id: id, shape: SHAPE_OK[n.shape] ? n.shape : "PROCESS", label: String(n.label == null ? "" : n.label), lane: n.lane != null ? String(n.lane) : undefined, taskIds: Array.isArray(n.taskIds) ? n.taskIds.map(String) : [], change: ["NEW", "CHANGED", "DELETED", "KEPT"].indexOf(n.change) >= 0 ? n.change : "NEW" };
      if (n.screenId) o.screenId = String(n.screenId);
      if (keepPos && typeof n.x === "number" && typeof n.y === "number" && isFinite(n.x) && isFinite(n.y)) { o.x = n.x; o.y = n.y; }
      return o;
    });
    if (!lanes.length) lanes = [{ id: "L1", label: "처리" }];
    nodes.forEach(function (n) { if (!n.lane || !laneIds[n.lane]) n.lane = lanes[0].id; laneIds[n.lane] = true; });
    var edges = (Array.isArray(f.edges) ? f.edges : []).filter(isObj).map(function (e) { return { from: String(e.from), to: String(e.to), label: String(e.label || "") }; }).filter(function (e) { return seen[e.from] && seen[e.to] && e.from !== e.to; });
    var out = { id: String(f.id || base.id || "PF-NEW"), kind: f.kind === "USER" ? "USER" : "PROCESS", title: String(f.title || base.title || "프로세스 플로우"), lanes: lanes, nodes: nodes, edges: edges };
    if (f.systemCode && codes[f.systemCode]) out.systemCode = f.systemCode;
    return out;
  }
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  // ── 열기·닫기 ───────────────────────────────
  function open(o) {
    if (S) close(true);
    var doc = sanitize(o.flow, o.flow, true, o.systems);
    S = { o: o, doc: doc, saved: JSON.stringify(doc), undo: [], redo: [], sel: { nodes: [], edge: null, lane: null }, tool: "select", z: 1, tab: "props", L: null, connectFrom: null, drag: null, aiBusy: false, aiCtl: null, aiDraft: "" };
    var el = document.createElement("div");
    el.className = "fe";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "플로우차트 캔버스");
    el.innerHTML = frame();
    document.body.appendChild(el);
    document.documentElement.classList.add("fe-open");
    S.el = el;
    ["click", "input", "change", "dblclick", "pointerdown"].forEach(function (t) { el.addEventListener(t, stop); });
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    el.addEventListener("dblclick", onDbl);
    el.addEventListener("focusin", onFocus);
    S.view = el.querySelector(".fe-view");
    S.view.addEventListener("pointerdown", onDown);
    S.view.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("resize", onResize);
    render();
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (S) { FL.clearCache(); render(); fit(); } });
    setTimeout(function () { var b = el.querySelector(".fe-close"); if (b) b.focus(); }, 30);
  }
  function stop(ev) { ev.stopPropagation(); }
  function dirty() { return S && JSON.stringify(S.doc) !== S.saved; }
  function close(force) {
    if (!S) return;
    if (!force && dirty() && !window.confirm("저장하지 않은 변경이 있습니다. 닫을까요?")) return;
    if (S.aiCtl) S.aiCtl.abort();
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
  function onResize() { if (S) renderCanvas(); }

  // ── 변경·되돌리기 ───────────────────────────
  function snap() { S.undo.push(JSON.stringify(S.doc)); if (S.undo.length > 120) S.undo.shift(); S.redo = []; }
  function mut(fn) { snap(); fn(S.doc); render(); }
  function undo() { if (!S.undo.length) return; S.redo.push(JSON.stringify(S.doc)); S.doc = JSON.parse(S.undo.pop()); fixSel(); render(); }
  function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.doc)); S.doc = JSON.parse(S.redo.pop()); fixSel(); render(); }
  function fixSel() {
    var ids = {};
    S.doc.nodes.forEach(function (n) { ids[n.id] = true; });
    S.sel.nodes = S.sel.nodes.filter(function (id) { return ids[id]; });
    if (S.sel.edge != null && !S.doc.edges[S.sel.edge]) S.sel.edge = null;
    if (S.sel.lane && !S.doc.lanes.some(function (l) { return l.id === S.sel.lane; })) S.sel.lane = null;
  }
  function node(id) { return S.doc.nodes.find(function (n) { return n.id === id; }); }
  function newId(prefix, list) {
    var n = 1, ids = {};
    list.forEach(function (x) { ids[x.id] = true; });
    while (ids[prefix + n]) n++;
    return prefix + n;
  }

  // ── 그리기 ──────────────────────────────────
  function frame() {
    var o = S.o, ed = o.editable;
    var tools = '<button class="fe-t" data-fe-tool="select" title="선택·이동 (V)">' + icon("select") + "<span>선택</span></button>" +
      (ed ? '<button class="fe-t" data-fe-tool="connect" title="연결: 시작 도형 → 끝 도형을 차례로 누름 (C)">' + icon("connect") + "<span>연결</span></button><hr>" +
        SHAPES.map(function (s, i) { return '<button class="fe-t" data-fe-tool="add:' + s[0] + '" title="' + s[1] + " 추가 (" + (i + 1) + ') — 캔버스를 눌러 놓기">' + icon(s[0]) + "<span>" + s[1] + "</span></button>"; }).join("") +
        '<hr><button class="fe-t" data-fe-act="lane-add" title="레인(가로 띠) 추가">' + icon("lane") + "<span>레인 추가</span></button>" : "");
    return '<header class="fe-h"><div class="fe-title"><span class="fe-eyebrow">프로세스 플로우 캔버스' + (ed ? "" : " · 보기 전용") + "</span>" +
      (ed ? '<input class="fe-title-in" data-fe-field="title" aria-label="플로우 제목" value="' + esc(S.doc.title) + '">' : "<b>" + esc(S.doc.title) + "</b>") + '</div><span class="fe-state" id="fe-state"></span><span class="fe-sp"></span>' +
      (ed ? '<button class="fe-b" data-fe-act="undo" title="되돌리기 (Ctrl+Z)">↶</button><button class="fe-b" data-fe-act="redo" title="다시 (Ctrl+Shift+Z)">↷</button><span class="fe-sep"></span>' : "") +
      '<button class="fe-b" data-fe-act="zout" title="축소">−</button><button class="fe-b fe-zv" data-fe-act="z100" title="100%로">100%</button><button class="fe-b" data-fe-act="zin" title="확대">+</button><button class="fe-b" data-fe-act="fit" title="화면에 맞춤">맞춤</button>' +
      (ed ? '<span class="fe-sep"></span><button class="fe-b" data-fe-act="relayout" title="옮긴 위치를 지우고 자동으로 다시 배치">자동 정렬</button>' : "") +
      '<span class="fe-sep"></span>' + (ed && o.save ? '<button class="fe-b fe-primary" data-fe-act="save" title="저장 (Ctrl+S)">저장</button>' : "") +
      '<button class="fe-b fe-close" data-fe-act="close" aria-label="닫기">닫기 ✕</button></header>' +
      '<div class="fe-body"><aside class="fe-tools" aria-label="도구">' + tools + "</aside>" +
      '<div class="fe-view" tabindex="0" aria-label="캔버스"><div class="fe-canvas"></div><textarea class="fe-inline" hidden aria-label="글자 편집"></textarea></div>' +
      '<aside class="fe-side"><div class="fe-tabs" role="tablist"><button data-fe-tab="props" role="tab">속성</button>' + (ed && o.ai ? '<button data-fe-tab="ai" role="tab">✦ AI</button>' : "") + '<button data-fe-tab="export" role="tab">내보내기</button></div><div class="fe-panel"></div></aside></div>' +
      '<footer class="fe-f" id="fe-hint"></footer>';
  }
  function render() {
    if (!S) return;
    renderCanvas();
    renderSide();
    var st = S.el.querySelector("#fe-state");
    if (st) st.textContent = S.o.editable ? (dirty() ? "● 저장 안 됨" : "저장됨") : "";
    if (st) st.className = "fe-state" + (dirty() ? " on" : "");
    S.el.querySelectorAll("[data-fe-tool]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-fe-tool") === S.tool)); });
    S.el.querySelectorAll("[data-fe-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-fe-tab") === S.tab)); });
    var u = S.el.querySelector('[data-fe-act="undo"]'), r = S.el.querySelector('[data-fe-act="redo"]');
    if (u) u.disabled = !S.undo.length;
    if (r) r.disabled = !S.redo.length;
    var hint = S.el.querySelector("#fe-hint");
    if (hint) hint.textContent = S.tool === "connect" ? (S.connectFrom ? "끝 도형을 누르세요 · Esc 취소" : "연결할 시작 도형을 누르세요 · Esc 취소") :
      S.tool.indexOf("add:") === 0 ? "캔버스에서 놓을 곳을 누르세요 (레인 안) · Esc 취소" :
      S.o.editable ? "끌어서 옮기기 · 두 번 눌러 글자 고치기 · Shift+누르기 여러 개 선택 · Delete 삭제 · 방향키 10px 이동 · Ctrl+휠 확대" : "Ctrl+휠 확대 · 끌어서 화면 이동";
  }
  function renderCanvas() {
    var o = S.o;
    S.L = FL.layout(S.doc, { color: o.color });
    var L = S.L, z = S.z;
    var lg = FL.legend(10, L.H + 8, { mode: "screen", only: FL.usedShapes(S.doc), maxW: Math.max(L.W - 20, 520) });
    var H = L.H + lg.h + 14, W = Math.max(L.W, 540);
    var body = FL.body(L, { mode: "screen", uid: "fe", hit: true, color: o.color, selected: { nodes: S.sel.nodes, edge: S.sel.edge, lane: S.sel.lane } });
    var tmp = S.connectFrom && L.nodes[S.connectFrom] ? '<line id="fe-tmp" x1="' + L.nodes[S.connectFrom].cx + '" y1="' + L.nodes[S.connectFrom].cy + '" x2="' + L.nodes[S.connectFrom].cx + '" y2="' + L.nodes[S.connectFrom].cy + '" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4" pointer-events="none"/>' : "";
    var handles = "";
    if (o.editable && S.sel.nodes.length === 1 && L.nodes[S.sel.nodes[0]] && S.tool === "select") {
      var nd = L.nodes[S.sel.nodes[0]];
      handles = '<g class="fe-handle" data-fe-handle="' + esc(nd.id) + '"><circle cx="' + (nd.r + 12) + '" cy="' + nd.cy + '" r="8" fill="var(--accent)"/><path d="M' + (nd.r + 8) + "," + nd.cy + " H" + (nd.r + 16) + " M" + (nd.r + 13) + "," + (nd.cy - 3) + " L" + (nd.r + 16) + "," + nd.cy + " L" + (nd.r + 13) + "," + (nd.cy + 3) + '" stroke="#fff" stroke-width="1.6" fill="none"/><title>끌어서 다른 도형에 연결</title></g>';
    }
    S.el.querySelector(".fe-canvas").innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(W * z) + '" height="' + Math.round(H * z) + '" viewBox="0 0 ' + W + " " + H + '" class="fe-svg' + (S.tool !== "select" ? " tool-" + S.tool.split(":")[0] : "") + '">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="var(--surface)"/>' + body + lg.markup + handles + tmp + "</svg>";
    var zv = S.el.querySelector(".fe-zv");
    if (zv) zv.textContent = Math.round(z * 100) + "%";
  }
  function fit() {
    if (!S || !S.L) return;
    var v = S.view, w = v.clientWidth - 32, h = v.clientHeight - 32;
    S.z = Math.max(0.2, Math.min(1.4, w / Math.max(S.L.W, 540), h / (S.L.H + 60)));
    renderCanvas();
  }
  function zoomTo(z, cx, cy) {
    var v = S.view, old = S.z;
    z = Math.max(0.15, Math.min(3, z));
    var r = v.getBoundingClientRect();
    cx = cx == null ? r.width / 2 : cx; cy = cy == null ? r.height / 2 : cy;
    var px = (v.scrollLeft + cx) / old, py = (v.scrollTop + cy) / old;
    S.z = z;
    renderCanvas();
    v.scrollLeft = px * z - cx; v.scrollTop = py * z - cy;
  }

  // ── 옆 패널 ─────────────────────────────────
  function opt(v, t, cur) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur == null ? "" : cur) ? " selected" : "") + ">" + esc(t) + "</option>"; }
  function renderSide() {
    var p = S.el.querySelector(".fe-panel"), o = S.o, ed = o.editable;
    if (document.activeElement && p.contains(document.activeElement) && document.activeElement.matches("input,textarea") && !S.forceSide) return;
    S.forceSide = false;
    var h = "";
    if (S.tab === "export") h = exportPanel();
    else if (S.tab === "ai") h = aiPanel();
    else if (S.sel.nodes.length === 1) {
      var n = node(S.sel.nodes[0]);
      var dis = ed ? "" : " disabled";
      h = '<h3>' + esc(SHAPE_OK[n.shape]) + ' <small class="mono">' + esc(n.id) + "</small></h3>" +
        '<label>글자<textarea data-fe-field="n.label" rows="3"' + dis + ">" + esc(n.label) + "</textarea></label>" +
        '<label>도형<select data-fe-field="n.shape"' + dis + ">" + SHAPES.map(function (s) { return opt(s[0], s[1], n.shape); }).join("") + "</select></label>" +
        '<label>레인<select data-fe-field="n.lane"' + dis + ">" + S.doc.lanes.map(function (l) { return opt(l.id, l.label, n.lane); }).join("") + "</select></label>" +
        '<label>화면 ID<input data-fe-field="n.screenId" list="fe-screens" value="' + esc(n.screenId || "") + '" placeholder="없으면 비움"' + dis + '></label><datalist id="fe-screens">' + (o.screens || []).map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + "</option>"; }).join("") + "</datalist>" +
        '<label>Task <small>(쉼표로 구분)</small><input data-fe-field="n.taskIds" list="fe-tasks" value="' + esc((n.taskIds || []).join(", ")) + '"' + dis + '></label><datalist id="fe-tasks">' + (o.tasks || []).map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.label) + "</option>"; }).join("") + "</datalist>" +
        (ed ? '<div class="fe-row"><b>다음 단계 추가</b><div class="fe-mini">' + SHAPES.slice(0, 6).map(function (s) { return '<button data-fe-act="next" data-fe-shape="' + s[0] + '" title="' + s[1] + '">' + icon(s[0]) + "</button>"; }).join("") + "</div></div>" +
          (n.x != null ? '<button class="fe-b wide" data-fe-act="unpin">자동 배치로 되돌리기</button>' : "") + '<button class="fe-b wide danger" data-fe-act="del">삭제 (Delete)</button>' : "");
    } else if (S.sel.nodes.length > 1) {
      h = "<h3>도형 " + S.sel.nodes.length + "개 선택</h3>" + (ed ? '<label>레인 한꺼번에 바꾸기<select data-fe-field="multi.lane"><option value="">선택</option>' + S.doc.lanes.map(function (l) { return opt(l.id, l.label); }).join("") + '</select></label><button class="fe-b wide" data-fe-act="unpin">자동 배치로 되돌리기</button><button class="fe-b wide danger" data-fe-act="del">모두 삭제</button>' : "");
    } else if (S.sel.edge != null) {
      var e = S.doc.edges[S.sel.edge], a = node(e.from), b = node(e.to);
      h = "<h3>연결선</h3><p class=\"fe-note\">" + esc(a ? a.label : e.from) + " → " + esc(b ? b.label : e.to) + "</p>" +
        '<label>조건·라벨<input data-fe-field="e.label" value="' + esc(e.label || "") + '" placeholder="예: 승인 / 반려"' + (ed ? "" : " disabled") + "></label>" +
        (ed ? '<button class="fe-b wide" data-fe-act="flip">방향 바꾸기</button><button class="fe-b wide danger" data-fe-act="del">삭제 (Delete)</button>' : "");
    } else if (S.sel.lane) {
      var li = S.doc.lanes.findIndex(function (l) { return l.id === S.sel.lane; }), l = S.doc.lanes[li], cnt = S.doc.nodes.filter(function (n) { return n.lane === l.id; }).length;
      h = "<h3>레인</h3>" + '<label>이름<input data-fe-field="l.label" value="' + esc(l.label) + '"' + (ed ? "" : " disabled") + "></label>" +
        '<label>시스템<select data-fe-field="l.systemCode"' + (ed ? "" : " disabled") + ">" + opt("", "(없음)", l.systemCode || "") + (o.systems || []).map(function (s) { return opt(s.code, s.code + " " + s.name, l.systemCode); }).join("") + "</select></label>" +
        '<p class="fe-note">도형 ' + cnt + "개</p>" +
        (ed ? '<div class="fe-row2"><button class="fe-b" data-fe-act="lane-up"' + (li ? "" : " disabled") + '>위로</button><button class="fe-b" data-fe-act="lane-down"' + (li < S.doc.lanes.length - 1 ? "" : " disabled") + '>아래로</button></div><button class="fe-b wide danger" data-fe-act="del"' + (cnt ? ' title="도형이 있는 레인은 도형을 옮긴 뒤 지울 수 있습니다"' : "") + ">레인 삭제</button>" : "");
    } else {
      var d = S.doc;
      h = "<h3>플로우</h3><p class=\"fe-note\">" + esc(d.id) + " · 레인 " + d.lanes.length + " · 도형 " + d.nodes.length + " · 연결 " + d.edges.length + "</p>" +
        '<div class="fe-lanes"><b>레인 (위→아래)</b>' + d.lanes.map(function (l) { return '<button class="fe-lane" data-fe-lane="' + esc(l.id) + '"><i style="background:' + esc((l.systemCode && o.color && o.color(l.systemCode)) || "#7B8794") + '"></i>' + esc(l.label) + "</button>"; }).join("") + (ed ? '<button class="fe-b wide" data-fe-act="lane-add">+ 레인 추가</button>' : "") + "</div>" +
        (ed ? '<div class="fe-help"><b>그리는 법</b><ol><li>왼쪽 도구에서 도형을 고르고 캔버스(레인 안)를 누르면 그 자리에 놓입니다.</li><li>도형을 고르면 오른쪽에 파란 ▶ 손잡이가 생깁니다. 끌어서 다른 도형에 놓으면 연결됩니다. ‘연결’ 도구로 두 도형을 차례로 눌러도 됩니다.</li><li>두 번 누르면 글자를 바로 고칩니다. 도형 크기는 글자 수에 맞춰 자동으로 바뀝니다.</li><li>‘자동 정렬’은 직접 옮긴 위치를 지우고 흐름 순서대로 다시 배치합니다.</li><li>‘✦ AI’ 탭에서 요청하면 AI가 같은 도구로 그리거나 고칩니다.</li></ol></div>' : "");
    }
    p.innerHTML = h;
  }
  function aiPanel() {
    var ai = S.o.ai;
    if (!ai) return "";
    var empty = S.doc.nodes.length < 3;
    return "<h3>✦ AI로 그리기·고치기</h3>" + (ai.available ? '<p class="fe-note">연결: ' + esc(ai.label || "AI") + "</p>" : '<p class="fe-note warn">AI 설정이 없습니다. AI 설정에서 연결을 등록하세요.</p>') +
      '<p class="fe-note">' + (empty ? "요구사항·Task·기능 명세를 근거로 AI가 도형·연결·레인 도구로 플로우를 그립니다. 추가로 원하는 점을 적어도 됩니다." : "지금 캔버스를 바탕으로 AI가 고칩니다. 결과는 캔버스에 바로 그려지고(되돌리기 가능), 저장을 눌러야 반영됩니다.") + "</p>" +
      '<label>요청<textarea data-fe-field="ai" rows="5" placeholder="' + (empty ? "예: 반려 시 보완 요청을 문자로 알리고 재신청하는 흐름 포함" : "예: 반려 사유 입력 단계 추가, 외부 연계는 별도 레인으로") + '">' + esc(S.aiDraft) + "</textarea></label>" +
      (S.aiBusy ? '<div class="fe-busy"><span class="fe-spin"></span>AI가 그리는 중… <button class="fe-b" data-fe-act="ai-stop">멈춤</button></div>' : '<button class="fe-b wide fe-primary" data-fe-act="ai-run"' + (ai.available ? "" : " disabled") + ">" + (empty ? "AI로 그리기" : "AI로 고치기") + "</button>") +
      (S.aiErr ? '<p class="fe-err" role="alert">' + esc(S.aiErr) + "</p>" : "") +
      '<p class="fe-note">AI에게는 쓸 수 있는 도형 7종과 규칙(시작·종료, 판단은 조건 라벨, 되돌아가는 흐름, 레인 순서)을 함께 보냅니다. 위치·크기는 자동 배치가 정합니다.</p>';
  }
  function exportPanel() {
    return "<h3>내보내기</h3>" +
      '<button class="fe-b wide" data-fe-act="x-pdf">PDF 내려받기</button>' +
      '<button class="fe-b wide" data-fe-act="x-pptx">PPT(PPTX) 내려받기 <small>도형·글자 편집 가능</small></button>' +
      '<button class="fe-b wide" data-fe-act="x-png">PNG 이미지</button>' +
      '<button class="fe-b wide" data-fe-act="x-svg">SVG 벡터</button>' +
      '<hr><b>Figma</b><button class="fe-b wide" data-fe-act="x-figsvg">Figma용 SVG 복사 <small>Figma에서 Ctrl+V → 벡터로 붙음</small></button>' +
      '<button class="fe-b wide" data-fe-act="x-figprompt">Figma AI 프롬프트 복사 <small>Figma MCP가 연결된 Claude에 붙여 넣기</small></button>' +
      '<p class="fe-note">모두 화면과 같은 배치·범례로 만들어집니다. 제목과 레인은 내보내기 파일 위쪽에 들어갑니다.</p>';
  }

  // ── 이벤트 ──────────────────────────────────
  function pt(ev) {
    var svg = S.el.querySelector(".fe-svg"), r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / S.z, y: (ev.clientY - r.top) / S.z };
  }
  function laneAt(y) {
    var L = S.L, ls = L.lanes;
    for (var i = 0; i < ls.length; i++) if (y < ls[i].top + ls[i].h) return ls[i];
    return ls[ls.length - 1];
  }
  function setPos(n, cx, cy) {
    var L = S.L, lane = laneAt(cy), g = 10;
    cx = Math.round(cx / g) * g; cy = Math.round(cy / g) * g;
    n.lane = S.doc.lanes[lane.idx].id;
    n.x = Math.max(20, cx - L.left0);
    n.y = Math.max(20, cy - lane.top - (lane.idx === 0 ? L.topExtra || 0 : 0));
  }
  function onDown(ev) {
    if (!S || ev.button > 0) return;
    var t = ev.target, ed = S.o.editable;
    hideInline(true);
    var hd = t.closest && t.closest("[data-fe-handle]");
    if (hd && ed) { S.connectFrom = hd.getAttribute("data-fe-handle"); S.drag = { kind: "link" }; renderCanvas(); moveTmp(ev); ev.preventDefault(); return; }
    var g = t.closest && t.closest("[data-nid]"), eg = t.closest && t.closest("[data-eid]"), lg = t.closest && t.closest("[data-lid]");
    var p = pt(ev);
    if (S.tool.indexOf("add:") === 0 && ed && !g) {
      var sh = S.tool.slice(4);
      mut(function (d) {
        var id = newId("n", d.nodes), n = { id: id, shape: sh, label: sh === "TERMINATOR" ? (d.nodes.some(function (x) { return x.shape === "TERMINATOR"; }) ? "종료" : "시작") : SHAPE_OK[sh], taskIds: [], change: "NEW" };
        d.nodes.push(n);
        setPos(n, p.x, p.y);
        S.sel = { nodes: [id], edge: null, lane: null };
      });
      if (!ev.shiftKey) S.tool = "select";
      render();
      setTimeout(function () { startInline(S.sel.nodes[0], true); }, 20);
      ev.preventDefault();
      return;
    }
    if (g && S.tool.indexOf("add:") === 0 && ed) {
      // 도형 위를 누르면 그 도형 다음 단계로 붙여 넣는다
      S.sel = { nodes: [g.getAttribute("data-nid")], edge: null, lane: null };
      var shp = S.tool.slice(4);
      if (!ev.shiftKey) S.tool = "select";
      action("next", { getAttribute: function () { return shp; } });
      ev.preventDefault();
      return;
    }
    if (g) {
      var id = g.getAttribute("data-nid");
      if (S.tool === "connect" && ed) {
        if (!S.connectFrom) { S.connectFrom = id; render(); moveTmp(ev); }
        else { link(S.connectFrom, id); S.connectFrom = null; render(); }
        ev.preventDefault();
        return;
      }
      if (ev.shiftKey) {
        var i = S.sel.nodes.indexOf(id);
        if (i >= 0) S.sel.nodes.splice(i, 1); else S.sel.nodes.push(id);
      } else if (S.sel.nodes.indexOf(id) < 0) S.sel.nodes = [id];
      S.sel.edge = null; S.sel.lane = null;
      if (ed) {
        var starts = {};
        S.sel.nodes.forEach(function (nid) { var nd = S.L.nodes[nid]; if (nd) starts[nid] = [nd.cx, nd.cy]; });
        S.drag = { kind: "node", sx: p.x, sy: p.y, starts: starts, moved: false };
      }
      S.forceSide = true;
      render();
      ev.preventDefault();
      return;
    }
    if (eg) { S.sel = { nodes: [], edge: Number(eg.getAttribute("data-eid")), lane: null }; S.forceSide = true; render(); ev.preventDefault(); return; }
    if (lg && p.x < S.L.LW) { S.sel = { nodes: [], edge: null, lane: lg.getAttribute("data-lid") }; S.forceSide = true; render(); ev.preventDefault(); return; }
    if (S.tool === "connect") { S.connectFrom = null; render(); return; }
    // 빈 곳: 선택 해제 + 끌어서 화면 이동
    S.sel = { nodes: [], edge: null, lane: null };
    S.forceSide = true;
    S.drag = { kind: "pan", x: ev.clientX, y: ev.clientY, l: S.view.scrollLeft, t: S.view.scrollTop };
    render();
  }
  function moveTmp(ev) {
    var l = S.el.querySelector("#fe-tmp");
    if (!l) return;
    var p = pt(ev);
    l.setAttribute("x2", p.x); l.setAttribute("y2", p.y);
  }
  var raf = 0;
  function onMove(ev) {
    if (!S) return;
    if (S.connectFrom) moveTmp(ev);
    var d = S.drag;
    if (!d) return;
    if (d.kind === "pan") { S.view.scrollLeft = d.l - (ev.clientX - d.x); S.view.scrollTop = d.t - (ev.clientY - d.y); return; }
    if (d.kind !== "node") return;
    var p = pt(ev), dx = p.x - d.sx, dy = p.y - d.sy;
    if (!d.moved && Math.hypot(dx, dy) * S.z < 4) return;
    if (!d.moved) { snap(); d.moved = true; }
    Object.keys(d.starts).forEach(function (id) { var n = node(id); if (n) setPos(n, d.starts[id][0] + dx, d.starts[id][1] + dy); });
    if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (S) renderCanvas(); });
  }
  function onUp(ev) {
    if (!S || !S.drag) return;
    var d = S.drag;
    S.drag = null;
    if (d.kind === "link") {
      var el = document.elementFromPoint(ev.clientX, ev.clientY), g = el && el.closest && el.closest("[data-nid]");
      if (g && g.getAttribute("data-nid") !== S.connectFrom) link(S.connectFrom, g.getAttribute("data-nid"));
      S.connectFrom = null;
      render();
      return;
    }
    if (d.kind === "node" && d.moved) render();
  }
  function link(a, b) {
    if (!a || !b || a === b) return;
    if (S.doc.edges.some(function (e) { return e.from === a && e.to === b; })) { S.o.toast && S.o.toast("이미 연결돼 있습니다"); return; }
    mut(function (d) { d.edges.push({ from: a, to: b, label: "" }); S.sel = { nodes: [], edge: d.edges.length - 1, lane: null }; });
    S.forceSide = true;
    var from = node(a);
    if (from && from.shape === "DECISION") setTimeout(function () { startEdgeInline(S.sel.edge); }, 20);
  }
  function onWheel(ev) {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();
    var r = S.view.getBoundingClientRect();
    zoomTo(S.z * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), ev.clientX - r.left, ev.clientY - r.top);
  }
  function onDbl(ev) {
    if (!S || !S.o.editable) return;
    var t = ev.target, g = t.closest && t.closest("[data-nid]"), eg = t.closest && t.closest("[data-eid]"), lg = t.closest && t.closest("[data-lid]");
    if (g) return startInline(g.getAttribute("data-nid"));
    if (eg) return startEdgeInline(Number(eg.getAttribute("data-eid")));
    if (lg && pt(ev).x < S.L.LW) { S.sel = { nodes: [], edge: null, lane: lg.getAttribute("data-lid") }; S.forceSide = true; render(); var i = S.el.querySelector('[data-fe-field="l.label"]'); if (i) { i.focus(); i.select(); } }
  }
  // 도형 위에 바로 글자 고치기
  function startInline(id, fresh) {
    var nd = S.L && S.L.nodes[id], n = node(id);
    if (!nd || !n) return;
    var ta = S.el.querySelector(".fe-inline"), svg = S.el.querySelector(".fe-svg"), vr = S.view.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    var w = Math.max(nd.w, 150) * S.z, h = Math.max(nd.h, 60) * S.z;
    ta.style.left = (sr.left - vr.left + S.view.scrollLeft + (nd.cx * S.z) - w / 2) + "px";
    ta.style.top = (sr.top - vr.top + S.view.scrollTop + (nd.cy * S.z) - h / 2) + "px";
    ta.style.width = w + "px"; ta.style.height = h + "px";
    ta.style.fontSize = Math.max(12, 13 * S.z) + "px";
    ta.value = n.label;
    ta.hidden = false;
    S.inline = { kind: "node", id: id, before: n.label, fresh: fresh };
    ta.focus();
    ta.select();
  }
  function startEdgeInline(i) {
    var e = S.L && S.L.edges.find(function (x) { return x.i === i; });
    if (!e) return;
    var ta = S.el.querySelector(".fe-inline"), svg = S.el.querySelector(".fe-svg"), vr = S.view.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    var p = e.lp || { x: (e.pts[0][0] + e.pts[1][0]) / 2, y: (e.pts[0][1] + e.pts[1][1]) / 2 };
    ta.style.left = (sr.left - vr.left + S.view.scrollLeft + p.x * S.z - 60) + "px";
    ta.style.top = (sr.top - vr.top + S.view.scrollTop + p.y * S.z - 16) + "px";
    ta.style.width = "120px"; ta.style.height = "30px"; ta.style.fontSize = "12px";
    ta.value = S.doc.edges[i].label || "";
    ta.hidden = false;
    S.inline = { kind: "edge", i: i, before: ta.value };
    S.sel = { nodes: [], edge: i, lane: null };
    ta.focus();
    ta.select();
  }
  function hideInline(commit) {
    var ta = S && S.el.querySelector(".fe-inline");
    if (!ta || ta.hidden || !S.inline) return;
    var v = ta.value.replace(/\s+$/, ""), inl = S.inline;
    ta.hidden = true;
    S.inline = null;
    if (!commit || v === inl.before) return render();
    mut(function (d) {
      if (inl.kind === "node") { var n = d.nodes.find(function (x) { return x.id === inl.id; }); if (n) n.label = v; }
      else if (d.edges[inl.i]) d.edges[inl.i].label = v.replace(/\n/g, " ");
    });
    S.forceSide = true;
    render();
  }
  function onFocus(ev) {
    var f = ev.target.getAttribute && ev.target.getAttribute("data-fe-field");
    if (f && f !== "ai" && f !== "title") S.fieldSnap = true;
  }
  function onInput(ev) {
    var t = ev.target;
    if (t.classList.contains("fe-inline")) return;
    var f = t.getAttribute("data-fe-field");
    if (!f) return;
    if (f === "ai") { S.aiDraft = t.value; return; }
    if (S.fieldSnap) { snap(); S.fieldSnap = false; }
    applyField(f, t.value);
    renderCanvas();
    var st = S.el.querySelector("#fe-state");
    if (st) { st.textContent = dirty() ? "● 저장 안 됨" : "저장됨"; st.className = "fe-state" + (dirty() ? " on" : ""); }
  }
  function onChange(ev) {
    var t = ev.target, f = t.getAttribute("data-fe-field");
    if (!f || t.tagName !== "SELECT") return;
    if (f === "multi.lane") { if (t.value) mut(function (d) { d.nodes.forEach(function (n) { if (S.sel.nodes.indexOf(n.id) >= 0) { n.lane = t.value; delete n.x; delete n.y; } }); }); return; }
    mut(function () { applyField(f, t.value); });
    S.forceSide = true;
    render();
  }
  function applyField(f, v) {
    var d = S.doc;
    if (f === "title") d.title = v;
    else if (f.indexOf("n.") === 0) {
      var n = node(S.sel.nodes[0]);
      if (!n) return;
      var k = f.slice(2);
      if (k === "taskIds") n.taskIds = v.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      else if (k === "screenId") { if (v.trim()) n.screenId = v.trim(); else delete n.screenId; }
      else if (k === "lane") { n.lane = v; delete n.x; delete n.y; }
      else n[k] = v;
    } else if (f === "e.label" && d.edges[S.sel.edge]) d.edges[S.sel.edge].label = v;
    else if (f.indexOf("l.") === 0) {
      var l = d.lanes.find(function (x) { return x.id === S.sel.lane; });
      if (!l) return;
      if (f === "l.systemCode") { if (v) l.systemCode = v; else delete l.systemCode; } else l.label = v;
    }
  }
  function onClick(ev) {
    var t = ev.target, b = t.closest && t.closest("button");
    if (!b || !S) return;
    var tool = b.getAttribute("data-fe-tool"), tab = b.getAttribute("data-fe-tab"), act = b.getAttribute("data-fe-act"), lane = b.getAttribute("data-fe-lane");
    if (tool) { S.tool = S.tool === tool && tool !== "select" ? "select" : tool; S.connectFrom = null; render(); S.view.focus(); return; }
    if (tab) { S.tab = tab; S.forceSide = true; render(); return; }
    if (lane) { S.sel = { nodes: [], edge: null, lane: lane }; S.forceSide = true; render(); return; }
    if (act) action(act, b);
  }
  function action(act, b) {
    var o = S.o, d = S.doc;
    switch (act) {
      case "close": return close();
      case "undo": return undo();
      case "redo": return redo();
      case "zin": return zoomTo(S.z * 1.2);
      case "zout": return zoomTo(S.z / 1.2);
      case "z100": return zoomTo(1);
      case "fit": return fit();
      case "relayout": return mut(function (x) { x.nodes.forEach(function (n) { delete n.x; delete n.y; }); });
      case "unpin": return mut(function (x) { x.nodes.forEach(function (n) { if (S.sel.nodes.indexOf(n.id) >= 0) { delete n.x; delete n.y; } }); });
      case "lane-add":
        return mut(function (x) { var id = newId("L", x.lanes); x.lanes.push({ id: id, label: "새 레인" }); S.sel = { nodes: [], edge: null, lane: id }; S.forceSide = true; S.tab = "props"; });
      case "lane-up": case "lane-down": return mut(function (x) {
        var i = x.lanes.findIndex(function (l) { return l.id === S.sel.lane; }), j = act === "lane-up" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= x.lanes.length) return;
        var t = x.lanes[i]; x.lanes[i] = x.lanes[j]; x.lanes[j] = t;
        x.nodes.forEach(function (n) { delete n.x; delete n.y; });
      });
      case "flip": return mut(function (x) { var e = x.edges[S.sel.edge]; var t = e.from; e.from = e.to; e.to = t; });
      case "del": return del();
      case "next": {
        var cur = node(S.sel.nodes[0]), sh = b.getAttribute("data-fe-shape");
        if (!cur) return;
        return mut(function (x) {
          var id = newId("n", x.nodes), n = { id: id, shape: sh, label: SHAPE_OK[sh], lane: cur.lane, taskIds: [], change: "NEW" };
          if (cur.x != null) { var nd = S.L.nodes[cur.id]; n.x = cur.x + nd.w / 2 + 110 + FL.nodeSize(n).w / 2; n.y = cur.y; }
          x.nodes.push(n);
          x.edges.push({ from: cur.id, to: id, label: "" });
          S.sel = { nodes: [id], edge: null, lane: null };
          S.forceSide = true;
          setTimeout(function () { startInline(id, true); }, 20);
        });
      }
      case "save": return save();
      case "ai-run": return aiRun();
      case "ai-stop": if (S.aiCtl) S.aiCtl.abort(); return;
      case "x-svg": case "x-png": case "x-pdf": case "x-pptx": case "x-figsvg": case "x-figprompt": return doExport(act, b);
    }
  }
  function del() {
    if (!S.o.editable) return;
    if (S.sel.nodes.length) {
      var rm = {};
      S.sel.nodes.forEach(function (id) { rm[id] = true; });
      mut(function (x) { x.nodes = x.nodes.filter(function (n) { return !rm[n.id]; }); x.edges = x.edges.filter(function (e) { return !rm[e.from] && !rm[e.to]; }); S.sel.nodes = []; });
    } else if (S.sel.edge != null) mut(function (x) { x.edges.splice(S.sel.edge, 1); S.sel.edge = null; });
    else if (S.sel.lane) {
      if (S.doc.nodes.some(function (n) { return n.lane === S.sel.lane; })) { S.o.toast && S.o.toast("도형이 있는 레인은 지울 수 없습니다. 도형을 다른 레인으로 옮기거나 지운 뒤 삭제하세요", "err"); return; }
      if (S.doc.lanes.length < 2) { S.o.toast && S.o.toast("레인은 하나 이상 있어야 합니다", "err"); return; }
      mut(function (x) { x.lanes = x.lanes.filter(function (l) { return l.id !== S.sel.lane; }); S.sel.lane = null; });
    }
    S.forceSide = true;
    render();
  }
  function onKey(ev) {
    if (!S) return;
    var t = ev.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
    var mod = ev.ctrlKey || ev.metaKey;
    if (t && t.classList && t.classList.contains("fe-inline")) {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); hideInline(false); }
      else if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); hideInline(true); }
      return;
    }
    if (mod && (ev.key === "s" || ev.key === "S")) { ev.preventDefault(); ev.stopPropagation(); if (S.o.editable && S.o.save) save(); return; }
    if (ev.key === "Escape") {
      ev.preventDefault(); ev.stopPropagation();
      if (S.connectFrom || S.tool !== "select") { S.connectFrom = null; S.tool = "select"; render(); }
      else if (S.sel.nodes.length || S.sel.edge != null || S.sel.lane) { S.sel = { nodes: [], edge: null, lane: null }; S.forceSide = true; render(); }
      else close();
      return;
    }
    if (typing) return;
    ev.stopPropagation();
    if (mod && (ev.key === "z" || ev.key === "Z")) { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if (mod && (ev.key === "y" || ev.key === "Y")) { ev.preventDefault(); redo(); return; }
    if (!S.o.editable) return;
    if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); del(); return; }
    if (ev.key === "Enter" && S.sel.nodes.length === 1) { ev.preventDefault(); startInline(S.sel.nodes[0]); return; }
    if (/^Arrow/.test(ev.key) && S.sel.nodes.length) {
      ev.preventDefault();
      var dx = ev.key === "ArrowLeft" ? -10 : ev.key === "ArrowRight" ? 10 : 0, dy = ev.key === "ArrowUp" ? -10 : ev.key === "ArrowDown" ? 10 : 0;
      mut(function () { S.sel.nodes.forEach(function (id) { var nd = S.L.nodes[id], n = node(id); if (nd && n) setPos(n, nd.cx + dx, nd.cy + dy); }); });
      return;
    }
    if (mod) return;
    var k = ev.key.toLowerCase();
    if (k === "v") { S.tool = "select"; S.connectFrom = null; render(); }
    else if (k === "c") { S.tool = "connect"; render(); }
    else if (/^[1-7]$/.test(k)) { S.tool = "add:" + SHAPES[Number(k) - 1][0]; render(); }
  }

  // ── 저장 · AI · 내보내기 ─────────────────────
  function save() {
    if (!S.o.save) return;
    var btn = S.el.querySelector('[data-fe-act="save"]'), doc = sanitize(S.doc, S.doc, true, S.o.systems);
    if (!doc.nodes.length) { S.o.toast && S.o.toast("도형이 하나 이상 있어야 저장할 수 있습니다", "err"); return; }
    if (btn) { btn.disabled = true; btn.textContent = "저장 중…"; }
    Promise.resolve(S.o.save(doc)).then(function () {
      if (!S) return;
      S.doc = doc;
      S.saved = JSON.stringify(doc);
      S.o.toast && S.o.toast("플로우를 저장했습니다");
      render();
    }, function (e) { S && S.o.toast && S.o.toast("저장하지 못했습니다: " + (e && e.message || e), "err"); }).then(function () {
      var b2 = S && S.el.querySelector('[data-fe-act="save"]');
      if (b2) { b2.disabled = false; b2.textContent = "저장"; }
    });
  }
  function aiRun() {
    var ai = S.o.ai, ta = S.el.querySelector('[data-fe-field="ai"]'), ins = ta ? ta.value.trim() : S.aiDraft;
    S.aiDraft = ins;
    var cur = sanitize(S.doc, S.doc, false, S.o.systems), empty = cur.nodes.length < 3, prompt = ai.prompt();
    var input = empty ? prompt + (ins ? "\n## 추가 지시\n" + ins + "\n" : "") :
      [{ role: "user", content: prompt }, { role: "assistant", content: JSON.stringify(cur) }, { role: "user", content: (ai.refine || "") + (ins || "위 플로우를 규칙에 맞게 다듬어 주세요 (빠진 시작·종료, 판단 조건 라벨, 끊어진 노드 보완)") }];
    S.aiBusy = true; S.aiErr = ""; S.aiCtl = new AbortController();
    S.forceSide = true; render();
    ai.run(input, S.aiCtl.signal).then(function (out) {
      if (!S) return;
      var f = out && (out.flow || out);
      var next = sanitize(f, S.doc, false, S.o.systems);
      if (!next.nodes.length) throw new Error("AI 결과에 도형(nodes)이 없습니다");
      next.id = S.doc.id;
      mut(function () { S.doc = next; });
      S.o.toast && S.o.toast("AI가 그린 결과를 캔버스에 불러왔습니다. 확인 후 저장하세요 (되돌리기 가능)");
    }).catch(function (e) {
      if (!S) return;
      S.aiErr = e && (e.code === "cancelled" || e.name === "AbortError") ? "" : (e && e.message) || String(e);
    }).then(function () { if (!S) return; S.aiBusy = false; S.aiCtl = null; S.forceSide = true; render(); fit(); });
  }
  function doExport(act, b) {
    var o = S.o, doc = sanitize(S.doc, S.doc, true, o.systems), bx = FX.build(doc, { color: o.color, project: o.project });
    var old = b.innerHTML, busy = function () { b.disabled = true; b.textContent = "만드는 중…"; }, done = function (msg) { b.disabled = false; b.innerHTML = old; if (msg) o.toast && o.toast(msg); };
    var fail = function (e) { b.disabled = false; b.innerHTML = old; o.toast && o.toast("내보내지 못했습니다: " + (e && e.message || e), "err"); };
    var copy = function (text, msg) {
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error("클립보드를 쓸 수 없습니다"))).then(function () { done(msg); }, fail);
    };
    if (act === "x-svg") { FX.download(new Blob([bx.svg], { type: "image/svg+xml" }), FX.fileName(doc, "svg")); return; }
    if (act === "x-pptx") { FX.download(new Blob([FX.pptx(doc, bx, { project: o.project })], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), FX.fileName(doc, "pptx")); return; }
    if (act === "x-figsvg") { busy(); return copy(bx.svg, "SVG를 복사했습니다. Figma 캔버스에서 Ctrl+V(⌘V) 하면 벡터로 붙습니다"); }
    if (act === "x-figprompt") { busy(); return copy(FX.figmaPrompt(doc, bx, { project: o.project }), "Figma 프롬프트를 복사했습니다. Figma MCP가 연결된 Claude에 붙여 넣으세요"); }
    busy();
    (act === "x-png" ? FX.toPng(bx, 2).then(function (bl) { FX.download(bl, FX.fileName(doc, "png")); }) : FX.toPdf(bx).then(function (bl) { FX.download(bl, FX.fileName(doc, "pdf")); })).then(function () { done(); }, fail);
  }

  root.FlowEdit = { open: open, close: close, sanitize: sanitize, isOpen: function () { return !!S; } };
})(typeof window !== "undefined" ? window : globalThis);
