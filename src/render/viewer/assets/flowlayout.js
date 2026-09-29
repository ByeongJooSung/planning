/*
 * 플로우차트 배치·그리기 엔진
 *  - 글자 수에 맞춰 도형의 가로·세로 크기를 정한다 (줄바꿈 포함)
 *  - 레인(가로 띠) × 열(처리 순서)에 배치하고, 같은 레인 같은 열에서는 위아래 칸(slot)으로 나눈다
 *  - 연결선은 직각으로 이어 주고(간격·채널 분리), 다른 노드를 지나면 우회로를 찾는다
 *  - 캔버스에서 옮긴 위치(node.x, node.y: 내용 영역 왼쪽·소속 레인 위쪽 기준 중심)는 그대로 쓴다
 * 브라우저와 Node(테스트)에서 같은 결과가 나오도록 글자 폭은 canvas가 없으면 근사값을 쓴다.
 */
(function (root) {
  "use strict";
  var FONT = '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif';
  var MONO = '"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace';
  var K = { fs: 13, lh: 18, grid: 10, LW: 132, margin: 28, colGap: 76, lanePad: 26, laneMin: 108, slotGap: 30 };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  // ── 글자 폭 ──────────────────────────────────
  var ctx2d, wcache = {}, wcount = 0;
  function approx(str, size, bold) {
    var w = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i), f;
      if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3130 && c <= 0x318f) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef)) f = 0.98;
      else if (c === 32) f = 0.3;
      else if (c >= 65 && c <= 90) f = 0.66;
      else if (c >= 48 && c <= 57) f = 0.58;
      else if (c >= 97 && c <= 122) f = "il".indexOf(str[i]) >= 0 ? 0.28 : "mw".indexOf(str[i]) >= 0 ? 0.84 : 0.56;
      else if (".,:;'!|".indexOf(str[i]) >= 0) f = 0.3;
      else if ("()[]/-·".indexOf(str[i]) >= 0) f = 0.38;
      else if (c > 0x2000) f = 0.9;
      else f = 0.6;
      w += f;
    }
    return w * size * (bold ? 1.04 : 1);
  }
  function measure(str, size, bold) {
    str = String(str);
    var key = size + (bold ? "b|" : "n|") + str;
    if (key in wcache) return wcache[key];
    var w = null;
    if (api.useCanvas && typeof document !== "undefined") {
      try {
        if (ctx2d === undefined) ctx2d = document.createElement("canvas").getContext("2d") || null;
        if (ctx2d) { ctx2d.font = (bold ? "600 " : "400 ") + size + "px " + FONT; w = ctx2d.measureText(str).width; }
      } catch (e) { ctx2d = null; }
    }
    if (w == null) w = approx(str, size, bold);
    if (wcount++ > 6000) { wcache = {}; wcount = 0; }
    return (wcache[key] = w);
  }
  function clearCache() { wcache = {}; wcount = 0; }

  /** 글자 폭에 맞춰 줄바꿈: 공백에서 끊고, 한 단어가 너무 길면 글자 단위로 끊는다. 직접 넣은 줄바꿈(\n)은 지킨다 */
  function wrap(text, maxW, size, bold) {
    var out = [];
    String(text == null ? "" : text).split("\n").forEach(function (para) {
      var cur = "";
      var push = function () { out.push(cur); cur = ""; };
      para.split(" ").forEach(function (word) {
        if (measure(word, size, bold) > maxW) {
          if (cur) push();
          var chunk = "";
          Array.from(word).forEach(function (ch) {
            if (chunk && measure(chunk + ch, size, bold) > maxW) { out.push(chunk); chunk = ch; } else chunk += ch;
          });
          cur = chunk;
          return;
        }
        if (cur && measure(cur + " " + word, size, bold) > maxW) push();
        cur = cur ? cur + " " + word : word;
      });
      out.push(cur);
    });
    if (out.length > 8) { out = out.slice(0, 8); out[7] = out[7].replace(/.{0,1}$/, "…"); }
    return out;
  }
  var up10 = function (v) { return Math.ceil(v / K.grid) * K.grid; };

  // ── 도형 크기 ────────────────────────────────
  var MAXW = { DECISION: 128, TERMINATOR: 170, CONNECTOR: 150, IO: 190, DOCUMENT: 190, SCREEN: 190, PROCESS: 200 };
  function nodeSize(n) {
    var sh = n.shape || "PROCESS", small = sh === "CONNECTOR";
    var size = small ? 11.5 : K.fs, lh = small ? 15 : K.lh;
    var lines = wrap(n.label || "", MAXW[sh] || 200, size, sh === "TERMINATOR");
    var tw = 0;
    lines.forEach(function (l) { tw = Math.max(tw, measure(l, size, sh === "TERMINATOR")); });
    var th = lines.length * lh, sid = n.screenId ? measure(n.screenId, 10.5, false) : 0;
    var w, h;
    switch (sh) {
      case "TERMINATOR": w = Math.max(tw + 48, 96); h = Math.max(th + 22, 40); break;
      case "DECISION": {
        h = Math.max(th * 2 + 30, 84);
        w = Math.max(tw / Math.max(0.35, 1 - th / h) + 26, 124);
        break;
      }
      case "CONNECTOR": w = Math.max(tw + 30, 70); h = Math.max(th + 14, 30); break;
      case "IO": w = Math.max(tw + 48, 116); h = Math.max(th + 24, 46); break;
      case "DOCUMENT": w = Math.max(tw + 34, 110); h = Math.max(th + 32, 52); break;
      case "SCREEN": w = Math.max(tw + 32, sid + 32, 120); h = th + 22 + 20; break;
      default: w = Math.max(tw + 34, sid + 30, 110); h = Math.max(th + 24 + (sid ? 14 : 0), 44);
    }
    return { w: up10(w), h: up10(h), lines: lines, lh: lh, size: size, tw: tw, th: th };
  }

  // ── 구조 분석: 되돌아가는 연결, 열(rank) ─────
  function analyze(f) {
    var byId = {}, out = {}, inn = {};
    f.nodes.forEach(function (n, i) { byId[n.id] = i; out[n.id] = []; inn[n.id] = []; });
    var edges = [];
    f.edges.forEach(function (e, i) {
      if (e.from === e.to || !(e.from in byId) || !(e.to in byId)) return;
      var o = { e: e, i: i, back: false };
      edges.push(o);
      out[e.from].push(o);
      inn[e.to].push(o);
    });
    var state = {};
    function dfs(id) {
      state[id] = 1;
      out[id].forEach(function (o) {
        var t = o.e.to;
        if (state[t] === 1) o.back = true;
        else if (!state[t]) dfs(t);
      });
      state[id] = 2;
    }
    f.nodes.forEach(function (n) { if (!inn[n.id].length && !state[n.id]) dfs(n.id); });
    f.nodes.forEach(function (n) { if (!state[n.id]) dfs(n.id); });
    var rank = {};
    f.nodes.forEach(function (n) { rank[n.id] = 0; });
    for (var k = 0; k < f.nodes.length + 1; k++) {
      var ch = false;
      edges.forEach(function (o) {
        if (!o.back && rank[o.e.to] < rank[o.e.from] + 1) { rank[o.e.to] = rank[o.e.from] + 1; ch = true; }
      });
      if (!ch) break;
    }
    // 들어오는 연결이 없는 노드는 첫 후속 바로 앞으로 당겨 긴 선을 없앤다
    f.nodes.forEach(function (n) {
      var fw = out[n.id].filter(function (o) { return !o.back; });
      if (!inn[n.id].filter(function (o) { return !o.back; }).length && fw.length) {
        var m = Math.min.apply(null, fw.map(function (o) { return rank[o.e.to]; }));
        if (m - 1 > rank[n.id]) rank[n.id] = m - 1;
      }
    });
    return { edges: edges, out: out, inn: inn, rank: rank, byId: byId };
  }

  // ── 배치 ─────────────────────────────────────
  function layout(f, opts) {
    opts = opts || {};
    var lanes = (f.lanes && f.lanes.length ? f.lanes : [{ id: "_", label: "" }]).map(function (l, i) {
      return { id: l.id, label: l.label || "", systemCode: l.systemCode, idx: i, color: (l.systemCode && opts.color ? opts.color(l.systemCode) : null) || "#7B8794" };
    });
    var laneIdx = {};
    lanes.forEach(function (l) { laneIdx[l.id] = l.idx; });
    var an = analyze(f);
    var N = {}, order = [];
    f.nodes.forEach(function (n, i) {
      var sz = nodeSize(n);
      N[n.id] = { id: n.id, n: n, i: i, w: sz.w, h: sz.h, sz: sz, lane: laneIdx[n.lane] != null ? laneIdx[n.lane] : 0, rank: an.rank[n.id], slot: 0, manual: n.x != null && n.y != null };
      order.push(n.id);
    });

    // 칸(slot): 같은 레인·같은 열이면 위아래로 나눈다. 앞 노드와 같은 레인이면 같은 칸에 두어 선이 곧게 이어지게 한다
    var used = {};
    var procOrder = order.slice().sort(function (a, b) {
      var A = N[a], B = N[b];
      if (A.rank !== B.rank) return A.rank - B.rank;
      var ea = firstIn(a), eb = firstIn(b);
      return ea !== eb ? ea - eb : A.i - B.i;
    });
    function firstIn(id) {
      var m = 1e9;
      an.inn[id].forEach(function (o) { if (!o.back && o.i < m) m = o.i; });
      return m;
    }
    procOrder.forEach(function (id) {
      var nd = N[id], pref = 0, best = -1;
      an.inn[id].forEach(function (o) {
        if (o.back) return;
        var p = N[o.e.from];
        if (p && p.rank < nd.rank && p.rank > best) { best = p.rank; pref = p.lane === nd.lane ? p.slot : 0; }
      });
      var key = function (s) { return nd.lane + ":" + nd.rank + ":" + s; };
      var cand = [pref, pref + 1, pref - 1, pref + 2, pref - 2, pref + 3, pref - 3, pref + 4, pref - 4];
      var s = cand.filter(function (c) { return !used[key(c)]; })[0];
      if (s == null) { s = pref + 5; while (used[key(s)]) s++; }
      used[key(s)] = true;
      nd.slot = s;
    });

    // 열 위치
    var maxRank = 0;
    order.forEach(function (id) { if (N[id].rank > maxRank) maxRank = N[id].rank; });
    var colW = [], cols = [];
    for (var r = 0; r <= maxRank; r++) colW[r] = 0;
    order.forEach(function (id) { colW[N[id].rank] = Math.max(colW[N[id].rank], N[id].w); });
    // 열 사이 간격: 그 사이를 지나는 직각 연결·라벨 수에 따라 넓힌다
    var gapAfter = [];
    for (r = 0; r <= maxRank; r++) gapAfter[r] = K.colGap;
    an.edges.forEach(function (o) {
      if (o.back) return;
      var a = N[o.e.from], b = N[o.e.to];
      if (a.lane === b.lane && a.slot === b.slot) {
        if (o.e.label) gapAfter[a.rank] = Math.max(gapAfter[a.rank], measure(o.e.label, 11, true) + 34);
        return;
      }
      gapAfter[a.rank] = Math.max(gapAfter[a.rank], K.colGap + 8);
    });
    var perGap = {};
    an.edges.forEach(function (o) {
      if (o.back) return;
      var a = N[o.e.from], b = N[o.e.to];
      if (a.lane !== b.lane || a.slot !== b.slot) perGap[a.rank] = (perGap[a.rank] || 0) + 1;
    });
    Object.keys(perGap).forEach(function (rk) { gapAfter[rk] = Math.max(gapAfter[rk], K.colGap - 12 + Math.min(perGap[rk], 6) * 8); });
    var x = 0;
    for (r = 0; r <= maxRank; r++) { cols[r] = { left: x, w: colW[r], cx: x + colW[r] / 2 }; x += colW[r] + gapAfter[r]; }
    var contentW = Math.max(x - (maxRank >= 0 ? gapAfter[maxRank] : 0), 0);

    // 레인 높이·칸 위치
    var left0 = K.LW + K.margin;
    lanes.forEach(function (l) {
      var mine = order.filter(function (id) { return N[id].lane === l.idx; });
      var smin = 0, smax = 0, maxH = 40;
      mine.forEach(function (id) { var s = N[id].slot; if (s < smin) smin = s; if (s > smax) smax = s; maxH = Math.max(maxH, N[id].h); });
      l.smin = smin;
      l.span = smax - smin + 1;
      l.pitch = maxH + K.slotGap;
      l.maxH = maxH;
      l.h = Math.max(K.laneMin, (smax - smin + 1) * l.pitch - K.slotGap + K.lanePad * 2);
    });
    var topExtra = opts.topExtra || 0;
    if (topExtra) lanes[0].h += topExtra;
    // 옮긴 노드가 레인 아래로 넘치면 레인을 넓힌다
    order.forEach(function (id) {
      var nd = N[id];
      if (!nd.manual) return;
      var l = lanes[nd.lane];
      l.h = Math.max(l.h, nd.n.y + nd.h / 2 + K.lanePad - 6);
    });
    var top = 0;
    lanes.forEach(function (l) { l.top = top; top += l.h; });
    var H = top;
    var W = left0 + contentW + K.margin;
    order.forEach(function (id) {
      var nd = N[id], l = lanes[nd.lane];
      if (nd.manual) {
        nd.cx = left0 + nd.n.x;
        nd.cy = l.top + nd.n.y + (nd.lane === 0 ? topExtra : 0);
      } else {
        nd.cx = left0 + cols[nd.rank].cx;
        // 칸이 하나뿐인 레인은 세로 가운데, 여러 칸이면 칸 묶음을 레인 가운데에 둔다
        var ex = nd.lane === 0 ? topExtra : 0;
        nd.cy = l.span === 1 ? l.top + ex + (l.h - ex) / 2 : l.top + ex + (l.h - ex - (l.span * l.pitch - K.slotGap)) / 2 + (nd.slot - l.smin) * l.pitch + l.maxH / 2;
      }
      nd.x = nd.cx - nd.w / 2; nd.y = nd.cy - nd.h / 2;
      nd.l = nd.x; nd.r = nd.x + nd.w; nd.t = nd.y; nd.b = nd.y + nd.h;
      if (nd.r + K.margin > W) W = nd.r + K.margin;
    });

    var edges = routeAll(f, an, N, lanes, cols, order);
    var extra = 0, minY = 1e9;
    edges.forEach(function (e) {
      e.pts.forEach(function (p) { if (p[0] + K.margin > W) W = p[0] + K.margin; if (p[1] + 10 > H + extra) extra = p[1] + 10 - H; if (p[1] < minY) minY = p[1]; });
      if (e.lp && e.lp.y - 13 < minY) minY = e.lp.y - 13;
    });
    // 되돌아가는 선·라벨이 맨 위 밖으로 나가면 첫 레인 위쪽을 넓혀 다시 배치한다
    if (minY < 6 && !topExtra && !opts._retry) return layout(f, Object.assign({}, opts, { topExtra: up10(6 - minY), _retry: true }));
    return { W: Math.ceil(W), H: Math.ceil(H + extra), LW: K.LW, left0: left0, lanes: lanes, nodes: N, order: order, edges: edges, cols: cols, an: an, topExtra: topExtra };
  }

  // ── 연결선 ───────────────────────────────────
  function hit(seg, rects, skipA, skipB) {
    var n = 0, x1 = Math.min(seg[0][0], seg[1][0]), x2 = Math.max(seg[0][0], seg[1][0]), y1 = Math.min(seg[0][1], seg[1][1]), y2 = Math.max(seg[0][1], seg[1][1]);
    rects.forEach(function (r) {
      if (r === skipA || r === skipB) return;
      if (x2 > r.l - 3 && x1 < r.r + 3 && y2 > r.t - 3 && y1 < r.b + 3) n++;
    });
    return n;
  }
  function crossings(pts, rects, a, b) {
    var n = 0;
    for (var i = 0; i + 1 < pts.length; i++) n += hit([pts[i], pts[i + 1]], rects, a, b);
    return n;
  }
  function simplify(pts) {
    var out = [];
    pts.forEach(function (p) {
      var last = out[out.length - 1];
      if (last && Math.abs(last[0] - p[0]) < 0.5 && Math.abs(last[1] - p[1]) < 0.5) return;
      out.push([Math.round(p[0] * 2) / 2, Math.round(p[1] * 2) / 2]);
    });
    for (var i = 1; i + 1 < out.length; ) {
      var a = out[i - 1], b = out[i], c = out[i + 1];
      if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) out.splice(i, 1); else i++;
    }
    return out;
  }

  function routeAll(f, an, N, lanes, cols, order) {
    var rects = order.map(function (id) { return N[id]; });
    var aisles = [];
    lanes.forEach(function (l) { aisles.push(l.top + 12, l.top + l.h - 12); });
    var results = [], loopIdx = {}, aisleUse = {};
    // 앞으로 나가는 연결이 여러 개인 노드: 가장 가까운 것은 오른쪽으로, 나머지는 아래·위로 나간다
    var exit = {};
    order.forEach(function (id) {
      var a = N[id];
      var fw = an.out[id].filter(function (o) { var b = N[o.e.to]; return b.l - a.r >= 24; });
      if (fw.length < 2) return;
      var main = fw.slice().sort(function (p, q) { return Math.abs(N[p.e.to].cy - a.cy) - Math.abs(N[q.e.to].cy - a.cy) || p.i - q.i; })[0];
      fw.forEach(function (o) {
        var dy = N[o.e.to].cy - a.cy;
        exit[o.i] = o === main ? "right" : dy > 2 ? "bottom" : dy < -2 ? "top" : "right";
      });
    });
    // 직각 연결의 세로 통로(채널) 순서: 같은 열 사이를 지나는 것끼리 간격을 나눈다
    var groups = {};
    an.edges.forEach(function (o) {
      var a = N[o.e.from], b = N[o.e.to];
      if (b.l - a.r < 24) return;
      if (exit[o.i] && exit[o.i] !== "right") return;
      if (Math.abs(a.cy - b.cy) < 1) return;
      var key = a.rank + (b.cy > a.cy ? "d" : "u");
      (groups[key] = groups[key] || []).push(o);
    });
    var chan = {};
    Object.keys(groups).forEach(function (k) {
      var g = groups[k], down = /d$/.test(k);
      g.sort(function (p, q) { var d = N[p.e.from].cy - N[q.e.from].cy; return down ? -d || p.i - q.i : d || p.i - q.i; });
      g.forEach(function (o, i) { chan[o.i] = (i - (g.length - 1) / 2) * 11; });
    });
    var byI = {};
    an.edges.forEach(function (o) { byI[o.i] = o; });

    f.edges.forEach(function (e, i) {
      var o = byI[i];
      if (!o) return;
      var a = N[e.from], b = N[e.to], pts;
      var gapX = b.l - a.r;
      var cands = [];
      if (gapX >= 24) {
        var ex = exit[i] || "right", off = chan[i] || 0;
        var ey = b.cy;
        if (ex === "bottom") cands.push([[a.cx, a.b], [a.cx, ey], [b.l, ey]]);
        else if (ex === "top") cands.push([[a.cx, a.t], [a.cx, ey], [b.l, ey]]);
        else if (Math.abs(a.cy - ey) < 1) cands.push([[a.r, a.cy], [b.l, ey]]);
        else {
          var mid = b.rank === a.rank + 1 ? (K.LW + K.margin) + (cols[a.rank].left + cols[a.rank].w + cols[b.rank].left) / 2 : (a.r + b.l) / 2;
          [mid + off, b.l - 22 + off / 2, a.r + 22 + off / 2].forEach(function (cx) { cands.push([[a.r, a.cy], [cx, a.cy], [cx, ey], [b.l, ey]]); });
        }
        var best = null, bc = 1e9;
        cands.forEach(function (c) { var k = crossings(c, rects, a, b); if (k < bc) { bc = k; best = c; } });
        pts = best;
        if (bc > 0) {
          // 우회: 레인 사이 빈 통로(aisle)로 돌아간다
          var sy = ex === "right" ? a.cy : ex === "bottom" ? a.b : a.t, mids = (a.cy + b.cy) / 2;
          var sorted = aisles.slice().sort(function (p, q) { return Math.abs(p - mids) - Math.abs(q - mids); });
          var k2 = (aisleUse[Math.round(mids)] = (aisleUse[Math.round(mids)] || 0) + 1) - 1;
          for (var s = 0; s < sorted.length; s++) {
            var ay = sorted[s] + (k2 % 3) * 5, x1 = a.r + 16 + k2 * 5, x2 = b.l - 16 - k2 * 5;
            var alt = [[a.r, a.cy], [x1, a.cy], [x1, ay], [x2, ay], [x2, b.cy], [b.l, b.cy]];
            if (crossings(alt, rects, a, b) === 0) { pts = alt; break; }
          }
        }
      } else if (a.l - b.r >= 24 || o.back) {
        // 되돌아가는 연결: 아래(또는 위)로 돌아 들어간다
        var key = Math.round(Math.max(a.cy, b.cy) / 10);
        var kk = (loopIdx[key] = (loopIdx[key] || 0) + 1) - 1;
        var yl = Math.max(a.b, b.b) + 16 + kk * 8, yt = Math.min(a.t, b.t) - 16 - kk * 8;
        var c1 = [[a.cx, a.b], [a.cx, yl], [b.cx, yl], [b.cx, b.b]];
        var c2 = [[a.cx, a.t], [a.cx, yt], [b.cx, yt], [b.cx, b.t]];
        pts = crossings(c1, rects, a, b) <= crossings(c2, rects, a, b) ? c1 : c2;
      } else {
        // 같은 열에서 위아래로 이어지는 연결
        if (b.cy >= a.cy) pts = Math.abs(a.cx - b.cx) < 1 ? [[a.cx, a.b], [b.cx, b.t]] : [[a.cx, a.b], [a.cx, (a.b + b.t) / 2], [b.cx, (a.b + b.t) / 2], [b.cx, b.t]];
        else pts = Math.abs(a.cx - b.cx) < 1 ? [[a.cx, a.t], [b.cx, b.b]] : [[a.cx, a.t], [a.cx, (a.t + b.b) / 2], [b.cx, (a.t + b.b) / 2], [b.cx, b.b]];
      }
      pts = simplify(pts);
      results.push({ i: i, from: e.from, to: e.to, label: e.label || "", pts: pts, back: !!o.back || (a.l - b.r >= 24), lp: labelPos(e.label, pts) });
    });
    return results;
  }
  function labelPos(label, pts) {
    if (!label) return null;
    var w = measure(label, 11, true) + 10;
    for (var i = 0; i + 1 < pts.length; i++) {
      var p = pts[i], q = pts[i + 1], len = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]);
      if (len < 30 && i + 2 < pts.length) continue;
      if (p[1] === q[1]) { var dir = q[0] > p[0] ? 1 : -1; return { x: p[0] + dir * Math.min(len / 2, 12 + w / 2), y: p[1] - 9, w: w, anchor: "middle" }; }
      var dv = q[1] > p[1] ? 1 : -1;
      return { x: p[0] + 8, y: p[1] + dv * Math.min(len / 2, 16), w: w, anchor: "start" };
    }
    return { x: pts[0][0], y: pts[0][1] - 9, w: w, anchor: "middle" };
  }

  // ── 그리기 ───────────────────────────────────
  var LIGHT = { bg: "#FFFFFF", ink: "#1F2937", muted: "#6B7280", line: "#6B7280", surface: "#FFFFFF", laneLine: "#D5DBE3", decFill: "#FFF4DC", decStroke: "#B7791F", ioFill: "#EEF4FB", docFill: "#F7F8FA", back: "#C2570C", accent: "#1F5E8C", onColor: "#FFFFFF" };
  var SCREEN = { bg: "var(--surface,#fff)", ink: "var(--ink,#1F2937)", muted: "var(--ink-3,#6B7280)", line: "var(--ink-3,#6B7280)", surface: "var(--surface,#fff)", laneLine: "var(--line,#D5DBE3)", decFill: "var(--st-prog-bg,#FFF4DC)", decStroke: "var(--st-prog,#B7791F)", ioFill: "var(--accent-soft,#EEF4FB)", docFill: "var(--surface-2,#F7F8FA)", back: "var(--st-prog,#C2570C)", accent: "var(--accent,#1F5E8C)", onColor: "#FFFFFF" };
  function shade(hex, amt) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return hex;
    var v = parseInt(m[1], 16), c = [v >> 16, (v >> 8) & 255, v & 255].map(function (x) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? x * (1 + amt) : x + (255 - x) * amt))); });
    return "#" + c.map(function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("").toUpperCase();
  }
  function roundPath(pts, r) {
    if (pts.length < 2) return "";
    var d = "M" + pts[0][0] + "," + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++) {
      var p = pts[i - 1], c = pts[i], n = pts[i + 1];
      var l1 = Math.hypot(c[0] - p[0], c[1] - p[1]), l2 = Math.hypot(n[0] - c[0], n[1] - c[1]), rr = Math.min(r, l1 / 2, l2 / 2);
      var a = [c[0] - (c[0] - p[0]) / l1 * rr, c[1] - (c[1] - p[1]) / l1 * rr], b = [c[0] + (n[0] - c[0]) / l2 * rr, c[1] + (n[1] - c[1]) / l2 * rr];
      d += " L" + a[0] + "," + a[1] + " Q" + c[0] + "," + c[1] + " " + b[0] + "," + b[1];
    }
    var e = pts[pts.length - 1];
    return d + " L" + e[0] + "," + e[1];
  }
  function shortTask(id) { return String(id).replace(/^.*-(T\d+)$/, "$1"); }

  /** 레이아웃 → SVG 내부 마크업. data-nid / data-eid / data-lid 는 편집기가 클릭 대상을 찾는 데 쓴다 */
  function body(L, opts) {
    opts = opts || {};
    var T = opts.mode === "export" ? LIGHT : SCREEN, hl = opts.highlight || null, uid = (opts.uid || "f").replace(/[^A-Za-z0-9_-]/g, "_");
    var sel = opts.selected || {}, s = "";
    s += '<defs><marker id="ah-' + uid + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,1 L10,5 L0,9 z" fill="' + T.line + '"/></marker>' +
      '<marker id="ahb-' + uid + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,1 L10,5 L0,9 z" fill="' + T.back + '"/></marker>' +
      '<marker id="ahs-' + uid + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,1 L10,5 L0,9 z" fill="' + T.accent + '"/></marker></defs>';
    // 레인
    L.lanes.forEach(function (l, i) {
      var tint = i % 2 ? 0.05 : 0.09, cur = sel.lane === l.id;
      s += '<g data-lid="' + esc(l.id) + '"><rect x="0" y="' + l.top + '" width="' + L.W + '" height="' + l.h + '" fill="' + l.color + '" fill-opacity="' + tint + '"/>' +
        '<rect x="0" y="' + l.top + '" width="' + L.LW + '" height="' + l.h + '" fill="' + l.color + '" fill-opacity="' + (cur ? 0.32 : 0.16) + '"/><rect x="0" y="' + l.top + '" width="5" height="' + l.h + '" fill="' + l.color + '"/>';
      var lines = wrap(l.label, L.LW - 30, 12, true), y0 = l.top + l.h / 2 - (lines.length - 1) * 8 + 4;
      lines.forEach(function (t, j) { s += '<text x="' + (L.LW / 2 + 3) + '" y="' + (y0 + j * 16) + '" text-anchor="middle" font-size="12" font-weight="600" fill="' + T.ink + '" font-family=\'' + FONT + "'>" + esc(t) + "</text>"; });
      if (i > 0) s += '<line x1="0" x2="' + L.W + '" y1="' + l.top + '" y2="' + l.top + '" stroke="' + T.laneLine + '"/>';
      s += "</g>";
    });
    s += '<line x1="' + L.LW + '" x2="' + L.LW + '" y1="0" y2="' + L.H + '" stroke="' + T.laneLine + '"/>';
    // 연결선
    L.edges.forEach(function (e) {
      var on = sel.edge === e.i, col = on ? T.accent : e.back ? T.back : T.line;
      var dim = hl && !e.hi ? ' opacity="0.35"' : "";
      s += '<g data-eid="' + e.i + '"' + dim + '><path d="' + roundPath(e.pts, 9) + '" fill="none" stroke="' + col + '" stroke-width="' + (on ? 2.2 : 1.5) + '"' + (e.back ? ' stroke-dasharray="6 4"' : "") + ' marker-end="url(#' + (on ? "ahs-" : e.back ? "ahb-" : "ah-") + uid + ')" stroke-linejoin="round"/>' +
        (opts.hit ? '<path d="' + roundPath(e.pts, 9) + '" fill="none" stroke="transparent" stroke-width="14" data-hit="1"/>' : "") + "</g>";
    });
    // 노드
    L.order.forEach(function (id) {
      var nd = L.nodes[id], n = nd.n, l = L.lanes[nd.lane], on = hl ? (n.taskIds || []).some(function (t) { return hl.indexOf(t) >= 0; }) : false, isSel = sel.nodes && sel.nodes.indexOf(id) >= 0;
      var sh = n.shape || "PROCESS", stroke = isSel ? T.accent : on ? T.accent : shade(l.color, -0.25), sw = isSel || on ? 2.6 : 1.5;
      var g = '<g data-nid="' + esc(id) + '"' + (hl && !on ? ' opacity="0.38"' : "") + ">", tcol = T.ink, cx = nd.cx, cy = nd.cy, x = nd.l, y = nd.t, w = nd.w, h = nd.h;
      if (sh === "DECISION") g += '<polygon points="' + cx + "," + y + " " + (x + w) + "," + cy + " " + cx + "," + (y + h) + " " + x + "," + cy + '" fill="' + T.decFill + '" stroke="' + (isSel || on ? T.accent : T.decStroke) + '" stroke-width="' + sw + '" stroke-linejoin="round"/>';
      else if (sh === "TERMINATOR") { g += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + h / 2 + '" fill="' + shade(l.color, -0.2) + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>'; tcol = T.onColor; }
      else if (sh === "IO") g += '<polygon points="' + (x + 14) + "," + y + " " + (x + w) + "," + y + " " + (x + w - 14) + "," + (y + h) + " " + x + "," + (y + h) + '" fill="' + T.ioFill + '" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linejoin="round"/>';
      else if (sh === "DOCUMENT") g += '<path d="M' + x + "," + y + " H" + (x + w) + " V" + (y + h - 9) + " Q" + (x + w * 0.75) + "," + (y + h - 22) + " " + cx + "," + (y + h - 9) + " T" + x + "," + (y + h - 9) + ' Z" fill="' + T.docFill + '" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linejoin="round"/>';
      else if (sh === "CONNECTOR") g += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + h / 2 + '" fill="' + T.surface + '" stroke="' + (isSel ? T.accent : T.muted) + '" stroke-width="' + sw + '" stroke-dasharray="4 3"/>';
      else if (sh === "SCREEN") g += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="7" fill="' + T.surface + '" stroke="' + stroke + '" stroke-width="' + sw + '"/><path d="M' + x + "," + (y + 20) + " V" + (y + 7) + " Q" + x + "," + y + " " + (x + 7) + "," + y + " H" + (x + w - 7) + " Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + 7) + " V" + (y + 20) + ' Z" fill="' + l.color + '" fill-opacity="0.22"/><line x1="' + x + '" x2="' + (x + w) + '" y1="' + (y + 20) + '" y2="' + (y + 20) + '" stroke="' + stroke + '" stroke-width="1"/>';
      else g += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" fill="' + T.surface + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
      var sz = nd.sz, ls = sz.lines, blockH = ls.length * sz.lh, ty;
      if (sh === "SCREEN") ty = y + 20 + (h - 20) / 2 - blockH / 2;
      else if (sh === "PROCESS" && n.screenId) ty = cy - blockH / 2 - 7;
      else if (sh === "DOCUMENT") ty = cy - blockH / 2 - 4;
      else ty = cy - blockH / 2;
      ls.forEach(function (t, j) {
        g += '<text x="' + cx + '" y="' + (ty + j * sz.lh + sz.lh * 0.74) + '" text-anchor="middle" font-size="' + sz.size + '"' + (sh === "TERMINATOR" ? ' font-weight="600"' : "") + ' fill="' + (sh === "CONNECTOR" ? T.muted : tcol) + '" font-family=\'' + FONT + "'>" + esc(t) + "</text>";
      });
      if (n.screenId) {
        var sy = sh === "SCREEN" ? y + 14 : y + h - 8;
        g += '<text x="' + cx + '" y="' + sy + '" text-anchor="middle" font-size="10.5" fill="' + T.accent + '" font-family=\'' + MONO + "'>" + esc(n.screenId) + "</text>";
      }
      if (n.taskIds && n.taskIds.length) {
        var tag = n.taskIds.map(shortTask).join(", "), tw = measure(tag, 9.5, false) + 8;
        g += '<rect x="' + (x + 6) + '" y="' + (y - 7) + '" width="' + tw + '" height="13" rx="6.5" fill="' + T.surface + '" stroke="' + T.laneLine + '"/><text x="' + (x + 6 + tw / 2) + '" y="' + (y + 2.5) + '" text-anchor="middle" font-size="9.5" fill="' + T.muted + '" font-family=\'' + MONO + "'>" + esc(tag) + "</text>";
      }
      s += g + "</g>";
    });
    // 연결선 라벨 (노드 위에)
    L.edges.forEach(function (e) {
      if (!e.lp) return;
      var p = e.lp, x0 = p.anchor === "middle" ? p.x - p.w / 2 : p.x - 3;
      s += '<g pointer-events="none"><rect x="' + x0 + '" y="' + (p.y - 11) + '" width="' + p.w + '" height="15" rx="7.5" fill="' + T.surface + '" fill-opacity="0.94" stroke="' + T.laneLine + '"/><text x="' + (x0 + p.w / 2) + '" y="' + (p.y - 0.5) + '" text-anchor="middle" font-size="11" font-weight="600" fill="' + T.ink + '" font-family=\'' + FONT + "'>" + esc(e.label) + "</text></g>";
    });
    return s;
  }

  /** 범례: 도형 종류 + 되돌아가는 흐름. 쓰인 도형만 보여 줄 수 있다(only). 반환 {markup, h} */
  var LEGEND = [["TERMINATOR", "시작·종료"], ["PROCESS", "처리"], ["DECISION", "판단"], ["DOCUMENT", "문서"], ["IO", "입출력·연계"], ["SCREEN", "화면"], ["CONNECTOR", "연결점"]];
  function legend(x0, y0, opts) {
    opts = opts || {};
    var T = opts.mode === "export" ? LIGHT : SCREEN, only = opts.only, maxW = opts.maxW || 2000;
    var items = LEGEND.filter(function (it) { return !only || only[it[0]]; }), s = "", x = x0, y = y0 + 14, rowH = 24;
    var txt = function (t, tx) { return '<text x="' + tx + '" y="' + (y + 4) + '" font-size="11.5" fill="' + T.muted + "\" font-family='" + FONT + "'>" + esc(t) + "</text>"; };
    s += '<text x="' + x + '" y="' + (y + 4) + '" font-size="11.5" font-weight="700" fill="' + T.ink + "\" font-family='" + FONT + "'>범례</text>";
    x += 40;
    var place = function (w) { if (x + w > x0 + maxW) { x = x0 + 40; y += rowH; } };
    items.forEach(function (it) {
      var sh = it[0], w = 24, h = 14, tw = measure(it[1], 11.5, false), yy = y - 7;
      place(w + 8 + tw + 18);
      if (sh === "DECISION") s += '<polygon points="' + (x + w / 2) + "," + (yy - 3) + " " + (x + w) + "," + (yy + h / 2) + " " + (x + w / 2) + "," + (yy + h + 3) + " " + x + "," + (yy + h / 2) + '" fill="' + T.decFill + '" stroke="' + T.decStroke + '" stroke-width="1.2"/>';
      else if (sh === "TERMINATOR") s += '<rect x="' + x + '" y="' + yy + '" width="' + w + '" height="' + h + '" rx="7" fill="#4B5563"/>';
      else if (sh === "IO") s += '<polygon points="' + (x + 5) + "," + yy + " " + (x + w) + "," + yy + " " + (x + w - 5) + "," + (yy + h) + " " + x + "," + (yy + h) + '" fill="' + T.ioFill + '" stroke="' + T.muted + '" stroke-width="1.2"/>';
      else if (sh === "DOCUMENT") s += '<path d="M' + x + "," + yy + " H" + (x + w) + " V" + (yy + h - 3) + " Q" + (x + w * 0.75) + "," + (yy + h - 8) + " " + (x + w / 2) + "," + (yy + h - 3) + " T" + x + "," + (yy + h - 3) + ' Z" fill="' + T.docFill + '" stroke="' + T.muted + '" stroke-width="1.2"/>';
      else if (sh === "CONNECTOR") s += '<rect x="' + x + '" y="' + yy + '" width="' + w + '" height="' + h + '" rx="7" fill="' + T.surface + '" stroke="' + T.muted + '" stroke-dasharray="3 2"/>';
      else if (sh === "SCREEN") s += '<rect x="' + x + '" y="' + yy + '" width="' + w + '" height="' + h + '" rx="3" fill="' + T.surface + '" stroke="' + T.muted + '" stroke-width="1.2"/><rect x="' + x + '" y="' + yy + '" width="' + w + '" height="5" rx="2" fill="' + T.accent + '" fill-opacity="0.35"/>';
      else s += '<rect x="' + x + '" y="' + yy + '" width="' + w + '" height="' + h + '" rx="4" fill="' + T.surface + '" stroke="' + T.muted + '" stroke-width="1.2"/>';
      s += txt(it[1], x + w + 7);
      x += w + 7 + tw + 18;
    });
    var extra = [["line", "흐름"], ["back", "되돌아가는 흐름(반려·보완)"], ["label", "조건"]];
    extra.forEach(function (it) {
      var tw = measure(it[1], 11.5, false);
      place(34 + tw + 18);
      if (it[0] === "label") { s += '<rect x="' + x + '" y="' + (y - 7) + '" width="28" height="14" rx="7" fill="' + T.surface + '" stroke="' + T.laneLine + '"/><text x="' + (x + 14) + '" y="' + (y + 3.5) + '" text-anchor="middle" font-size="9.5" font-weight="600" fill="' + T.ink + "\" font-family='" + FONT + "'>예</text>"; }
      else s += '<line x1="' + x + '" x2="' + (x + 26) + '" y1="' + y + '" y2="' + y + '" stroke="' + (it[0] === "back" ? T.back : T.line) + '" stroke-width="1.5"' + (it[0] === "back" ? ' stroke-dasharray="6 4"' : "") + '/><path d="M' + (x + 26) + "," + (y - 4) + " L" + (x + 32) + "," + y + " L" + (x + 26) + "," + (y + 4) + ' z" fill="' + (it[0] === "back" ? T.back : T.line) + '"/>';
      s += txt(it[1], x + 38);
      x += 38 + tw + 18;
    });
    return { markup: s, h: y - y0 + 18 };
  }
  function usedShapes(f) {
    var o = {};
    (f.nodes || []).forEach(function (n) { o[n.shape || "PROCESS"] = true; });
    return o;
  }

  function svg(f, opts) {
    opts = opts || {};
    var L = f.order ? f : layout(f, opts);
    if (opts.highlight) L.edges.forEach(function (e) { e.hi = (L.nodes[e.from].n.taskIds || []).concat(L.nodes[e.to].n.taskIds || []).some(function (t) { return opts.highlight.indexOf(t) >= 0; }); });
    var title = f.title || (f.id || "");
    var lg = opts.legend === false ? null : legend(10, L.H + 6, { mode: opts.mode, only: usedShapes(f), maxW: Math.max(L.W - 20, 520) });
    var H = L.H + (lg ? lg.h + 10 : 0), W = Math.max(L.W, lg ? 540 : 0);
    // fit: 화면 폭에 맞춰 줄여 전체가 한눈에 보이게 (원래 크기보다 키우지는 않음)
    var size = opts.fit ? 'width="100%" style="max-width:' + W + 'px;height:auto;display:block"' : 'width="' + W + '" height="' + H + '"';
    return '<svg xmlns="http://www.w3.org/2000/svg" ' + size + ' viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(title) + '">' + body(L, Object.assign({ uid: (f.id || "f") + (opts.suffix || "") }, opts)) + (lg ? lg.markup : "") + "</svg>";
  }

  var api = { layout: layout, body: body, svg: svg, legend: legend, usedShapes: usedShapes, nodeSize: nodeSize, measure: measure, wrap: wrap, clearCache: clearCache, roundPath: roundPath, shade: shade, esc: esc, K: K, FONT: FONT, MONO: MONO, LIGHT: LIGHT, useCanvas: true, shortTask: shortTask };
  root.FlowLayout = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
