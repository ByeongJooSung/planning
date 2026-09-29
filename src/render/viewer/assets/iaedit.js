/*
 * 정보구조도 캔버스 편집기 (전체 화면)
 *  - 왼쪽 → 오른쪽으로 펼친 사이트맵. 메뉴는 색 채운 상자, 화면은 화면 ID·종류·Task 수·화면설계서 상태를 함께 보인다
 *  - 끌어서 옮기기: 상자 가운데에 놓으면 그 아래(하위)로, 위·아래 끝에 놓으면 같은 단계에서 앞·뒤로
 *  - 두 번 누르면 이름을 바로 고치고, 오른쪽 패널에서 종류·로그인·변경 구분·Task 연결을 바꾼다
 *  - AI 탭: 지금 구조를 바탕으로 AI가 메뉴·화면을 고친다 · 내보내기: SVG · PNG · PDF
 * IaEdit.open(opts) — opts: {system:{code,name,color}, nodes, editable, tasks:[{id,label,systemCode}], status(id)→{status,label},
 *   hasSb(id)→bool, project, save(nodes)→Promise(nodes), openScreen(id), ai:{available,label,refine,prompt(),run(input,signal)}, toast(msg,tone), onClose()}
 */
(function (root) {
  "use strict";
  var FL = root.FlowLayout, FX = root.FlowExport;
  var KINDS = [["MENU", "메뉴"], ["PAGE", "페이지"], ["POPUP", "팝업"], ["LAYER", "레이어"], ["TAB", "탭"], ["EXTERNAL", "외부"]];
  var KIND = {};
  KINDS.forEach(function (k) { KIND[k[0]] = k[1]; });
  var CHG = [["NEW", "신규"], ["CHANGED", "변경"], ["DELETED", "삭제"], ["KEPT", "유지"]];
  var ROOT = "__root";
  var G = { colGap: 64, rowGap: 12, pad: 28, menuH: 38, scrH: 54, minW: 132, maxW: 280 };
  var esc = function (s) { return FL.esc(s); };
  var S = null;
  var tmpN = 0;

  // ── 문서 정리 ────────────────────────────────
  var isObj = function (v) { return v && typeof v === "object" && !Array.isArray(v); };
  function sanitize(list) {
    var seen = {};
    var out = (Array.isArray(list) ? list : []).filter(isObj).map(function (n) {
      var id = String(n.id || "new:" + ++tmpN);
      while (seen[id]) id = "new:" + ++tmpN;
      seen[id] = true;
      var o = { id: id, parentId: n.parentId ? String(n.parentId) : null, name: String(n.name == null ? "" : n.name).trim() || "이름 없음", kind: KIND[n.kind] ? n.kind : "PAGE",
        loginRequired: !!n.loginRequired, roles: Array.isArray(n.roles) ? n.roles.map(String) : [], taskIds: Array.isArray(n.taskIds) ? n.taskIds.map(String) : [],
        change: ["NEW", "CHANGED", "DELETED", "KEPT"].indexOf(n.change) >= 0 ? n.change : "NEW" };
      if (n.changeReason) o.changeReason = String(n.changeReason);
      // 정보구조도 표(엑셀)에서 관리하는 항목은 그대로 넘긴다
      ["devices", "func", "boardType", "pages", "track", "devNeeded", "note", "decision"].forEach(function (k) { if (n[k] != null) o[k] = JSON.parse(JSON.stringify(n[k])); });
      if (o.kind === "MENU") o.taskIds = [];
      return o;
    });
    out.forEach(function (n) { if (n.parentId && (!seen[n.parentId] || n.parentId === n.id)) n.parentId = null; });
    // 순환 끊기
    var byId = {};
    out.forEach(function (n) { byId[n.id] = n; });
    out.forEach(function (n) {
      var cur = n, guard = {};
      while (cur && cur.parentId) { if (guard[cur.id]) { n.parentId = null; break; } guard[cur.id] = true; cur = byId[cur.parentId]; }
    });
    return out;
  }
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  function byId(id) { return S.nodes.find(function (n) { return n.id === id; }); }
  function kids(pid) { return S.nodes.filter(function (n) { return (n.parentId || ROOT) === pid; }); }
  function isDesc(id, anc) {
    var cur = byId(id), guard = {};
    while (cur && cur.parentId && !guard[cur.id]) { if (cur.parentId === anc) return true; guard[cur.id] = true; cur = byId(cur.parentId); }
    return false;
  }
  function subtree(id) {
    var out = [id];
    kids(id).forEach(function (k) { out = out.concat(subtree(k.id)); });
    return out;
  }

  // ── 배치 (왼쪽 → 오른쪽 트리) ─────────────────
  function size(n) {
    if (n.id === ROOT) return { w: Math.max(150, FL.measure(n.name, 14, true) + 36), h: 44, lines: [n.name] };
    var menu = n.kind === "MENU", fs = 13;
    var lines = FL.wrap(n.name, G.maxW - 28, fs, true).slice(0, 2);
    var tw = Math.max.apply(null, lines.map(function (l) { return FL.measure(l, fs, true); }));
    var sub = menu ? 0 : FL.measure(n.id, 10.5, false) + 12 + (n.kind !== "PAGE" ? FL.measure(KIND[n.kind], 10, true) + 16 : 0) + 34;
    var w = Math.min(G.maxW, Math.max(G.minW, Math.ceil(Math.max(tw, sub) + 28)));
    var h = (menu ? G.menuH : G.scrH) + (lines.length - 1) * 17;
    return { w: Math.ceil(w / 2) * 2, h: h, lines: lines };
  }
  function layout() {
    var sys = S.o.system, L = { nodes: {}, edges: [], W: 0, H: 0 };
    var rootN = { id: ROOT, name: sys.name + " (" + sys.code + ")", kind: "ROOT" };
    var depthW = [], items = [];
    function walk(n, d) {
      var sz = size(n), ch = S.collapsed[n.id] ? [] : kids(n.id);
      var it = { id: n.id, n: n, d: d, w: sz.w, h: sz.h, lines: sz.lines, kids: [], hidden: S.collapsed[n.id] ? subtree(n.id).length - 1 : 0 };
      depthW[d] = Math.max(depthW[d] || 0, sz.w);
      items.push(it);
      it.kids = ch.map(function (c) { return walk(c, d + 1); });
      return it;
    }
    var top = walk(rootN, 0);
    var X = [G.pad];
    for (var d = 1; d < depthW.length; d++) X[d] = X[d - 1] + depthW[d - 1] + G.colGap;
    var cursor = G.pad;
    function place(it) {
      it.x = X[it.d];
      if (!it.kids.length) { it.y = cursor; cursor += it.h + G.rowGap; }
      else {
        it.kids.forEach(place);
        var a = it.kids[0], b = it.kids[it.kids.length - 1];
        var mid = (a.y + a.h / 2 + b.y + b.h / 2) / 2;
        it.y = Math.max(mid - it.h / 2, it === top ? G.pad : 0);
        // 한 칸 위 형제 영역과 겹치지 않도록 (자식이 적어 부모가 더 클 때)
        if (it.y + it.h + G.rowGap > cursor) cursor = it.y + it.h + G.rowGap;
      }
      it.cx = it.x + it.w / 2; it.cy = it.y + it.h / 2;
      L.nodes[it.id] = it;
      it.kids.forEach(function (k) { L.edges.push({ from: it, to: k }); });
    }
    place(top);
    items.forEach(function (it) { L.W = Math.max(L.W, it.x + it.w + G.pad + (it.hidden ? 40 : 0)); L.H = Math.max(L.H, it.y + it.h + G.pad); });
    L.W = Math.max(L.W, 480);
    return L;
  }

  // ── 그리기 ──────────────────────────────────
  var STC = { NOT_STARTED: "#9AA5B1", IN_PROGRESS: "#D69E2E", DONE: "#2F855A", NEEDS_REVIEW: "#C53030" };
  function bodySvg(L, mode) {
    var ex = mode === "export", T = ex ? FL.LIGHT : null, sys = S.o.system, col = sys.color || "#1F5E8C";
    var ink = ex ? T.ink : "var(--ink,#1F2937)", muted = ex ? T.muted : "var(--ink-3,#6B7280)", surf = ex ? "#FFFFFF" : "var(--surface,#fff)", line = ex ? "#9AA5B1" : "var(--line-strong,#9AA5B1)";
    var font = "font-family='" + FL.FONT + "'", mono = "font-family='" + FL.MONO + "'";
    var s = "";
    L.edges.forEach(function (e) {
      var a = e.from, b = e.to, x1 = a.x + a.w + (a.id === ROOT ? 0 : 0), mx = a.x + a.w + G.colGap / 2, x2 = b.x;
      var pts = [[x1, a.cy], [mx, a.cy], [mx, b.cy], [x2, b.cy]];
      s += '<path d="' + FL.roundPath(pts, 8) + '" fill="none" stroke="' + line + '" stroke-width="1.4"/>';
    });
    Object.keys(L.nodes).forEach(function (id) {
      var it = L.nodes[id], n = it.n, sel = !ex && S.sel === id, drop = !ex && S.drop && S.drop.id === id ? S.drop.zone : null;
      var g = '<g' + (ex ? "" : ' data-iid="' + esc(id) + '"') + (!ex && S.drag && S.drag.moved && S.drag.ids[id] ? ' opacity="0.35"' : "") + ">";
      if (id === ROOT) {
        g += '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" rx="10" fill="' + FL.shade(col, -0.18) + '"/>';
        g += '<text x="' + it.cx + '" y="' + (it.cy + 5) + '" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" ' + font + ">" + esc(n.name) + "</text>";
      } else if (n.kind === "MENU") {
        g += '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" rx="8" fill="' + col + '"/>';
        it.lines.forEach(function (l, i) { g += '<text x="' + it.cx + '" y="' + (it.y + 24 + i * 17) + '" text-anchor="middle" font-size="13" font-weight="600" fill="#fff" ' + font + ">" + esc(l) + "</text>"; });
      } else {
        var dash = n.kind === "POPUP" || n.kind === "LAYER" ? ' stroke-dasharray="5 3"' : "", del = n.change === "DELETED";
        g += '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" rx="7" fill="' + surf + '" stroke="' + col + '" stroke-width="1.6"' + dash + "/>";
        g += '<rect x="' + it.x + '" y="' + it.y + '" width="4" height="' + it.h + '" rx="2" fill="' + col + '"/>';
        it.lines.forEach(function (l, i) { g += '<text x="' + (it.x + 14) + '" y="' + (it.y + 20 + i * 17) + '" font-size="13" font-weight="600" fill="' + ink + '"' + (del ? ' text-decoration="line-through"' : "") + " " + font + ">" + esc(l) + "</text>"; });
        var by = it.y + it.h - 12, bx = it.x + 14;
        g += '<text x="' + bx + '" y="' + (by + 4) + '" font-size="10.5" fill="' + muted + '" ' + mono + ">" + esc(/^new:/.test(n.id) ? "새 화면 (저장 시 ID)" : n.id) + "</text>";
        bx += FL.measure(/^new:/.test(n.id) ? "새 화면 (저장 시 ID)" : n.id, 10.5, false) + 8;
        if (n.kind !== "PAGE") {
          var kw = FL.measure(KIND[n.kind], 10, true) + 10;
          g += '<rect x="' + bx + '" y="' + (by - 7) + '" width="' + kw + '" height="15" rx="7.5" fill="none" stroke="' + muted + '" stroke-width="1"/><text x="' + (bx + kw / 2) + '" y="' + (by + 4) + '" text-anchor="middle" font-size="10" font-weight="600" fill="' + muted + '" ' + font + ">" + esc(KIND[n.kind]) + "</text>";
        }
        // 오른쪽 위: Task 수 · 화면설계서 상태
        var tc = n.taskIds.length, tx = it.x + it.w - 10;
        g += '<text x="' + tx + '" y="' + (it.y + it.h - 8) + '" text-anchor="end" font-size="10" font-weight="700" fill="' + (tc ? col : "#C53030") + '" ' + font + ">" + (tc ? "T" + tc : "T0") + "<title>" + (tc ? "연결된 Task " + tc + "개: " + esc(n.taskIds.join(", ")) : "연결된 Task 없음") + "</title></text>";
        var st = S.o.status ? S.o.status(n.id) : null;
        if (st) g += '<circle cx="' + (it.x + it.w - 10) + '" cy="' + (it.y + 10) + '" r="4.5" fill="' + (STC[st.status] || STC.NOT_STARTED) + '"><title>화면설계서 ' + esc(st.label || st.status) + "</title></circle>";
      }
      if (it.hidden) g += '<g' + (ex ? "" : ' data-itoggle="' + esc(id) + '"') + ' style="cursor:pointer"><rect x="' + (it.x + it.w + 6) + '" y="' + (it.cy - 10) + '" width="30" height="20" rx="10" fill="' + (ex ? "#EEF1F4" : "var(--surface-2,#EEF1F4)") + '" stroke="' + line + '"/><text x="' + (it.x + it.w + 21) + '" y="' + (it.cy + 4) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="' + muted + '" ' + font + ">+" + it.hidden + "</text></g>";
      else if (!ex && id !== ROOT && kids(id).length) g += '<g data-itoggle="' + esc(id) + '" style="cursor:pointer"><circle cx="' + (it.x + it.w + 8) + '" cy="' + it.cy + '" r="7" fill="' + surf + '" stroke="' + line + '"/><path d="M' + (it.x + it.w + 4.5) + "," + it.cy + " H" + (it.x + it.w + 11.5) + '" stroke="' + muted + '" stroke-width="1.5"/><title>접기</title></g>';
      if (sel) g += '<rect x="' + (it.x - 4) + '" y="' + (it.y - 4) + '" width="' + (it.w + 8) + '" height="' + (it.h + 8) + '" rx="10" fill="none" stroke="var(--accent,#1F5E8C)" stroke-width="2" pointer-events="none"/>';
      if (drop === "in") g += '<rect x="' + (it.x - 3) + '" y="' + (it.y - 3) + '" width="' + (it.w + 6) + '" height="' + (it.h + 6) + '" rx="9" fill="rgba(31,94,140,.12)" stroke="var(--accent,#1F5E8C)" stroke-width="2.4" stroke-dasharray="6 3" pointer-events="none"/>';
      if (drop === "before" || drop === "after") { var yy = drop === "before" ? it.y - 6 : it.y + it.h + 6; g += '<path d="M' + (it.x - 6) + "," + yy + " H" + (it.x + it.w + 6) + '" stroke="var(--accent,#1F5E8C)" stroke-width="3" stroke-linecap="round" pointer-events="none"/>'; }
      s += g + "</g>";
    });
    return s;
  }
  function legendSvg(x, y, ex) {
    var col = S.o.system.color || "#1F5E8C", muted = ex ? FL.LIGHT.muted : "var(--ink-3,#6B7280)", surf = ex ? "#fff" : "var(--surface,#fff)", font = "font-family='" + FL.FONT + "'";
    var items = [["menu", "메뉴"], ["page", "화면(페이지·탭·외부)"], ["popup", "팝업·레이어"], ["t", "T숫자 = 연결 Task 수 (T0 빨강: 연결 없음)"]];
    var s = "", cx = x;
    items.forEach(function (it) {
      if (it[0] === "menu") s += '<rect x="' + cx + '" y="' + y + '" width="22" height="13" rx="3" fill="' + col + '"/>';
      else if (it[0] === "page") s += '<rect x="' + cx + '" y="' + y + '" width="22" height="13" rx="3" fill="' + surf + '" stroke="' + col + '" stroke-width="1.4"/>';
      else if (it[0] === "popup") s += '<rect x="' + cx + '" y="' + y + '" width="22" height="13" rx="3" fill="' + surf + '" stroke="' + col + '" stroke-width="1.4" stroke-dasharray="4 2"/>';
      else s += '<text x="' + (cx + 11) + '" y="' + (y + 11) + '" text-anchor="middle" font-size="10" font-weight="700" fill="' + col + '" ' + font + ">T2</text>";
      s += '<text x="' + (cx + 28) + '" y="' + (y + 11) + '" font-size="11" fill="' + muted + '" ' + font + ">" + esc(it[1]) + "</text>";
      cx += 36 + FL.measure(it[1], 11, false) + 18;
    });
    if (S.o.status) {
      [["NOT_STARTED", "미진행"], ["IN_PROGRESS", "진행중"], ["DONE", "완료"], ["NEEDS_REVIEW", "재검토"]].forEach(function (k, i) {
        s += '<circle cx="' + (cx + 5) + '" cy="' + (y + 7) + '" r="4.5" fill="' + STC[k[0]] + '"/><text x="' + (cx + 13) + '" y="' + (y + 11) + '" font-size="11" fill="' + muted + '" ' + font + ">" + (i ? "" : "설계서 ") + k[1] + "</text>";
        cx += 22 + FL.measure((i ? "" : "설계서 ") + k[1], 11, false) + 8;
      });
    }
    return { markup: s, w: cx - x, h: 22 };
  }
  function exportSvg() {
    var L = layout(), PADX = 28, HEAD = 74, lg = legendSvg(0, 0, true);
    var W = Math.max(L.W + PADX * 2, lg.w + PADX * 2, 600), H = HEAD + L.H + 40;
    var T = FL.LIGHT, title = S.o.system.name + " 정보구조도";
    var date = new Date().toISOString().slice(0, 10);
    var sv = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '"><rect width="' + W + '" height="' + H + '" fill="#FFFFFF"/>';
    sv += '<text x="' + PADX + '" y="34" font-size="20" font-weight="700" fill="' + T.ink + "\" font-family='" + FL.FONT + "'>" + esc(title) + "</text>";
    sv += '<text x="' + PADX + '" y="56" font-size="11.5" fill="' + T.muted + "\" font-family='" + FL.FONT + "'>" + esc(["IA-" + S.o.system.code, S.o.project, "화면 " + S.nodes.filter(function (n) { return n.kind !== "MENU"; }).length + "개", date].filter(Boolean).join(" · ")) + "</text>";
    var saved = S.sel; S.sel = null;
    sv += '<g transform="translate(' + PADX + "," + HEAD + ')">' + bodySvg(L, "export") + "</g>";
    S.sel = saved;
    sv += '<g transform="translate(' + PADX + "," + (HEAD + L.H + 6) + ')">' + legendSvg(0, 0, true).markup + "</g></svg>";
    return { svg: sv, w: W, h: H };
  }

  // ── 열기·닫기 ───────────────────────────────
  function open(o) {
    if (S) close(true);
    var nodes = sanitize(o.nodes);
    S = { o: o, nodes: nodes, saved: JSON.stringify(nodes), undo: [], redo: [], sel: null, z: 1, tab: "props", L: null, drag: null, drop: null, collapsed: {}, aiBusy: false, aiCtl: null, aiDraft: "", taskQ: "" };
    var el = document.createElement("div");
    el.className = "fe ie";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "정보구조도 캔버스");
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
    if (o.select && byId(o.select)) { S.sel = o.select; S.forceSide = true; render(); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (S) { FL.clearCache(); render(); fit(); } });
    setTimeout(function () { var b = el.querySelector(".fe-close"); if (b) b.focus(); }, 30);
  }
  function stop(ev) { ev.stopPropagation(); }
  function dirty() { return S && JSON.stringify(S.nodes) !== S.saved; }
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

  function snap() { S.undo.push(JSON.stringify(S.nodes)); if (S.undo.length > 120) S.undo.shift(); S.redo = []; }
  function mut(fn) { snap(); fn(S.nodes); render(); }
  function undo() { if (!S.undo.length) return; S.redo.push(JSON.stringify(S.nodes)); S.nodes = JSON.parse(S.undo.pop()); if (S.sel && !byId(S.sel)) S.sel = null; S.forceSide = true; render(); }
  function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.nodes)); S.nodes = JSON.parse(S.redo.pop()); if (S.sel && !byId(S.sel)) S.sel = null; S.forceSide = true; render(); }

  function frame() {
    var o = S.o, ed = o.editable;
    var btn = function (act, label, title, ic) { return '<button class="fe-t" data-ie-act="' + act + '" title="' + esc(title) + '">' + ic + "<span>" + label + "</span></button>"; };
    var a = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"';
    var ic = {
      menu: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="7" width="18" height="10" rx="2" fill="currentColor" opacity=".85"/></svg>',
      page: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="5" width="18" height="14" rx="2" ' + a + '/><path d="M3 9 H21" ' + a + "/></svg>",
      popup: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="6" width="16" height="12" rx="2" ' + a + ' stroke-dasharray="3 2"/></svg>',
      sib: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="5" y="3" width="14" height="7" rx="2" ' + a + '/><rect x="5" y="14" width="14" height="7" rx="2" ' + a + '/><path d="M12 10 V14" ' + a + "/></svg>",
      out: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M14 6 L8 12 L14 18 M8 12 H20" ' + a + "/></svg>",
    };
    var tools = ed ? btn("add-menu", "메뉴", "선택한 항목 아래에 메뉴 추가 (M)", ic.menu) + btn("add-page", "화면", "선택한 항목 아래에 화면 추가 (N)", ic.page) + btn("add-popup", "팝업", "선택한 화면에 팝업 추가 (P)", ic.popup) +
      "<hr>" + btn("add-sib", "같은 단계", "선택한 항목 바로 아래 같은 단계로 추가 (Enter)", ic.sib) + btn("outdent", "상위로", "한 단계 위로 꺼내기 (Shift+Tab)", ic.out) : "";
    return '<header class="fe-h"><div class="fe-title"><span class="fe-eyebrow">정보구조도 캔버스' + (ed ? "" : " · 보기 전용") + "</span><b>" + esc(o.system.name + " (" + o.system.code + ")") + '</b></div><span class="fe-state" id="fe-state"></span><span class="fe-sp"></span>' +
      (ed ? '<button class="fe-b" data-ie-act="undo" title="되돌리기 (Ctrl+Z)">↶</button><button class="fe-b" data-ie-act="redo" title="다시 (Ctrl+Shift+Z)">↷</button><span class="fe-sep"></span>' : "") +
      '<button class="fe-b" data-ie-act="zout" title="축소">−</button><button class="fe-b fe-zv" data-ie-act="z100" title="100%로">100%</button><button class="fe-b" data-ie-act="zin" title="확대">+</button><button class="fe-b" data-ie-act="fit" title="화면에 맞춤">맞춤</button>' +
      '<button class="fe-b" data-ie-act="expand" title="접은 가지 모두 펼치기">모두 펼치기</button>' +
      '<span class="fe-sep"></span>' + (ed && o.save ? '<button class="fe-b fe-primary" data-ie-act="save" title="저장 (Ctrl+S)">저장</button>' : "") +
      '<button class="fe-b fe-close" data-ie-act="close" aria-label="닫기">닫기 ✕</button></header>' +
      '<div class="fe-body' + (ed ? "" : " no-tools") + '">' + (ed ? '<aside class="fe-tools" aria-label="도구">' + tools + "</aside>" : "<div></div>") +
      '<div class="fe-view" tabindex="0" aria-label="캔버스"><div class="fe-canvas"></div><input class="fe-inline ie-inline" hidden aria-label="이름 편집"></div>' +
      '<aside class="fe-side"><div class="fe-tabs" role="tablist"><button data-ie-tab="props" role="tab">속성</button>' + (ed && o.ai ? '<button data-ie-tab="ai" role="tab">✦ AI</button>' : "") + '<button data-ie-tab="export" role="tab">내보내기</button></div><div class="fe-panel"></div></aside></div>' +
      '<footer class="fe-f" id="fe-hint"></footer>';
  }
  function render() {
    if (!S) return;
    renderCanvas();
    renderSide();
    var st = S.el.querySelector("#fe-state");
    if (st) { st.textContent = S.o.editable ? (dirty() ? "● 저장 안 됨" : "저장됨") : ""; st.className = "fe-state" + (dirty() ? " on" : ""); }
    S.el.querySelectorAll("[data-ie-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-ie-tab") === S.tab)); });
    var u = S.el.querySelector('[data-ie-act="undo"]'), r = S.el.querySelector('[data-ie-act="redo"]');
    if (u) u.disabled = !S.undo.length;
    if (r) r.disabled = !S.redo.length;
    var n = S.sel && byId(S.sel);
    S.el.querySelectorAll('[data-ie-act="add-popup"]').forEach(function (b) { b.disabled = !n || n.kind === "MENU"; });
    S.el.querySelectorAll('[data-ie-act="add-sib"],[data-ie-act="outdent"]').forEach(function (b) { b.disabled = !n || (b.getAttribute("data-ie-act") === "outdent" && !n.parentId); });
    var hint = S.el.querySelector("#fe-hint");
    if (hint) hint.textContent = S.drag && S.drag.moved ? "상자 가운데에 놓으면 그 아래(하위)로, 위·아래 끝에 놓으면 같은 단계 앞·뒤로 옮깁니다 · Esc 취소" :
      S.o.editable ? "끌어서 옮기기 · 두 번 눌러 이름 고치기 · Enter 같은 단계 추가 · Tab 하위 화면 추가 · Delete 삭제 · Ctrl+휠 확대" : "Ctrl+휠 확대 · 끌어서 화면 이동";
  }
  function renderCanvas() {
    S.L = layout();
    var L = S.L, z = S.z, lg = legendSvg(G.pad, L.H - 6, false), W = Math.max(L.W, lg.w + G.pad * 2), H = L.H + 26;
    S.el.querySelector(".fe-canvas").innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(W * z) + '" height="' + Math.round(H * z) + '" viewBox="0 0 ' + W + " " + H + '" class="fe-svg ie-svg' + (S.drag && S.drag.moved ? " dragging" : "") + '">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="var(--surface)"/>' + bodySvg(L, "screen") + lg.markup + "</svg>";
    var zv = S.el.querySelector(".fe-zv");
    if (zv) zv.textContent = Math.round(z * 100) + "%";
  }
  function fit() {
    if (!S || !S.L) return;
    var v = S.view, w = v.clientWidth - 32, h = v.clientHeight - 32;
    S.z = Math.max(0.2, Math.min(1.2, w / S.L.W, h / (S.L.H + 26)));
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
    if (document.activeElement && p.contains(document.activeElement) && document.activeElement.matches("input[type=text],input:not([type]),textarea") && !S.forceSide) return;
    S.forceSide = false;
    var h = "", n = S.sel && byId(S.sel);
    if (S.tab === "export") h = exportPanel();
    else if (S.tab === "ai") h = aiPanel();
    else if (n) {
      var dis = ed ? "" : " disabled", menu = n.kind === "MENU", isNew = /^new:/.test(n.id), sibs = kids(n.parentId || ROOT), si = sibs.indexOf(n);
      h = "<h3>" + esc(KIND[n.kind]) + ' <small class="mono">' + esc(isNew ? "새 항목 · 저장하면 ID가 붙습니다" : n.id) + "</small></h3>" +
        '<label>이름<input data-ie-field="name" value="' + esc(n.name) + '"' + dis + "></label>" +
        '<label>종류<select data-ie-field="kind"' + dis + ">" + KINDS.map(function (k) { return opt(k[0], k[1], n.kind); }).join("") + "</select></label>" +
        (menu ? "" : '<label class="fe-chk"><input type="checkbox" data-ie-field="loginRequired"' + (n.loginRequired ? " checked" : "") + dis + "> 로그인 필요</label>") +
        '<div class="fe-row2"><label>변경 구분<select data-ie-field="change"' + dis + ">" + CHG.map(function (c) { return opt(c[0], c[1], n.change); }).join("") + "</select></label></div>" +
        '<label>변경 사유·메모<input data-ie-field="changeReason" value="' + esc(n.changeReason || "") + '" placeholder="선택"' + dis + "></label>" +
        (ed ? '<div class="fe-row2"><button class="fe-b" data-ie-act="up"' + (si > 0 ? "" : " disabled") + '>▲ 위로</button><button class="fe-b" data-ie-act="down"' + (si < sibs.length - 1 ? "" : " disabled") + ">▼ 아래로</button></div>" +
          '<label>상위 항목<select data-ie-field="parentId">' + opt("", "(최상위)", n.parentId || "") + S.nodes.filter(function (x) { return x.id !== n.id && !isDesc(x.id, n.id); }).map(function (x) { return opt(x.id, (x.kind === "MENU" ? "▦ " : "▢ ") + x.name + (x.kind === "MENU" || /^new:/.test(x.id) ? "" : " · " + x.id), n.parentId); }).join("") + "</select></label>" : "") +
        (menu || !(o.channels || []).length ? "" : '<div class="ie-devs"><b>지원 채널</b><div class="chk-row">' + o.channels.map(function (c) { return '<label class="fe-chk"><input type="checkbox" data-ie-dev="' + esc(c.id) + '"' + ((n.devices || []).indexOf(c.id) >= 0 ? " checked" : "") + dis + "> " + esc(c.label) + "</label>"; }).join("") + "</div></div>") +
        (menu ? "" : taskBox(n, ed)) +
        (!menu && !isNew && o.openScreen ? '<button class="fe-b wide" data-ie-act="open-sb">화면설계서 열기 →</button>' : "") +
        (!menu && isNew ? '<p class="fe-note">새 화면은 저장한 뒤 화면설계서를 만들 수 있습니다.</p>' : "") +
        (ed ? '<button class="fe-b wide danger" data-ie-act="del">삭제 (Delete)' + (kids(n.id).length ? " · 하위 " + (subtree(n.id).length - 1) + "개 포함" : "") + "</button>" : "");
    } else {
      var scr = S.nodes.filter(function (x) { return x.kind !== "MENU"; }), none = scr.filter(function (x) { return !x.taskIds.length; }).length;
      h = "<h3>정보구조도</h3><p class=\"fe-note\">메뉴 " + (S.nodes.length - scr.length) + " · 화면 " + scr.length + (none ? ' · <b class="warn">Task 없는 화면 ' + none + "개</b>" : "") + "</p>" +
        (none && ed ? '<p class="fe-note">빨간 T0 표시가 Task와 연결되지 않은 화면입니다. 화면을 골라 오른쪽에서 Task를 직접 체크해 연결하세요. 한 Task를 여러 화면에 연결해도 됩니다.</p>' : "") +
        (ed ? '<div class="fe-help"><b>편집하는 법</b><ol><li>왼쪽 도구로 메뉴·화면·팝업을 추가합니다. 선택한 항목 아래(하위)로 들어갑니다.</li><li>상자를 끌어 다른 상자 <b>가운데</b>에 놓으면 그 아래로, <b>위·아래 끝</b>에 놓으면 같은 단계에서 순서가 바뀝니다.</li><li>두 번 누르면 이름을 바로 고칩니다.</li><li>화면 ID는 저장할 때 화면 ID 규칙으로 붙습니다. 이미 있는 화면의 ID는 바뀌지 않습니다.</li><li>‘✦ AI’ 탭에서 요청하면 AI가 지금 구조를 바탕으로 고칩니다.</li></ol></div>' : "");
    }
    p.innerHTML = h;
  }
  function taskBox(n, ed) {
    var o = S.o, q = S.taskQ.toLowerCase(), sys = o.system.code;
    var list = (o.tasks || []).slice().sort(function (a, b) { return (a.systemCode === sys ? 0 : 1) - (b.systemCode === sys ? 0 : 1); });
    var shown = list.filter(function (t) { return n.taskIds.indexOf(t.id) >= 0 || !q || (t.id + " " + t.label).toLowerCase().indexOf(q) >= 0; });
    var unknown = n.taskIds.filter(function (id) { return !list.some(function (t) { return t.id === id; }); });
    return '<div class="ie-tasks"><b>연결 Task <small>' + n.taskIds.length + "개 · 한 Task를 여러 화면에 연결할 수 있습니다</small></b>" +
      (ed ? '<input class="ie-q" data-ie-field="taskQ" type="search" placeholder="Task 찾기 (ID·내용)" value="' + esc(S.taskQ) + '">' : "") +
      '<div class="ie-tlist">' + shown.map(function (t) {
        return '<label class="ie-t' + (t.systemCode === sys ? "" : " other") + '"><input type="checkbox" data-ie-task="' + esc(t.id) + '"' + (n.taskIds.indexOf(t.id) >= 0 ? " checked" : "") + (ed ? "" : " disabled") + '><span class="mono">' + esc(t.id) + "</span><span>" + esc(t.label) + "</span></label>";
      }).join("") + unknown.map(function (id) { return '<label class="ie-t bad"><input type="checkbox" data-ie-task="' + esc(id) + '" checked' + (ed ? "" : " disabled") + '><span class="mono">' + esc(id) + "</span><span>없는 Task — 체크를 풀어 정리하세요</span></label>"; }).join("") +
      (shown.length || unknown.length ? "" : '<p class="fe-note">맞는 Task가 없습니다.</p>') + "</div></div>";
  }
  function aiPanel() {
    var ai = S.o.ai;
    if (!ai) return "";
    var empty = !S.nodes.length;
    return "<h3>✦ AI로 만들기·고치기</h3>" + (ai.available ? '<p class="fe-note">연결: ' + esc(ai.label || "AI") + "</p>" : '<p class="fe-note warn">AI 설정이 없습니다. AI 설정에서 연결을 등록하세요.</p>') +
      '<p class="fe-note">' + (empty ? "요구사항·Task를 근거로 AI가 메뉴와 화면을 만듭니다." : "지금 구조를 바탕으로 AI가 고칩니다. 이미 있는 화면 ID는 유지하도록 지시합니다. 결과는 캔버스에 바로 그려지고(되돌리기 가능), 저장을 눌러야 반영됩니다.") + "</p>" +
      '<label>요청<textarea data-ie-field="ai" rows="5" placeholder="' + (empty ? "예: 마이페이지 아래 신청 내역·알림 설정 화면 포함" : "예: Task가 없는 화면에 맞는 Task를 연결, 신청 관련 화면은 ‘신청’ 메뉴로 묶기") + '">' + esc(S.aiDraft) + "</textarea></label>" +
      (S.aiBusy ? '<div class="fe-busy"><span class="fe-spin"></span>AI가 만드는 중… <button class="fe-b" data-ie-act="ai-stop">멈춤</button></div>' : '<button class="fe-b wide fe-primary" data-ie-act="ai-run"' + (ai.available ? "" : " disabled") + ">" + (empty ? "AI로 만들기" : "AI로 고치기") + "</button>") +
      (S.aiErr ? '<p class="fe-err" role="alert">' + esc(S.aiErr) + "</p>" : "");
  }
  function exportPanel() {
    return "<h3>내보내기</h3>" +
      '<button class="fe-b wide" data-ie-act="x-pdf">PDF 내려받기</button>' +
      '<button class="fe-b wide" data-ie-act="x-png">PNG 이미지</button>' +
      '<button class="fe-b wide" data-ie-act="x-svg">SVG 벡터</button>' +
      '<button class="fe-b wide" data-ie-act="x-figsvg">Figma용 SVG 복사 <small>Figma에서 Ctrl+V → 벡터로 붙음</small></button>' +
      '<p class="fe-note">접은 가지는 접힌 그대로 내보냅니다. 전체를 담으려면 ‘모두 펼치기’ 뒤에 내려받으세요.</p>';
  }

  // ── 이벤트 ──────────────────────────────────
  function pt(ev) {
    var svg = S.el.querySelector(".ie-svg"), r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / S.z, y: (ev.clientY - r.top) / S.z };
  }
  function onDown(ev) {
    if (!S || ev.button > 0) return;
    hideInline(true);
    var t = ev.target, tg = t.closest && t.closest("[data-itoggle]"), g = t.closest && t.closest("[data-iid]");
    if (tg) { var tid = tg.getAttribute("data-itoggle"); S.collapsed[tid] = !S.collapsed[tid]; render(); ev.preventDefault(); return; }
    if (g) {
      var id = g.getAttribute("data-iid");
      S.sel = id === ROOT ? null : id;
      S.forceSide = true;
      if (S.o.editable && id !== ROOT) { var p = pt(ev), ids = {}; subtree(id).forEach(function (x) { ids[x] = true; }); S.drag = { kind: "node", id: id, ids: ids, sx: p.x, sy: p.y, moved: false }; }
      render();
      ev.preventDefault();
      return;
    }
    S.sel = null;
    S.forceSide = true;
    S.drag = { kind: "pan", x: ev.clientX, y: ev.clientY, l: S.view.scrollLeft, t: S.view.scrollTop };
    render();
  }
  function dropAt(ev) {
    var p = pt(ev), L = S.L, best = null;
    Object.keys(L.nodes).forEach(function (id) {
      var it = L.nodes[id];
      if (p.x >= it.x - 8 && p.x <= it.x + it.w + 8 && p.y >= it.y - 8 && p.y <= it.y + it.h + 8) best = it;
    });
    if (!best || S.drag.ids[best.id]) return null;
    if (best.id === ROOT) return { id: ROOT, zone: "in" };
    var f = (p.y - best.y) / best.h;
    return { id: best.id, zone: f < 0.28 ? "before" : f > 0.72 ? "after" : "in" };
  }
  var raf = 0;
  function onMove(ev) {
    if (!S || !S.drag) return;
    var d = S.drag;
    if (d.kind === "pan") { S.view.scrollLeft = d.l - (ev.clientX - d.x); S.view.scrollTop = d.t - (ev.clientY - d.y); return; }
    var p = pt(ev);
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) * S.z < 5) return;
    d.moved = true;
    var dr = dropAt(ev);
    if (JSON.stringify(dr) !== JSON.stringify(S.drop)) { S.drop = dr; if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (S) { renderCanvas(); render(); } }); }
    else if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (S) renderCanvas(); });
  }
  function onUp() {
    if (!S || !S.drag) return;
    var d = S.drag, dr = S.drop;
    S.drag = null; S.drop = null;
    if (d.kind === "node" && d.moved && dr) moveTo(d.id, dr);
    else render();
  }
  function moveTo(id, dr) {
    mut(function (list) {
      var n = list.find(function (x) { return x.id === id; });
      var tgt = dr.id === ROOT ? null : list.find(function (x) { return x.id === dr.id; });
      var i = list.indexOf(n);
      list.splice(i, 1);
      if (dr.zone === "in") {
        n.parentId = tgt ? tgt.id : null;
        if (tgt) S.collapsed[tgt.id] = false;
        list.push(n);
      } else {
        n.parentId = tgt.parentId || null;
        var j = list.indexOf(tgt);
        list.splice(dr.zone === "before" ? j : j + 1, 0, n);
      }
    });
    S.o.toast && S.o.toast(dr.zone === "in" ? "하위로 옮겼습니다" : "순서를 바꿨습니다");
  }
  function onWheel(ev) {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();
    var r = S.view.getBoundingClientRect();
    zoomTo(S.z * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), ev.clientX - r.left, ev.clientY - r.top);
  }
  function onDbl(ev) {
    if (!S || !S.o.editable) return;
    var g = ev.target.closest && ev.target.closest("[data-iid]");
    if (g && g.getAttribute("data-iid") !== ROOT) startInline(g.getAttribute("data-iid"));
  }
  function startInline(id) {
    var it = S.L && S.L.nodes[id], n = byId(id);
    if (!it || !n) return;
    var inp = S.el.querySelector(".ie-inline"), svg = S.el.querySelector(".ie-svg"), vr = S.view.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    var w = Math.max(it.w, 160) * S.z;
    inp.style.left = (sr.left - vr.left + S.view.scrollLeft + it.x * S.z) + "px";
    inp.style.top = (sr.top - vr.top + S.view.scrollTop + it.y * S.z) + "px";
    inp.style.width = w + "px"; inp.style.height = Math.max(30, 30 * S.z) + "px";
    inp.style.fontSize = Math.max(12, 13 * S.z) + "px";
    inp.value = n.name;
    inp.hidden = false;
    S.inline = { id: id, before: n.name };
    inp.focus();
    inp.select();
  }
  function hideInline(commit) {
    var inp = S && S.el.querySelector(".ie-inline");
    if (!inp || inp.hidden || !S.inline) return;
    var v = inp.value.trim(), inl = S.inline;
    inp.hidden = true;
    S.inline = null;
    if (!commit || !v || v === inl.before) return render();
    mut(function (list) { var n = list.find(function (x) { return x.id === inl.id; }); if (n) n.name = v; });
    S.forceSide = true;
    render();
  }
  function onFocus(ev) {
    var f = ev.target.getAttribute && ev.target.getAttribute("data-ie-field");
    if (f && f !== "ai" && f !== "taskQ") S.fieldSnap = true;
  }
  function onInput(ev) {
    var t = ev.target;
    if (t.classList.contains("ie-inline")) return;
    var f = t.getAttribute("data-ie-field");
    if (!f || t.tagName === "SELECT" || t.type === "checkbox") return;
    if (f === "ai") { S.aiDraft = t.value; return; }
    if (f === "taskQ") {
      S.taskQ = t.value; S.forceSide = true; renderSide();
      var q = S.el.querySelector(".ie-q"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
      return;
    }
    var n = byId(S.sel);
    if (!n) return;
    if (S.fieldSnap) { snap(); S.fieldSnap = false; }
    if (f === "name") n.name = t.value;
    else if (f === "changeReason") { if (t.value.trim()) n.changeReason = t.value; else delete n.changeReason; }
    renderCanvas();
    var st = S.el.querySelector("#fe-state");
    if (st) { st.textContent = dirty() ? "● 저장 안 됨" : "저장됨"; st.className = "fe-state" + (dirty() ? " on" : ""); }
  }
  function onChange(ev) {
    var t = ev.target, n = byId(S.sel);
    if (!n) return;
    var task = t.getAttribute("data-ie-task"), f = t.getAttribute("data-ie-field"), dev = t.getAttribute("data-ie-dev");
    if (dev) {
      mut(function () { var cur = (n.devices || []).filter(function (x) { return x !== dev; }); if (t.checked) cur.push(dev); var order = S.o.channels.map(function (c) { return c.id; }); n.devices = order.filter(function (x) { return cur.indexOf(x) >= 0; }); if (!n.devices.length) delete n.devices; });
      S.forceSide = true; render();
      return;
    }
    if (task) {
      mut(function () { n.taskIds = t.checked ? n.taskIds.concat(n.taskIds.indexOf(task) >= 0 ? [] : [task]) : n.taskIds.filter(function (x) { return x !== task; }); });
      S.forceSide = true; render();
      return;
    }
    if (!f || f === "ai" || f === "taskQ") return;
    if (f === "name" || f === "changeReason") { if (f === "name" && !t.value.trim()) { n.name = "이름 없음"; S.forceSide = true; render(); } return; }
    mut(function (list) {
      if (f === "kind") { n.kind = t.value; if (n.kind === "MENU") n.taskIds = []; }
      else if (f === "loginRequired") n.loginRequired = t.checked;
      else if (f === "change") n.change = t.value;
      else if (f === "parentId") { n.parentId = t.value || null; list.splice(list.indexOf(n), 1); list.push(n); }
    });
    S.forceSide = true;
    render();
  }
  function onClick(ev) {
    var b = ev.target.closest && ev.target.closest("button");
    if (!b || !S) return;
    var tab = b.getAttribute("data-ie-tab"), act = b.getAttribute("data-ie-act");
    if (tab) { S.tab = tab; S.forceSide = true; render(); return; }
    if (act) action(act, b);
  }
  function add(kind, sibling) {
    if (!S.o.editable) return;
    var cur = S.sel && byId(S.sel);
    if (kind === "POPUP" && (!cur || cur.kind === "MENU")) { S.o.toast && S.o.toast("팝업은 화면을 고른 뒤 추가하세요", "err"); return; }
    var id = "new:" + ++tmpN;
    var n = { id: id, parentId: null, name: kind === "MENU" ? "새 메뉴" : kind === "POPUP" ? "새 팝업" : "새 화면", kind: kind, loginRequired: cur ? !!cur.loginRequired : false, roles: [], taskIds: [], change: "NEW" };
    mut(function (list) {
      if (sibling && cur) {
        n.parentId = cur.parentId || null;
        var after = subtree(cur.id), last = list.reduce(function (m, x, i) { return after.indexOf(x.id) >= 0 ? i : m; }, list.indexOf(cur));
        list.splice(last + 1, 0, n);
      } else {
        n.parentId = cur ? cur.id : null;
        if (cur) S.collapsed[cur.id] = false;
        list.push(n);
      }
      S.sel = id;
      S.forceSide = true;
      S.tab = "props";
    });
    setTimeout(function () { if (S) startInline(id); }, 20);
  }
  function action(act, b) {
    var n = S.sel && byId(S.sel);
    switch (act) {
      case "close": return close();
      case "undo": return undo();
      case "redo": return redo();
      case "zin": return zoomTo(S.z * 1.2);
      case "zout": return zoomTo(S.z / 1.2);
      case "z100": return zoomTo(1);
      case "fit": return fit();
      case "expand": S.collapsed = {}; render(); return fit();
      case "add-menu": return add("MENU");
      case "add-page": return add("PAGE");
      case "add-popup": return add("POPUP");
      case "add-sib": return n ? add(n.kind === "POPUP" ? "POPUP" : n.kind, true) : add("PAGE");
      case "outdent":
        if (!n || !n.parentId) return;
        return mut(function (list) {
          var par = list.find(function (x) { return x.id === n.parentId; });
          n.parentId = par ? par.parentId || null : null;
          list.splice(list.indexOf(n), 1);
          var sub = par ? subtree(par.id) : [], last = list.reduce(function (m, x, i) { return sub.indexOf(x.id) >= 0 ? i : m; }, -1);
          list.splice(last + 1, 0, n);
        });
      case "up": case "down": {
        if (!n) return;
        var sibs = kids(n.parentId || ROOT), i = sibs.indexOf(n), o = sibs[act === "up" ? i - 1 : i + 1];
        if (!o) return;
        return mut(function (list) { var a = list.indexOf(n), c = list.indexOf(o); list[a] = o; list[c] = n; });
      }
      case "del": return del();
      case "open-sb":
        if (!n) return;
        if (dirty() && !window.confirm("저장하지 않은 변경이 있습니다. 버리고 화면설계서로 갈까요?")) return;
        var cb = S.o.openScreen, sid = n.id;
        close(true);
        return cb && cb(sid);
      case "save": return save();
      case "ai-run": return aiRun();
      case "ai-stop": if (S.aiCtl) S.aiCtl.abort(); return;
      case "x-svg": case "x-png": case "x-pdf": case "x-figsvg": return doExport(act, b);
    }
  }
  function del() {
    if (!S.o.editable || !S.sel) return;
    var ids = subtree(S.sel), withSb = ids.filter(function (id) { return S.o.hasSb && S.o.hasSb(id); });
    if (ids.length > 1 && !window.confirm("하위 항목 " + (ids.length - 1) + "개도 함께 지웁니다. 계속할까요?")) return;
    if (withSb.length) S.o.toast && S.o.toast("화면설계서가 있는 화면 " + withSb.length + "개가 포함돼 있습니다. 저장할 때 화면설계서 삭제를 한 번 더 확인합니다");
    mut(function (list) { var rm = {}; ids.forEach(function (x) { rm[x] = true; }); for (var i = list.length - 1; i >= 0; i--) if (rm[list[i].id]) list.splice(i, 1); S.sel = null; });
    S.forceSide = true;
    render();
  }
  function onKey(ev) {
    if (!S) return;
    var t = ev.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
    var mod = ev.ctrlKey || ev.metaKey;
    if (t && t.classList && t.classList.contains("ie-inline")) {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); hideInline(false); }
      else if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); hideInline(true); }
      return;
    }
    if (mod && (ev.key === "s" || ev.key === "S")) { ev.preventDefault(); ev.stopPropagation(); if (S.o.editable && S.o.save) save(); return; }
    if (ev.key === "Escape") {
      ev.preventDefault(); ev.stopPropagation();
      if (S.drag) { S.drag = null; S.drop = null; render(); }
      else if (S.sel) { S.sel = null; S.forceSide = true; render(); }
      else close();
      return;
    }
    if (typing) return;
    ev.stopPropagation();
    if (mod && (ev.key === "z" || ev.key === "Z")) { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if (mod && (ev.key === "y" || ev.key === "Y")) { ev.preventDefault(); redo(); return; }
    if (!S.o.editable || mod) return;
    if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); del(); return; }
    if (ev.key === "F2" && S.sel) { ev.preventDefault(); startInline(S.sel); return; }
    if (ev.key === "Enter") { ev.preventDefault(); action("add-sib"); return; }
    if (ev.key === "Tab") { ev.preventDefault(); action(ev.shiftKey ? "outdent" : "add-page"); return; }
    var k = ev.key.toLowerCase();
    if (k === "m") add("MENU"); else if (k === "n") add("PAGE"); else if (k === "p") add("POPUP");
  }

  // ── 저장 · AI · 내보내기 ─────────────────────
  function save() {
    if (!S.o.save) return;
    var btn = S.el.querySelector('[data-ie-act="save"]'), nodes = sanitize(S.nodes);
    if (btn) { btn.disabled = true; btn.textContent = "저장 중…"; }
    Promise.resolve(S.o.save(nodes)).then(function (fresh) {
      if (!S) return;
      if (fresh === false) return; // 사용자가 취소
      var list = sanitize(fresh || nodes);
      // 새 ID로 바뀐 선택 따라가기
      if (S.sel && /^new:/.test(S.sel)) { var old = S.nodes.find(function (x) { return x.id === S.sel; }); var m = old && list.find(function (x) { return x.name === old.name && !S.nodes.some(function (y) { return y.id === x.id; }); }); S.sel = m ? m.id : null; }
      S.nodes = list;
      S.saved = JSON.stringify(list);
      S.undo = []; S.redo = [];
      S.forceSide = true;
      S.o.toast && S.o.toast("정보구조도를 저장했습니다");
      render();
    }, function (e) { S && S.o.toast && S.o.toast("저장하지 못했습니다: " + (e && e.message || e), "err"); }).then(function () {
      var b2 = S && S.el.querySelector('[data-ie-act="save"]');
      if (b2) { b2.disabled = false; b2.textContent = "저장"; }
    });
  }
  function aiRun() {
    var ai = S.o.ai, ta = S.el.querySelector('[data-ie-field="ai"]'), ins = ta ? ta.value.trim() : S.aiDraft;
    S.aiDraft = ins;
    var cur = sanitize(S.nodes).map(function (n) { var o = clone(n); if (/^new:/.test(o.id)) o.id = ""; return o; });
    var prompt = ai.prompt();
    var input = !cur.length ? prompt + (ins ? "\n## 추가 지시\n" + ins + "\n" : "") :
      [{ role: "user", content: prompt }, { role: "assistant", content: JSON.stringify({ nodes: cur }) }, { role: "user", content: (ai.refine || "") + "이미 있는 화면 ID는 바꾸지 말고, 새 화면은 id를 빈 문자열로 두세요. taskIds는 위 Task 목록에 있는 ID만 쓰세요.\n" + (ins || "위 정보구조도를 다듬어 주세요 (Task 없는 화면에 맞는 Task 연결, 메뉴 묶음 정리)") }];
    S.aiBusy = true; S.aiErr = ""; S.aiCtl = new AbortController();
    S.forceSide = true; render();
    ai.run(input, S.aiCtl.signal).then(function (out) {
      if (!S) return;
      var list = out && (out.nodes || (out.ia && out.ia.nodes));
      if (!Array.isArray(list) || !list.length) throw new Error("AI 결과에 노드(nodes)가 없습니다");
      var next = sanitize(list.map(function (n) { return isObj(n) && !n.id ? Object.assign({}, n, { id: "new:" + ++tmpN }) : n; }));
      mut(function () { S.nodes = next; S.sel = null; });
      S.o.toast && S.o.toast("AI 결과를 캔버스에 불러왔습니다. 확인 후 저장하세요 (되돌리기 가능)");
    }).catch(function (e) {
      if (!S) return;
      S.aiErr = e && (e.code === "cancelled" || e.name === "AbortError") ? "" : (e && e.message) || String(e);
    }).then(function () { if (!S) return; S.aiBusy = false; S.aiCtl = null; S.forceSide = true; render(); fit(); });
  }
  function doExport(act, b) {
    var o = S.o, bx = exportSvg(), name = ("IA-" + o.system.code + "_" + o.system.name + "_정보구조도").replace(/[\\/:*?"<>|\s]+/g, "_");
    var old = b.innerHTML, done = function (msg) { b.disabled = false; b.innerHTML = old; if (msg) o.toast && o.toast(msg); };
    var fail = function (e) { b.disabled = false; b.innerHTML = old; o.toast && o.toast("내보내지 못했습니다: " + (e && e.message || e), "err"); };
    if (act === "x-svg") return FX.download(new Blob([bx.svg], { type: "image/svg+xml" }), name + ".svg");
    b.disabled = true; b.textContent = "만드는 중…";
    if (act === "x-figsvg") return (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(bx.svg) : Promise.reject(new Error("클립보드를 쓸 수 없습니다"))).then(function () { done("SVG를 복사했습니다. Figma 캔버스에서 Ctrl+V(⌘V) 하면 벡터로 붙습니다"); }, fail);
    (act === "x-png" ? FX.toPng(bx, 2).then(function (bl) { FX.download(bl, name + ".png"); }) : FX.toPdf(bx).then(function (bl) { FX.download(bl, name + ".pdf"); })).then(function () { done(); }, fail);
  }

  root.IaEdit = { open: open, close: close, sanitize: sanitize, isOpen: function () { return !!S; } };
})(typeof window !== "undefined" ? window : globalThis);
