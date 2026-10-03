/*
 * 화면설계서 문서 내보내기: PPTX(화면 이미지 + 편집 가능한 Description 표) · PDF(인쇄용) · PNG
 *  - 와이어프레임 HTML을 브라우저 안에서 그림(SVG foreignObject → canvas)으로 바꾼다. 외부 라이브러리 없음
 *  - 슬라이드 1280×720(16:9): 머리말(화면 ID·화면명·Location) · 왼쪽 화면 이미지 · 오른쪽 번호별 Description
 *  - 항목이 많으면 ‘(계속)’ 슬라이드로 표를 이어 쓴다
 * SbExport.deck(items, opts) → PPTX Uint8Array · SbExport.pdf(items, opts) → PDF Blob · SbExport.capture(html, w) → {png, w, h}
 */
(function (root) {
  "use strict";
  var PX = 9525, SW = 1280, SH = 720;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var hex = function (c) { return String(c || "#000000").replace("#", "").toUpperCase(); };
  var T = { ink: "#16202C", muted: "#6B7280", line: "#D9DEE5", head: "#EEF2F7", accent: "#1F5E8C", band: "#F6F8FB", lens: "#1F5E8C", cust: "#0B7A75" };

  // ── 페이지 CSS (뷰어 <style> 안의 와이어프레임 규칙) ──
  var cssCache = null;
  function pageCss() {
    if (cssCache != null) return cssCache;
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll("style"), function (st) {
      var t = st.textContent || "";
      // 와이어프레임·프레임·범위 CSS만 (뷰어 전체 CSS는 크고 필요 없다)
      if (/\.wf\b|\.fr-|\.wfs-/.test(t)) out.push(t);
    });
    cssCache = out.join("\n");
    return cssCache;
  }
  function fontStack() { return "Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', 'IBM Plex Sans KR', sans-serif"; }

  /** HTML 한 덩어리를 폭 w로 그려 PNG로. 돌려주는 h는 실제 높이(px) */
  function capture(html, w, opts) {
    opts = opts || {};
    var scale = opts.scale || 1.5, maxH = opts.maxH || 4000;
    var host = document.createElement("div");
    host.setAttribute("style", "position:fixed;left:-30000px;top:0;width:" + w + "px;background:#fff;z-index:-1");
    host.innerHTML = html;
    document.body.appendChild(host);
    var h = Math.min(maxH, Math.max(opts.minH || 1, Math.ceil(host.getBoundingClientRect().height)));
    var ser = new XMLSerializer();
    var inner = ser.serializeToString(host.firstElementChild || host);
    document.body.removeChild(host);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:' + w + "px;height:" + h + 'px;overflow:hidden;background:#fff;font-family:' + fontStack() + '"><style><![CDATA[' + pageCss().replace(/\]\]>/g, "]]]]><![CDATA[>") + "]]></style>" + inner + "</div></foreignObject></svg>";
    return new Promise(function (resolve, reject) {
      // blob: 주소는 Chromium에서 캔버스를 오염시켜 PNG로 못 뽑는다 → data: 주소
      var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg), img = new Image();
      img.onload = function () {
        try {
          var cv = document.createElement("canvas");
          cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
          var c = cv.getContext("2d");
          c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height);
          c.drawImage(img, 0, 0, cv.width, cv.height);
          cv.toBlob(function (bl) { if (!bl) return reject(new Error("이미지를 만들지 못했습니다")); bl.arrayBuffer().then(function (ab) { resolve({ png: new Uint8Array(ab), w: w, h: h, canvas: cv }); }, reject); }, "image/png");
        } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error("화면을 그림으로 바꾸지 못했습니다")); };
      img.src = url;
    });
  }
  function jpegOf(cv, q) { return new Promise(function (ok, no) { cv.toBlob(function (bl) { if (!bl) return no(new Error("JPEG 실패")); bl.arrayBuffer().then(function (ab) { ok(new Uint8Array(ab)); }, no); }, "image/jpeg", q || 0.9); }); }

  // ── 글자 줄 수 추정 (표 행 높이·슬라이드 나누기) ──
  function lines(text, widthPx, fontPx) { var per = Math.max(4, Math.floor(widthPx / (fontPx * 0.95))); return String(text || "").split("\n").reduce(function (a, l) { return a + Math.max(1, Math.ceil(l.length / per)); }, 0); }

  /** 화면설계서 항목 → 표 행 [no, 항목, 설명(여러 줄)] */
  function descRows(sb) {
    return sb.components.map(function (c) {
      var d = [];
      if (c.planner) d.push("[기획] " + c.planner);
      if (c.customer) d.push("[고객] " + c.customer);
      if (c.options) d.push("옵션: " + c.options.values.join(" / ") + (c.options.default ? " (기본 " + c.options.default + ")" : ""));
      var v = c.validation;
      if (v) {
        var parts = [v.required ? "필수" : "선택"];
        if (v.minLength != null || v.maxLength != null) parts.push((v.minLength != null ? v.minLength : 0) + "~" + (v.maxLength != null ? v.maxLength : "") + "자");
        if (v.format) parts.push(v.format);
        if (v.timing && v.timing.length) parts.push("검증 " + v.timing.map(function (t) { return { ON_INPUT: "입력 중", ON_BLUR: "포커스 아웃", ON_SUBMIT: "제출 시" }[t] || t; }).join("·"));
        d.push("유효성: " + parts.join(" · "));
        (v.messages || []).forEach(function (m) { d.push("  - " + (m.condition ? m.condition + " → " : "") + m.text); });
      }
      if (c.ui && c.ui.link) d.push("이동: " + c.ui.link);
      return { no: c.no, label: c.label + (c.ui ? "\n" + c.ui.component : ""), desc: d.join("\n") };
    });
  }
  /** 표 행을 슬라이드에 들어가는 만큼 묶는다 */
  function chunkRows(rows, availH, descW, fontPx, rowPad) {
    var out = [], cur = [], used = 0;
    rows.forEach(function (r) {
      var h = Math.max(lines(r.desc, descW, fontPx), lines(r.label, 110, fontPx)) * fontPx * 1.45 + rowPad;
      if (cur.length && used + h > availH) { out.push(cur); cur = []; used = 0; }
      cur.push(r); used += h;
    });
    if (cur.length || !out.length) out.push(cur);
    return out;
  }

  // ── 슬라이드 모델: 각 화면 → [{kind:"screen"|"cont", …}] ──
  var LAY = { padX: 28, headH: 70, imgX: 28, imgY: 86, imgW: 760, imgH: 596, tabX: 812, tabY: 86, tabW: 440, colNo: 34, colItem: 112, foot: 700 };
  function slidesOf(it, idx, total, opts) {
    var rows = descRows(it.sb), descW = LAY.tabW - LAY.colNo - LAY.colItem - 16;
    var chunks = chunkRows(rows, LAY.imgH - 30, descW, 11, 10);
    return chunks.map(function (rs, i) {
      return { kind: i ? "cont" : "screen", it: it, rows: rs, part: i + 1, parts: chunks.length, idx: idx, total: total, opts: opts, first: rs.length ? rs[0].no : null, last: rs.length ? rs[rs.length - 1].no : null };
    });
  }

  // ── 인쇄용 HTML 슬라이드 (PDF·미리보기) ──
  function slideHtml(s) {
    var it = s.it, o = s.opts || {}, head = it.head || {};
    var h = '<div class="xs" style="width:' + SW + "px;height:" + SH + 'px;position:relative;background:#fff;font-family:' + fontStack() + ";color:" + T.ink + ';overflow:hidden;box-sizing:border-box">';
    h += '<div style="position:absolute;left:0;top:0;right:0;height:' + LAY.headH + "px;background:" + T.band + ";border-bottom:1px solid " + T.line + ';padding:12px 28px;box-sizing:border-box;display:flex;align-items:center;gap:18px">' +
      '<div style="flex:1;min-width:0"><div style="font-size:11px;color:' + T.muted + '">' + esc(o.project || "") + " · " + esc(head.system || "") + " · 화면설계서" + (s.parts > 1 ? " · " + s.part + "/" + s.parts : "") + '</div><div style="font-size:20px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="font-family:ui-monospace,Menlo,monospace;font-size:15px;color:' + T.accent + ';margin-right:10px">' + esc(it.sb.screenId) + "</span>" + esc(it.sb.title || "") + (s.kind === "cont" ? ' <span style="font-weight:400;color:' + T.muted + ';font-size:14px">(계속)</span>' : "") + "</div></div>" +
      '<table style="font-size:11px;border-collapse:collapse;color:' + T.ink + '"><tr><th style="text-align:left;padding:1px 10px 1px 0;color:' + T.muted + ';font-weight:600">Location</th><td style="padding:1px 0">' + esc(head.location || "") + '</td></tr><tr><th style="text-align:left;padding:1px 10px 1px 0;color:' + T.muted + ';font-weight:600">화면 유형</th><td style="padding:1px 0">' + esc(head.kind || "") + (it.sb.template ? " · " + esc(it.sb.template) : "") + '</td></tr><tr><th style="text-align:left;padding:1px 10px 1px 0;color:' + T.muted + ';font-weight:600">Task</th><td style="padding:1px 0;font-family:ui-monospace,Menlo,monospace">' + esc((head.tasks || []).join(", ") || "-") + "</td></tr></table></div>";
    if (s.kind === "screen" && it.img) {
      var r = Math.min(LAY.imgW / it.img.w, LAY.imgH / it.img.h), iw = Math.round(it.img.w * r), ih = Math.round(it.img.h * r);
      h += '<div style="position:absolute;left:' + LAY.imgX + "px;top:" + LAY.imgY + "px;width:" + LAY.imgW + "px;height:" + LAY.imgH + 'px;border:1px solid ' + T.line + ';box-sizing:border-box;background:#fff;overflow:hidden"><img src="' + it.img.url + '" style="width:' + iw + "px;height:" + ih + 'px;display:block" alt=""/>' +
        (it.marks || []).map(function (m) { return '<span style="position:absolute;left:' + Math.round(m.x * r - 10) + "px;top:" + Math.round(m.y * r - 10) + 'px;width:20px;height:20px;border-radius:50%;background:#D92D20;color:#fff;font:700 11px/20px ' + fontStack() + ';text-align:center;border:2px solid #fff;box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,.4)">' + m.no + "</span>"; }).join("") + "</div>";
    } else if (s.kind === "screen") h += '<div style="position:absolute;left:' + LAY.imgX + "px;top:" + LAY.imgY + "px;width:" + LAY.imgW + "px;height:" + LAY.imgH + 'px;border:1px dashed ' + T.line + ";color:" + T.muted + ';display:flex;align-items:center;justify-content:center;font-size:13px;box-sizing:border-box">와이어프레임 없음 (디자인 시스템 미선택)</div>';
    var tx = s.kind === "screen" ? LAY.tabX : LAY.padX, tw = s.kind === "screen" ? LAY.tabW : SW - LAY.padX * 2;
    h += '<table style="position:absolute;left:' + tx + "px;top:" + LAY.tabY + "px;width:" + tw + 'px;border-collapse:collapse;font-size:11px;line-height:1.45;table-layout:fixed"><colgroup><col style="width:' + LAY.colNo + 'px"/><col style="width:' + LAY.colItem + 'px"/><col/></colgroup><thead><tr style="background:' + T.head + '"><th style="border:1px solid ' + T.line + ';padding:5px 4px;text-align:center">No</th><th style="border:1px solid ' + T.line + ';padding:5px 6px;text-align:left">항목</th><th style="border:1px solid ' + T.line + ';padding:5px 6px;text-align:left">Description</th></tr></thead><tbody>' +
      s.rows.map(function (r) {
        var lab = r.label.split("\n");
        return '<tr><td style="border:1px solid ' + T.line + ';text-align:center;vertical-align:top;padding:4px 2px"><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#D92D20;color:#fff;font-weight:700;font-size:10px;line-height:18px">' + r.no + '</span></td><td style="border:1px solid ' + T.line + ';vertical-align:top;padding:4px 6px;word-break:break-all"><b>' + esc(lab[0]) + "</b>" + (lab[1] ? '<br/><span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:' + T.muted + '">' + esc(lab[1]) + "</span>" : "") + '</td><td style="border:1px solid ' + T.line + ';vertical-align:top;padding:4px 6px;white-space:pre-wrap;word-break:break-word">' + esc(r.desc).replace(/\[기획\]/g, '<b style="color:' + T.lens + '">기획</b>').replace(/\[고객\]/g, '<b style="color:' + T.cust + '">고객</b>') + "</td></tr>";
      }).join("") + "</tbody></table>";
    h += '<div style="position:absolute;left:28px;right:28px;bottom:8px;display:flex;justify-content:space-between;font-size:10px;color:' + T.muted + '"><span>' + esc(o.project || "") + " · " + esc(o.date || "") + "</span><span>" + (s.idx + 1) + " / " + s.total + "</span></div></div>";
    return h;
  }
  function coverHtml(items, o) {
    var list = items.map(function (it) { return '<li style="margin:2px 0"><span style="font-family:ui-monospace,Menlo,monospace;color:' + T.accent + ';margin-right:8px">' + esc(it.sb.screenId) + "</span>" + esc(it.sb.title || "") + '<span style="color:' + T.muted + ';margin-left:6px">' + it.sb.components.length + "항목</span></li>"; }).join("");
    return '<div style="width:' + SW + "px;height:" + SH + 'px;position:relative;background:#fff;font-family:' + fontStack() + ";color:" + T.ink + ';box-sizing:border-box;padding:56px 64px;overflow:hidden"><div style="font-size:13px;color:' + T.muted + ';letter-spacing:.04em">화면설계서 (Storyboard)</div><h1 style="margin:8px 0 4px;font-size:34px;line-height:1.2">' + esc(o.project || "") + '</h1><div style="font-size:18px;color:' + T.accent + ';font-weight:600">' + esc(o.system || "") + '</div><div style="font-size:12px;color:' + T.muted + ';margin-top:10px">' + esc(o.date || "") + " · 화면 " + items.length + "개 · 항목 " + items.reduce(function (a, it) { return a + it.sb.components.length; }, 0) + "개" + (o.version ? " · 버전 " + esc(o.version) : "") + '</div><div style="height:1px;background:' + T.line + ';margin:22px 0 16px"></div><div style="font-size:12px;font-weight:700;margin-bottom:6px">수록 화면</div><ol style="margin:0;padding-left:20px;font-size:11.5px;columns:' + (items.length > 14 ? 3 : items.length > 7 ? 2 : 1) + ';column-gap:28px">' + list + "</ol></div>";
  }

  // ── PDF (여러 쪽) ──
  function buildPdfPages(pages) {
    var enc = new TextEncoder(), parts = [], offs = [], len = 0;
    var push = function (u) { parts.push(u); len += u.length; };
    var str = function (t) { push(enc.encode(t)); };
    var obj = function (n, body) { offs[n] = len; str(n + " 0 obj\n" + body + "\nendobj\n"); };
    str("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    var n = 3, kids = [];
    pages.forEach(function () { kids.push((n) + " 0 R"); n += 3; });
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + pages.length + " >>");
    var id = 3;
    pages.forEach(function (pg) {
      var pw = Math.round(pg.w * 0.75 * 100) / 100, ph = Math.round(pg.h * 0.75 * 100) / 100;
      obj(id, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw + " " + ph + "] /Resources << /XObject << /Im0 " + (id + 1) + " 0 R >> >> /Contents " + (id + 2) + " 0 R >>");
      offs[id + 1] = len;
      str((id + 1) + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + pg.iw + " /Height " + pg.ih + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + pg.jpeg.length + " >>\nstream\n");
      push(pg.jpeg);
      str("\nendstream\nendobj\n");
      var content = "q " + pw + " 0 0 " + ph + " 0 0 cm /Im0 Do Q";
      obj(id + 2, "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
      id += 3;
    });
    var xref = len, total = id;
    var x = "xref\n0 " + total + "\n0000000000 65535 f \n";
    for (var i = 1; i < total; i++) x += ("0000000000" + (offs[i] || 0)).slice(-10) + " 00000 n \n";
    str(x + "trailer\n<< /Size " + total + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF");
    var out = new Uint8Array(len), p = 0;
    parts.forEach(function (u) { out.set(u, p); p += u.length; });
    return out;
  }

  // ── PPTX (여러 슬라이드: 그림 + 편집 가능한 글자·표) ──
  var NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  var X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  var E = function (v) { return Math.round(v * PX); };
  function run(t, o) { return '<a:r><a:rPr lang="ko-KR" sz="' + Math.round((o.size || 11) * 100) + '" b="' + (o.bold ? 1 : 0) + '" dirty="0"><a:solidFill><a:srgbClr val="' + hex(o.color || T.ink) + '"/></a:solidFill><a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/></a:rPr><a:t>' + esc(t) + "</a:t></a:r>"; }
  function para(runs, algn) { return '<a:p><a:pPr algn="' + (algn || "l") + '"/>' + runs + "</a:p>"; }
  function textLines(ls, o) { return ls.map(function (l) { return para(run(l, o), o.algn); }).join(""); }
  function Slide() { this.sp = ""; this.id = 1; this.rels = []; this.media = []; }
  Slide.prototype.box = function (name, x, y, w, h, body, o) {
    o = o || {};
    var fill = o.fill ? '<a:solidFill><a:srgbClr val="' + hex(o.fill) + '"/></a:solidFill>' : "<a:noFill/>";
    var ln = o.line ? '<a:ln w="' + E(o.lw || 1) + '"><a:solidFill><a:srgbClr val="' + hex(o.line) + '"/></a:solidFill>' + (o.dash ? '<a:prstDash val="dash"/>' : "") + "</a:ln>" : "<a:ln><a:noFill/></a:ln>";
    this.sp += '<p:sp><p:nvSpPr><p:cNvPr id="' + ++this.id + '" name="' + esc(name) + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="' + E(x) + '" y="' + E(y) + '"/><a:ext cx="' + Math.max(1, E(w)) + '" cy="' + Math.max(1, E(h)) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' + fill + ln + '</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="' + E(o.ins == null ? 4 : o.ins) + '" tIns="' + E(o.ins == null ? 3 : o.ins) + '" rIns="' + E(o.ins == null ? 4 : o.ins) + '" bIns="' + E(o.ins == null ? 3 : o.ins) + '" anchor="' + (o.anchor || "t") + '"><a:noAutofit/></a:bodyPr><a:lstStyle/>' + (body || '<a:p><a:endParaRPr lang="ko-KR"/></a:p>') + "</p:txBody></p:sp>";
  };
  Slide.prototype.image = function (name, png, x, y, w, h) {
    var rid = "rIdImg" + (this.media.length + 1), mname = "image" + (this.media.length + 1) + ".png";
    this.media.push({ rid: rid, name: mname, data: png });
    this.sp += '<p:pic><p:nvPicPr><p:cNvPr id="' + ++this.id + '" name="' + esc(name) + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="' + E(x) + '" y="' + E(y) + '"/><a:ext cx="' + E(w) + '" cy="' + E(h) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="' + E(1) + '"><a:solidFill><a:srgbClr val="' + hex(T.line) + '"/></a:solidFill></a:ln></p:spPr></p:pic>';
  };
  Slide.prototype.oval = function (name, x, y, d, label) {
    this.sp += '<p:sp><p:nvSpPr><p:cNvPr id="' + ++this.id + '" name="' + esc(name) + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="' + E(x) + '" y="' + E(y) + '"/><a:ext cx="' + E(d) + '" cy="' + E(d) + '"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="D92D20"/></a:solidFill><a:ln w="' + E(1.5) + '"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/>' + para(run(String(label), { size: 9, bold: true, color: "#FFFFFF" }), "ctr") + "</p:txBody></p:sp>";
  };
  /** 표: cols=[폭px], rows=[[셀 본문(XML a:p…)]], head=첫 행 머리글 */
  Slide.prototype.table = function (name, x, y, cols, rows, rowH) {
    var tw = cols.reduce(function (a, b) { return a + b; }, 0);
    var grid = cols.map(function (c) { return '<a:gridCol w="' + E(c) + '"/>'; }).join("");
    var cell = function (body, head, i) {
      var fill = head ? '<a:solidFill><a:srgbClr val="' + hex(T.head) + '"/></a:solidFill>' : "";
      var bd = ["L", "R", "T", "B"].map(function (s) { return "<a:ln" + s + ' w="' + E(0.75) + '"><a:solidFill><a:srgbClr val="' + hex(T.line) + '"/></a:solidFill></a:ln' + s + ">"; }).join("");
      return '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>' + (body || '<a:p><a:endParaRPr lang="ko-KR"/></a:p>') + '</a:txBody><a:tcPr marL="' + E(5) + '" marR="' + E(5) + '" marT="' + E(3) + '" marB="' + E(3) + '" anchor="t"' + (i === 0 ? ' anchorCtr="0"' : "") + ">" + bd + fill + "</a:tcPr></a:tc>";
    };
    var trs = rows.map(function (r, ri) { return '<a:tr h="' + E(rowH[ri] || 22) + '">' + r.map(function (c, ci) { return cell(c, ri === 0, ci); }).join("") + "</a:tr>"; }).join("");
    this.sp += '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + ++this.id + '" name="' + esc(name) + '"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="' + E(x) + '" y="' + E(y) + '"/><a:ext cx="' + E(tw) + '" cy="' + E(rowH.reduce(function (a, b) { return a + b; }, 0)) + '"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="0"/><a:tblGrid>' + grid + "</a:tblGrid>" + trs + "</a:tbl></a:graphicData></a:graphic></p:graphicFrame>";
  };
  Slide.prototype.xml = function () {
    return X + "<p:sld " + NS + '><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' + this.sp + "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>";
  };

  function pptxSlide(s) {
    var sl = new Slide(), it = s.it, o = s.opts || {}, head = it.head || {};
    sl.box("머리띠", 0, 0, SW, LAY.headH, "", { fill: T.band, line: T.line, lw: 0.75 });
    sl.box("문서 구분", LAY.padX, 8, 760, 18, textLines([(o.project || "") + " · " + (head.system || "") + " · 화면설계서" + (s.parts > 1 ? " · " + s.part + "/" + s.parts : "")], { size: 9, color: T.muted }), { ins: 0 });
    sl.box("화면 제목", LAY.padX, 26, 760, 36, para(run(it.sb.screenId + "  ", { size: 13, bold: true, color: T.accent }) + run((it.sb.title || "") + (s.kind === "cont" ? " (계속)" : ""), { size: 18, bold: true })), { ins: 0, anchor: "ctr" });
    sl.box("화면 정보", 812, 8, 440, 56, textLines(["Location  " + (head.location || ""), "화면 유형  " + (head.kind || "") + (it.sb.template ? " · " + it.sb.template : ""), "Task  " + ((head.tasks || []).join(", ") || "-")], { size: 9, color: T.ink }), { ins: 0 });
    if (s.kind === "screen") {
      if (it.img) {
        var r = Math.min(LAY.imgW / it.img.w, LAY.imgH / it.img.h), iw = Math.round(it.img.w * r), ih = Math.round(it.img.h * r);
        sl.image("화면 " + it.sb.screenId, it.img.png, LAY.imgX, LAY.imgY, iw, ih);
        (it.marks || []).forEach(function (m) { sl.oval("번호 " + m.no, LAY.imgX + m.x * r - 9, LAY.imgY + m.y * r - 9, 18, m.no); });
      } else sl.box("화면 없음", LAY.imgX, LAY.imgY, LAY.imgW, LAY.imgH, textLines(["와이어프레임 없음 (디자인 시스템 미선택)"], { size: 11, color: T.muted, algn: "ctr" }), { line: T.line, dash: true, anchor: "ctr" });
    }
    var tx = s.kind === "screen" ? LAY.tabX : LAY.padX, tw = s.kind === "screen" ? LAY.tabW : SW - LAY.padX * 2;
    var cols = [LAY.colNo, LAY.colItem, tw - LAY.colNo - LAY.colItem], rows = [[textLines(["No"], { size: 9, bold: true, algn: "ctr" }), textLines(["항목"], { size: 9, bold: true }), textLines(["Description"], { size: 9, bold: true })]], rh = [22];
    s.rows.forEach(function (r) {
      var lab = r.label.split("\n");
      var descP = r.desc.split("\n").map(function (l) {
        var m = /^\[(기획|고객)\] (.*)$/.exec(l);
        return m ? para(run(m[1] + " ", { size: 9, bold: true, color: m[1] === "기획" ? T.lens : T.cust }) + run(m[2], { size: 9 })) : para(run(l, { size: 9, color: /^(옵션|유효성|이동|  -)/.test(l) ? T.muted : T.ink }));
      }).join("");
      rows.push([textLines([String(r.no)], { size: 9, bold: true, color: "#D92D20", algn: "ctr" }), para(run(lab[0], { size: 9, bold: true })) + (lab[1] ? para(run(lab[1], { size: 8, color: T.muted })) : ""), descP]);
      rh.push(Math.max(lines(r.desc, cols[2] - 12, 11), lines(r.label, cols[1] - 12, 11)) * 15 + 8);
    });
    sl.table("Description", tx, LAY.tabY, cols, rows, rh);
    sl.box("바닥", LAY.padX, LAY.foot, SW - LAY.padX * 2, 16, para(run((o.project || "") + " · " + (o.date || ""), { size: 8, color: T.muted }) + run("    " + (s.idx + 1) + " / " + s.total, { size: 8, color: T.muted })), { ins: 0 });
    return sl;
  }
  function pptxCover(items, o) {
    var sl = new Slide();
    sl.box("구분", 64, 56, 1100, 20, textLines(["화면설계서 (Storyboard)"], { size: 11, color: T.muted }), { ins: 0 });
    sl.box("제목", 64, 78, 1100, 50, textLines([o.project || ""], { size: 28, bold: true }), { ins: 0 });
    sl.box("시스템", 64, 130, 1100, 28, textLines([o.system || ""], { size: 15, bold: true, color: T.accent }), { ins: 0 });
    sl.box("요약", 64, 160, 1100, 20, textLines([(o.date || "") + " · 화면 " + items.length + "개 · 항목 " + items.reduce(function (a, it) { return a + it.sb.components.length; }, 0) + "개" + (o.version ? " · 버전 " + o.version : "")], { size: 10, color: T.muted }), { ins: 0 });
    sl.box("선", 64, 196, 1152, 1, "", { fill: T.line });
    var perCol = Math.ceil(items.length / (items.length > 14 ? 3 : items.length > 7 ? 2 : 1)), colsN = Math.ceil(items.length / perCol), cw = Math.floor(1152 / colsN);
    for (var c = 0; c < colsN; c++) {
      var part = items.slice(c * perCol, (c + 1) * perCol);
      sl.box("목차 " + (c + 1), 64 + c * cw, 212, cw - 16, 470, part.map(function (it, i) { return para(run((c * perCol + i + 1) + ". ", { size: 9.5, color: T.muted }) + run(it.sb.screenId + " ", { size: 9.5, color: T.accent }) + run(it.sb.title || "", { size: 9.5 })); }).join(""), { ins: 0 });
    }
    return sl;
  }
  function pack(slides) {
    var rel = function (items) { return X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + items.map(function (i) { return '<Relationship Id="' + i[0] + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + i[1] + '" Target="' + i[2] + '"/>'; }).join("") + "</Relationships>"; };
    var clr = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"].map(function (a, i) { return "<a:" + a + '><a:srgbClr val="' + ["1F5E8C", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47"][i] + '"/></a:' + a + ">"; }).join("");
    var fills = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>', lns = '<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>';
    var theme = X + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="SB"><a:themeElements><a:clrScheme name="SB"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' + clr + '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="SB"><a:majorFont><a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="SB"><a:fillStyleLst>' + fills + fills + fills + "</a:fillStyleLst><a:lnStyleLst>" + lns + lns + lns + "</a:lnStyleLst><a:effectStyleLst>" + "<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3) + "</a:effectStyleLst><a:bgFillStyleLst>" + fills + fills + fills + "</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>";
    var grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
    var files = [
      { name: "_rels/.rels", data: rel([["rId1", "officeDocument", "ppt/presentation.xml"]]) },
      { name: "ppt/presentation.xml", data: X + "<p:presentation " + NS + ' saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' + slides.map(function (_, i) { return '<p:sldId id="' + (256 + i) + '" r:id="rIdS' + (i + 1) + '"/>'; }).join("") + '</p:sldIdLst><p:sldSz cx="' + E(SW) + '" cy="' + E(SH) + '" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>' },
      { name: "ppt/_rels/presentation.xml.rels", data: rel([["rId1", "slideMaster", "slideMasters/slideMaster1.xml"], ["rId2", "theme", "theme/theme1.xml"]].concat(slides.map(function (_, i) { return ["rIdS" + (i + 1), "slide", "slides/slide" + (i + 1) + ".xml"]; }))) },
      { name: "ppt/slideMasters/slideMaster1.xml", data: X + "<p:sldMaster " + NS + '><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>' + grp + '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>' },
      { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: rel([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "theme", "../theme/theme1.xml"]]) },
      { name: "ppt/slideLayouts/slideLayout1.xml", data: X + "<p:sldLayout " + NS + ' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>' + grp + "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>" },
      { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: rel([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]]) },
      { name: "ppt/theme/theme1.xml", data: theme }
    ];
    var overrides = "";
    slides.forEach(function (sl, i) {
      var n = i + 1;
      files.push({ name: "ppt/slides/slide" + n + ".xml", data: sl.xml() });
      files.push({ name: "ppt/slides/_rels/slide" + n + ".xml.rels", data: rel([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"]].concat(sl.media.map(function (m) { return [m.rid, "image", "../media/s" + n + "_" + m.name]; }))) });
      sl.media.forEach(function (m) { files.push({ name: "ppt/media/s" + n + "_" + m.name, data: m.data }); });
      overrides += '<Override PartName="/ppt/slides/slide' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    });
    files.unshift({ name: "[Content_Types].xml", data: X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' + overrides + "</Types>" });
    return root.FlowExport.zip(files);
  }

  /** items: [{sb, head:{system,location,kind,tasks}, html(와이어프레임 HTML, 없으면 null), marks:[{no,x,y}]}] */
  function prepare(items, opts, onStep) {
    var i = 0;
    return items.reduce(function (p, it) {
      return p.then(function () {
        i++;
        if (onStep) onStep(i, items.length, it.sb.screenId);
        if (!it.html) return null;
        return capture(it.html, opts.vw || 1920, { scale: 1.25, maxH: 4000 }).then(function (img) {
          if (it.crop) {
            // 본문 영역만 잘라 낸다 (번호 좌표도 함께 옮김)
            var sc = img.canvas.width / img.w, cv = document.createElement("canvas");
            cv.width = Math.round(it.crop.w * sc); cv.height = img.canvas.height;
            cv.getContext("2d").drawImage(img.canvas, Math.round(it.crop.x * sc), 0, cv.width, cv.height, 0, 0, cv.width, cv.height);
            img = { canvas: cv, w: it.crop.w, h: img.h, png: null };
            (it.marks || []).forEach(function (m) { m.x -= it.crop.x; });
          }
          it.img = img;
          it.img.url = img.canvas.toDataURL("image/png");
          return new Promise(function (ok, no) { img.canvas.toBlob(function (bl) { if (!bl) return no(new Error("PNG 실패")); bl.arrayBuffer().then(function (ab) { img.png = new Uint8Array(ab); ok(); }, no); }, "image/png"); });
        });
      });
    }, Promise.resolve()).then(function () {
      var total = 0, all = [];
      items.forEach(function (it, idx) { var ss = slidesOf(it, idx, 0, opts); all = all.concat(ss); });
      total = all.length;
      all.forEach(function (s, k) { s.idx = k; s.total = total; });
      return all;
    });
  }
  function deck(items, opts, onStep) {
    return prepare(items, opts, onStep).then(function (slides) {
      return pack([pptxCover(items, opts)].concat(slides.map(pptxSlide)));
    });
  }
  function pdf(items, opts, onStep) {
    return prepare(items, opts, onStep).then(function (slides) {
      var htmls = [coverHtml(items, opts)].concat(slides.map(slideHtml)), pages = [];
      return htmls.reduce(function (p, h) {
        return p.then(function () { return capture(h, SW, { scale: 2, minH: SH, maxH: SH }); }).then(function (img) { return jpegOf(img.canvas, 0.9).then(function (j) { pages.push({ jpeg: j, iw: img.canvas.width, ih: img.canvas.height, w: SW, h: SH }); }); });
      }, Promise.resolve()).then(function () { return new Blob([buildPdfPages(pages)], { type: "application/pdf" }); });
    });
  }
  /** 인쇄용 HTML 문서 (브라우저에서 바로 인쇄 → PDF) */
  function printHtml(items, opts, onStep) {
    return prepare(items, opts, onStep).then(function (slides) {
      var body = [coverHtml(items, opts)].concat(slides.map(slideHtml)).map(function (h) { return '<section class="pg">' + h + "</section>"; }).join("");
      // 뷰어 조각 검사가 html 여는 태그 글자를 보지 않도록 나눠 쓴다
      return "<!doctype html><" + "html lang=\"ko\"><head><meta charset=\"utf-8\"><title>" + esc((opts.project || "") + " " + (opts.system || "") + " 화면설계서") + "</title><style>@page{size:1280px 720px;margin:0}body{margin:0;background:#e5e7eb}.pg{width:1280px;height:720px;margin:16px auto;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.15);page-break-after:always;overflow:hidden}@media print{body{background:#fff}.pg{margin:0;box-shadow:none}}</style></head><body>" + body + "</body></" + "html>";
    });
  }

  root.SbExport = { pageCss: pageCss, capture: capture, deck: deck, pdf: pdf, printHtml: printHtml, descRows: descRows, buildPdfPages: buildPdfPages };
})(typeof window !== "undefined" ? window : globalThis);
