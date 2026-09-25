/* 프로세스 플로우 SVG (스윔레인) + 시스템별 플로우 추출 */
(function () {
  "use strict";
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function wrap(text, max) {
    var words = String(text || "").split(" "), lines = [], cur = "";
    words.forEach(function (w) {
      if (cur && (cur + " " + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
    });
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }

  /**
   * opts.color(systemCode) → 레인 색
   * opts.highlight: Task ID 배열 — 해당 노드를 강조하고 나머지는 흐리게
   */
  function svg(f, opts) {
    opts = opts || {};
    var hl = opts.highlight || null;
    var LW = 118, CW = 146, LH = 112, NW = 120, NH = 58, PAD = 12;
    var lanes = f.lanes.length ? f.lanes : [{ id: "_", label: "" }];
    var laneIdx = {};
    lanes.forEach(function (l, i) { laneIdx[l.id] = i; });
    var out = {}, inc = {};
    f.nodes.forEach(function (n) { out[n.id] = []; inc[n.id] = 0; });
    f.edges.forEach(function (e) { if (out[e.from]) out[e.from].push(e); if (e.to in inc) inc[e.to]++; });
    var mark = {}, back = {};
    function dfs(id) {
      mark[id] = 1;
      out[id].forEach(function (e) {
        if (!(e.to in out)) return;
        if (mark[e.to] === 1) back[e.from + ">" + e.to] = true;
        else if (!mark[e.to]) dfs(e.to);
      });
      mark[id] = 2;
    }
    f.nodes.forEach(function (n) { if (!inc[n.id] && !mark[n.id]) dfs(n.id); });
    f.nodes.forEach(function (n) { if (!mark[n.id]) dfs(n.id); });
    var col = {};
    f.nodes.forEach(function (n) { col[n.id] = 0; });
    for (var k = 0; k < f.nodes.length; k++) {
      f.edges.forEach(function (e) {
        if (back[e.from + ">" + e.to] || !(e.from in col) || !(e.to in col)) return;
        if (col[e.to] < col[e.from] + 1) col[e.to] = col[e.from] + 1;
      });
    }
    var used = {};
    f.nodes.forEach(function (n) {
      var r = laneIdx[n.lane] || 0;
      while (used[r + ":" + col[n.id]]) col[n.id]++;
      used[r + ":" + col[n.id]] = true;
    });
    var maxCol = Math.max.apply(null, f.nodes.map(function (n) { return col[n.id]; }).concat([0]));
    var W = LW + (maxCol + 1) * CW + PAD, H = lanes.length * LH;
    var P = {};
    f.nodes.forEach(function (n) {
      var r = laneIdx[n.lane] || 0;
      P[n.id] = { x: LW + col[n.id] * CW + (CW - NW) / 2, y: r * LH + (LH - NH) / 2, r: r };
    });
    var uid = (f.id + (opts.suffix || "")).replace(/[^A-Za-z0-9_-]/g, "_");
    var s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(f.title) + '">' +
      '<defs><marker id="ah-' + uid + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow" d="M0,0 L10,5 L0,10 z"/></marker>' +
      '<marker id="ahb-' + uid + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow back" d="M0,0 L10,5 L0,10 z"/></marker></defs>';
    lanes.forEach(function (l, i) {
      var color = l.systemCode && opts.color ? opts.color(l.systemCode) : "#8A94A3";
      s += '<rect x="0" y="' + i * LH + '" width="' + W + '" height="' + LH + '" fill="' + color + '" fill-opacity="' + (i % 2 ? 0.05 : 0.09) + '"/>';
      s += '<rect x="0" y="' + i * LH + '" width="4" height="' + LH + '" fill="' + color + '"/>';
      var words = wrap(l.label, 7);
      words.forEach(function (w, j) {
        s += '<text class="lane-label" x="14" y="' + (i * LH + LH / 2 - (words.length - 1) * 8 + j * 16 + 4) + '">' + esc(w) + "</text>";
      });
      if (i > 0) s += '<line class="lane-line" x1="0" x2="' + W + '" y1="' + i * LH + '" y2="' + i * LH + '"/>';
    });
    s += '<line class="lane-line" x1="' + (LW - 8) + '" x2="' + (LW - 8) + '" y1="0" y2="' + H + '"/>';

    f.edges.forEach(function (e) {
      var a = P[e.from], b = P[e.to];
      if (!a || !b) return;
      var isBack = !!back[e.from + ">" + e.to];
      var d, lx, ly;
      if (isBack) {
        var yb = Math.max(a.y, b.y) + NH + 18;
        var ax = a.x + NW / 2, bx = b.x + NW / 2 + 16;
        d = "M" + ax + "," + (a.y + NH) + " V" + yb + " H" + bx + " V" + (b.y + NH);
        lx = ax + 6; ly = a.y + NH + 14;
      } else if (a.r === b.r) {
        d = "M" + (a.x + NW) + "," + (a.y + NH / 2) + " H" + b.x;
        lx = (a.x + NW + b.x) / 2; ly = a.y + NH / 2 - 7;
      } else {
        var mx = a.x + NW + (b.x - a.x - NW) / 2;
        d = "M" + (a.x + NW) + "," + (a.y + NH / 2) + " H" + mx + " V" + (b.y + NH / 2) + " H" + b.x;
        lx = mx + 4; ly = (a.y + b.y + NH) / 2;
      }
      s += '<path class="edge' + (isBack ? " back" : "") + '" d="' + d + '" marker-end="url(#' + (isBack ? "ahb-" : "ah-") + uid + ')"/>';
      if (e.label) s += '<text class="elabel" x="' + lx + '" y="' + ly + '" text-anchor="' + (a.r === b.r ? "middle" : "start") + '">' + esc(e.label) + "</text>";
    });

    f.nodes.forEach(function (n) {
      var p = P[n.id], cx = p.x + NW / 2, cy = p.y + NH / 2;
      var on = hl ? n.taskIds.some(function (t) { return hl.indexOf(t) >= 0; }) : false;
      var cls = "shape " + n.shape + (on ? " hl" : "");
      var shape;
      if (n.shape === "DECISION") shape = '<polygon class="' + cls + '" points="' + cx + "," + (p.y - 4) + " " + (p.x + NW + 4) + "," + cy + " " + cx + "," + (p.y + NH + 4) + " " + (p.x - 4) + "," + cy + '"/>';
      else if (n.shape === "TERMINATOR") shape = '<rect class="' + cls + '" x="' + (p.x + 20) + '" y="' + (p.y + 12) + '" width="' + (NW - 40) + '" height="' + (NH - 24) + '" rx="17"/>';
      else if (n.shape === "IO") shape = '<polygon class="' + cls + '" points="' + (p.x + 12) + "," + p.y + " " + (p.x + NW) + "," + p.y + " " + (p.x + NW - 12) + "," + (p.y + NH) + " " + p.x + "," + (p.y + NH) + '"/>';
      else if (n.shape === "CONNECTOR") shape = '<rect class="' + cls + '" x="' + p.x + '" y="' + (p.y + 6) + '" width="' + NW + '" height="' + (NH - 12) + '" rx="' + ((NH - 12) / 2) + '"/>';
      else if (n.shape === "DOCUMENT") shape = '<path class="' + cls + '" d="M' + p.x + "," + p.y + " H" + (p.x + NW) + " V" + (p.y + NH - 8) + " Q" + (p.x + NW * 0.75) + "," + (p.y + NH - 18) + " " + cx + "," + (p.y + NH - 8) + " T" + p.x + "," + (p.y + NH - 8) + ' Z"/>';
      else shape = '<rect class="' + cls + '" x="' + p.x + '" y="' + p.y + '" width="' + NW + '" height="' + NH + '" rx="5"/>';
      s += '<g class="' + (hl && !on ? "dim" : "") + '">' + shape;
      var lines = wrap(n.label, n.shape === "DECISION" ? 5 : 9);
      var baseY = cy - (lines.length - 1) * 7 + (n.screenId ? -5 : 4);
      lines.forEach(function (w, j) { s += '<text class="nlabel' + (n.shape === "CONNECTOR" ? " conn" : "") + '" x="' + cx + '" y="' + (baseY + j * 14) + '" text-anchor="middle">' + esc(w) + "</text>"; });
      if (n.screenId) s += '<text class="nsid" x="' + cx + '" y="' + (p.y + NH - 8) + '" text-anchor="middle">' + esc(n.screenId) + "</text>";
      if (n.taskIds.length) s += '<text class="ntask" x="' + cx + '" y="' + (p.y - (n.shape === "DECISION" ? 8 : 4)) + '" text-anchor="middle">' + esc(n.taskIds.join(", ")) + "</text>";
      s += "</g>";
    });
    return s + "</svg>";
  }

  /**
   * 한 시스템의 레인만 남긴 플로우. 다른 시스템으로 나가고 들어오는 연결은 연결 노드(CONNECTOR)로 바꾼다.
   */
  function forSystem(f, systemCode) {
    var keepLanes = f.lanes.filter(function (l) { return l.systemCode === systemCode; });
    if (!keepLanes.length) return null;
    var keep = {};
    keepLanes.forEach(function (l) { keep[l.id] = true; });
    var laneOf = {};
    f.lanes.forEach(function (l) { laneOf[l.id] = l; });
    var nodes = f.nodes.filter(function (n) { return keep[n.lane]; }).map(function (n) { return n; });
    var ids = {};
    nodes.forEach(function (n) { ids[n.id] = true; });
    var byId = {};
    f.nodes.forEach(function (n) { byId[n.id] = n; });
    var edges = [], extra = [];
    var outLane = { id: "L-OTHER", label: "다른 시스템" };
    f.edges.forEach(function (e, i) {
      var a = ids[e.from], b = ids[e.to];
      if (a && b) edges.push(e);
      else if (a || b) {
        var other = byId[a ? e.to : e.from];
        if (!other) return;
        var lane = laneOf[other.lane];
        var cid = "c" + i;
        extra.push({ id: cid, shape: "CONNECTOR", label: (a ? "→ " : "← ") + (lane ? lane.label.split(" · ")[0] : "") + ": " + other.label, lane: "L-OTHER", taskIds: [], change: "KEPT" });
        edges.push(a ? { from: e.from, to: cid, label: e.label } : { from: cid, to: e.to, label: e.label });
      }
    });
    return { id: f.id + "-" + systemCode, kind: f.kind, title: f.title, lanes: keepLanes.concat(extra.length ? [outLane] : []), nodes: nodes.concat(extra), edges: edges };
  }

  window.Flow = { svg: svg, forSystem: forSystem };
})();
