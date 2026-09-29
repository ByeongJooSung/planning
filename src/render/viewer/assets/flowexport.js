/*
 * 플로우차트 내보내기: 독립 SVG · PNG · PDF · PPTX(편집 가능한 도형) · Figma(AI 프롬프트, 붙여넣기용 SVG)
 * 배치는 FlowLayout 결과를 그대로 쓰므로 어디로 내보내도 화면과 같은 모양이다.
 */
(function (root) {
  "use strict";
  var FL = root.FlowLayout;
  var esc = function (s) { return FL.esc(s); };
  var PX = 9525; // 1px(96dpi) = 9525 EMU

  // ── 독립 SVG (제목·범례 포함, 색은 모두 고정값) ──
  function build(flow, opts) {
    opts = opts || {};
    var L = opts.layout || FL.layout(flow, { color: opts.color });
    var PADX = 28, HEAD = 74;
    var W = Math.max(L.W + PADX * 2, 600), lgH = FL.legend(0, 0, { mode: "export", only: FL.usedShapes(flow), maxW: W - PADX * 2 }).h, H = HEAD + L.H + lgH + 26;
    var T = FL.LIGHT, title = flow.title || flow.id || "프로세스 플로우";
    var date = opts.date || new Date().toISOString().slice(0, 10);
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">';
    s += '<rect width="' + W + '" height="' + H + '" fill="#FFFFFF"/>';
    s += '<text x="' + PADX + '" y="34" font-size="20" font-weight="700" fill="' + T.ink + "\" font-family='" + FL.FONT + "'>" + esc(title) + "</text>";
    s += '<text x="' + PADX + '" y="56" font-size="11.5" fill="' + T.muted + "\" font-family='" + FL.FONT + "'>" + esc([flow.id, opts.project, opts.sub, date].filter(Boolean).join(" · ")) + "</text>";
    s += '<g transform="translate(' + PADX + "," + HEAD + ')">' + FL.body(L, { mode: "export", uid: "x" }) + "</g>";
    // 범례 (쓰인 도형만)
    s += FL.legend(PADX, HEAD + L.H + 10, { mode: "export", only: FL.usedShapes(flow), maxW: W - PADX * 2 }).markup;
    s += "</svg>";
    return { svg: s, w: W, h: H, layout: L, padX: PADX, head: HEAD };
  }

  // ── PNG / PDF (브라우저) ──
  function toCanvas(svg, w, h, scale) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var sc = Math.min(scale || 2, 16000 / Math.max(w, h)), cv = document.createElement("canvas");
        cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
        var c = cv.getContext("2d");
        c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height);
        c.drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv);
      };
      img.onerror = function () { reject(new Error("이미지로 바꾸지 못했습니다")); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }
  function toPng(b, scale) {
    return toCanvas(b.svg, b.w, b.h, scale || 2).then(function (cv) {
      return new Promise(function (ok, no) { cv.toBlob(function (bl) { bl ? ok(bl) : no(new Error("PNG를 만들지 못했습니다")); }, "image/png"); });
    });
  }
  function toPdf(b) {
    return toCanvas(b.svg, b.w, b.h, 2.5).then(function (cv) {
      return new Promise(function (ok, no) {
        cv.toBlob(function (bl) {
          if (!bl) return no(new Error("PDF를 만들지 못했습니다"));
          var fr = new FileReader();
          fr.onload = function () { ok(new Blob([buildPdf(new Uint8Array(fr.result), cv.width, cv.height, b.w, b.h)], { type: "application/pdf" })); };
          fr.onerror = function () { no(new Error("PDF를 만들지 못했습니다")); };
          fr.readAsArrayBuffer(bl);
        }, "image/jpeg", 0.93);
      });
    });
  }
  /** JPEG 한 장을 한 페이지에 채운 PDF. 쪽 크기는 차트 크기(96dpi → pt) — 인쇄 크기가 크면 줄인다 */
  function buildPdf(jpeg, iw, ih, w, h) {
    var k = Math.min(0.75, 14000 / Math.max(w, h)), pw = Math.round(w * k * 100) / 100, ph = Math.round(h * k * 100) / 100;
    var enc = new TextEncoder(), parts = [], offs = [], len = 0;
    var push = function (u) { parts.push(u); len += u.length; };
    var str = function (t) { push(enc.encode(t)); };
    var obj = function (n, body) { offs[n] = len; str(n + " 0 obj\n" + body + "\nendobj\n"); };
    str("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw + " " + ph + "] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
    offs[4] = len;
    str("4 0 obj\n<< /Type /XObject /Subtype /Image /Width " + iw + " /Height " + ih + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n");
    push(jpeg);
    str("\nendstream\nendobj\n");
    var content = "q " + pw + " 0 0 " + ph + " 0 0 cm /Im0 Do Q";
    obj(5, "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
    var xref = len;
    var x = "xref\n0 6\n0000000000 65535 f \n";
    for (var i = 1; i <= 5; i++) x += ("0000000000" + offs[i]).slice(-10) + " 00000 n \n";
    str(x + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF");
    var out = new Uint8Array(len), p = 0;
    parts.forEach(function (u) { out.set(u, p); p += u.length; });
    return out;
  }

  // ── ZIP (저장만 함, 압축 없음) ──
  var crcTable = null;
  function crc32(u) {
    if (!crcTable) { crcTable = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
    var crc = 0xffffffff;
    for (var i = 0; i < u.length; i++) crc = crcTable[(crc ^ u[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    var enc = new TextEncoder(), chunks = [], central = [], off = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      chunks.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var csize = 0;
    central.forEach(function (u) { csize += u.length; });
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    var all = chunks.concat(central, [new Uint8Array(e.buffer)]), total = 0;
    all.forEach(function (u) { total += u.length; });
    var out = new Uint8Array(total), p = 0;
    all.forEach(function (u) { out.set(u, p); p += u.length; });
    return out;
  }

  // ── PPTX: 도형·연결선·글자가 모두 편집 가능한 한 장짜리 슬라이드 ──
  var NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  var PRST = { TERMINATOR: "flowChartTerminator", PROCESS: "roundRect", DECISION: "flowChartDecision", DOCUMENT: "flowChartDocument", IO: "flowChartInputOutput", SCREEN: "roundRect", CONNECTOR: "roundRect" };
  var hex = function (c) { return String(c || "#000000").replace("#", "").toUpperCase(); };
  function pptx(flow, b, opts) {
    opts = opts || {};
    var L = b.layout, PADX = b.padX, HEAD = b.head;
    var sc = Math.min(1, 5000 / Math.max(b.w, b.h)), E = function (v) { return Math.round(v * sc * PX); };
    var T = FL.LIGHT, id = 1, sp = "";
    var sz = function (px) { return Math.max(600, Math.round(px * 0.75 * sc * 100)); };
    var run = function (t, o) {
      return '<a:r><a:rPr lang="ko-KR" sz="' + sz(o.size) + '" b="' + (o.bold ? 1 : 0) + '" dirty="0"><a:solidFill><a:srgbClr val="' + hex(o.color) + '"/></a:solidFill><a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/><a:cs typeface="Malgun Gothic"/></a:rPr><a:t>' + esc(t) + "</a:t></a:r>";
    };
    var paras = function (lines, o) { return lines.map(function (t) { return '<a:p><a:pPr algn="' + (o.algn || "ctr") + '"/>' + run(t, o) + "</a:p>"; }).join(""); };
    var text = function (body, anchor, ins) {
      var i = E(ins == null ? 4 : ins);
      return '<p:txBody><a:bodyPr wrap="none" lIns="' + i + '" tIns="' + i + '" rIns="' + i + '" bIns="' + i + '" anchor="' + (anchor || "ctr") + '"><a:noAutofit/></a:bodyPr><a:lstStyle/>' + (body || '<a:p><a:endParaRPr lang="ko-KR"/></a:p>') + "</p:txBody>";
    };
    function shape(name, prst, x, y, w, h, o) {
      o = o || {};
      var fill = o.fill ? '<a:solidFill><a:srgbClr val="' + hex(o.fill) + '">' + (o.alpha != null ? '<a:alpha val="' + Math.round(o.alpha * 100000) + '"/>' : "") + "</a:srgbClr></a:solidFill>" : "<a:noFill/>";
      var ln = o.line ? '<a:ln w="' + E(o.lw || 1.5) + '"><a:solidFill><a:srgbClr val="' + hex(o.line) + '"/></a:solidFill>' + (o.dash ? '<a:prstDash val="dash"/>' : "") + "</a:ln>" : "<a:ln><a:noFill/></a:ln>";
      var av = o.adj != null ? '<a:avLst><a:gd name="adj" fmla="val ' + o.adj + '"/></a:avLst>' : "<a:avLst/>";
      sp += '<p:sp><p:nvSpPr><p:cNvPr id="' + ++id + '" name="' + esc(name) + '"/><p:cNvSpPr' + (o.tx ? ' txBox="1"' : "") + "/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"" + E(x) + '" y="' + E(y) + '"/><a:ext cx="' + Math.max(1, E(w)) + '" cy="' + Math.max(1, E(h)) + '"/></a:xfrm><a:prstGeom prst="' + prst + '">' + av + "</a:prstGeom>" + fill + ln + "</p:spPr>" + text(o.body, o.anchor, o.ins) + "</p:sp>";
    }
    function poly(name, pts, o) {
      var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
      var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys), w = Math.max(Math.max.apply(null, xs) - x0, 0.1), h = Math.max(Math.max.apply(null, ys) - y0, 0.1);
      var W = Math.max(1, E(w)), Hh = Math.max(1, E(h));
      var path = pts.map(function (p, i) { return "<a:" + (i ? "lnTo" : "moveTo") + '><a:pt x="' + E(p[0] - x0) + '" y="' + E(p[1] - y0) + '"/></a:' + (i ? "lnTo" : "moveTo") + ">"; }).join("");
      sp += '<p:sp><p:nvSpPr><p:cNvPr id="' + ++id + '" name="' + esc(name) + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="' + E(x0) + '" y="' + E(y0) + '"/><a:ext cx="' + W + '" cy="' + Hh + '"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="' + W + '" h="' + Hh + '" fill="none">' + path + '</a:path></a:pathLst></a:custGeom><a:noFill/><a:ln w="' + E(o.lw || 1.5) + '" cap="rnd"><a:solidFill><a:srgbClr val="' + hex(o.color) + '"/></a:solidFill>' + (o.dash ? '<a:prstDash val="dash"/>' : "") + '<a:round/><a:tailEnd type="triangle" w="med" len="med"/></a:ln></p:spPr>' + text("", "ctr") + "</p:sp>";
    }
    var ox = PADX, oy = HEAD;
    // 제목
    shape("제목", "rect", PADX, 8, b.w - PADX * 2, 36, { tx: true, anchor: "t", ins: 0, body: paras([flow.title || flow.id], { size: 20, bold: true, color: T.ink, algn: "l" }) });
    shape("부제", "rect", PADX, 44, b.w - PADX * 2, 22, { tx: true, anchor: "t", ins: 0, body: paras([[flow.id, opts.project, opts.sub].filter(Boolean).join(" · ")], { size: 11.5, color: T.muted, algn: "l" }) });
    // 레인
    L.lanes.forEach(function (l) {
      shape("Lane/" + l.id, "rect", ox, oy + l.top, L.W, l.h, { fill: FL.shade(l.color, l.idx % 2 ? 0.95 : 0.91), line: T.laneLine, lw: 0.75 });
      shape("LaneHead/" + l.id, "rect", ox, oy + l.top, L.LW, l.h, { fill: FL.shade(l.color, 0.84), line: T.laneLine, lw: 0.75, body: paras(FL.wrap(l.label, L.LW - 30, 12, true), { size: 12, bold: true, color: T.ink }) });
      shape("LaneBar/" + l.id, "rect", ox, oy + l.top, 5, l.h, { fill: l.color });
    });
    // 연결선 → 노드 → 라벨 순서로 그려 노드가 위에 온다
    L.edges.forEach(function (e) { poly("Edge/" + e.from + "-" + e.to, e.pts.map(function (p) { return [ox + p[0], oy + p[1]]; }), { color: e.back ? T.back : T.line, dash: e.back, lw: 1.5 }); });
    L.order.forEach(function (nid) {
      var nd = L.nodes[nid], n = nd.n, l = L.lanes[nd.lane], sh = n.shape || "PROCESS", line = FL.shade(l.color, -0.25), fill = T.surface, col = T.ink;
      if (sh === "DECISION") { fill = T.decFill; line = T.decStroke; }
      else if (sh === "TERMINATOR") { fill = FL.shade(l.color, -0.2); col = "#FFFFFF"; }
      else if (sh === "IO") fill = T.ioFill;
      else if (sh === "DOCUMENT") fill = T.docFill;
      else if (sh === "CONNECTOR") line = T.muted;
      var body = paras(nd.sz.lines, { size: nd.sz.size, bold: sh === "TERMINATOR", color: sh === "CONNECTOR" ? T.muted : col });
      if (n.screenId) body += paras([n.screenId], { size: 10.5, color: T.accent });
      shape("Node/" + nid, PRST[sh] || "roundRect", ox + nd.l, oy + nd.t, nd.w, nd.h, { fill: fill, line: line, lw: 1.5, body: body, dash: sh === "CONNECTOR", adj: sh === "CONNECTOR" ? 50000 : sh === "PROCESS" || sh === "SCREEN" ? 12000 : null, ins: 3 });
      if (n.taskIds && n.taskIds.length) {
        var tag = n.taskIds.map(FL.shortTask).join(", "), tw = FL.measure(tag, 9.5, false) + 10;
        shape("Tag/" + nid, "roundRect", ox + nd.l + 6, oy + nd.t - 7, tw, 13, { fill: T.surface, line: T.laneLine, lw: 0.75, adj: 50000, ins: 0, body: paras([tag], { size: 9.5, color: T.muted }) });
      }
    });
    L.edges.forEach(function (e) {
      if (!e.lp) return;
      var p = e.lp, x0 = p.anchor === "middle" ? p.x - p.w / 2 : p.x - 3;
      shape("EdgeLabel/" + e.from + "-" + e.to, "roundRect", ox + x0, oy + p.y - 11, p.w, 15, { fill: T.surface, line: T.laneLine, lw: 0.75, adj: 50000, ins: 0, body: paras([e.label], { size: 11, bold: true, color: T.ink }) });
    });

    // 범례 (쓰인 도형만) — 편집 가능한 도형과 글자
    var used = FL.usedShapes(flow), lx = PADX, ly = HEAD + L.H + 18;
    shape("Legend/제목", "rect", lx, ly - 2, 40, 18, { tx: true, ins: 0, body: paras(["범례"], { size: 11.5, bold: true, color: T.ink, algn: "l" }) });
    lx += 44;
    [["TERMINATOR", "시작·종료"], ["PROCESS", "처리"], ["DECISION", "판단"], ["DOCUMENT", "문서"], ["IO", "입출력·연계"], ["SCREEN", "화면"], ["CONNECTOR", "연결점"]].forEach(function (it) {
      if (!used[it[0]]) return;
      var fill = it[0] === "DECISION" ? T.decFill : it[0] === "TERMINATOR" ? "#4B5563" : it[0] === "IO" ? T.ioFill : it[0] === "DOCUMENT" ? T.docFill : T.surface;
      shape("Legend/" + it[0], PRST[it[0]] || "roundRect", lx, ly, 26, 14, { fill: fill, line: it[0] === "DECISION" ? T.decStroke : T.muted, lw: 1, dash: it[0] === "CONNECTOR", adj: it[0] === "CONNECTOR" ? 50000 : null });
      var tw = FL.measure(it[1], 11.5, false) + 8;
      shape("Legend/" + it[0] + "/글자", "rect", lx + 30, ly - 2, tw, 18, { tx: true, ins: 0, body: paras([it[1]], { size: 11.5, color: T.muted, algn: "l" }) });
      lx += 30 + tw + 14;
    });
    poly("Legend/되돌아감", [[lx, ly + 7], [lx + 30, ly + 7]], { color: T.back, dash: true, lw: 1.5 });
    shape("Legend/되돌아감/글자", "rect", lx + 36, ly - 2, 170, 18, { tx: true, ins: 0, body: paras(["되돌아가는 흐름(반려·보완)"], { size: 11.5, color: T.muted, algn: "l" }) });

    var cx = Math.round(b.w * sc * PX), cy = Math.round(b.h * sc * PX);
    var slide = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ' + NS + '><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' + sp + "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>";
    var X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var rel = function (items) { return X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + items.map(function (i) { return '<Relationship Id="' + i[0] + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + i[1] + '" Target="' + i[2] + '"/>'; }).join("") + "</Relationships>"; };
    var clr = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"].map(function (a, i) { return "<a:" + a + '><a:srgbClr val="' + ["4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47"][i] + '"/></a:' + a + ">"; }).join("");
    var fills = "<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>", lns = '<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>';
    var theme = X + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Flow"><a:themeElements><a:clrScheme name="Flow"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' + clr + '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Flow"><a:majorFont><a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Flow"><a:fillStyleLst>' + fills + fills + fills + "</a:fillStyleLst><a:lnStyleLst>" + lns + lns + lns + "</a:lnStyleLst><a:effectStyleLst>" + "<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3) + "</a:effectStyleLst><a:bgFillStyleLst>" + fills + fills + fills + "</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>";
    var grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
    var files = [
      { name: "[Content_Types].xml", data: X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>' },
      { name: "_rels/.rels", data: rel([["rId1", "officeDocument", "ppt/presentation.xml"]]) },
      { name: "ppt/presentation.xml", data: X + "<p:presentation " + NS + ' saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="' + cx + '" cy="' + cy + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>' },
      { name: "ppt/_rels/presentation.xml.rels", data: rel([["rId1", "slideMaster", "slideMasters/slideMaster1.xml"], ["rId2", "slide", "slides/slide1.xml"], ["rId3", "theme", "theme/theme1.xml"]]) },
      { name: "ppt/slideMasters/slideMaster1.xml", data: X + "<p:sldMaster " + NS + '><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>' + grp + '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>' },
      { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: rel([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "theme", "../theme/theme1.xml"]]) },
      { name: "ppt/slideLayouts/slideLayout1.xml", data: X + "<p:sldLayout " + NS + ' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>' + grp + "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>" },
      { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: rel([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]]) },
      { name: "ppt/theme/theme1.xml", data: theme },
      { name: "ppt/slides/slide1.xml", data: slide },
      { name: "ppt/slides/_rels/slide1.xml.rels", data: rel([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"]]) },
    ];
    return zip(files);
  }

  // ── Figma ──
  function figmaPrompt(flow, b, opts) {
    opts = opts || {};
    var L = b.layout, T = FL.LIGHT, r = function (v) { return Math.round(v); };
    var o = [];
    o.push("# 요청: Figma에 플로우차트 그리기 — " + (flow.title || flow.id));
    o.push("Figma MCP 도구(use_figma 등)로 아래 스펙 그대로 그려 주세요. 설명 없이 바로 작업하고, 끝나면 만든 프레임 링크와 요약을 알려 주세요.\n");
    o.push("## 프레임");
    o.push("- 이름 `" + (flow.id || "flow") + " " + (flow.title || "") + "`, 크기 " + b.w + "×" + b.h + ", 배경 #FFFFFF. 아래 좌표는 모두 이 프레임 왼쪽 위 기준 px.");
    o.push("- 레이어 이름 규칙: `Lane/…` `Node/…` `Edge/…` `Label/…`. 노드는 도형 + 글자를 한 그룹(또는 컴포넌트)으로, 연결선은 노드와 이어진 커넥터로 만든다.\n");
    o.push("## 글꼴·스타일");
    o.push("- 글꼴 Noto Sans KR (없으면 Pretendard, 그다음 Malgun Gothic). 노드 글자 13px Regular · 시작/종료는 13px SemiBold 흰색 · 레인 이름 12px SemiBold · 연결선 라벨 11px SemiBold · 화면 ID 10.5px IBM Plex Mono " + T.accent + " · Task 태그 9.5px Mono " + T.muted);
    o.push("- 글자색 " + T.ink + ". 선 두께 노드 1.5px, 연결선 1.5px, 모서리 반지름: 처리·화면 8px, 시작/종료·연결점은 완전 둥글게.");
    o.push("- 글자는 모두 표시된 줄바꿈 그대로(자동 줄바꿈 끄기), 도형 가운데 정렬. 도형 크기는 아래 값을 고정으로 쓴다.\n");
    o.push("## 레인 (위→아래)");
    L.lanes.forEach(function (l) {
      o.push("- Lane/" + l.id + " “" + l.label + "”: 사각형 x=" + b.padX + " y=" + r(b.head + l.top) + " w=" + L.W + " h=" + r(l.h) + " 채움 " + l.color + " 투명도 " + (l.idx % 2 ? 5 : 9) + "% · 왼쪽 라벨 영역 w=" + L.LW + "(투명도 16%) · 왼쪽 막대 w=5 " + l.color + " · 라벨 글자 가운데");
    });
    o.push("\n## 노드 (종류: 좌표 x,y는 왼쪽 위 · 크기 w×h · 채움/선 · 글자)");
    L.order.forEach(function (id) {
      var nd = L.nodes[id], n = nd.n, l = L.lanes[nd.lane], sh = n.shape || "PROCESS", fill = "#FFFFFF", line = FL.shade(l.color, -0.25);
      if (sh === "DECISION") { fill = T.decFill; line = T.decStroke; } else if (sh === "TERMINATOR") fill = FL.shade(l.color, -0.2); else if (sh === "IO") fill = T.ioFill; else if (sh === "DOCUMENT") fill = T.docFill;
      var kind = { TERMINATOR: "타원형(양끝 완전 둥근 사각형) 시작/종료", PROCESS: "둥근 사각형(8px) 처리", DECISION: "마름모 판단", DOCUMENT: "문서(아래 물결 사각형)", IO: "평행사변형 입출력(기울기 14px)", SCREEN: "둥근 사각형 화면(위에 화면 ID 띠)", CONNECTOR: "점선 둥근 알약형 연결점" }[sh];
      o.push("- Node/" + id + " " + kind + ": x=" + r(b.padX + nd.l) + " y=" + r(b.head + nd.t) + " w=" + nd.w + " h=" + nd.h + " 채움 " + fill + " 선 " + line + " · 글자 “" + nd.sz.lines.join("↵") + "”" + (n.screenId ? " + 화면 ID “" + n.screenId + "”" : "") + (n.taskIds && n.taskIds.length ? " · 왼쪽 위 태그 “" + n.taskIds.map(FL.shortTask).join(", ") + "”" : ""));
    });
    o.push("\n## 연결선 (직각 폴리라인, 모서리 반지름 9px, 끝에 화살표. 되돌아가는 흐름은 " + T.back + " 점선)");
    L.edges.forEach(function (e, i) {
      o.push("- Edge/" + e.from + "→" + e.to + (e.back ? " (되돌아감)" : "") + ": " + e.pts.map(function (p) { return "(" + r(b.padX + p[0]) + "," + r(b.head + p[1]) + ")"; }).join(" → ") + (e.label ? " · 라벨 “" + e.label + "” 가운데 (" + r(b.padX + e.lp.x) + "," + r(b.head + e.lp.y) + "), 흰 알약 배경" : ""));
    });
    o.push("\n## 마무리");
    o.push("- 프레임 위쪽에 제목 “" + (flow.title || flow.id) + "” 20px Bold, 아래에 " + [flow.id, opts.project, opts.sub].filter(Boolean).join(" · ") + " 11.5px. 프레임 아래쪽에 범례(도형 종류, 점선=되돌아가는 흐름)를 넣는다.");
    o.push("- 다 그린 뒤 겹치거나 잘린 글자가 없는지 스크린샷으로 확인하고 고친다.");
    o.push("\n(참고) 그대로 붙여 넣을 수 있는 SVG는 화면의 ‘Figma용 SVG 복사’로 받을 수 있습니다.");
    return o.join("\n");
  }

  function download(blob, name) {
    var a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  }
  function fileName(flow, ext) {
    return String((flow.id || "flow") + "_" + (flow.title || "")).replace(/[\\/:*?"<>|\s]+/g, "_").replace(/_+$/, "").slice(0, 80) + "." + ext;
  }

  root.FlowExport = { build: build, toPng: toPng, toPdf: toPdf, buildPdf: buildPdf, pptx: pptx, zip: zip, crc32: crc32, figmaPrompt: figmaPrompt, download: download, fileName: fileName };
})(typeof window !== "undefined" ? window : globalThis);
