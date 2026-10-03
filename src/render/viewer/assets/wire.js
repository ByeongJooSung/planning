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
    filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>'
  };
  var ICON_LABEL = {
    search: "검색", menu: "메뉴", user: "사용자", bell: "알림", home: "홈", download: "내려받기", upload: "올리기",
    calendar: "달력", "chevron-left": "이전", "chevron-right": "다음", close: "닫기", check: "확인", alert: "경고",
    info: "안내", file: "파일", logout: "로그아웃", plus: "추가", edit: "수정", trash: "삭제", filter: "필터"
  };
  function icon(name, size) {
    var s = size || 16;
    return '<svg class="wf-ic" data-ic="' + esc(ICON_PATHS[name] ? name : "info") + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON_PATHS[name] || ICON_PATHS.info) + "</svg>";
  }

  var SAMPLE = {
    portal: { menus: ["정보공개", "민원안내", "알림마당", "기관소개"], title: "정보공개 목록" },
    service: { menus: ["민원신청", "나의 민원", "정보공개", "고객센터"], title: "나의 신청 현황" },
    admin: { menus: ["대시보드", "정보공개 심사", "민원 관리", "통계", "시스템 관리"], title: "심사 목록" }
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
      "--w-pad": (compact ? t.spacing * 2 : t.spacing * 3) + "px", "--w-max": t.grid.maxWidth + "px", "--w-shadow": shadow
    };
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
  C["search-panel"] = function (ds, p) {
    var fields = (p.fields || []).map(function (f) {
      var ctl = f.type === "select" ? '<span class="wf-input sel"><em>' + esc((f.options || ["전체"])[0]) + "</em>▾</span>" :
        f.type === "date-range" ? '<span class="wf-input"><em>2025-09-25</em>' + icon("calendar", 14) + '</span><span class="wf-tilde">~</span><span class="wf-input"><em>2026-09-25</em>' + icon("calendar", 14) + "</span>" :
          '<span class="wf-input"><em>' + esc(f.placeholder || "") + "</em></span>";
      return '<label class="wf-sf' + (f.type === "date-range" ? " wide" : "") + '"><span>' + esc(f.label) + '</span><div class="wf-row">' + ctl + "</div></label>";
    }).join("");
    return '<div class="wf-spanel"><div class="wf-sgrid">' + fields + '</div><div class="wf-sbtns">' + btn("초기화", "secondary") + btn("조회", "primary") + "</div></div>";
  };
  C["data-table"] = function (ds, p, ctx, link) {
    var cols = p.columns || [], rows = p.rows || [], bc = p.badgeColumn;
    var head = '<div class="wf-thead"><span>총 <b>' + esc(p.total != null ? p.total : rows.length) + "</b>건</span>" +
      (ds.layout.pagination === "numbered-size" ? '<span class="wf-input sel sm"><em>30개씩</em>▾</span>' : "") + "</div>";
    // 항목마다 표/카드를 고를 수 있다 (props.view: "table" | "card"). 없으면 디자인 시스템 목록 형태
    var view = p.view === "table" || p.view === "list" ? "table" : p.view === "card" ? "card" : ds.layout.list;
    if (view === "card") {
      return head + '<div class="wf-cards">' + rows.map(function (r) {
        return '<div class="wf-card"' + linkAttr(ctx, link) + ">" + (bc != null ? badge(r[bc]) : "") + "<b>" + esc(r[1] != null ? r[1] : r[0]) + '</b><span class="wf-meta">' +
          r.filter(function (_, i) { return i !== 1 && i !== bc; }).map(esc).join(" · ") + "</span></div>";
      }).join("") + "</div>";
    }
    return head + '<table class="wf-table"><thead><tr>' + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) {
        return "<tr" + linkAttr(ctx, link) + ">" + r.map(function (v, i) { return "<td>" + (i === bc ? badge(v) : i === 1 && link ? "<u>" + esc(v) + "</u>" : esc(v)) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
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
    return '<div class="wf-stats">' + (p.items || []).map(function (s) { return '<div class="wf-stat"><span>' + esc(s[0]) + "</span><b>" + esc(s[1]) + "</b></div>"; }).join("") + "</div>";
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
    return '<div class="wf-notice"><div class="wf-nh"><b>' + esc(p.title || "공지사항") + '</b><span>더보기 +</span></div><ul>' +
      (p.items || []).map(function (it) { return "<li><span>" + esc(it[0]) + "</span><em>" + esc(it[1] || "") + "</em></li>"; }).join("") + "</ul></div>";
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
  C["login-form"] = function (ds, p) {
    return '<div class="wf-login"><b class="wf-lt">' + esc(p.title || "로그인") + "</b>" +
      field("아이디", "아이디를 입력하세요") + field("비밀번호", "비밀번호를 입력하세요") +
      btn("로그인", "primary block") + btn("간편인증 로그인", "secondary block") +
      '<div class="wf-links"><span>아이디 찾기</span><span>비밀번호 찾기</span><span>회원가입</span></div></div>';
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
    return '<div class="wf-tabs">' + (p.items || []).map(function (t, i) { return '<span class="' + (i === (p.active || 0) ? "on" : "") + '">' + esc(t) + "</span>"; }).join("") + "</div>";
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
  function logo(ctx) { return '<span class="wf-logo"><i></i><b>' + esc(ctx.systemName || "서비스명") + "</b></span>"; }
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
    if (ds.layout.footer === "simple" || ctx.view === "mobile") return '<footer class="wf-footer simple" data-cmp="footer"><div class="wf-container"><span>' + esc(ctx.systemName || "") + "</span><span>개인정보처리방침 · 이용약관 · © 2026</span></div></footer>";
    return '<footer class="wf-footer" data-cmp="footer"><div class="wf-container">' + logo(ctx) + '<div><span>개인정보처리방침 · 저작권정책 · 웹 접근성 정책</span><span>(04500) 서울특별시 ○○구 ○○로 00 · 대표전화 000-0000</span><span>© 2026 ○○기관. All rights reserved.</span></div></div></footer>';
  }
  function sideShell(ds, ctx, inner) {
    var menus = ctx.menus || [];
    return '<div class="wf-sshell"><aside class="wf-side" data-cmp="gnb">' + logo(ctx) + '<nav>' + menus.map(function (m, i) {
      return '<span class="' + (i === (ctx.activeMenu || 0) ? "on" : "") + '">' + icon(["home", "file", "edit", "bell", "user"][i % 5], 15) + esc(m) + "</span>";
    }).join("") + '</nav></aside><div class="wf-sbody"><div class="wf-topbar">' + C.breadcrumb(ds, { items: ctx.crumbs || [] }) +
      '<span class="wf-utl">' + icon("bell") + icon("user") + "<em>" + esc(ctx.userName || "사용자") + "</em></span></div>" +
      '<main class="wf-main">' + inner + "</main></div></div>";
  }

  /** 화면 한 장: 틀(GNB/사이드) + 제목 + 블록들 */
  function page(ds, ctx, blocksHtml) {
    var acts = ctx.titleActions ? '<div class="wf-tacts">' + ctx.titleActions + "</div>" : "";
    var title = ctx.title ? '<div class="wf-ptitle"><h1>' + esc(ctx.title) + "</h1>" + (ds.layout.nav === "side" ? "" : C.breadcrumb(ds, { items: ctx.crumbs || [] })) + acts + "</div>" : "";
    var body = title + '<div class="wf-blocks">' + blocksHtml + "</div>";
    var frame;
    if (ctx.bare) frame = '<div class="wf-bare">' + blocksHtml + "</div>";
    else if (ds.layout.nav === "side" && ctx.view !== "mobile") frame = sideShell(ds, ctx, body);
    else frame = header(ds, ctx) + '<main class="wf-main"><div class="wf-container">' + body + "</div></main>" + footer(ds, ctx);
    var viewCls = ctx.view === "mobile" ? " wf-m" : ctx.view === "tablet" ? " wf-t" : "";
    return '<div class="wf wf-nav-' + ds.layout.nav + " wf-" + ds.layout.density + viewCls + (scopeCls(ds) ? " " + useCss(ds) : "") + '" style="' + vars(ds) + '">' + frame + (ctx.overlay ? '<div class="wf-overlay">' + ctx.overlay + "</div>" : "") + "</div>";
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
    var listRows = prof === "admin" ?
      [["2026-0934", "구청 청사 에너지 사용량", "김○○", "2026-09-24", "공개신청"], ["2026-0933", "마을버스 노선 조정안", "이○○", "2026-09-23", "반려"], ["2026-0930", "도서관 좌석 이용률", "박○○", "2026-09-21", "심사중"]] :
      [["128", "2026년 하반기 도로 정비 계획", "도로과", "2026-09-24", "공개"], ["127", "공공 체육시설 이용 현황", "체육진흥과", "2026-09-22", "공개"], ["126", "민원 처리 결과 통계", "민원봉사과", "2026-09-19", "부분공개"]];
    var cols = prof === "admin" ? ["신청번호", "제목", "신청인", "신청일", "상태"] : ["번호", "제목", "기관", "공개일", "구분"];
    var list = component(ds, "search-panel", { fields: [{ label: "기간", type: "date-range" }, { label: "상태", type: "select", options: ["전체"] }, { label: "검색어", type: "text", placeholder: "제목" }] }) +
      component(ds, "data-table", { total: 128, columns: cols, rows: listRows, badgeColumn: 4 }) + component(ds, "pagination", { total: 128 });
    var wrap = function (h) { return '<div class="wf-blk">' + h + "</div>"; };
    var listPage = function (extra) { return page(ds, Object.assign({}, c, { title: s.title }, extra || {}), wrap(list)); };
    switch (type) {
      case "login":
        return page(ds, Object.assign({}, c, { bare: prof === "admin", title: prof === "admin" ? "" : "로그인", crumbs: ["로그인"] }), wrap(component(ds, "login-form", { title: prof === "admin" ? (ctx.systemName || "관리자") + " 로그인" : "로그인" })));
      case "dashboard":
        return page(ds, Object.assign({}, c, { title: prof === "admin" ? "대시보드" : "나의 민원", crumbs: ["대시보드"] }),
          wrap(component(ds, "stat-cards", { items: [["신규 신청", "12"], ["심사중", "8"], ["반려", "3"], ["공개", "124"]] })) +
          '<div class="wf-2col">' + wrap(component(ds, "data-table", { total: 12, columns: cols.slice(0, 3).concat(["상태"]), rows: listRows.map(function (r) { return [r[0], r[1], r[2], r[4]]; }), badgeColumn: 3 })) +
          wrap(component(ds, "notice-list", { title: "공지사항", items: [["시스템 점검 안내(9/28)", "09-24"], ["심사 기준 개정 안내", "09-20"], ["상반기 처리 실적", "09-12"]] })) + "</div>");
      case "main":
        if (prof === "admin") return template(ds, "dashboard", ctx);
        return page(ds, Object.assign({}, c, { title: "", showMega: ds.layout.nav === "top-mega" }),
          wrap(component(ds, "hero-banner", { title: prof === "service" ? "필요한 민원을 한 곳에서 신청하세요" : "누구나 쉽게 찾아보는 공공 정보", text: "정보공개 · 민원신청 · 처리 현황 조회" })) +
          (ds.layout.search === "hero" ? "" : wrap(component(ds, "search-bar", { placeholder: "찾고 싶은 정보를 검색하세요" }))) +
          wrap(component(ds, "quick-links", { items: ["정보공개 청구", "자료 등록", "처리 현황", "알림 신청", "자주 묻는 질문", "서식 내려받기"] })) +
          '<div class="wf-2col">' + wrap(component(ds, "notice-list", { title: "공지사항", items: [["시스템 점검 안내(9/28)", "09-24"], ["정보공개 청구 절차 변경", "09-20"]] })) +
          wrap(component(ds, "notice-list", { title: "최근 공개 자료", items: [["2026년 하반기 도로 정비 계획", "09-24"], ["공공 체육시설 이용 현황", "09-22"]] })) + "</div>");
      case "list":
        return listPage();
      case "detail":
        return page(ds, Object.assign({}, c, { title: "상세 정보" }),
          wrap(component(ds, "detail-table", { rows: [["제목", "2026년 하반기 도로 정비 계획"], ["기관", "도로과"], ["공개 구분", "전체공개"], ["공개일", "2026-09-24"]] })) +
          wrap(component(ds, "file-list", { files: ["도로정비계획_2026하반기.pdf (2.1MB)"] })) + wrap(component(ds, "button-group", { buttons: [{ label: "목록", variant: "secondary" }] })));
      case "form":
        return page(ds, Object.assign({}, c, { title: "자료 등록" }),
          (prof === "service" ? wrap(component(ds, "step-indicator", { steps: ["자료 입력", "내용 확인", "신청 완료"], current: 0 })) : "") +
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
