/* 디자인 시스템 기반 와이어프레임 렌더러 — 컨셉 미리보기, 디자인 시스템 페이지, 화면설계서, 프로토타입이 함께 쓴다. */
(function () {
  "use strict";
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var ICON_PATHS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    home: '<path d="M3 11l9-7 9 7v9h-7v-6h-4v6H3z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 16V5M7 10l5-5 5 5M4 20h16"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    "chevron-left": '<path d="M15 5l-7 7 7 7"/>',
    "chevron-right": '<path d="M9 5l7 7-7 7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
    logout: '<path d="M15 12H4M8 8l-4 4 4 4M13 4h6v16h-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    megaphone: '<path d="M3 10v4h4l7 5V5L7 10z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    excel: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8l6 8M15 8l-6 8"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>'
  };
  var ICON_LABEL = {
    search: "검색", menu: "메뉴", user: "사용자", bell: "알림", home: "홈", download: "내려받기", upload: "올리기",
    calendar: "달력", "chevron-left": "이전", "chevron-right": "다음", close: "닫기", check: "확인", alert: "경고",
    info: "안내", file: "파일", logout: "로그아웃", plus: "추가", edit: "수정", trash: "삭제", filter: "필터",
    chart: "통계", settings: "설정", folder: "폴더", clipboard: "문서", shield: "보안", layers: "분류", clock: "시간", refresh: "새로고침",
    megaphone: "알림 문구", panel: "메뉴 접기", excel: "엑셀", inbox: "접수함"
  };
  /** 메뉴 이름으로 어울리는 아이콘 고르기 */
  var MENU_ICONS = [[/대시|홈|메인/, "home"], [/접수|신청|신고/, "inbox"], [/심사|검토|승인/, "check"], [/등록|작성/, "edit"], [/통계|현황|분석/, "chart"], [/관리|운영|설정/, "settings"],
    [/게시|공지|알림/, "megaphone"], [/자료|문서|증명/, "file"], [/정보|조회/, "search"], [/보안|보호|권한/, "shield"], [/회원|사용자|나의|마이/, "user"], [/분류|물질|목록/, "layers"]];
  function menuIcon(name, i) {
    for (var k = 0; k < MENU_ICONS.length; k++) if (MENU_ICONS[k][0].test(name)) return MENU_ICONS[k][1];
    return ["folder", "clipboard", "layers", "file", "settings"][i % 5];
  }
  function icon(name, size) {
    var s = size || 16;
    return '<svg class="wf-ic" data-ic="' + esc(ICON_PATHS[name] ? name : "info") + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON_PATHS[name] || ICON_PATHS.info) + "</svg>";
  }

  var SAMPLE = {
    portal: { menus: ["정보공개", "민원안내", "알림마당", "기관소개"], title: "정보공개 목록" },
    service: { menus: ["등록 신청", "신고", "변경 등록", "자료 제출", "보완 요청", "진행 현황", "증명서 발급", "나의 정보"], title: "나의 신청 현황" },
    admin: { menus: ["접수", "심사", "등록 관리", "민원 관리", "통계", "운영 관리", "자료 관리", "게시판"], title: "심사 목록" }
  };

  function vars(ds) {
    var t = ds.tokens, c = t.color, f = t.font, L = ds.layout;
    var compact = L.density === "compact";
    var btnR = L.button === "pill" ? "999px" : L.button === "rounded" ? t.radius.md + "px" : t.radius.sm + "px";
    var shadow = t.shadow === "strong" ? "0 6px 18px rgba(0,0,0,.18)" : t.shadow === "soft" ? "0 2px 8px rgba(15,23,42,.08)" : "none";
    var v = {
      "--w-primary": c.primary, "--w-on-primary": c.onPrimary, "--w-accent": c.accent, "--w-bg": c.bg, "--w-surface": c.surface,
      "--w-alt": c.surfaceAlt, "--w-border": c.border, "--w-text": c.text, "--w-muted": c.textMuted, "--w-nav": c.nav,
      "--w-on-nav": c.onNav, "--w-success": c.success, "--w-warning": c.warning, "--w-danger": c.danger, "--w-info": c.info,
      "--w-font": f.family, "--w-display": f.scale.display + "px", "--w-h1": f.scale.h1 + "px", "--w-h2": f.scale.h2 + "px",
      "--w-h3": f.scale.h3 + "px", "--w-body": f.scale.body + "px", "--w-small": f.scale.small + "px", "--w-caption": f.scale.caption + "px",
      "--w-bold": f.weightBold, "--w-r-sm": t.radius.sm + "px", "--w-r-md": t.radius.md + "px", "--w-r-lg": t.radius.lg + "px",
      "--w-btn-r": btnR, "--w-h": t.control.height + "px", "--w-row": t.control.rowHeight + "px", "--w-sp": t.spacing + "px",
      "--w-pad": (compact ? t.spacing * 2 : t.spacing * 3) + "px", "--w-max": t.grid.maxWidth + "px", "--w-shadow": shadow,
      "--w-nav-active": c.navActive || c.primary, "--w-on-nav-active": c.onNavActive || c.onPrimary,
      "--w-header": c.header || c.surface, "--w-on-header": c.onHeader || c.text
    };
    // 상단 메뉴형 헤더 색: 흰 바탕(기본) 또는 톤의 메뉴 색
    var navFill = L.headerFill === "nav" || (!L.headerFill && !L.frame);
    v["--w-gnb-bg"] = navFill ? c.nav : (c.header || c.surface);
    v["--w-gnb-fg"] = navFill ? c.onNav : (c.onHeader || c.text);
    // 표 머리: 진한 면 / 옅은 면 / 선만
    var th = L.tableHead || "line";
    if (th === "dark") { v["--w-th-bg"] = c.tableHead || c.nav; v["--w-th-color"] = c.onTableHead || "#FFFFFF"; v["--w-th-line"] = "transparent"; }
    else if (th === "tint") { v["--w-th-bg"] = c.tableHead || c.surfaceAlt; v["--w-th-color"] = c.onTableHead || c.text; v["--w-th-line"] = c.border; }
    // 통계 카드·차트 계열 색
    var ser = t.series && t.series.length ? t.series : [c.primary, c.accent, c.info, c.success, c.warning];
    ser.forEach(function (col, i) { v["--w-s" + (i + 1)] = col; });
    v["--w-chart-1"] = ser[0]; v["--w-chart-2"] = ser[1] || c.accent; v["--w-chart-3"] = ser[2] || c.info;
    // 컴포넌트 스타일 변수(디자인 시스템 componentStyles)는 토큰 뒤에 붙여 덮어쓴다
    var cs = ds.componentStyles || {};
    Object.keys(cs).forEach(function (cid) { Object.keys(cs[cid] || {}).forEach(function (k) { if (/^--w-[a-z0-9-]+$/.test(k)) v[k] = cs[cid][k]; }); });
    // style="…" 속성 안에 들어가므로 큰따옴표를 작은따옴표로 바꾼다 (글꼴 이름)
    return Object.keys(v).map(function (k) { return k + ":" + String(v[k]).replace(/"/g, "'"); }).join(";");
  }

  function tone(v) {
    v = String(v);
    if (/반려|거부|오류|중지/.test(v)) return "danger";
    if (/공개$|승인|완료|전체공개/.test(v)) return "success";
    if (/부분|보완|대기/.test(v)) return "warning";
    if (/심사|신청|접수|처리중/.test(v)) return "info";
    return "neutral";
  }
  function badge(v) { return '<span class="wf-badge ' + tone(v) + '">' + esc(v) + "</span>"; }
  function btn(label, variant, attrs) {
    return '<button type="button" class="wf-btn ' + (variant || "secondary") + '"' + (attrs || "") + ">" + esc(label) + "</button>";
  }
  function linkAttr(ctx, link) { return link ? ' data-link="' + esc(link) + '"' : ""; }

  // ── 컴포넌트 ─────────────────────────────────
  var C = {};
  C["search-bar"] = function (ds, p) {
    return '<div class="wf-search' + (p.variant === "hero" ? " hero" : "") + '"><span class="wf-input">' + icon("search") + "<em>" + esc(p.placeholder || "검색어를 입력하세요") + "</em></span>" + btn("검색", "primary") + "</div>";
  };
  /** 아이콘이 붙은 버튼 (라벨 뒤에 아이콘) */
  function btnI(label, variant, ic, attrs) {
    return '<button type="button" class="wf-btn ' + (variant || "secondary") + '"' + (attrs || "") + "><span>" + esc(label) + "</span>" + icon(ic, 15) + "</button>";
  }
  function ctlOf(f) {
    return f.type === "select" ? '<span class="wf-input sel"><em>' + esc((f.options || ["전체"])[0]) + "</em>" + icon("chevron-right", 12).replace('class="wf-ic"', 'class="wf-ic dn"') + "</span>" :
      f.type === "date-range" ? '<span class="wf-input sel sm"><em>' + esc(f.basis || "작성일자") + "</em>" + icon("chevron-right", 12).replace('class="wf-ic"', 'class="wf-ic dn"') + '</span><span class="wf-input"><em>YYYY-MM-DD</em>' + icon("calendar", 14) + '</span><span class="wf-tilde">-</span><span class="wf-input"><em>YYYY-MM-DD</em>' + icon("calendar", 14) + "</span>" :
        '<span class="wf-input"><em>' + esc(f.placeholder || (f.label ? f.label + " 입력" : "")) + "</em></span>";
  }
  C["search-panel"] = function (ds, p) {
    var st = ds.layout.searchStyle || "card", fields = p.fields || [];
    if (st === "table") {
      var rows = [];
      for (var i = 0; i < fields.length; i += 2) rows.push(fields.slice(i, i + 2));
      return '<div class="wf-stable"><div class="wf-strows">' + rows.map(function (r) {
        return '<div class="wf-str">' + r.map(function (f) { return '<div class="wf-stl">' + esc(f.label) + '</div><div class="wf-stc"><div class="wf-row">' + ctlOf(f) + "</div></div>"; }).join("") +
          (r.length === 1 ? '<div class="wf-stl e"></div><div class="wf-stc"></div>' : "") + "</div>";
      }).join("") + '</div><div class="wf-sbtns center">' + btnI("초기화", "secondary wide", "refresh") + btn("검색", "primary wide") + "</div></div>";
    }
    if (st === "inline") {
      return '<div class="wf-sinline">' + fields.map(function (f) { return '<label class="wf-sil"><span>' + esc(f.label) + '</span><div class="wf-row">' + ctlOf(f) + "</div></label>"; }).join("") + btn("초기화", "secondary") + btn("검색", "primary") + "</div>";
    }
    var cards = fields.map(function (f) {
      return '<label class="wf-sf' + (f.type === "date-range" ? " wide" : "") + '"><span>' + esc(f.label) + '</span><div class="wf-row">' + ctlOf(f) + "</div></label>";
    }).join("");
    return '<div class="wf-spanel"><div class="wf-sgrid">' + cards + '</div><div class="wf-sbtns">' + btn("초기화", "secondary") + btn("조회", "primary") + "</div></div>";
  };
  /** 대시보드 위젯 머리: 제목 (건수) · 오른쪽 보조 */
  function widgetHead(title, count, right) {
    return '<div class="wf-whead"><b>' + esc(title) + (count != null ? " <em>(" + esc(count) + ")</em>" : "") + "</b>" + (right || "") + "</div>";
  }
  C["data-table"] = function (ds, p, ctx, link) {
    var cols = p.columns || [], rows = p.rows || [], bc = p.badgeColumn, total = p.total != null ? p.total : rows.length;
    var biz = ds.layout.searchStyle === "table";
    var tools = '<span class="wf-ttools">' + (ds.layout.pagination === "numbered-size" || biz ? '<span class="wf-input sel sm"><em>20개씩 보기</em>' + icon("chevron-right", 12).replace('class="wf-ic"', 'class="wf-ic dn"') + "</span>" : "") +
      (biz ? '<span class="wf-input sel sm"><em>최신순</em>' + icon("chevron-right", 12).replace('class="wf-ic"', 'class="wf-ic dn"') + "</span>" + btnI("엑셀 다운로드", "secondary sm", "excel") : "") +
      (p.action ? btn(p.action, "primary sm") : "") + "</span>";
    var head = p.title ? widgetHead(p.title, total, p.period ? '<span class="wf-meta">' + esc(p.period) + "</span>" : p.more ? '<span class="wf-more-l">더보기 +</span>' : "") :
      '<div class="wf-thead"><span class="wf-total">총 <b>' + esc(total) + "</b>건</span>" + tools + "</div>";
    // 항목마다 표/카드를 고를 수 있다 (props.view: "table" | "card"). 없으면 디자인 시스템 목록 형태
    var view = p.view === "table" || p.view === "list" ? "table" : p.view === "card" ? "card" : ds.layout.list;
    var body;
    if (view === "card") {
      body = '<div class="wf-cards">' + rows.map(function (r) {
        return '<div class="wf-card"' + linkAttr(ctx, link) + ">" + (bc != null ? badge(r[bc]) : "") + "<b>" + esc(r[1] != null ? r[1] : r[0]) + '</b><span class="wf-meta">' +
          r.filter(function (_, i) { return i !== 1 && i !== bc; }).map(esc).join(" · ") + "</span></div>";
      }).join("") + "</div>";
    } else {
      body = '<table class="wf-table"><thead><tr>' + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        rows.map(function (r) {
          return "<tr" + linkAttr(ctx, link) + ">" + r.map(function (v, i) { return "<td>" + (i === bc ? badge(v) : (i === (p.linkColumn != null ? p.linkColumn : 1)) && link ? "<u>" + esc(v) + "</u>" : esc(v)) + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table>";
    }
    return p.title ? '<div class="wf-widget">' + head + body + "</div>" : head + body;
  };
  C["card-list"] = function (ds, p, ctx, link) {
    return '<div class="wf-cards">' + (p.items || []).map(function (it) {
      return '<div class="wf-card"' + linkAttr(ctx, link) + "><b>" + esc(it.title || it) + '</b><span class="wf-meta">' + esc(it.meta || "") + "</span></div>";
    }).join("") + "</div>";
  };
  C.pagination = function (ds, p) {
    if (ds.layout.pagination === "more") return '<div class="wf-more">' + btn("더보기 (10 / " + (p.total || 10) + ")", "secondary") + "</div>";
    var nums = [1, 2, 3, 4, 5].map(function (n) { return '<span class="wf-pg' + (n === 1 ? " on" : "") + '">' + n + "</span>"; }).join("");
    return '<div class="wf-pager"><span class="wf-pg">' + icon("chevron-left", 14) + "</span>" + nums + '<span class="wf-pg">' + icon("chevron-right", 14) + "</span></div>";
  };
  C["detail-table"] = function (ds, p) {
    return '<table class="wf-dtable"><tbody>' + (p.rows || []).map(function (r) {
      return "<tr><th>" + esc(r[0]) + "</th><td>" + (/구분|상태/.test(r[0]) ? badge(r[1]) : esc(r[1])) + "</td></tr>";
    }).join("") + "</tbody></table>";
  };
  C["status-badge"] = function (ds, p) { return badge(p.label || "심사중"); };
  C["file-list"] = function (ds, p) {
    return '<ul class="wf-files">' + (p.files || ["첨부파일.pdf (1.2MB)"]).map(function (f) { return "<li>" + icon("file") + "<span>" + esc(f) + "</span>" + icon("download") + "</li>"; }).join("") + "</ul>";
  };
  C["stat-cards"] = function (ds, p) {
    var st = ds.layout.stat || "plain", items = p.items || [];
    var nSer = ds.tokens && ds.tokens.series && ds.tokens.series.length ? ds.tokens.series.length : 5;
    var cols = p.columns || Math.min(items.length || 4, items.length > 6 ? 5 : items.length > 4 ? 3 : 4);
    var ics = ["file", "clipboard", "edit", "inbox", "layers", "shield", "check", "folder", "chart", "user"];
    var cards = items.map(function (s0, i) {
      var sc = "--sc:var(--w-s" + (i % nSer + 1) + ")", unit = s0[2] != null ? s0[2] : p.unit || "";
      var val = "<b>" + esc(s0[1]) + (unit ? "<small>" + esc(unit) + "</small>" : "") + "</b>";
      if (st === "gradient") return '<div class="wf-stat g" style="' + sc + '"><div class="wf-sth"><span>' + esc(s0[0]) + "</span>" + icon(ics[i % ics.length], 20) + "</div>" + val + "</div>";
      if (st === "topline") return '<div class="wf-stat tl" style="' + sc + '"><span>' + esc(s0[0]) + "</span>" + val + "</div>";
      if (st === "icon") return '<div class="wf-stat ic" style="' + sc + '"><i>' + icon(ics[i % ics.length], 20) + "</i><div><span>" + esc(s0[0]) + "</span>" + val + "</div></div>";
      return '<div class="wf-stat"><span>' + esc(s0[0]) + "</span>" + val + "</div>";
    }).join("");
    var grid = '<div class="wf-stats st-' + st + '" style="grid-template-columns:repeat(' + cols + ',minmax(0,1fr))">' + cards + "</div>";
    return p.title ? '<div class="wf-widget">' + widgetHead(p.title, p.count) + grid + "</div>" : grid;
  };
  /** 차트(그래프) 와이어프레임: 막대·선·영역·원형·도넛. props: {type,title,labels,series:[{name,values}],unit} 또는 items:[[라벨,값…]] */
  C.chart = function (ds, p) {
    var labels = Array.isArray(p.labels) ? p.labels.map(String) : [], series = [];
    var rows = Array.isArray(p.items) ? p.items : Array.isArray(p.data) ? p.data : Array.isArray(p.rows) ? p.rows : null;
    if (rows && rows.length && Array.isArray(rows[0])) {
      labels = rows.map(function (r) { return String(r[0]); });
      var nSer = Math.max.apply(null, rows.map(function (r) { return r.length - 1; }));
      for (var si = 0; si < nSer; si++) series.push({ name: Array.isArray(p.columns) ? p.columns[si + 1] : p.series && p.series[si] && p.series[si].name || (nSer > 1 ? "계열 " + (si + 1) : ""), values: rows.map(function (r) { return Number(r[si + 1]) || 0; }) });
    } else if (Array.isArray(p.series) && p.series.length) {
      series = p.series.map(function (s0, i) { return Array.isArray(s0) ? { name: "계열 " + (i + 1), values: s0.map(Number) } : { name: s0.name || s0.label || "계열 " + (i + 1), values: (s0.values || s0.data || []).map(Number) }; });
    } else if (Array.isArray(p.values)) series = [{ name: p.name || "", values: p.values.map(Number) }];
    if (!series.length) { labels = ["1월", "2월", "3월", "4월", "5월", "6월"]; series = [{ name: "", values: [32, 45, 38, 56, 49, 61] }]; }
    var n = Math.max(labels.length, series[0].values.length);
    while (labels.length < n) labels.push(String(labels.length + 1));
    var type = String(p.type || p.variant || "bar").toLowerCase();
    if (/pie|원/.test(type)) type = "pie"; else if (/donut|도넛/.test(type)) type = "donut"; else if (/area|영역/.test(type)) type = "area"; else if (/line|선|추이/.test(type)) type = "line"; else type = "bar";
    var W = 600, H = 220, padL = 40, padR = 12, padT = 12, padB = 30, unit = p.unit ? String(p.unit) : "";
    var max = 0; series.forEach(function (s0) { s0.values.forEach(function (v) { if (v > max) max = v; }); });
    max = max || 1;
    var nice = Math.pow(10, Math.floor(Math.log10(max))); max = Math.ceil(max / nice) * nice;
    var cw = W - padL - padR, ch = H - padT - padB, svg = "";
    var X = function (i) { return padL + cw * (n === 1 ? 0.5 : i / (n - 1)); }, Y = function (v) { return padT + ch - ch * v / max; };
    var cls = function (i) { return "s" + (i % 3); };
    if (type === "pie" || type === "donut") {
      var vals = series[0].values.slice(0, n), tot = vals.reduce(function (a, b) { return a + b; }, 0) || 1, cx = 130, cy = H / 2, r = 86, a0 = -Math.PI / 2;
      svg += vals.map(function (v, i) {
        var a1 = a0 + Math.PI * 2 * v / tot, x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1), lg = a1 - a0 > Math.PI ? 1 : 0;
        var d = "M" + cx + " " + cy + " L" + x0.toFixed(1) + " " + y0.toFixed(1) + " A" + r + " " + r + " 0 " + lg + " 1 " + x1.toFixed(1) + " " + y1.toFixed(1) + " Z";
        a0 = a1;
        return '<path class="' + cls(i) + '" style="opacity:' + (1 - Math.floor(i / 3) * 0.3) + '" d="' + d + '"/>';
      }).join("");
      if (type === "donut") svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.58) + '" class="hole"/><text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" class="tot">' + esc(String(tot)) + esc(unit) + "</text>";
      svg += vals.map(function (v, i) { var y = 40 + i * 22; return '<rect class="' + cls(i) + '" style="opacity:' + (1 - Math.floor(i / 3) * 0.3) + '" x="260" y="' + (y - 9) + '" width="12" height="12" rx="2"/><text x="280" y="' + (y + 1) + '" class="lb">' + esc(labels[i]) + "</text><text x=\"" + (W - 20) + '" y="' + (y + 1) + '" text-anchor="end" class="lb">' + esc(String(v)) + esc(unit) + " · " + Math.round(v / tot * 100) + "%</text>"; }).join("");
    } else {
      for (var g = 0; g <= 4; g++) { var gy = padT + ch * g / 4; svg += '<line class="grid" x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '"/><text x="' + (padL - 6) + '" y="' + (gy + 4) + '" text-anchor="end" class="ax">' + Math.round(max * (4 - g) / 4) + "</text>"; }
      labels.forEach(function (l, i) { svg += '<text x="' + (type === "bar" ? padL + cw * (i + 0.5) / n : X(i)) + '" y="' + (H - 10) + '" text-anchor="middle" class="ax">' + esc(l) + "</text>"; });
      if (type === "bar") {
        var gw = cw / n, bw = Math.min(28, gw * 0.7 / series.length);
        series.forEach(function (s0, si) { s0.values.forEach(function (v, i) { var x = padL + gw * i + (gw - bw * series.length) / 2 + bw * si; svg += '<rect class="' + cls(si) + '" x="' + x.toFixed(1) + '" y="' + Y(v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (padT + ch - Y(v)).toFixed(1) + '" rx="2"/>'; }); });
      } else {
        series.forEach(function (s0, si) {
          var pts = s0.values.map(function (v, i) { return X(i).toFixed(1) + "," + Y(v).toFixed(1); });
          if (type === "area") svg += '<path class="' + cls(si) + ' area" d="M' + pts.join(" L") + " L" + X(s0.values.length - 1).toFixed(1) + "," + (padT + ch) + " L" + X(0) + "," + (padT + ch) + ' Z"/>';
          svg += '<polyline class="' + cls(si) + ' ln" points="' + pts.join(" ") + '"/>' + s0.values.map(function (v, i) { return '<circle class="' + cls(si) + ' dot" cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3.5"/>'; }).join("");
        });
      }
    }
    var legend = series.length > 1 || (series[0].name && type !== "pie" && type !== "donut") ? '<div class="wf-legend">' + series.map(function (s0, i) { return '<span><i class="' + cls(i) + '"></i>' + esc(s0.name || "계열 " + (i + 1)) + "</span>"; }).join("") + "</div>" : "";
    return '<div class="wf-chart wf-chart-' + type + '">' + (p.title ? '<div class="wf-ch"><b>' + esc(p.title) + "</b>" + (unit ? "<span>단위: " + esc(unit) + "</span>" : "") + "</div>" : "") + legend +
      '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(p.title || "차트") + '">' + svg + "</svg></div>";
  };
  C["notice-list"] = function (ds, p) {
    var tabs = p.tabs && p.tabs.length ? '<span class="wf-ntabs">' + p.tabs.map(function (t, i) { return '<span class="' + (i === 0 ? "on" : "") + '">' + esc(t) + "</span>"; }).join("") + "</span>" : "<b>" + esc(p.title || "공지사항") + "</b>";
    return '<div class="wf-notice"><div class="wf-nh">' + tabs + '<span>더보기 +</span></div><ul>' +
      (p.items || []).map(function (it) { return "<li><span>" + (it[2] ? '<i class="wf-ntag">[' + esc(it[2]) + "]</i> " : "") + esc(it[0]) + "</span><em>" + esc(it[1] || "") + "</em></li>"; }).join("") + "</ul></div>";
  };
  /** 업무 알림 한 줄: parts [[글, 강조(primary|danger|"")], …] 또는 text */
  C["notice-banner"] = function (ds, p) {
    var parts = p.parts || [[p.text || "새로 지정된 업무가 있습니다.", ""]];
    return '<div class="wf-nbanner">' + icon("megaphone", 20) + "<span>" + parts.map(function (x) { return x[1] ? '<b class="t-' + esc(x[1]) + '">' + esc(x[0]) + "</b>" : esc(x[0]); }).join("") + "</span></div>";
  };
  /** 달력: 일정이 있는 날에 점 표시 */
  C.calendar = function (ds, p) {
    var days = ["일", "월", "화", "수", "목", "금", "토"], marks = p.marks || [2, 3, 5, 6, 9, 12, 13, 16, 19, 20, 23, 24, 26, 27, 29], today = p.today || 13, first = p.first != null ? p.first : 0, last = p.days || 30;
    var cells = "";
    for (var i = 0; i < 35; i++) {
      var d = i - first + 1, out = d < 1 || d > last, dd = out ? (d < 1 ? 31 + d - 5 : d - last) : d;
      cells += '<span class="' + (out ? "out" : "") + (i % 7 === 0 ? " sun" : i % 7 === 6 ? " sat" : "") + (!out && d === today ? " today" : "") + '"><em>' + dd + "</em>" + (!out && marks.indexOf(d) >= 0 ? "<i></i>" : "") + "</span>";
    }
    return '<div class="wf-cal"><div class="wf-calh"><span class="wf-caly">' + esc(p.year || "2026년") + ' ▾</span><b>' + esc(p.month || "11월") + ' ▾</b>' + icon("settings", 16) + '</div><div class="wf-calg">' +
      days.map(function (x, i) { return '<span class="wd' + (i === 0 ? " sun" : i === 6 ? " sat" : "") + '">' + x + "</span>"; }).join("") + cells + "</div></div>";
  };
  /** 자주 찾는 메뉴: 테두리 칩 묶음 */
  C["chip-links"] = function (ds, p) {
    return '<div class="wf-widget">' + widgetHead(p.title || "자주 찾는 메뉴", null, icon("settings", 16)) + '<div class="wf-chips">' + (p.items || ["신청 › 신고", "처리 현황", "자료 제출 › 보완", "증명서 발급"]).map(function (x) {
      return '<span class="wf-chip">' + esc(x).replace(/ › /g, ' <i>›</i> ') + "</span>";
    }).join("") + "</div></div>";
  };
  C["empty-state"] = function (ds, p) { return '<div class="wf-empty">' + icon("info", 22) + "<span>" + esc(p.message || "조회된 내용이 없습니다.") + "</span></div>"; };
  C["hero-banner"] = function (ds, p) {
    return '<div class="wf-hero"><b>' + esc(p.title || "") + "</b><span>" + esc(p.text || "") + "</span>" +
      (ds.layout.search === "hero" ? C["search-bar"](ds, { placeholder: p.placeholder || "찾고 싶은 정보를 검색하세요", variant: "hero" }) : "") + "</div>";
  };
  C["quick-links"] = function (ds, p) {
    var icons = ["file", "edit", "search", "bell", "user", "download"];
    return '<div class="wf-quick">' + (p.items || []).map(function (it, i) { return '<div class="wf-ql">' + icon(icons[i % icons.length], 22) + "<span>" + esc(it) + "</span></div>"; }).join("") + "</div>";
  };
  C["login-form"] = function (ds, p, ctx) {
    var form = '<b class="wf-lt">' + esc(p.title || "로그인") + "</b>" +
      field("아이디", "아이디를 입력해 주세요.") + field("비밀번호", "비밀번호를 입력해 주세요.") +
      btn("로그인", "primary block lg") + (p.split ? btn("회원가입", "secondary block lg") + '<div class="wf-links"><u>회원정보 찾기</u></div>' : btn("간편인증 로그인", "secondary block") + '<div class="wf-links"><span>아이디 찾기</span><span>비밀번호 찾기</span><span>회원가입</span></div>');
    if (!p.split) return '<div class="wf-login">' + form + "</div>";
    var c = ctx || {};
    return '<div class="wf-lsplit"><div class="wf-lbrand">' + logo(c, true) + '<div class="wf-lart">' + icon("shield", 72) + icon("layers", 44) + "</div><p>" + esc(p.slogan || "안전하고 신뢰받는 공공 서비스의 시작") + "<br>" + esc((c.projectName || c.systemName || "") + "에 오신 것을 환영합니다.") + '</p></div><div class="wf-login in">' + form + "</div></div>";
  };
  function field(label, ph, req, inner) {
    return '<label class="wf-field"><span class="wf-lbl">' + esc(label) + (req ? ' <i class="wf-req">*</i>' : "") + "</span>" + (inner || '<span class="wf-input"><em>' + esc(ph || "") + "</em></span>") + "</label>";
  }
  C["text-input"] = function (ds, p, ctx, link, spec) {
    var msg = spec && spec.validation && spec.validation.messages && spec.validation.messages[0];
    return '<label class="wf-field"><span class="wf-lbl">' + esc(p.label) + (p.required ? ' <i class="wf-req">*</i>' : "") + "</span>" +
      '<input class="wf-input real" type="text" placeholder="' + esc(p.placeholder || "") + '"' + (p.required ? ' data-required="1" data-msg="' + esc(msg ? msg.text : p.label + "을(를) 입력해 주세요.") + '"' : "") + ' aria-label="' + esc(p.label) + '"><span class="wf-err" hidden></span></label>';
  };
  C.textarea = function (ds, p, ctx, link, spec) {
    var msg = spec && spec.validation && spec.validation.messages && spec.validation.messages[0];
    return '<label class="wf-field"><span class="wf-lbl">' + esc(p.label) + (p.required ? ' <i class="wf-req">*</i>' : "") + "</span>" +
      '<textarea class="wf-input real area" placeholder="' + esc(p.placeholder || "") + '"' + (p.required ? ' data-required="1" data-msg="' + esc(msg ? msg.text : p.label + "을(를) 입력해 주세요.") + '"' : "") + ' aria-label="' + esc(p.label) + '"></textarea><span class="wf-count">0 / 2,000</span><span class="wf-err" hidden></span></label>';
  };
  C.select = function (ds, p) { return field(p.label, "", p.required, '<span class="wf-input sel"><em>' + esc(p.value || (p.options || ["선택하세요"])[0]) + "</em>▾</span>"); };
  C["radio-group"] = function (ds, p) {
    return field(p.label, "", p.required, '<div class="wf-opts">' + (p.options || []).map(function (o) {
      return '<span class="wf-opt"><i class="wf-radio' + (o === p.value ? " on" : "") + '"></i>' + esc(o) + "</span>";
    }).join("") + "</div>");
  };
  C["checkbox-group"] = function (ds, p) {
    return field(p.label, "", p.required, '<div class="wf-opts">' + (p.options || []).map(function (o) {
      var on = (p.values || []).indexOf(o) >= 0;
      return '<span class="wf-opt"><i class="wf-check' + (on ? " on" : "") + '">' + (on ? icon("check", 11) : "") + "</i>" + esc(o) + "</span>";
    }).join("") + "</div>");
  };
  C["date-range"] = function (ds, p) {
    return field(p.label || "기간", "", p.required, '<div class="wf-row"><span class="wf-input"><em>2026-09-01</em>' + icon("calendar", 14) + '</span><span class="wf-tilde">~</span><span class="wf-input"><em>2026-09-25</em>' + icon("calendar", 14) + "</span></div>");
  };
  C["file-upload"] = function (ds, p) {
    return field(p.label || "첨부파일", "", p.required, '<div class="wf-upload">' + icon("upload", 20) + "<span>파일을 끌어 놓거나 <u>파일 선택</u></span><em>" + esc(p.hint || "") + "</em></div>");
  };
  C.button = function (ds, p, ctx, link) { return btn(p.label || "버튼", p.variant || "primary", linkAttr(ctx, link)); };
  C["button-group"] = function (ds, p, ctx, link) {
    return '<div class="wf-btns">' + (p.buttons || []).map(function (b) {
      var a = (b.action ? ' data-action="' + esc(b.action) + '"' : "") + (b.confirm ? ' data-confirm="' + esc(b.confirm) + '"' : "") + (b.message ? ' data-message="' + esc(b.message) + '"' : "");
      var l = b.action === "toast" ? "" : linkAttr(ctx, b.link || link);
      return btn(b.label, b.variant, a + l);
    }).join("") + "</div>";
  };
  C["step-indicator"] = function (ds, p) {
    return '<ol class="wf-steps">' + (p.steps || []).map(function (s, i) {
      return '<li class="' + (i < p.current ? "done" : i === p.current ? "on" : "") + '"><i>' + (i + 1) + "</i><span>" + esc(s) + "</span></li>";
    }).join("") + "</ol>";
  };
  C.tabs = function (ds, p) {
    return '<div class="wf-tabs ' + (p.style || ds.layout.tabs || "line") + '">' + (p.items || []).map(function (t, i) { return '<span class="' + (i === (p.active || 0) ? "on" : "") + '">' + esc(t) + "</span>"; }).join("") + "</div>";
  };
  C.breadcrumb = function (ds, p) { return '<div class="wf-bc" data-cmp="breadcrumb">' + icon("home", 13) + (p.items || []).map(function (x) { return "<span>›</span><span>" + esc(x) + "</span>"; }).join("") + "</div>"; };
  C["confirm-dialog"] = function (ds, p) {
    return '<div class="wf-dialog"><b>' + esc(p.title || "확인") + "</b><p>" + esc(p.message || "처리하시겠습니까?") + '</p><div class="wf-btns end">' + btn(p.cancel || "취소", "secondary", ' data-close="1"') + btn(p.confirm || "확인", "primary", ' data-ok="1"') + "</div></div>";
  };
  C["alert-dialog"] = function (ds, p) {
    return '<div class="wf-dialog"><span class="wf-dic ' + (p.tone || "info") + '">' + icon(p.tone === "danger" ? "alert" : "info", 22) + "</span><b>" + esc(p.title || "알림") + "</b><p>" + esc(p.message || "") + '</p><div class="wf-btns end">' + btn("확인", "primary", ' data-close="1"') + "</div></div>";
  };
  C.toast = function (ds, p) { return '<div class="wf-toast ' + (p.tone || "success") + '">' + icon(p.tone === "danger" ? "alert" : "check", 16) + "<span>" + esc(p.message || "저장했습니다.") + "</span></div>"; };
  C.modal = function (ds, p) {
    return '<div class="wf-modal"><div class="wf-mh"><b>' + esc(p.title || "팝업") + "</b>" + icon("close") + '</div><div class="wf-mb">' + (p.body || "") + "</div>" +
      (p.footer === false ? "" : '<div class="wf-btns end">' + btn("닫기", "secondary", ' data-close="1"') + btn(p.ok || "확인", "primary", ' data-close="1"') + "</div>") + "</div>";
  };
  C.gnb = function (ds, p, ctx) { return header(ds, ctx || {}); };
  C.lnb = function (ds, p, ctx) {
    var items = (ctx && ctx.menus) || ["하위 메뉴 1", "하위 메뉴 2", "하위 메뉴 3"];
    return '<nav class="wf-lnb" data-cmp="lnb">' + items.map(function (m, i) { return '<span class="' + (i === 0 ? "on" : "") + '">' + esc(m) + "</span>"; }).join("") + "</nav>";
  };
  C.footer = function (ds, p, ctx) { return footer(ds, ctx || {}); };

  /** 디자인 시스템에 추가된 컴포넌트: 기본 렌더러가 없으면 이름과 항목으로 그린다 */
  function generic(ds, id, p) {
    var comp = (ds && ds.components || []).find(function (c) { return c.id === id; });
    var name = comp ? comp.name : id;
    var items = p.items || [];
    return '<div class="wf-generic"><div class="wf-gh"><b>' + esc(name) + "</b><code>" + esc(id) + "</code></div>" +
      (items.length ? '<ol class="wf-tl">' + items.map(function (it) {
        var a = Array.isArray(it) ? it : [it];
        return "<li><i></i><div><span class=\"wf-meta\">" + esc(a[0]) + (a[1] ? " · " + esc(a[1]) : "") + "</span>" + (a[2] ? badge(a[2]) : "") + (a[3] ? "<p>" + esc(a[3]) + "</p>" : "") + "</div></li>";
      }).join("") + "</ol>" : '<p class="wf-meta">' + esc(comp ? comp.description : "") + "</p>") + "</div>";
  }

  /** 컴포넌트 하나. data-cmp로 감싸 댓글 핀·번호 라벨이 어떤 컴포넌트인지 알 수 있게 한다 */
  function component(ds, id, props, ctx, link, spec) {
    // 이 화면에서만 고친 모양(항목 프레임)이 있으면 그 모양 그대로
    if (ds && spec && spec.ui && spec.ui.tree && window.Frames) {
      return '<div class="wf-c wf-frc" data-cmp="' + esc(id) + '" data-own="1"' + (link ? ' data-link="' + esc(link) + '"' : "") + ">" + window.Frames.html(spec.ui.tree, { ds: ds, props: Object.assign({}, props || {}), comps: ds.components }) + "</div>";
    }
    // 프레임 편집기로 그린 모양이 있으면 그 모양으로 (props는 텍스트 bind에 들어간다)
    var fc = (ds && ds.components || []).find(function (c) { return c.id === id && c.tree; });
    if (fc && window.Frames) {
      var p2 = Object.assign({}, props || {});
      if (spec && spec.label) { if (p2.label == null) p2.label = spec.label; if (p2.title == null) p2.title = spec.label; }
      if (spec && spec.customer && p2.text == null) p2.text = spec.customer;
      return '<div class="wf-c wf-frc" data-cmp="' + esc(id) + '"' + (link ? ' data-link="' + esc(link) + '"' : "") + ">" + window.Frames.html(window.Frames.treeOf(fc, p2.variant) || fc.tree, { ds: ds, props: p2, comps: ds.components }) + "</div>";
    }
    var fn = C[id];
    var html = fn && id !== "gnb" && id !== "footer" && id !== "breadcrumb" ? fn(ds, props || {}, ctx || {}, link, spec) : fn ? fn(ds, props || {}, ctx || {}) : generic(ds, id, props || {});
    if (id === "gnb" || id === "footer" || id === "breadcrumb") return html;
    return '<div class="wf-c" data-cmp="' + esc(id) + '">' + html + "</div>";
  }

  // ── 프레임 ───────────────────────────────────
  /** 정부 상징형 원 (공공 프로젝트) */
  var EMBLEM = '<svg class="wf-emb" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#fff"/><path d="M1 16a15 15 0 0 1 30 0z" fill="#CD2E3A"/><path d="M1 16a15 15 0 0 0 30 0z" fill="#0047A0"/><circle cx="8.5" cy="16" r="7.5" fill="#CD2E3A"/><circle cx="23.5" cy="16" r="7.5" fill="#0047A0"/></svg>';
  /** 로고: 공공이면 상징 + 두 줄(사업명 · 시스템명), 아니면 색 상자 + 시스템명 */
  function logo(ctx, inv) {
    var two = ctx.projectName && ctx.projectName !== ctx.systemName;
    var mark = ctx.gov ? EMBLEM : "<i></i>";
    return '<span class="wf-logo' + (two ? " two" : "") + (inv ? " inv" : "") + '">' + mark + (two ? '<span><small>' + esc(ctx.projectName) + "</small><b>" + esc(ctx.systemName || "서비스명") + "</b></span>" : "<b>" + esc(ctx.systemName || "서비스명") + "</b>") + "</span>";
  }
  function isSideNav(nav) { return nav === "side" || nav === "side-header" || nav === "header-side" || nav === "rail"; }
  function menuItems(ctx, opts) {
    var menus = ctx.menus || [];
    return menus.map(function (m, i) {
      return '<span class="' + (i === (ctx.activeMenu || 0) ? "on" : "") + '" title="' + esc(m) + '">' + icon(menuIcon(m, i), opts.rail ? 20 : 17) + (opts.rail ? "" : "<em>" + esc(m) + "</em>" + (opts.chev ? icon("chevron-right", 14) : "")) + "</span>";
    }).join("");
  }
  function userName(ctx) { return ctx.userName || "홍길동"; }
  function orgName(ctx) { return ctx.orgName || (ctx.profile === "admin" ? "운영기관" : "(주)사업장명"); }
  /** 남은 시간 + 로그인 연장 */
  function session(cls) { return '<span class="wf-timer ' + (cls || "") + '"><b>60:00</b><u>로그인 연장</u></span>'; }
  function avatar() { return '<i class="wf-avatar">' + icon("user", 18) + "</i>"; }
  /** 모바일 머리: 로고 + 검색·메뉴 아이콘 한 줄, 그 아래 현재 메뉴 가로 스크롤 탭 */
  function mobileHeader(ds, ctx) {
    var menus = ctx.menus || [];
    return '<header class="wf-header wf-mhead" data-cmp="gnb"><div class="wf-hbar"><div class="wf-container">' + icon("menu", 20) + logo(ctx) + '<span class="wf-utl">' + icon("search", 18) + icon("user", 18) + "</span></div></div>" +
      (menus.length ? '<nav class="wf-mtabs">' + menus.map(function (m, i) { return '<span class="' + (i === (ctx.activeMenu || 0) ? "on" : "") + '">' + esc(m) + "</span>"; }).join("") + "</nav>" : "") + "</header>";
  }
  function header(ds, ctx) {
    var L = ds.layout, menus = ctx.menus || [];
    if (ctx.view === "mobile") return mobileHeader(ds, ctx);
    var menuHtml = '<nav class="wf-menu">' + menus.map(function (m, i) { return '<span class="' + (i === (ctx.activeMenu || 0) ? "on" : "") + '">' + esc(m) + "</span>"; }).join("") + "</nav>";
    var util = ctx.profile === "admin" ? '<span class="wf-utl">' + icon("bell") + icon("user") + "<em>" + esc(ctx.userName || "심사자 정○○") + "</em></span>" :
      '<span class="wf-utl"><em>로그인</em><em>회원가입</em>' + icon("menu") + "</span>";
    var search = L.search === "header" ? '<span class="wf-hsearch">' + icon("search", 15) + "<em>검색어 입력</em></span>" : "";
    var top = ctx.profile === "admin" ? "" : '<div class="wf-utilbar"><div class="wf-container"><span>이 누리집은 대한민국 공식 전자정부 누리집입니다.</span></div></div>';
    var bar = L.logo === "center" ?
      '<div class="wf-hbar center"><div class="wf-container"><span></span>' + logo(ctx) + util + '</div></div><div class="wf-menubar"><div class="wf-container">' + menuHtml + search + "</div></div>" :
      '<div class="wf-hbar"><div class="wf-container">' + logo(ctx) + menuHtml + search + util + "</div></div>";
    var mega = L.nav === "top-mega" ? '<div class="wf-mega"><div class="wf-container">' + menus.slice(0, 4).map(function (m) {
      return "<div><b>" + esc(m) + "</b><span>목록</span><span>안내</span><span>자주 묻는 질문</span></div>";
    }).join("") + "</div></div>" : "";
    return '<header class="wf-header" data-cmp="gnb">' + (ctx.profile === "admin" ? "" : top) + bar + (ctx.showMega ? mega : "") + "</header>";
  }
  function footer(ds, ctx) {
    if (ds.layout.footer === "none") return "";
    if (ctx.inside) return '<footer class="wf-footer inside" data-cmp="footer"><span>Copyright © 2026 ' + esc(ctx.projectName || ctx.systemName || "") + '. All rights reserved.</span><span class="wf-flinks"><b>개인정보처리방침</b><span>이용약관</span><span class="wf-input sel sm"><em>관련기관 바로가기</em>' + icon("chevron-right", 12).replace('class="wf-ic"', 'class="wf-ic dn"') + '</span><i class="wf-go">GO</i></span></footer>';
    if (ds.layout.footer === "simple" || ctx.view === "mobile") return '<footer class="wf-footer simple" data-cmp="footer"><div class="wf-container"><span>' + esc(ctx.systemName || "") + "</span><span>개인정보처리방침 · 이용약관 · © 2026</span></div></footer>";
    return '<footer class="wf-footer" data-cmp="footer"><div class="wf-container">' + logo(ctx) + '<div><span>개인정보처리방침 · 저작권정책 · 웹 접근성 정책</span><span>(04500) 서울특별시 ○○구 ○○로 00 · 대표전화 000-0000</span><span>© 2026 ○○기관. All rights reserved.</span></div></div></footer>';
  }
  /** 업무형 좌측 메뉴 셸 (side · side-header · rail) */
  function sideShell(ds, ctx, inner) {
    var nav = ds.layout.nav, rail = nav === "rail";
    var side = '<aside class="wf-side' + (rail ? " rail" : "") + '" data-cmp="gnb"><div class="wf-sidehead">' + (rail ? (ctx.gov ? EMBLEM : '<span class="wf-logo"><i></i></span>') : logo(ctx) + icon("panel", 18)) + "</div>" +
      '<nav class="wf-snav">' + menuItems(ctx, { rail: rail, chev: true }) + "</nav>" +
      (nav === "side" ? '<div class="wf-sideuser">' + avatar() + "<div><small>" + esc(orgName(ctx)) + "</small><b>" + esc(userName(ctx)) + ' 님</b></div><div class="wf-sess"><span>60:00</span><u>로그인 연장</u></div></div>' : "") + "</aside>";
    var top = nav === "side" ? "" : '<div class="wf-topbar" data-cmp="gnb"><span class="wf-hello">[' + esc(orgName(ctx)) + '] <b>' + esc(userName(ctx)) + "</b>님 반갑습니다.</span>" +
      '<span class="wf-utl">' + session("pill") + '<span class="wf-tuser"><span><small>' + esc(orgName(ctx)) + "</small><b>" + esc(userName(ctx)) + " 님</b></span>" + avatar() + "</span></span></div>";
    return '<div class="wf-sshell ' + nav + '">' + side + '<div class="wf-sbody">' + top + '<main class="wf-main">' + inner + "</main>" + (ds.layout.footer === "none" ? "" : footer(ds, Object.assign({}, ctx, { inside: true }))) + "</div></div>";
  }
  /** 전체 폭 헤더 + 그 아래 좌측 메뉴 (민원 포털형) */
  function headerSideShell(ds, ctx, inner) {
    var head = '<header class="wf-gheader" data-cmp="gnb"><div class="wf-ghin">' + logo(ctx) + '<span class="wf-gutil"><em>이전접속 IP 000.000.000.00</em><em>이전접속시간 2026-02-03 13:00:00</em>' + session("box") +
      '<span class="wf-gbtn">마이페이지 ' + icon("chevron-right", 12) + "</span>" + (ctx.profile === "admin" ? "" : '<span class="wf-gbtn">사업자 전환 ' + icon("refresh", 13) + "</span>") +
      '<span class="wf-guser">' + icon("user", 16) + esc(userName(ctx) + (ctx.profile === "admin" ? " 님" : "님" + orgName(ctx))) + "</span></span></div></header>";
    var side = '<aside class="wf-side hs" data-cmp="lnb"><span class="wf-fold">' + icon("panel", 15) + '</span><nav class="wf-snav">' + menuItems(ctx, {}) + "</nav></aside>";
    return head + '<div class="wf-sshell header-side">' + side + '<div class="wf-sbody"><main class="wf-main">' + inner + "</main>" + (ds.layout.footer === "none" ? "" : footer(ds, Object.assign({}, ctx, { inside: true }))) + "</div></div>";
  }

  /** 화면 한 장: 틀(GNB/사이드) + 제목 + 블록들 */
  function page(ds, ctx, blocksHtml) {
    var nav = ds.layout.nav, side = isSideNav(nav) && ctx.view !== "mobile";
    var acts = ctx.titleActions ? '<div class="wf-tacts">' + ctx.titleActions + "</div>" : "";
    var bc = C.breadcrumb(ds, { items: ctx.crumbs || [] });
    var title = ctx.title ? '<div class="wf-ptitle' + (side ? " thin" : "") + '"><h1>' + (ctx.back ? icon("chevron-left", 18) : "") + esc(ctx.title) + "</h1>" + (acts && side ? acts + bc : bc + acts) + "</div>" : "";
    var body = title + '<div class="wf-blocks">' + blocksHtml + "</div>";
    var frame;
    if (ctx.bare) frame = '<div class="wf-bare">' + blocksHtml + "</div>";
    else if (side && nav === "header-side") frame = headerSideShell(ds, ctx, body);
    else if (side) frame = sideShell(ds, ctx, body);
    else frame = header(ds, ctx) + '<main class="wf-main"><div class="wf-container">' + body + "</div></main>" + footer(ds, ctx);
    var L = ds.layout, viewCls = ctx.view === "mobile" ? " wf-m" : ctx.view === "tablet" ? " wf-t" : "";
    var mods = " wf-th-" + (L.tableHead || "line") + " wf-stat-" + (L.stat || "plain") + " wf-mark-" + (L.navMark || "fill") + " wf-srch-" + (L.searchStyle || "card");
    return '<div class="wf wf-nav-' + nav + " wf-" + L.density + mods + viewCls + (scopeCls(ds) ? " " + useCss(ds) : "") + '" style="' + vars(ds) + '">' + frame + (ctx.overlay ? '<div class="wf-overlay">' + ctx.overlay + "</div>" : "") + "</div>";
  }

  /** 입력 항목: 이어서 나오면 실제 신청 화면처럼 왼쪽 항목명 · 오른쪽 입력칸 표(폼 테이블)로 묶는다 */
  var FIELD = { "text-input": 1, textarea: 1, select: 1, "radio-group": 1, "checkbox-group": 1, "date-range": 1, "file-upload": 1 };
  function isField(c) { return c.ui && !c.ui.tree && FIELD[c.ui.component] && !(c.ui.props && c.ui.props.stacked); }
  function blocks(ds, comps, ctx) {
    var out = [], run = [];
    var flush = function () {
      if (!run.length) return;
      if (run.length === 1 && ds.layout.form === "stacked") { out.push(blockList(ds, run, ctx)); run = []; return; }
      out.push('<div class="wf-form">' + run.map(function (c) {
        var p = c.ui.props || {}, req = p.required || (c.validation && c.validation.required);
        var no = ctx.markers ? ' data-no="' + c.no + '"' : "";
        return '<div class="wf-fr"' + no + ">" + (ctx.markers === true ? '<span class="wf-mk">' + c.no + "</span>" : "") + '<div class="wf-fth">' + esc(p.label || c.label) + (req ? ' <i class="wf-req">*</i>' : "") + '</div><div class="wf-ftd">' + component(ds, c.ui.component, p, ctx, c.ui.link, c) + "</div></div>";
      }).join("") + "</div>");
      run = [];
    };
    comps.forEach(function (c) { if (isField(c)) run.push(c); else { flush(); out.push(blockList(ds, [c], ctx)); } });
    flush();
    return out.join("");
  }
  function blockList(ds, comps, ctx) {
    return comps.map(function (c) {
      // markers: true → 번호 배지, "pos" → 배지 없이 위치만 표시(data-no, 화면설계서 캔버스가 배지를 따로 올림)
      var no = ctx.markers ? ' data-no="' + c.no + '"' : "";
      if (!c.ui) return '<div class="wf-blk text"' + no + ">" + (ctx.markers === "pos" ? "" : '<span class="wf-mk">' + c.no + "</span>") + '<div class="wf-generic"><div class="wf-gh"><b>' + esc(c.label) + "</b><code>와이어프레임 미작성</code></div><p class=\"wf-meta\">" + esc(c.customer || c.planner || "") + "</p></div></div>";
      return '<div class="wf-blk"' + no + ">" + (ctx.markers === true ? '<span class="wf-mk">' + c.no + "</span>" : "") + component(ds, c.ui.component, c.ui.props, ctx, c.ui.link, c) + "</div>";
    }).join("");
  }

  /** 스토리보드 화면 렌더링. ctx: {systemName, profile, menus, crumbs, markers, parent (팝업일 때 부모 화면)} */
  /** 제목 줄 오른쪽에 둘 버튼 묶음 (props.placement: "title") — 실제 화면처럼 [삭제][저장]을 제목 옆에 */
  function isTitleAct(c) { return c.ui && c.ui.component === "button-group" && c.ui.props && c.ui.props.placement === "title"; }
  /** 채널(뷰포트) 규격: 화면설계서·내보내기·프로토타입이 같은 값을 쓴다 */
  var VIEWS = { pc: { id: "pc", label: "PC", w: 1920, h: 1080, ch: ["WEB", "PC_WEB", "PC"] }, tablet: { id: "tablet", label: "태블릿", w: 1024, h: 1366, ch: ["TABLET"] }, mobile: { id: "mobile", label: "모바일", w: 390, h: 844, ch: ["MOBILE", "MOBILE_WEB", "APP", "MOBILE_APP"] } };
  function screen(ds, sb, ctx) {
    var tops = ctx.popup ? [] : sb.components.filter(isTitleAct);
    if (tops.length) {
      var rest = sb.components.filter(function (c) { return !isTitleAct(c); });
      var ta = blocks(ds, tops, ctx).replace(/class="wf-blk"/g, 'class="wf-blk inline"');
      return page(ds, Object.assign({}, ctx, { title: sb.title, titleActions: ta }), blocks(ds, rest, ctx));
    }
    var c = Object.assign({}, ctx, { title: sb.title });
    if (ctx.popup) {
      var inner = '<div class="wf-blocks">' + blocks(ds, sb.components, ctx) + "</div>";
      var modal = C.modal(ds, { title: sb.title, body: inner, footer: false });
      var under = ctx.parent ? blocks(ds, ctx.parent.components, { markers: false }) : "";
      return page(ds, Object.assign({}, ctx, { title: ctx.parent ? ctx.parent.title : "", overlay: modal }), under);
    }
    return page(ds, c, blocks(ds, sb.components, ctx));
  }

  // ── 컨셉 비교·디자인 시스템 페이지용 표준 화면 ───────
  function template(ds, type, ctx) {
    var prof = ctx.profile || "portal";
    var s = SAMPLE[prof];
    var c = Object.assign({ menus: s.menus, crumbs: [s.menus[0]] }, ctx);
    var side = isSideNav(ds.layout.nav) && ctx.view !== "mobile", biz = ds.layout.searchStyle === "table";
    var cols, listRows;
    if (prof === "admin") {
      cols = ["구분", "접수일자", "접수번호", "신청인", "신청 건명", "담당자", "처리기한", "진행상태"];
      listRows = [["신규", "2026-11-21", "R2611-00027", "(주)한빛산업", "공장 증설에 따른 변경 신청", "홍길동", "2026-11-28", "심사중"], ["변경", "2026-11-21", "R2611-00026", "(주)미래소재", "대표자 변경 신고", "김철수", "2026-11-27", "보완요청"], ["신규", "2026-11-20", "R2611-00025", "푸른환경(주)", "신규 등록 신청", "홍길동", "2026-11-27", "접수"], ["연장", "2026-11-20", "R2611-00024", "(주)대한케미칼", "자료 보호 기간 연장", "이영희", "2026-11-26", "승인"], ["변경", "2026-11-19", "R2611-00023", "(주)세진", "사업장 주소 변경", "김철수", "2026-11-26", "반려"]];
    } else if (prof === "service") {
      cols = ["제출구분", "등록구분", "접수번호", "접수일자", "신청 건명", "상태", "제출일자"];
      listRows = [["신규", "일반등록", "B1806-002182", "2026-10-25", "신규 등록 신청서", "작성중", "2026-10-25"], ["기존", "-", "-", "2026-10-25", "변경 등록 신청서", "보완요청", "2026-10-25"], ["개별제출", "일반등록", "B1806-002180", "2026-10-24", "자료 제출 확인 신청", "심사중", "-"], ["후발", "일반등록", "-", "-", "후발 등록 신청서", "승인", "2026-10-22"], ["신규", "간이등록", "B1806-002176", "2026-10-21", "간이 등록 신청서", "접수", "2026-10-21"]];
    } else {
      cols = ["번호", "제목", "기관", "공개일", "구분"];
      listRows = [["128", "2026년 하반기 도로 정비 계획", "도로과", "2026-09-24", "공개"], ["127", "공공 체육시설 이용 현황", "체육진흥과", "2026-09-22", "공개"], ["126", "민원 처리 결과 통계", "민원봉사과", "2026-09-19", "부분공개"], ["125", "어린이 보호구역 지정 현황", "교통행정과", "2026-09-17", "공개"], ["124", "공영주차장 요금 체계 안내", "주차관리과", "2026-09-15", "공개"]];
    }
    var bcol = cols.length - (prof === "service" ? 2 : 1);
    var fields = biz ? [{ label: "날짜", type: "date-range", basis: prof === "admin" ? "접수일자" : "작성일자" }, { label: "신청 건명" }, { label: "접수번호" }, { label: "상태", type: "select" }, { label: prof === "admin" ? "담당자" : "구분", type: "select" }, { label: "신청인" }] :
      [{ label: "기간", type: "date-range" }, { label: "상태", type: "select", options: ["전체"] }, { label: "검색어", type: "text", placeholder: "제목" }];
    var tabs = side && prof !== "portal" ? component(ds, "tabs", { items: ["전체", "접수", "보완요청", "처리현황", "승인현황"], active: 0 }) : "";
    var list = tabs + component(ds, "search-panel", { fields: fields }) +
      component(ds, "data-table", { total: 124, columns: cols, rows: listRows, badgeColumn: bcol, action: prof === "service" ? "신규 작성" : prof === "admin" ? "일괄 배정" : null }) + component(ds, "pagination", { total: 124 });
    var wrap = function (h) { return '<div class="wf-blk">' + h + "</div>"; };
    var listTitle = prof === "service" ? "등록 신청 및 진행현황" : s.title;
    var listPage = function (extra) { return page(ds, Object.assign({}, c, { title: listTitle, crumbs: [(c.menus || [])[0] || "업무", listTitle] }, extra || {}), wrap(list)); };
    var notices = [["시스템 정기 점검 안내 (11/28 22:00~24:00)", "2026-11-21", "공지"], ["신청서 작성 매뉴얼 개정 배포", "2026-11-20", "자료"], ["보완 요청 처리 절차 변경 안내", "2026-11-19", "공지"], ["연말 처리 기한 조정 안내", "2026-11-18", "공지"], ["자주 묻는 질문 업데이트", "2026-11-15", "자료"]];
    switch (type) {
      case "login":
        if (ctx.view === "mobile") return page(ds, Object.assign({}, c, { title: "로그인", crumbs: ["로그인"] }), wrap(component(ds, "login-form", { title: "로그인" }, c)));
        return page(ds, Object.assign({}, c, { bare: side || prof === "admin", title: side || prof === "admin" ? "" : "로그인", crumbs: ["로그인"] }), wrap(component(ds, "login-form", { title: "로그인", split: true }, c)));
      case "dashboard":
        if (prof === "admin") {
          var banner = component(ds, "notice-banner", { parts: [["2026년 11월 20일 목요일, 담당자님에게 ", ""], ["새롭게 지정된 민원은 5건", "primary"], [" / ", ""], ["처리 중인 민원은 14건", "danger"], ["이 있습니다.", ""]] });
          var welcome = ds.layout.nav === "side" || !side ? '<div class="wf-welcome"><span>[' + esc(orgName(c)) + "] <b>" + esc(userName(c)) + "</b>님 반갑습니다.</span>" + banner + "</div>" : banner;
          var stats = component(ds, "stat-cards", { title: "신규 접수 현황", count: 5, unit: "건", columns: 5, items: [["신규 신청", "456"], ["변경 신청", "35"], ["보완 제출", "22"], ["이의 신청", "123"], ["재신청", "8"], ["변경 신고", "123"], ["변경 등록", "8"], ["승계", "35"], ["선임·해임", "456"], ["연장·해지", "22"]] });
          return page(ds, Object.assign({}, c, { title: "", crumbs: ["대시보드"] }),
            wrap(welcome) + '<div class="wf-dgrid">' + wrap(stats) + wrap('<div class="wf-widget cal">' + component(ds, "calendar", {}) + "</div>") + "</div>" +
            '<div class="wf-dgrid b">' + wrap(component(ds, "data-table", { title: "처리 중인 민원 목록", total: 14, columns: cols, rows: listRows, badgeColumn: bcol, view: "table" })) + wrap(component(ds, "chip-links", { items: ["신청 및 등록 › 신고", "개별제출 확인", "신청 및 등록 › 변경신고", "민원관리 › 자료보호연장", "처리 현황", "통계 › 월별 처리"] })) + "</div>" +
            '<div class="wf-dgrid b">' + wrap(component(ds, "data-table", { title: "최근 완료한 민원", total: 5, period: "조회기간 : 2026-11-15 ~ 2026-11-21", columns: ["구분", "접수번호", "신청인", "신청 건명", "완료일자"], rows: listRows.map(function (r) { return [r[0], r[2], r[3], r[4], "2026-11-21"]; }), view: "table" })) + wrap(component(ds, "notice-list", { tabs: ["공지사항", "자료실", "게시판"], items: notices })) + "</div>");
        }
        return page(ds, Object.assign({}, c, { title: "나의 민원", crumbs: ["나의 민원"] }),
          wrap(component(ds, "stat-cards", { items: [["작성중", "2", "건"], ["심사중", "3", "건"], ["보완요청", "1", "건"], ["처리완료", "24", "건"]] })) +
          '<div class="wf-2col">' + wrap(component(ds, "data-table", { title: "최근 신청 내역", total: 5, columns: cols.slice(2, 6), rows: listRows.map(function (r) { return r.slice(2, 6); }), badgeColumn: prof === "service" ? 3 : null, view: "table", more: true })) +
          wrap(component(ds, "notice-list", { title: "공지사항", items: notices.slice(0, 4) })) + "</div>");
      case "main":
        if (prof === "admin") return template(ds, "dashboard", ctx);
        return page(ds, Object.assign({}, c, { title: "", showMega: ds.layout.nav === "top-mega" }),
          wrap(component(ds, "hero-banner", { title: prof === "service" ? "필요한 민원을 한 곳에서 신청하세요" : "누구나 쉽게 찾아보는 공공 정보", text: "정보공개 · 민원신청 · 처리 현황 조회" })) +
          (ds.layout.search === "hero" ? "" : wrap(component(ds, "search-bar", { placeholder: "찾고 싶은 정보를 검색하세요" }))) +
          wrap(component(ds, "quick-links", { items: ["정보공개 청구", "자료 등록", "처리 현황", "알림 신청", "자주 묻는 질문", "서식 내려받기"] })) +
          '<div class="wf-2col">' + wrap(component(ds, "notice-list", { title: "공지사항", items: notices.slice(0, 3) })) +
          wrap(component(ds, "notice-list", { title: "최근 공개 자료", items: [["2026년 하반기 도로 정비 계획", "09-24"], ["공공 체육시설 이용 현황", "09-22"], ["민원 처리 결과 통계", "09-19"]] })) + "</div>");
      case "list":
        return listPage();
      case "detail":
        return page(ds, Object.assign({}, c, { title: "상세 정보" }),
          wrap(component(ds, "detail-table", { rows: [["제목", "2026년 하반기 도로 정비 계획"], ["기관", "도로과"], ["공개 구분", "전체공개"], ["공개일", "2026-09-24"]] })) +
          wrap(component(ds, "file-list", { files: ["도로정비계획_2026하반기.pdf (2.1MB)"] })) + wrap(component(ds, "button-group", { buttons: [{ label: "목록", variant: "secondary" }] })));
      case "form":
        return page(ds, Object.assign({}, c, { title: side ? listTitle + " - 신규작성" : "자료 등록", back: side, crumbs: [(c.menus || [])[0] || "업무", listTitle, "신규작성"] }),
          (prof !== "admin" ? wrap(component(ds, "step-indicator", { steps: side ? ["신규작성", "임시저장", "제출", "접수완료", "보완요청", "결과통지"] : ["자료 입력", "내용 확인", "신청 완료"], current: 0 })) : "") +
          wrap(component(ds, "text-input", { label: "제목", placeholder: "제목을 입력하세요", required: true })) +
          wrap(component(ds, "radio-group", { label: "공개 구분", options: ["전체공개", "부분공개"], value: "전체공개", required: true })) +
          wrap(component(ds, "select", { label: "분류", options: ["선택하세요"] })) +
          wrap(component(ds, "file-upload", { label: "첨부파일", hint: "PDF·HWP, 20MB 이하" })) +
          wrap(component(ds, "button-group", { buttons: [{ label: "취소", variant: "secondary" }, { label: "등록", variant: "primary" }] })));
      case "confirm":
        return listPage({ overlay: component(ds, "confirm-dialog", { title: "공개 신청", message: "입력한 내용으로 공개를 신청할까요? 신청 후에는 수정할 수 없습니다.", confirm: "신청", cancel: "취소" }) });
      case "alert":
        return listPage({ overlay: component(ds, "alert-dialog", { title: "필수 항목 확인", message: "제목을 입력해 주세요.", tone: "danger" }) });
      case "toast":
        return listPage({ toast: true }).replace(/<\/div>$/, '<div class="wf-toast-wrap">' + component(ds, "toast", { message: "공개 신청을 접수했습니다." }) + "</div></div>");
      case "modal":
        return listPage({ overlay: component(ds, "modal", { title: "승인·반려 처리", body: '<div class="wf-blocks">' + component(ds, "detail-table", { rows: [["신청번호", "2026-0934"], ["제목", "구청 청사 에너지 사용량"]] }) + component(ds, "radio-group", { label: "처리 결과", options: ["승인", "반려"], value: "승인", required: true }) + "</div>", ok: "처리" }) });
    }
    return "";
  }

  // ── 톤앤매너 단계의 추가 CSS: 시스템마다 루트 클래스(wfs-코드) 안에서만 적용 ──
  function scopeCls(ds) { return ds && ds.systemCode && ds.css ? "wfs-" + String(ds.systemCode).toLowerCase().replace(/[^a-z0-9_-]/g, "") : ""; }
  /** 선택자마다 범위 클래스를 앞에 붙인다. .wf(루트)·:root·html·body로 시작하면 루트 자신을 가리킨다 */
  function scopeCss(css, sel) {
    var src = String(css || "").replace(/\/\*[\s\S]*?\*\//g, ""), out = "", i = 0;
    function block(from) { var d = 0; for (var j = from; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) return j; } } return src.length; }
    function scopeSel(list) {
      var parts = [], cur = "", par = 0;
      for (var k = 0; k < list.length; k++) { var ch = list[k]; if (ch === "(") par++; if (ch === ")") par--; if (ch === "," && !par) { parts.push(cur); cur = ""; } else cur += ch; }
      parts.push(cur);
      return parts.map(function (x) {
        x = x.trim();
        if (!x) return "";
        var m = /^(:root|html|body|\.wf)(?![a-zA-Z0-9_-])/.exec(x);
        return m ? sel + ".wf" + x.slice(m[0].length) : sel + " " + x;
      }).filter(Boolean).join(", ");
    }
    while (i < src.length) {
      var open = src.indexOf("{", i);
      if (open < 0) break;
      var pre = src.slice(i, open).trim(), end = block(open), body = src.slice(open + 1, end);
      if (/^@(media|supports|container|layer)\b/i.test(pre)) out += pre + "{" + scopeCss(body, sel) + "}\n";
      else if (/^@/.test(pre)) out += pre + "{" + body + "}\n";
      else if (pre) out += scopeSel(pre) + "{" + body + "}\n";
      i = end + 1;
    }
    return out;
  }
  var cssDone = {};
  /** 이 디자인의 추가 CSS를 문서에 넣고 루트에 붙일 클래스를 돌려준다 */
  function useCss(ds) {
    var cls = scopeCls(ds);
    if (!cls || typeof document === "undefined") return cls;
    if (cssDone[cls] !== ds.css) {
      var el = document.getElementById(cls) || document.head.appendChild(Object.assign(document.createElement("style"), { id: cls }));
      el.textContent = scopeCss(ds.css, "." + cls);
      cssDone[cls] = ds.css;
    }
    return cls;
  }

  window.Wire = { screen: screen, template: template, component: component, icon: icon, iconLabel: ICON_LABEL, vars: vars, page: page, useCss: useCss, scopeCss: scopeCss, VIEWS: VIEWS };
})();
