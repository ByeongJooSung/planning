(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("planning-data").textContent);
  var Wire = window.Wire, Flow = window.Flow, KB = window.KB;

  var STATUS = { NOT_STARTED: "미착수", IN_DESIGN: "설계중", DESIGNED: "설계완료", REVIEWED: "검토완료", EXCLUDED: "제외" };
  var STATUS_ORDER = ["REVIEWED", "DESIGNED", "IN_DESIGN", "NOT_STARTED", "EXCLUDED"];
  var RANK = { NOT_STARTED: 0, IN_DESIGN: 1, DESIGNED: 2, REVIEWED: 3, EXCLUDED: 4 };
  var STAGE = { S0: "자료 수집", S0A: "기존 서비스 분석", S1: "기획안", S2: "정보구조도", S3: "다이어그램", S4: "스토리보드", S5: "프로토타입" };
  var STAGE_ORDER = ["S0", "S0A", "S1", "S2", "S3", "S4", "S5"];
  var STAGE_ST = { NOT_STARTED: "미시작", COLLECTING: "정보수집중", GATE_PASSED: "게이트 통과", DRAFTED: "초안", IN_REVIEW: "검토중", CONFIRMED: "확정", SKIPPED: "패스", NEEDS_UPDATE: "변경 필요" };
  var TYPE = { NEW: "신규 구축", EXISTING: "기존 서비스" };
  var SCOPE = { NEW_MENU: "신규 메뉴 추가", MODIFY: "기존 메뉴 수정", RENEWAL: "전면 개편" };
  var TEMPLATE = { GENERAL: "일반 양식", PUBLIC: "공공기관 제출 양식" };
  var KIND = { MENU: "메뉴", PAGE: "페이지", POPUP: "팝업", LAYER: "레이어", TAB: "탭", EXTERNAL: "외부" };
  var CHG = { NEW: "신규", CHANGED: "변경", DELETED: "삭제", KEPT: "유지" };
  var COLL = {
    project: "프로젝트 설정", systems: "시스템 구분", sources: "참조자료", requirements: "요구사항", tasks: "Task",
    stateSets: "공통 상태값", planSections: "기획안 섹션", features: "기능", iaNodes: "정보구조도", flows: "플로우",
    flowNodes: "플로우 노드", flowEdges: "플로우 연결", storyboardScreens: "스토리보드 화면",
    prototypeScreens: "프로토타입 화면", changeRequests: "변경 요청", designSystems: "디자인 시스템", designComponents: "디자인 컴포넌트"
  };
  var TIMING = { ON_INPUT: "입력 중", ON_BLUR: "입력칸을 벗어날 때", ON_SUBMIT: "제출 시" };
  var TEMPLATES = [["login", "로그인"], ["dashboard", "대시보드"], ["main", "메인"], ["list", "목록"], ["detail", "상세"], ["form", "등록"], ["confirm", "확인 창"], ["alert", "알림 창"], ["toast", "토스트"], ["modal", "모달 팝업"]];
  var CATEGORY = { navigation: "내비게이션", layout: "레이아웃", search: "검색", data: "데이터", content: "콘텐츠", form: "입력", action: "버튼", feedback: "피드백" };
  var LAYOUT_LABEL = {
    nav: ["GNB 위치", { top: "상단", "top-mega": "상단 메가메뉴", side: "좌측 사이드" }],
    logo: ["로고 위치", { left: "왼쪽", center: "가운데" }],
    search: ["검색 영역", { header: "헤더 안", hero: "첫 화면 큰 검색창", panel: "목록 위 조건 패널" }],
    list: ["목록 형태", { table: "표(그리드)", card: "카드" }],
    pagination: ["페이지네이션", { numbered: "번호", "numbered-size": "번호 + 목록 개수 선택", more: "더보기" }],
    button: ["버튼 모서리", { square: "각진", rounded: "둥근", pill: "알약형" }],
    density: ["밀도", { comfortable: "여유", compact: "촘촘" }],
    footer: ["푸터", { full: "기관 정보 전체", simple: "간단", none: "없음" }]
  };
  var PAGES = {
    dash: ["대시보드", "단계 진행과 요구사항 충족 현황"],
    kb: ["참조자료", "올린 문서가 이 프로젝트의 지식이 됩니다. 요구사항 추출, Task 제안, 기획안 생성 때 근거로 검색됩니다."],
    req: ["요구사항·Task", "요구사항을 등록하면 시스템별 Task가 자동 또는 수동으로 만들어집니다. Task를 누르면 그 Task의 프로세스 플로우, 화면설계서, 프로토타입을 봅니다."],
    design: ["디자인 시스템", "시스템 영역마다 컨셉 3종을 제안받아 하나를 고르면 디자인 시스템이 만들어집니다. 화면설계서와 프로토타입은 이 디자인으로 그립니다."],
    ia: ["정보구조도", "Task별로 만든 화면이 통합된 시스템별 메뉴·화면 구조"],
    rtm: ["요구사항 추적표", "요구사항 → 시스템별 Task → 산출물 연결과 충족 상태"],
    flow: ["시스템별 프로세스 플로우", "Task별 흐름을 통합한 프로세스를 시스템 영역별로 나눠 봅니다"],
    ver: ["버전 이력", "스냅샷과 최근 스냅샷 이후 변경 사항"]
  };

  var state = { route: { view: "home" }, rtmView: "matrix", off: {}, flowSys: "ALL", dsSys: {}, kbQ: "", proto: {} };
  try {
    var saved = JSON.parse(localStorage.getItem("planning-viewer-2") || "{}");
    if (saved.route && (saved.route.view === "home" || (typeof saved.route.p === "number" && saved.route.p < DATA.projects.length))) state.route = saved.route;
    if (saved.rtmView) state.rtmView = saved.rtmView;
  } catch (e) { /* 저장소 없음 */ }
  var hash = (location.hash || "").slice(1);
  DATA.projects.forEach(function (p, i) { if (p.model.project.code === hash) state.route = { view: "project", p: i, page: "dash" }; });

  function persist() {
    try { localStorage.setItem("planning-viewer-2", JSON.stringify({ route: state.route, rtmView: state.rtmView })); } catch (e) { /* 무시 */ }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pill(st) { return '<span class="pill ' + st + '">' + (st === "REVIEWED" ? "✓ " : "") + STATUS[st] + "</span>"; }
  function P() { return DATA.projects[state.route.p]; }
  function sysOf(p, code) { return p.model.systems.find(function (x) { return x.code === code; }); }
  function sysColor(code) { var s = sysOf(P(), code); return s ? s.color : "#888888"; }
  function sysChip(code) { return '<span class="sys"><i style="background:' + sysColor(code) + '"></i>' + esc(code) + "</span>"; }
  function sysOn(code) { return !state.off[P().model.project.code + ":" + code]; }
  function shortTask(id, reqId) { return id.indexOf(reqId + "-") === 0 ? id.slice(reqId.length + 1) : id; }
  function fmtDate(iso) { return iso ? iso.slice(0, 16).replace("T", " ") : ""; }
  function minStatus(xs) {
    var live = xs.filter(function (x) { return x !== "EXCLUDED"; });
    if (!live.length) return xs.length ? "EXCLUDED" : null;
    var m = live.reduce(function (a, b) { return RANK[a] <= RANK[b] ? a : b; });
    if (m === "NOT_STARTED" && live.some(function (x) { return x !== "NOT_STARTED"; })) return "IN_DESIGN";
    return m;
  }
  function allTasks(p) { return p.rtm.rows.reduce(function (a, r) { return a.concat(r.tasks); }, []); }
  function findTrace(p, id) { return allTasks(p).find(function (t) { return t.taskId === id; }); }
  function rawTask(p, id) {
    var out = null;
    p.model.requirements.forEach(function (r) { r.tasks.forEach(function (t) { if (t.id === id) out = t; }); });
    return out;
  }
  function designOf(p, code) { return p.model.design.systems.find(function (d) { return d.systemCode === code; }); }
  function selectedDesign(p, code) {
    var d = designOf(p, code);
    return d && d.status === "SELECTED" ? d : null;
  }
  function profileOf(s) {
    var u = (s.users || []).join(" ");
    if ((s.channels || []).indexOf("ADMIN_WEB") >= 0 || /관리자|심사자|운영|담당자/.test(u) || s.code === "ADM") return "admin";
    if (/국민|비회원|누구나|방문자/.test(u)) return "portal";
    if (/민원|회원|신청|고객/.test(u)) return "service";
    return "portal";
  }
  function copyBox(cmd) {
    return '<div class="cmd"><code>' + esc(cmd) + '</code><button class="btn-sm" data-copy="' + esc(cmd) + '">복사</button></div>';
  }

  /** 와이어프레임 틀에 넣을 시스템·메뉴·위치 정보 */
  function wireCtx(p, code, screenId) {
    var s = sysOf(p, code) || { name: code, users: [], channels: [] };
    var nodes = p.model.ia.nodes.filter(function (n) { return n.systemCode === code; });
    var tops = nodes.filter(function (n) { return !n.parentId && n.kind === "MENU"; });
    var menus = tops.map(function (n) { return n.name; });
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    var crumbs = [], cur = byId[screenId], top = null;
    while (cur) { crumbs.unshift(cur.name); top = cur; cur = cur.parentId ? byId[cur.parentId] : null; }
    var prof = profileOf(s);
    var sample = { portal: ["알림마당", "기관소개"], service: ["고객센터"], admin: ["통계", "시스템 관리"] }[prof];
    return {
      systemName: s.name, profile: prof, menus: menus.concat(sample).slice(0, 6), activeMenu: Math.max(0, tops.indexOf(top)),
      crumbs: crumbs, userName: prof === "admin" ? (s.users[0] || "담당자") + " 정○○" : "민원인"
    };
  }

  // ── LNB ─────────────────────────────────────────
  function navItem(label, attrs, active, count) {
    return '<button class="nav-item" ' + attrs + ' aria-current="' + (active ? "page" : "false") + '"><span>' + esc(label) + "</span>" + (count != null ? '<span class="n">' + esc(count) + "</span>" : "") + "</button>";
  }
  function renderLnb() {
    var r = state.route, html = '<div class="brand"><b>Planning Studio</b><span>서비스 기획 산출물 관리</span></div>';
    var opts = [];
    if (r.view === "home") {
      html += '<nav class="nav-group"><span class="side-label">메뉴</span>' + navItem("전체 프로젝트", 'data-nav="home"', true, DATA.projects.length) + "</nav>";
      html += '<nav class="nav-group"><span class="side-label">프로젝트 바로가기</span>' + DATA.projects.map(function (p, i) {
        return navItem(p.model.project.name, 'data-open="' + i + '"', false);
      }).join("") + "</nav>";
      opts.push(['home', "전체 프로젝트"]);
      DATA.projects.forEach(function (p, i) { opts.push(["p" + i, p.model.project.name]); });
    } else {
      var p = P(), pr = p.model.project, page = r.view === "task" ? "req" : r.page;
      var ds = p.model.systems.filter(function (s) { return s.hasScreens; });
      var sel = ds.filter(function (s) { return selectedDesign(p, s.code); }).length;
      html += '<button class="back" data-nav="home">← 전체 프로젝트</button>';
      html += '<div class="proj-id"><span class="code">' + esc(pr.code) + " · v" + esc(pr.version) + '</span><b>' + esc(pr.name) + "</b></div>";
      var groups = [
        ["프로젝트", [["dash", null], ["kb", p.model.sources.length], ["req", p.rtm.rows.length], ["design", sel + "/" + ds.length]]],
        ["통합 산출물", [["ia", null], ["rtm", p.rtm.gaps.length + p.rtm.orphans.length || null], ["flow", null]]],
        ["이력", [["ver", p.snapshots.length]]]
      ];
      groups.forEach(function (g) {
        html += '<nav class="nav-group"><span class="side-label">' + g[0] + "</span>" + g[1].map(function (it) {
          opts.push([it[0], g[0] + " · " + PAGES[it[0]][0]]);
          return navItem(PAGES[it[0]][0], 'data-page="' + it[0] + '"', page === it[0], it[1]);
        }).join("") + "</nav>";
      });
      opts.unshift(["home", "← 전체 프로젝트"]);
    }
    var cur = r.view === "home" ? "home" : r.view === "task" ? "req" : r.page;
    html += '<label class="sr" for="lnb-select">메뉴</label><select id="lnb-select" class="lnb-select">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + esc(o[1]) + "</option>";
    }).join("") + "</select>";
    html += '<div class="side-foot">생성 ' + esc(fmtDate(DATA.generatedAt)) + "<br><code>planning view</code></div>";
    document.getElementById("side").innerHTML = html;
  }

  // ── 본문 ────────────────────────────────────────
  function render() {
    renderLnb();
    var r = state.route, html;
    if (r.view === "home") html = renderHome();
    else if (r.view === "task") html = renderTask();
    else {
      var info = PAGES[r.page] || PAGES.dash, pr = P().model.project;
      html = '<header class="page-head"><span class="eyebrow">' + esc(pr.name) + '</span><h1>' + info[0] + "</h1><p>" + esc(info[1]) + "</p></header>" + renderPage(r.page);
    }
    document.getElementById("main").innerHTML = html;
    afterRender();
  }
  function renderPage(page) {
    switch (page) {
      case "kb": return renderKb();
      case "req": return renderReq();
      case "design": return renderDesign();
      case "ia": return renderIa();
      case "rtm": return renderRtm();
      case "flow": return renderFlows();
      case "ver": return renderVer();
      default: return renderDash();
    }
  }
  function afterRender() {
    var r = state.route;
    if (r.view === "task" && r.tab === "proto") renderProto();
    if (r.view === "project" && r.page === "kb") runSearch();
  }

  // ── 프로젝트 목록 ───────────────────────────────
  function renderHome() {
    var totals = DATA.projects.reduce(function (a, p) {
      a.req += p.rtm.rows.length; a.task += p.rtm.coverage.tasks.total; a.gap += p.rtm.gaps.length; return a;
    }, { req: 0, task: 0, gap: 0 });
    var cards = DATA.projects.map(function (p, i) {
      var pr = p.model.project, c = p.rtm.coverage;
      var track = STAGE_ORDER.filter(function (s) { return pr.stages[s]; }).map(function (s) {
        return '<span class="trk ' + pr.stages[s] + '" title="' + (s === "S0A" ? "S0-A" : s) + " " + STAGE[s] + ": " + STAGE_ST[pr.stages[s]] + '"><i></i><em>' + (s === "S0A" ? "S0-A" : s) + "</em></span>";
      }).join("");
      var sysChips = p.model.systems.map(function (s) {
        var d = designOf(p, s.code);
        return '<span class="tag"><i class="dot" style="background:' + s.color + '"></i>' + esc(s.code) + (s.hasScreens ? (d && d.status === "SELECTED" ? " · 디자인 " + esc(d.selectedId) : d ? " · 컨셉 선택 대기" : "") : "") + "</span>";
      }).join("");
      return '<button class="box pcard" data-open="' + i + '">' +
        '<div class="pc-top"><span class="code">' + esc(pr.code) + " · v" + esc(pr.version) + '</span><span class="tag">' + esc(TYPE[pr.serviceType] + (pr.changeScope ? " · " + SCOPE[pr.changeScope] : "")) + "</span></div>" +
        '<b class="pc-name">' + esc(pr.name) + '</b><div class="pc-sys">' + sysChips + '</div><div class="track">' + track + "</div>" +
        '<div class="pc-rate"><div class="bar"><b style="width:' + c.designedRate + '%;background:var(--accent)"></b></div><span>설계완료 ' + c.designedRate + "%</span></div>" +
        '<dl class="pc-nums"><div><dt>요구사항</dt><dd>' + p.rtm.rows.length + "</dd></div><div><dt>Task</dt><dd>" + c.tasks.total + "</dd></div><div><dt>참조자료</dt><dd>" + p.model.sources.length +
        '</dd></div><div class="' + (p.rtm.gaps.length ? "warn" : "") + '"><dt>누락</dt><dd>' + p.rtm.gaps.length + "</dd></div></dl>" +
        '<span class="pc-foot">' + esc(TEMPLATE[pr.submissionTemplate]) + " · 수정 " + esc(fmtDate(pr.updatedAt)) + "</span></button>";
    }).join("");
    return '<header class="page-head"><span class="eyebrow">Planning Studio</span><h1>프로젝트</h1><p>프로젝트 ' + DATA.projects.length + "개 · 요구사항 " + totals.req + "건 · Task " + totals.task + "건 · 누락 " + totals.gap + "건</p></header>" +
      '<section class="pgrid">' + cards + '<div class="box pcard new"><b>새 프로젝트</b><p class="hint">서비스 유형, 변경 범위, 시스템 구분을 정해 만듭니다.</p>' +
      copyBox('planning init <코드> --name "<프로젝트명>" --type NEW --preset public-civil') + "</div></section>";
  }

  // ── 대시보드 ────────────────────────────────────
  function renderDash() {
    var p = P(), pr = p.model.project, rtm = p.rtm, c = rtm.coverage;
    var stages = STAGE_ORDER.filter(function (s) { return pr.stages[s]; }).map(function (s) {
      var st = pr.stages[s];
      return '<div class="stage ' + st + '"><span class="sid">' + (s === "S0A" ? "S0-A" : s) + '</span><span class="sname">' + STAGE[s] + '</span><span class="sst">' + STAGE_ST[st] + "</span></div>";
    }).join("");
    var tasks = allTasks(p), auto = p.model.requirements.reduce(function (a, r) { return a + r.tasks.filter(function (t) { return t.origin === "AUTO"; }).length; }, 0);
    var kpis =
      kpi(c.designedRate, "%", "설계완료율 (제외 Task 빼고)") +
      kpi(c.requirements.total, "건", "요구사항 · 제외 " + c.requirements.EXCLUDED + "건") +
      kpi(c.tasks.total, "건", "Task · 자동 생성 " + auto + "건") +
      kpi(rtm.gaps.length, "건", "단계별 누락", rtm.gaps.length > 0) +
      kpi(rtm.orphans.length, "건", "요구사항 근거 없는 산출물", rtm.orphans.length > 0);
    var bars = p.model.systems.map(function (s) {
      var v = c.bySystem[s.code] || { total: 0, designed: 0, rate: 0 };
      return '<div class="bar-row"><div class="lbl">' + sysChip(s.code) + "<span>" + esc(s.name) + "</span></div>" +
        '<div class="bar" role="img" aria-label="' + esc(s.name) + " 설계완료 " + v.rate + '%"><b style="width:' + v.rate + "%;background:" + s.color + '"></b></div>' +
        '<div class="num">' + v.designed + "/" + v.total + " · " + v.rate + "%</div></div>";
    }).join("");
    var axis = '<div class="axis"><span></span><div><span>0%</span><span>50%</span><span>100%</span></div><span></span></div>';
    var total = c.tasks.total || 1;
    var stColors = { REVIEWED: "var(--st-rev-bg)", DESIGNED: "var(--st-done)", IN_DESIGN: "var(--st-prog)", NOT_STARTED: "var(--line-strong)", EXCLUDED: "var(--surface-2)" };
    var stack = STATUS_ORDER.map(function (s) { return c.tasks[s] ? '<span style="width:' + (c.tasks[s] / total * 100) + "%;background:" + stColors[s] + '"></span>' : ""; }).join("");
    var legend = STATUS_ORDER.map(function (s) { return '<span><i style="background:' + stColors[s] + '"></i>' + STATUS[s] + " " + c.tasks[s] + "</span>"; }).join("");

    var byStage = {};
    rtm.gaps.forEach(function (g) { (byStage[g.stage] = byStage[g.stage] || []).push(g); });
    var issues = Object.keys(byStage).map(function (st) {
      return '<details class="igroup"' + (byStage[st].length <= 4 ? " open" : "") + "><summary><span class=\"st\">" + (st === "S0A" ? "S0-A" : st) + "</span>" + STAGE[st] + " 누락 <b>" + byStage[st].length + "</b></summary>" +
        byStage[st].map(function (g) { return '<div class="issue">' + esc(g.message) + "</div>"; }).join("") + "</details>";
    }).join("") + (rtm.orphans.length ? '<details class="igroup orphan" open><summary><span class="st">근거</span>요구사항 근거 없는 산출물 <b>' + rtm.orphans.length + "</b></summary>" +
      rtm.orphans.map(function (o) { return '<div class="issue">' + esc(o.message) + "</div>"; }).join("") + "</details>" : "");

    var chunks = p.model.sources.reduce(function (a, s) { return a + (s.index ? s.index.chunks : 0); }, 0);
    var dsRows = p.model.systems.filter(function (s) { return s.hasScreens; }).map(function (s) {
      var d = designOf(p, s.code), c2 = d && d.status === "SELECTED" ? d.proposals.find(function (x) { return x.id === d.selectedId; }) : null;
      return '<button class="mini-row" data-page="design" data-dsys="' + esc(s.code) + '">' + sysChip(s.code) + "<span>" + esc(s.name) + "</span><em>" +
        (c2 ? esc(c2.id + ". " + c2.name) : d ? '<span class="warn-t">컨셉 선택 대기</span>' : '<span class="warn-t">제안 전</span>') + "</em></button>";
    }).join("");
    var hist = p.model.rtmRecords.history.slice(-5).reverse().map(function (h) {
      return '<div class="mini-row static"><span class="mono">' + esc(h.requirementId) + "</span><span>" + esc(h.detail) + "</span><em>" + esc(h.crId || "") + "</em></div>";
    }).join("");

    return '<section class="section"><h2>단계 진행</h2><div class="box stages">' + stages + "</div></section>" +
      '<section class="kpis">' + kpis + "</section>" +
      '<div class="dash-3">' +
      '<section class="section"><h2>참조자료 <small>프로젝트 지식</small></h2><button class="box tile" data-page="kb"><b>' + p.model.sources.length + "<small>건</small></b><span>검색 색인 " + chunks + "조각</span></button></section>" +
      '<section class="section"><h2>디자인 시스템 <small>시스템 영역별</small></h2><div class="box mini">' + (dsRows || '<div class="empty">화면이 있는 시스템이 없습니다.</div>') + "</div></section>" +
      '<section class="section"><h2>최근 요구사항 변경</h2><div class="box mini">' + (hist || '<div class="empty">변경 이력이 없습니다.</div>') + "</div></section></div>" +
      '<div class="dash-grid">' +
      '<section class="section"><h2>시스템별 설계완료 <small>설계완료·검토완료 Task / 전체 Task</small></h2><div class="box bars">' + bars + axis +
      '<div class="stack-wrap"><span class="hint">Task 상태 분포 (전체 ' + c.tasks.total + '건)</span><div class="stack">' + stack + '</div><div class="legend">' + legend + "</div></div></div></section>" +
      '<section class="section"><h2>확인할 항목 <small>누락 ' + rtm.gaps.length + " · 근거 없음 " + rtm.orphans.length + '</small></h2><div class="box issues">' + (issues || '<div class="empty">누락이나 근거 없는 산출물이 없습니다.</div>') + "</div></section></div>";
  }
  function kpi(v, unit, label, alert) {
    return '<div class="box kpi' + (alert ? " alert" : "") + '"><span class="v">' + v + "<small>" + unit + '</small></span><span class="l">' + esc(label) + "</span></div>";
  }

  // ── 참조자료 ────────────────────────────────────
  function renderKb() {
    var p = P();
    var rows = p.model.sources.map(function (s) {
      var used = p.model.requirements.filter(function (r) { return r.sources.some(function (x) { return x.sourceId === s.id; }); }).map(function (r) { return r.id; });
      var st = s.index ? (s.index.status === "INDEXED" ? '<span class="pill DESIGNED">색인 완료</span>' : '<span class="pill IN_DESIGN">' + (s.index.status === "UNSUPPORTED" ? "보관만(미지원 형식)" : "색인 실패") + "</span>") : '<span class="pill NOT_STARTED">색인 없음</span>';
      return '<tr><td class="id">' + esc(s.id) + "</td><td><b>" + esc(s.title) + '</b><br><span class="hint">' + esc(s.fileName || s.location) + (s.size ? " · " + (s.size / 1024).toFixed(1) + "KB" : "") + "</span></td><td>" + esc(s.kind) + "</td><td>" + st +
        '</td><td class="num">' + (s.index ? s.index.chunks + "조각 · " + s.index.chars.toLocaleString() + "자" : "—") + '</td><td class="id">' + (used.map(esc).join("<br>") || '<span class="dash">—</span>') + "</td><td>" + esc(fmtDate(s.addedAt)) + "</td></tr>";
    }).join("");
    return '<section class="section"><div class="box kb-search"><label for="kb-q" class="kb-label">프로젝트 지식 검색</label><div class="kb-row"><input id="kb-q" type="search" placeholder="예: 반려 사유, 목록 50건, 부분공개" value="' + esc(state.kbQ) + '" autocomplete="off"></div>' +
      '<div id="kb-results" class="kb-results"></div></div></section>' +
      '<section class="section"><h2>올린 자료 <small>' + p.model.sources.length + "건</small></h2>" +
      '<div class="box twrap"><table><thead><tr><th>ID</th><th>자료</th><th>유형</th><th>색인</th><th>분량</th><th>근거로 쓴 요구사항</th><th>올린 날</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="7" class="empty">아직 올린 자료가 없습니다.</td></tr>') + "</tbody></table></div>" +
      '<div class="note"><b>자료 올리기</b><p class="hint">지원 형식: txt, md, csv, json, html, eml(메일), docx, pdf. 같은 파일은 한 번만 색인합니다. 한글(hwp)·pptx·xlsx는 보관만 하고 P1에서 지원합니다. 이 화면은 읽기 전용 뷰어라 파일 올리기는 명령어로 합니다(웹 업로드는 서버 모드 P7).</p>' +
      copyBox("planning -p " + P().model.project.code + " kb add <파일> [<파일>...]") + "</div></section>";
  }
  function runSearch() {
    var box = document.getElementById("kb-results");
    if (!box) return;
    var p = P(), q = state.kbQ.trim();
    if (!q) { box.innerHTML = '<p class="hint">검색어를 입력하면 올린 자료에서 관련 문단을 찾습니다. 한국어는 두 글자 단위로 맞춰 찾습니다.</p>'; return; }
    var hits = KB.search(p.chunks || [], q, 6);
    var toks = KB.tokenize(q);
    box.innerHTML = hits.length ? hits.map(function (h) {
      var src = p.model.sources.find(function (s) { return s.id === h.chunk.sourceId; }) || {};
      var text = esc(h.chunk.text.length > 320 ? h.chunk.text.slice(0, 320) + "…" : h.chunk.text);
      toks.forEach(function (t) { if (t.length >= 2) text = text.split(esc(t)).join("<mark>" + esc(t) + "</mark>"); });
      return '<article class="hit"><div class="hit-h"><span class="mono">' + esc(h.chunk.sourceId) + "</span><b>" + esc(src.title || "") + "</b><span class=\"hint\">" + esc(h.chunk.locator) + '</span><span class="score">관련도 ' + h.score + "</span></div><p>" + text + "</p></article>";
    }).join("") : '<p class="hint">"' + esc(q) + '"와 관련된 내용을 찾지 못했습니다.</p>';
  }

  // ── 요구사항·Task ───────────────────────────────
  function renderReq() {
    var p = P(), m = p.model;
    var rows = p.rtm.rows.map(function (row) {
      var req = m.requirements.find(function (r) { return r.id === row.requirementId; });
      var steps = row.tasks.map(function (t) {
        var raw = rawTask(p, t.taskId) || {};
        var tr = raw.transition ? "<code>" + esc(raw.transition.from || "") + "</code> → <code>" + esc(raw.transition.to) + "</code>" : "";
        var after = raw.after && raw.after.length ? "선행 " + raw.after.map(function (a) { return shortTask(a, row.requirementId); }).join(", ") : "";
        var sub = [tr, after, t.screenless ? "화면 없음" : (t.screens.length ? t.screens.join(", ") : '<span class="warn-t">화면 미연결</span>')].filter(Boolean).join(" · ");
        return '<button class="step" data-task="' + esc(t.taskId) + '" style="--sys:' + sysColor(t.systemCode) + '"><span class="tid">' + esc(shortTask(t.taskId, row.requirementId)) + "</span>" +
          sysChip(t.systemCode) + '<span class="act"><span class="who">' + esc(t.actor) + "</span><b>" + esc(t.action) + "</b>" +
          (raw.origin === "AUTO" ? '<span class="auto" title="' + esc(raw.suggestReason || "") + '">자동</span>' : "") +
          '<span class="tr">' + sub + "</span></span>" + pill(t.status) + '<span class="go">›</span></button>';
      }).join("");
      var sub = [];
      if (row.originalId && row.originalId !== row.requirementId) sub.push("원본 " + esc(row.originalId));
      sub.push(esc(req.type) + " · " + esc(req.priority));
      if (row.sources.length) sub.push("출처 " + esc(row.sources.join(", ")));
      if (row.crIds.length) sub.push("변경 요청 " + esc(row.crIds.join(", ")));
      return '<article class="box req"><div class="req-head"><span class="req-id">' + esc(row.requirementId) + '</span><span class="req-title">' + esc(row.title) + "</span>" + pill(row.status) + "</div>" +
        '<div class="req-sub">' + sub.map(function (s) { return "<span>" + s + "</span>"; }).join("") + "</div>" +
        (req.description ? '<p class="req-desc">' + esc(req.description) + "</p>" : "") +
        (row.status === "EXCLUDED" ? '<div class="hint">제외 사유: ' + esc(row.excludeReason) + "</div>" :
          steps ? '<div class="chain">' + steps + "</div>" : '<div class="notask">시스템별 Task가 아직 없습니다.' + copyBox("planning -p " + m.project.code + " task auto " + row.requirementId) + "</div>") +
        "</article>";
    }).join("");
    return '<section class="section"><div class="note row"><div><b>요구사항 등록과 Task 생성</b><p class="hint">등록할 때 <code>--auto-tasks</code>를 붙이면 업무 동사(신청·심사·공개·알림·연계)를 시스템 성격에 맞춰 Task를 자동으로 만듭니다. <span class="auto">자동</span> 표시에 마우스를 올리면 근거가 보입니다. 직접 만들려면 <code>task add</code>를 씁니다.</p></div>' +
      copyBox('planning -p ' + m.project.code + ' req add --title "<요구사항>" --desc "<설명>" --auto-tasks') + "</div>" + rows + "</section>";
  }

  // ── Task 상세 ───────────────────────────────────
  function renderTask() {
    var p = P(), r = state.route, t = findTrace(p, r.taskId);
    if (!t) { state.route = { view: "project", p: r.p, page: "req" }; return renderPage("req"); }
    var raw = rawTask(p, t.taskId), row = p.rtm.rows.find(function (x) { return x.requirementId === t.requirementId; });
    var req = p.model.requirements.find(function (x) { return x.id === t.requirementId; });
    var tab = r.tab || "flow";
    var chain = row.tasks.map(function (x) {
      return '<button class="chip-t' + (x.taskId === t.taskId ? " on" : "") + '" data-task="' + esc(x.taskId) + '" style="--sys:' + sysColor(x.systemCode) + '"><i></i>' + esc(shortTask(x.taskId, row.requirementId)) + " " + esc(x.systemCode) + "</button>";
    }).join('<span class="arrow-t">›</span>');
    var srcs = req.sources.map(function (s) {
      var src = p.model.sources.find(function (x) { return x.id === s.sourceId; });
      return esc(s.sourceId) + (src ? " " + esc(src.title) : "") + (s.locator ? ' <span class="hint">· ' + esc(s.locator) + "</span>" : "");
    }).join("<br>");
    var info = [
      ["요구사항", '<span class="mono">' + esc(row.requirementId) + "</span> " + esc(row.title)],
      ["처리 순서", '<div class="chain-t">' + chain + "</div>"],
      ["자료 상태", raw.transition ? "<code>" + esc(raw.transition.from || "—") + "</code> → <code>" + esc(raw.transition.to) + "</code>" : '<span class="dash">—</span>'],
      ["연결 화면", t.screenless ? "화면 없음 (" + esc(raw.noScreenReason || "화면 없는 시스템") + ")" : t.screens.length ? t.screens.map(function (s) { return '<span class="mono">' + esc(s) + "</span>"; }).join(", ") : '<span class="warn-t">아직 없음 (S2)</span>'],
      ["기획안·기능", t.planSections.concat(t.features).map(esc).join(", ") || '<span class="dash">—</span>'],
      ["근거 자료", srcs || '<span class="dash">—</span>'],
      ["생성 방식", raw.origin === "AUTO" ? '<span class="auto">자동</span> ' + esc(raw.suggestReason || "") : "수동 등록"]
    ];
    if (t.reviewer) info.push(["검토 확인", esc(t.reviewer)]);
    var sbCount = t.screens.filter(function (s) { return p.model.storyboard.screens.some(function (x) { return x.screenId === s; }); }).length;
    var tabs = [["flow", "프로세스 플로우"], ["sb", "화면설계서 " + sbCount + "/" + t.screens.length], ["proto", "프로토타입"]];
    var body = tab === "sb" ? taskSheets(p, t) : tab === "proto" ? '<div id="proto"></div>' : taskFlow(p, t);
    return '<header class="page-head"><nav class="crumbs"><button data-page="req">요구사항·Task</button><span>›</span><span>' + esc(row.requirementId) + " " + esc(row.title) + "</span></nav>" +
      '<h1><span class="mono">' + esc(shortTask(t.taskId, row.requirementId)) + "</span> " + esc(t.action) + "</h1>" +
      '<div class="meta">' + sysChip(t.systemCode) + '<span class="tag">' + esc((sysOf(p, t.systemCode) || {}).name || "") + "</span>" + (t.actor ? '<span class="tag">행위자 ' + esc(t.actor) + "</span>" : "") + pill(t.status) + '<span class="tag mono">' + esc(t.taskId) + "</span></div></header>" +
      '<dl class="box info">' + info.map(function (i) { return "<div><dt>" + i[0] + "</dt><dd>" + i[1] + "</dd></div>"; }).join("") + "</dl>" +
      '<nav class="tabs" role="tablist">' + tabs.map(function (x) { return '<button class="tab" role="tab" data-ttab="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</nav>" +
      '<div class="panel">' + body + "</div>";
  }

  function taskFlow(p, t) {
    var ids = p.rtm.rows.find(function (r) { return r.requirementId === t.requirementId; }).tasks.map(function (x) { return x.taskId; });
    var flows = p.model.flows.filter(function (f) { return f.nodes.some(function (n) { return n.taskIds.some(function (id) { return ids.indexOf(id) >= 0; }); }); });
    if (!flows.length) return '<div class="box empty">이 요구사항의 Task는 아직 프로세스 플로우에 연결되지 않았습니다. 다이어그램 단계(S3)에서 만듭니다.</div>';
    var mine = t.flowNodes.length;
    return flows.map(function (f) {
      return '<section class="section"><h2>' + esc(f.title) + " <small>" + esc(f.id) + " · 진하게 표시한 노드가 이 Task" + (mine ? "" : " (이 Task는 아직 노드가 없습니다)") + '</small></h2><div class="box flow-box">' +
        Flow.svg(f, { color: sysColor, highlight: [t.taskId], suffix: "-t" }) + "</div></section>";
    }).join("") + '<p class="hint">같은 요구사항의 다른 Task는 흐리게 표시합니다. 점선 화살표는 반려·보완처럼 되돌아가는 흐름입니다.</p>';
  }

  function descCell(c) {
    var out = [];
    if (c.planner) out.push('<p><span class="lens">기획</span>' + esc(c.planner) + "</p>");
    if (c.customer) out.push('<p><span class="lens cust">고객</span>' + esc(c.customer) + "</p>");
    return out.join("");
  }
  function ruleCell(c) {
    var out = [];
    if (c.options) out.push('<p><b>옵션</b> ' + c.options.values.map(esc).join(" / ") + (c.options.default ? ' <span class="hint">(기본: ' + esc(c.options.default) + ")</span>" : "") + (c.options.note ? ' <span class="hint">' + esc(c.options.note) + "</span>" : "") + "</p>");
    var v = c.validation;
    if (v) {
      var parts = [v.required ? "필수" : "선택"];
      if (v.minLength != null || v.maxLength != null) parts.push((v.minLength != null ? v.minLength : 0) + "~" + (v.maxLength != null ? v.maxLength : "") + "자");
      if (v.format) parts.push(esc(v.format));
      if (v.allowedChars) parts.push("허용: " + esc(v.allowedChars));
      if (v.timing && v.timing.length) parts.push("검증: " + v.timing.map(function (x) { return TIMING[x]; }).join(", "));
      out.push("<p><b>유효성</b> " + parts.join(" · ") + "</p>");
      (v.messages || []).forEach(function (m) { out.push('<p class="msg">' + esc(m.condition) + " → “" + esc(m.text) + "”</p>"); });
    }
    return out.join("") || '<span class="dash">—</span>';
  }

  function screenWire(p, sb, markers) {
    var ds = selectedDesign(p, sb.systemCode);
    if (!ds) return null;
    var node = p.model.ia.nodes.find(function (n) { return n.id === sb.screenId; }) || {};
    var ctx = wireCtx(p, sb.systemCode, sb.screenId);
    ctx.markers = markers;
    if (node.kind === "POPUP") {
      ctx.popup = true;
      ctx.parent = p.model.storyboard.screens.find(function (s) { return s.screenId === node.parentId; });
    }
    return Wire.screen(ds, sb, ctx);
  }

  function taskSheets(p, t) {
    if (t.screenless) return '<div class="box empty">화면이 없는 Task입니다. 프로세스 플로우로 설계를 확인합니다.</div>';
    if (!t.screens.length) return '<div class="box empty">아직 연결된 화면이 없습니다. 정보구조도(S2)에서 화면 ID를 만들고 이 Task에 연결하면 화면설계서를 작성할 수 있습니다.</div>';
    return t.screens.map(function (sid) {
      var sb = p.model.storyboard.screens.find(function (s) { return s.screenId === sid; });
      var node = p.model.ia.nodes.find(function (n) { return n.id === sid; }) || {};
      var ctx = wireCtx(p, node.systemCode || t.systemCode, sid);
      var headRow = '<table class="sheet-head"><tbody><tr><th>화면 ID</th><td class="mono">' + esc(sid) + "</td><th>화면명</th><td>" + esc(node.name || (sb && sb.title) || "") + "</td><th>시스템</th><td>" + esc(ctx.systemName) + "</td></tr>" +
        "<tr><th>Location</th><td colspan=\"3\">" + esc(ctx.crumbs.join(" > ")) + "</td><th>화면 유형</th><td>" + esc(KIND[node.kind] || "") + (sb && sb.template ? " · " + esc(sb.template) : "") + "</td></tr></tbody></table>";
      if (!sb) return '<article class="box sheet">' + headRow + '<div class="empty">화면설계서가 아직 없습니다. 이 화면은 요구사항 추적표에서 “스토리보드 미작성”으로 잡힙니다.</div></article>';
      var wire = screenWire(p, sb, true);
      var ds = designOf(p, sb.systemCode);
      var left = wire ? '<div class="wire-box"><div class="zoom z55">' + wire + "</div></div>" :
        '<div class="wire-missing"><b>와이어프레임을 그릴 수 없습니다</b><p class="hint">' + esc(sb.systemCode) + " 디자인 시스템 컨셉이 " + (ds ? "아직 선택되지 않았습니다(제안 3종 검토 중)." : "아직 제안되지 않았습니다.") + " 오른쪽 설명만 글로 작성된 상태입니다.</p><button class=\"btn-sm\" data-page=\"design\" data-dsys=\"" + esc(sb.systemCode) + '">디자인 시스템 보기</button></div>';
      var desc = '<table class="desc"><thead><tr><th>No</th><th>항목</th><th>설명</th><th>옵션·유효성</th></tr></thead><tbody>' + sb.components.map(function (c) {
        return '<tr><td><span class="no">' + c.no + "</span></td><td><b>" + esc(c.label) + '</b><br><span class="hint mono">' + esc(c.ui ? c.ui.component : c.kind) + "</span>" + (c.ui && c.ui.link ? '<br><span class="hint">→ ' + esc(c.ui.link) + "</span>" : "") + "</td><td>" + descCell(c) + "</td><td>" + ruleCell(c) + "</td></tr>";
      }).join("") + "</tbody></table>";
      return '<article class="box sheet">' + headRow + '<div class="sheet-body">' + left + '<div class="desc-wrap">' + desc + "</div></div></article>";
    }).join("") + '<p class="hint">설명은 기획자 관점(정책·규칙·예외)과 고객 관점(보이는 것·할 수 있는 것)으로 적고, 개발자 관점은 넣지 않습니다. 공공기관 제출 양식으로 내보내면 장표 단위로 나뉘고, 한 장을 넘으면 같은 화면 ID로 “다음 페이지에 계속”이 붙습니다(S4 출력 기능).</p>';
  }

  // ── 프로토타입 ──────────────────────────────────
  function protoScreens(p, t) {
    var have = {};
    p.model.storyboard.screens.forEach(function (s) { have[s.screenId] = s; });
    var list = t.screens.filter(function (s) { return have[s]; });
    list.slice().forEach(function (s) {
      have[s].components.forEach(function (c) {
        var targets = [];
        if (c.ui && c.ui.link) targets.push(c.ui.link);
        if (c.ui && c.ui.props && c.ui.props.buttons) c.ui.props.buttons.forEach(function (b) { if (b.link) targets.push(b.link); });
        targets.forEach(function (l) { if (have[l] && list.indexOf(l) < 0) list.push(l); });
      });
    });
    return list;
  }
  function renderProto() {
    var box = document.getElementById("proto");
    if (!box) return;
    var p = P(), t = findTrace(p, state.route.taskId);
    var list = protoScreens(p, t);
    if (!list.length) { box.innerHTML = '<div class="box empty">화면설계서가 있는 화면이 없어 프로토타입을 만들 수 없습니다.</div>'; return; }
    var cur = state.proto[t.taskId];
    if (list.indexOf(cur) < 0) cur = state.proto[t.taskId] = list[0];
    var sb = p.model.storyboard.screens.find(function (s) { return s.screenId === cur; });
    var wire = screenWire(p, sb, false);
    box.innerHTML = '<div class="proto-bar"><span class="hint">화면</span>' + list.map(function (s) {
      var own = t.screens.indexOf(s) >= 0;
      return '<button class="chip-s' + (s === cur ? " on" : "") + '" data-pscreen="' + esc(s) + '">' + esc(s) + (own ? "" : ' <em>연결</em>') + "</button>";
    }).join("") + "</div>" +
      (wire ? '<div class="proto-frame" id="proto-frame"><div class="zoom z75">' + wire + "</div></div>" : '<div class="box empty">' + esc(sb.systemCode) + " 디자인 시스템 컨셉을 먼저 선택해야 프로토타입을 볼 수 있습니다.</div>") +
      '<p class="hint">화면설계서로 자동 생성한 프로토타입입니다. 목록 행, 버튼을 눌러 이동해 보세요. 필수 항목을 비우고 신청하면 설계한 오류 문구가 나옵니다. <em>연결</em> 표시는 이 Task 화면에서 이동하는 다른 화면입니다.</p>';
  }
  function protoRoot() { var f = document.getElementById("proto-frame"); return f ? f.querySelector(".wf") : null; }
  function protoToast(msg, tone) {
    var root = protoRoot();
    if (!root) return;
    var w = document.createElement("div");
    w.className = "wf-toast-wrap";
    w.innerHTML = Wire.component(null, "toast", { message: msg, tone: tone || "success" });
    root.appendChild(w);
    setTimeout(function () { if (w.parentNode) w.parentNode.removeChild(w); }, 2200);
  }
  function protoOverlay(html) {
    var root = protoRoot();
    if (!root) return;
    var o = document.createElement("div");
    o.className = "wf-overlay";
    o.innerHTML = html;
    root.appendChild(o);
  }
  var pending = null;
  function protoGo(target, msg) {
    var p = P(), t = findTrace(p, state.route.taskId);
    if (p.model.storyboard.screens.some(function (s) { return s.screenId === target; })) {
      state.proto[t.taskId] = target;
      renderProto();
      if (msg) protoToast(msg);
    } else protoToast("화면설계서가 아직 없는 화면입니다: " + target, "danger");
  }
  function protoClick(el) {
    if (el.closest("[data-close]")) { var o = el.closest(".wf-overlay"); if (o) o.parentNode.removeChild(o); return true; }
    if (el.closest("[data-ok]")) {
      var ov = el.closest(".wf-overlay"); if (ov) ov.parentNode.removeChild(ov);
      if (pending) { var pd = pending; pending = null; if (pd.link) protoGo(pd.link, pd.message); else protoToast(pd.message || "처리했습니다."); }
      return true;
    }
    var b = el.closest("[data-action]");
    if (b) {
      var act = b.getAttribute("data-action"), msg = b.getAttribute("data-message");
      if (act === "toast") { protoToast(msg || "저장했습니다."); return true; }
      if (act === "submit") {
        var root = protoRoot(), bad = [];
        root.querySelectorAll("[data-required]").forEach(function (inp) {
          var err = inp.parentNode.querySelector(".wf-err");
          if (!inp.value.trim()) { bad.push(inp); inp.classList.add("invalid"); if (err) { err.textContent = inp.getAttribute("data-msg"); err.hidden = false; } }
          else { inp.classList.remove("invalid"); if (err) err.hidden = true; }
        });
        if (bad.length) {
          protoOverlay(Wire.component(null, "alert-dialog", { title: "입력 내용을 확인해 주세요", message: bad[0].getAttribute("data-msg"), tone: "danger" }));
          return true;
        }
        pending = { link: b.getAttribute("data-link"), message: msg };
        protoOverlay(Wire.component(null, "confirm-dialog", { title: "확인", message: b.getAttribute("data-confirm") || "진행할까요?", confirm: "확인", cancel: "취소" }));
        return true;
      }
    }
    var l = el.closest("[data-link]");
    if (l) { protoGo(l.getAttribute("data-link")); return true; }
    return false;
  }

  // ── 디자인 시스템 ───────────────────────────────
  var SAMPLE_PROPS = {
    gnb: {}, lnb: {}, footer: {}, breadcrumb: { items: ["정보공개", "정보공개 목록"] },
    tabs: { items: ["전체 6", "심사중 2", "반려 1"], active: 0 },
    "step-indicator": { steps: ["자료 입력", "내용 확인", "신청 완료"], current: 1 },
    "search-bar": { placeholder: "검색어를 입력하세요" },
    "search-panel": { fields: [{ label: "기간", type: "date-range" }, { label: "상태", type: "select", options: ["전체"] }, { label: "검색어", type: "text", placeholder: "제목" }] },
    "data-table": { total: 42, columns: ["번호", "제목", "등록일", "상태"], badgeColumn: 3, rows: [["42", "도서관 좌석 이용률", "2026-09-21", "심사중"], ["41", "하천 수질 측정 결과", "2026-09-20", "공개"]] },
    "card-list": { items: [{ title: "도서관 좌석 이용률", meta: "2026-09-21 · 도서관과" }, { title: "하천 수질 측정 결과", meta: "2026-09-20 · 환경과" }] },
    pagination: { total: 128 },
    "detail-table": { rows: [["제목", "하천 수질 측정 결과"], ["공개 구분", "전체공개"]] },
    "status-badge": { label: "심사중" },
    "file-list": { files: ["수질측정결과_2026-09.pdf (840KB)"] },
    "stat-cards": { items: [["신규", "12"], ["심사중", "8"], ["반려", "3"], ["공개", "124"]] },
    "notice-list": { title: "공지사항", items: [["시스템 점검 안내", "09-24"], ["심사 기준 개정", "09-20"]] },
    "empty-state": { message: "조회된 자료가 없습니다." },
    "hero-banner": { title: "누구나 쉽게 찾아보는 공공 정보", text: "정보공개 · 민원신청 · 처리 현황" },
    "quick-links": { items: ["정보공개 청구", "자료 등록", "처리 현황", "알림 신청", "FAQ", "서식"] },
    "login-form": {},
    "text-input": { label: "제목", placeholder: "제목을 입력하세요", required: true },
    textarea: { label: "내용", placeholder: "내용을 입력하세요", required: true },
    select: { label: "분류", options: ["선택하세요"] },
    "radio-group": { label: "공개 구분", options: ["전체공개", "부분공개"], value: "전체공개" },
    "checkbox-group": { label: "약관 동의", options: ["이용약관(필수)", "개인정보 수집(필수)"], values: ["이용약관(필수)"] },
    "date-range": { label: "기간" },
    "file-upload": { label: "첨부파일", hint: "PDF·HWP, 20MB 이하" },
    button: { label: "공개 신청", variant: "primary" },
    "button-group": { buttons: [{ label: "취소", variant: "secondary" }, { label: "등록", variant: "primary" }] },
    "confirm-dialog": { title: "공개 신청", message: "입력한 내용으로 공개를 신청할까요?" },
    "alert-dialog": { title: "알림", message: "제목을 입력해 주세요.", tone: "danger" },
    toast: { message: "저장했습니다." },
    modal: { title: "승인·반려 처리", body: "<p style=\"margin:0\">처리 결과를 선택하세요.</p>" }
  };
  function sample(ds, c, ctx) {
    var props = SAMPLE_PROPS[c.id];
    if (!props) {
      props = {};
      var sbc = null;
      P().model.storyboard.screens.forEach(function (s) { s.components.forEach(function (x) { if (x.ui && x.ui.component === c.id) sbc = x; }); });
      if (sbc) props = sbc.ui.props;
    }
    return '<div class="wf ds-sample" style="' + Wire.vars(ds) + '">' + Wire.component(ds, c.id, props, ctx) + "</div>";
  }
  function thumbs(ds, ctx, scaleCls) {
    return '<div class="thumbs">' + TEMPLATES.map(function (t) {
      return '<figure class="thumb"><div class="thumb-in"><div class="zoom ' + scaleCls + '">' + Wire.template(ds, t[0], ctx) + '</div></div><figcaption>' + t[1] + "</figcaption></figure>";
    }).join("") + "</div>";
  }
  function asDs(concept) { return { tokens: concept.tokens, layout: concept.layout, components: [] }; }
  function swatches(tokens) {
    var c = tokens.color;
    return '<div class="swatches">' + [["주 색", c.primary], ["강조", c.accent], ["메뉴", c.nav], ["배경", c.bg], ["글자", c.text]].map(function (s) {
      return '<span class="sw" title="' + s[0] + " " + s[1] + '"><i style="background:' + s[1] + '"></i>' + s[0] + "</span>";
    }).join("") + "</div>";
  }
  function layoutChips(L) {
    return '<div class="lchips">' + Object.keys(LAYOUT_LABEL).map(function (k) { return '<span class="tag">' + LAYOUT_LABEL[k][0] + " · " + LAYOUT_LABEL[k][1][L[k]] + "</span>"; }).join("") + "</div>";
  }
  function fontName(f) { return f.split(",")[0].replace(/"/g, ""); }

  function renderDesign() {
    var p = P(), systems = p.model.systems.filter(function (s) { return s.hasScreens; });
    if (!systems.length) return '<div class="box empty">화면이 있는 시스템이 없습니다.</div>';
    var code = state.dsSys[p.model.project.code];
    if (!systems.some(function (s) { return s.code === code; })) code = systems[0].code;
    var chips = '<div class="filters">' + systems.map(function (s) {
      var d = designOf(p, s.code);
      return '<button class="fchip" data-dsys="' + esc(s.code) + '" aria-pressed="' + (s.code === code) + '"><i style="background:' + s.color + '"></i>' + esc(s.code + " " + s.name) +
        '<em class="' + (d && d.status === "SELECTED" ? "ok" : "wait") + '">' + (d && d.status === "SELECTED" ? "컨셉 " + esc(d.selectedId) : d ? "선택 대기" : "제안 전") + "</em></button>";
    }).join("") + "</div>";
    var s = sysOf(p, code), d = designOf(p, code), ctx = wireCtx(p, code, null);
    var body;
    if (!d) body = '<div class="box empty">아직 컨셉을 제안받지 않았습니다. 와이어프레임을 그리기 전에 컨셉 3종을 제안받아 하나를 고릅니다.' + copyBox("planning -p " + p.model.project.code + " design propose " + code) + "</div>";
    else if (d.status !== "SELECTED") body = renderProposals(p, d, ctx);
    else body = renderSystemDesign(p, d, ctx);
    return '<section class="section">' + chips + "</section>" + body;
  }

  function renderProposals(p, d, ctx) {
    var cols = d.proposals.map(function (c) {
      var ds = asDs(c);
      return '<article class="box concept"><div class="concept-h"><span class="cid">' + esc(c.id) + '</span><div><b>' + esc(c.name) + "</b><p>" + esc(c.summary) + '</p></div></div><p class="fit"><b>어울리는 경우</b> ' + esc(c.fit) + "</p>" +
        swatches(c.tokens) + '<p class="hint">글꼴 ' + esc(fontName(c.tokens.font.family)) + " · 본문 " + c.tokens.font.scale.body + "px · 버튼 높이 " + c.tokens.control.height + "px</p>" + layoutChips(c.layout) +
        thumbs(ds, ctx, "z20") + '<div class="pick"><span class="hint">이 컨셉으로 정하기</span>' + copyBox("planning -p " + p.model.project.code + " design select " + d.systemCode + " " + c.id) + "</div></article>";
    }).join("");
    return '<div class="note warn"><b>컨셉 선택 대기</b><p class="hint">' + esc(d.systemCode) + " 화면을 그리기 전에 아래 3개 컨셉 중 하나를 고르세요. 컨셉마다 로그인·대시보드·메인·목록·상세·등록·확인 창·알림 창·토스트·모달 팝업을 같은 내용으로 그려 비교합니다. 고른 컨셉으로 디자인 시스템이 만들어집니다.</p></div>" +
      '<div class="concepts">' + cols + "</div>";
  }

  function renderSystemDesign(p, d, ctx) {
    var t = d.tokens, L = d.layout, c = t.color;
    var chosen = d.proposals.find(function (x) { return x.id === d.selectedId; });
    var others = d.proposals.map(function (x) {
      return '<div class="box pmini' + (x.id === d.selectedId ? " on" : "") + '"><span class="cid">' + esc(x.id) + "</span><b>" + esc(x.name) + "</b>" + swatches(x.tokens) + (x.id === d.selectedId ? '<span class="pill DESIGNED">선택</span>' : "") + "</div>";
    }).join("");
    var colors = [["primary", "주 색"], ["onPrimary", "주 색 위 글자"], ["accent", "강조"], ["nav", "메뉴 배경"], ["onNav", "메뉴 글자"], ["bg", "배경"], ["surface", "면"], ["surfaceAlt", "보조 면"], ["border", "선"], ["text", "글자"], ["textMuted", "보조 글자"], ["success", "성공"], ["warning", "주의"], ["danger", "오류"], ["info", "안내"]].map(function (k) {
      return '<div class="color"><i style="background:' + c[k[0]] + '"></i><b>' + k[1] + '</b><span class="mono">' + esc(c[k[0]]) + "</span></div>";
    }).join("");
    var scale = [["display", "메인 비주얼"], ["h1", "화면 제목"], ["h2", "구역 제목"], ["h3", "소제목"], ["body", "본문"], ["small", "보조 본문"], ["caption", "캡션"]];
    var type = scale.map(function (s) {
      return '<div class="type-row"><span class="mono">' + s[0] + " · " + t.font.scale[s[0]] + 'px</span><span style="font-family:' + esc(t.font.family) + ";font-size:" + Math.min(t.font.scale[s[0]], 40) + "px;font-weight:" + (/body|small|caption/.test(s[0]) ? 400 : t.font.weightBold) + '">' + s[1] + " 정보공개 자료 등록</span></div>";
    }).join("");
    var gridCols = "";
    for (var i = 0; i < t.grid.columns; i++) gridCols += "<i></i>";
    var foundation = '<div class="ds-grid2"><div class="box pad"><h3>색상</h3><div class="colors">' + colors + '</div></div><div class="box pad"><h3>글꼴 · ' + esc(fontName(t.font.family)) + "</h3>" + type + "</div></div>" +
      '<div class="ds-grid3"><div class="box pad"><h3>간격·그리드</h3><div class="gridviz">' + gridCols + '</div><p class="hint">' + t.grid.columns + "단 · 최대 폭 " + t.grid.maxWidth + "px · 단 간격 " + t.grid.gutter + "px · 기본 간격 " + t.spacing + "px</p></div>" +
      '<div class="box pad"><h3>모서리·그림자</h3><div class="radii">' + ["sm", "md", "lg"].map(function (k) { return '<span style="border-radius:' + t.radius[k] + "px;box-shadow:" + (t.shadow === "none" ? "none" : "0 2px 8px rgba(0,0,0,.12)") + '">' + k + " " + t.radius[k] + "px</span>"; }).join("") + '</div><p class="hint">그림자: ' + ({ none: "없음", soft: "약하게", strong: "강하게" }[t.shadow]) + "</p></div>" +
      '<div class="box pad"><h3>컨트롤</h3><p class="hint">입력·버튼 높이 ' + t.control.height + "px · 목록 행 높이 " + t.control.rowHeight + "px · 굵은 글자 " + t.font.weightBold + "</p></div></div>";
    var rules = '<div class="box twrap"><table><tbody>' + Object.keys(LAYOUT_LABEL).map(function (k) { return "<tr><th>" + LAYOUT_LABEL[k][0] + "</th><td>" + LAYOUT_LABEL[k][1][L[k]] + "</td></tr>"; }).join("") + "</tbody></table></div>";
    var icons = '<div class="box icons">' + d.icons.map(function (n) { return '<div class="icon"><span style="color:' + c.primary + '">' + Wire.icon(n, 22) + '</span><b>' + esc(Wire.iconLabel[n] || n) + '</b><span class="mono">' + esc(n) + "</span></div>"; }).join("") + "</div>";
    var cats = {};
    d.components.forEach(function (x) { (cats[x.category] = cats[x.category] || []).push(x); });
    var comps = Object.keys(CATEGORY).filter(function (k) { return cats[k]; }).map(function (k) {
      return '<h3 class="cat">' + CATEGORY[k] + " <small>" + cats[k].length + "</small></h3>" + '<div class="comps">' + cats[k].map(function (x) {
        var wide = /gnb|footer|search-panel|data-table|hero-banner|quick-links|stat-cards|step-indicator|review/.test(x.id);
        return '<article class="box comp' + (wide ? " wide" : "") + (x.origin === "ADDED" ? " added" : "") + '"><div class="comp-h"><b>' + esc(x.name) + '</b><span class="mono">' + esc(x.id) + "</span>" +
          (x.origin === "ADDED" ? '<span class="pill IN_DESIGN">추가 · ' + esc(x.addedFor || "") + "</span>" : "") + "</div>" +
          '<p class="hint">' + esc(x.description) + (x.variants.length ? " · 변형: " + x.variants.map(esc).join(", ") : "") + "</p>" +
          '<div class="comp-demo' + (x.id === "gnb" || x.id === "footer" ? " flush" : "") + '">' + sample(d, x, ctx) + "</div></article>";
      }).join("") + "</div>";
    }).join("");
    return '<div class="ds-head box"><div><span class="eyebrow">선택한 컨셉</span><h2>' + esc(chosen.id + ". " + chosen.name) + "</h2><p>" + esc(chosen.summary) + '</p><p class="hint">선택 ' + esc(fmtDate(d.selectedAt)) + " · 컴포넌트 " + d.components.length + "개(추가 " + d.components.filter(function (x) { return x.origin === "ADDED"; }).length + "개) · 아이콘 " + d.icons.length + '개</p></div><div class="pminis">' + others + "</div></div>" +
      '<section class="section"><h2>기초 <small>색상 · 글꼴 · 간격 · 모서리</small></h2>' + foundation + "</section>" +
      '<section class="section"><h2>레이아웃 규칙 <small>GNB · 로고 · 검색 · 목록 · 페이지네이션</small></h2>' + rules + "</section>" +
      '<section class="section"><h2>화면 템플릿 <small>화면설계서가 이 틀로 그려집니다</small></h2>' + thumbs(d, ctx, "z30") + "</section>" +
      '<section class="section"><h2>컴포넌트 <small>' + d.components.length + "개</small></h2>" + comps +
      '<div class="note"><b>새 컴포넌트가 필요할 때</b><p class="hint">화면을 그리다 없는 컴포넌트가 필요하면 먼저 디자인 시스템에 추가한 뒤 화면설계서에서 씁니다. 디자인 시스템에 없는 컴포넌트를 쓰면 검사에서 오류가 납니다.</p>' +
      copyBox("planning -p " + p.model.project.code + " design component-add " + d.systemCode + ' <컴포넌트-id> --name "<이름>" --category data --for <Task ID>') + "</div></section>" +
      '<section class="section"><h2>아이콘 <small>' + d.icons.length + "개</small></h2>" + icons + "</section>";
  }

  // ── 통합: 요구사항 추적표 ──────────────────────
  function sysFilters() {
    return '<div class="filters" aria-label="시스템 구분 필터">' + P().model.systems.map(function (s) {
      return '<button class="fchip" data-sys="' + esc(s.code) + '" aria-pressed="' + sysOn(s.code) + '"><i style="background:' + s.color + '"></i>' + esc(s.code + " " + s.name) + "</button>";
    }).join("") + "</div>";
  }
  function renderRtm() {
    var views = [["matrix", "요구사항 × 시스템"], ["req", "요구사항별"], ["reverse", "화면 역추적"]];
    var bar = '<div class="toolbar"><div class="seg" role="group" aria-label="보기">' + views.map(function (v) {
      return '<button data-view="' + v[0] + '" aria-pressed="' + (state.rtmView === v[0]) + '">' + v[1] + "</button>";
    }).join("") + "</div>" + sysFilters() + "</div>";
    var body = state.rtmView === "req" ? rtmReq() : state.rtmView === "reverse" ? rtmReverse() : rtmMatrix();
    return '<section class="section">' + bar + '<div class="box twrap">' + body + "</div>" +
      '<p class="hint">CSV·JSON 파일: <code>planning rtm --write</code> → 프로젝트 <code>rtm/</code> 폴더</p></section>';
  }
  function rtmMatrix() {
    var p = P(), systems = p.model.systems.filter(function (s) { return sysOn(s.code); });
    var head = "<tr><th>요구사항</th>" + systems.map(function (s) { return "<th>" + sysChip(s.code) + " " + esc(s.name) + "</th>"; }).join("") + "<th>충족</th></tr>";
    var rows = p.rtm.rows.map(function (r) {
      var cells = systems.map(function (s) {
        var c = p.rtm.matrix[r.requirementId][s.code];
        if (!c || !c.taskIds.length) return '<td><span class="dash">—</span></td>';
        var scr = c.screens.length ? '<span class="s">' + c.screens.map(esc).join("<br>") + "</span>" : '<span class="s' + (c.screenless ? "" : " none") + '">' + (c.screenless ? "화면 없음" : "화면 미연결") + "</span>";
        return '<td><div class="cell"><span class="t">' + c.taskIds.map(function (t) { return '<button class="lnk" data-task="' + esc(t) + '">' + esc(shortTask(t, r.requirementId)) + "</button>"; }).join(", ") + "</span>" + scr + "<span>" + pill(c.status) + "</span></div></td>";
      }).join("");
      return "<tr" + (r.status === "EXCLUDED" ? ' class="muted"' : "") + '><td class="req-cell"><span class="id">' + esc(r.requirementId) + "</span><br>" + esc(r.title) + "</td>" + cells + "<td>" + pill(r.status) + "</td></tr>";
    }).join("");
    return "<table><thead>" + head + "</thead><tbody>" + rows + "</tbody></table>";
  }
  function rtmReq() {
    var p = P();
    var head = "<tr><th>요구사항</th><th>Task</th><th>시스템</th><th>처리 내용</th><th>기획안·기능</th><th>화면 ID</th><th>플로우</th><th>스토리보드</th><th>프로토타입</th><th>상태</th><th>확인</th></tr>";
    function list(xs) { return xs.length ? '<div class="ids">' + xs.map(esc).join("<br>") + "</div>" : '<span class="dash">—</span>'; }
    var rows = p.rtm.rows.map(function (r) {
      var tasks = r.tasks.filter(function (t) { return sysOn(t.systemCode); });
      var reqCell = '<td class="req-cell" rowspan="' + Math.max(tasks.length, 1) + '"><span class="id">' + esc(r.requirementId) + "</span><br>" + esc(r.title) + "<br>" + pill(r.status) + "</td>";
      if (!tasks.length) {
        var msg = r.tasks.length ? "필터로 숨김" : r.status === "EXCLUDED" ? "제외: " + esc(r.excludeReason) : "Task 미분해";
        return "<tr" + (r.status === "EXCLUDED" ? ' class="muted"' : "") + ">" + reqCell + '<td colspan="10" class="hint">' + msg + "</td></tr>";
      }
      return tasks.map(function (t, i) {
        return "<tr>" + (i === 0 ? reqCell : "") + '<td class="id"><button class="lnk" data-task="' + esc(t.taskId) + '">' + esc(shortTask(t.taskId, r.requirementId)) + "</button></td><td>" + sysChip(t.systemCode) + "</td><td>" +
          (t.actor ? '<span class="hint">' + esc(t.actor) + "</span><br>" : "") + esc(t.action) + "</td><td>" + list(t.planSections.concat(t.features)) + "</td><td>" +
          (t.screenless && !t.screens.length ? '<span class="hint">화면 없음</span>' : list(t.screens)) + "</td><td>" + list(t.flowNodes) + "</td><td>" + list(t.storyboard) +
          "</td><td>" + list(t.prototype) + "</td><td>" + pill(t.status) + '</td><td class="hint">' + esc(t.reviewer || "") + "</td></tr>";
      }).join("");
    }).join("");
    return "<table><thead>" + head + "</thead><tbody>" + rows + "</tbody></table>";
  }
  function rtmReverse() {
    var p = P();
    var rows = Object.keys(p.rtm.reverse).filter(function (id) { return sysOn(p.rtm.reverse[id].systemCode); }).map(function (id) {
      var e = p.rtm.reverse[id];
      var node = p.model.ia.nodes.find(function (n) { return n.id === id; }) || {};
      var orphan = !e.requirementIds.length && node.change !== "KEPT";
      return "<tr" + (orphan ? ' class="orphan"' : "") + '><td class="id">' + esc(id) + "</td><td>" + sysChip(e.systemCode) + "</td><td>" + esc(e.name) + "</td><td>" +
        '<span class="chg ' + (node.change || "NEW") + '">' + CHG[node.change || "NEW"] + '</span></td><td class="id">' +
        (e.requirementIds.length ? e.requirementIds.map(esc).join("<br>") : orphan ? '<span class="warn-t">요구사항 없음</span>' : '<span class="dash">—</span>') +
        '</td><td class="id">' + (e.taskIds.map(function (t) { return '<button class="lnk" data-task="' + esc(t) + '">' + esc(t) + "</button>"; }).join("<br>") || '<span class="dash">—</span>') + "</td></tr>";
    }).join("");
    return "<table><thead><tr><th>화면 ID</th><th>시스템</th><th>화면명</th><th>구분</th><th>요구사항</th><th>Task</th></tr></thead><tbody>" +
      (rows || '<tr><td colspan="6" class="empty">등록된 화면이 없습니다.</td></tr>') + "</tbody></table>";
  }

  // ── 통합: 정보구조도 ───────────────────────────
  function renderIa() {
    var p = P(), m = p.model;
    var st = {};
    allTasks(p).forEach(function (t) { t.screens.forEach(function (s) { (st[s] = st[s] || []).push(t.status); }); });
    var screens = m.ia.nodes.filter(function (n) { return n.kind !== "MENU"; });
    var done = screens.filter(function (n) { var s = minStatus(st[n.id] || []); return s === "DESIGNED" || s === "REVIEWED"; }).length;
    var cols = m.systems.filter(function (s) { return sysOn(s.code); }).map(function (s) {
      var nodes = m.ia.nodes.filter(function (n) { return n.systemCode === s.code; });
      if (!s.hasScreens) return '<div class="box ia-col"><h3><i style="background:' + s.color + '"></i>' + esc(s.name) + "<span>" + esc(s.code) + '</span></h3><div class="empty">화면 없는 시스템 (프로세스 플로우 레인으로만 표시)</div></div>';
      var ids = {};
      nodes.forEach(function (n) { ids[n.id] = true; });
      function children(pid) { return nodes.filter(function (n) { return (n.parentId && ids[n.parentId] ? n.parentId : null) === pid; }); }
      function li(n) {
        var kids = children(n.id), status = minStatus(st[n.id] || []);
        var tk = n.kind === "MENU" ? "" : n.taskIds.length ? '<span class="tk">' + n.taskIds.map(function (t) { return '<button class="lnk" data-task="' + esc(t) + '">' + esc(t) + "</button>"; }).join(", ") + "</span>" :
          n.change === "KEPT" ? "" : '<span class="tk none">연결된 요구사항 없음</span>';
        return '<li><div class="node ' + n.kind + '"><div class="top">' + (n.kind === "MENU" ? "" : '<span class="sid">' + esc(n.id) + "</span>") +
          '<span class="nm">' + esc(n.name) + "</span>" + (n.kind !== "MENU" && n.kind !== "PAGE" ? '<span class="kind">' + KIND[n.kind] + "</span>" : "") +
          (n.loginRequired ? '<span class="kind">로그인</span>' : "") + '<span class="chg ' + n.change + '">' + CHG[n.change] + "</span>" + (status ? pill(status) : "") + "</div>" + tk +
          (n.changeReason ? '<span class="tk">' + esc(n.changeReason) + "</span>" : "") + "</div>" +
          (kids.length ? "<ul>" + kids.map(li).join("") + "</ul>" : "") + "</li>";
      }
      var roots = children(null);
      var d = selectedDesign(p, s.code);
      return '<div class="box ia-col"><h3><i style="background:' + s.color + '"></i>' + esc(s.name) + "<span>" + esc(s.code) + " · 화면 " + nodes.filter(function (n) { return n.kind !== "MENU"; }).length + (d ? " · 디자인 " + esc(d.selectedId) : "") + "</span></h3>" +
        (roots.length ? '<ul class="tree">' + roots.map(li).join("") + "</ul>" : '<div class="empty">등록된 화면이 없습니다.</div>') + "</div>";
    }).join("");
    return '<section class="section"><div class="toolbar"><p class="hint" style="margin:0">화면 ' + screens.length + "개 중 설계완료 " + done + "개. 화면 옆 상태는 연결된 Task의 진행 상태입니다. Task ID를 누르면 Task 상세로 갑니다.</p>" + sysFilters() + "</div>" +
      (m.project.stages.S2 === "SKIPPED" ? '<p class="hint">기존 메뉴 수정(MODIFY) 프로젝트라 정보구조도 단계는 패스했습니다. 영향받는 기존 화면만 표시합니다.</p>' : "") +
      '<div class="ia-cols">' + cols + "</div></section>";
  }

  // ── 통합: 시스템별 프로세스 플로우 ─────────────
  function renderFlows() {
    var p = P(), flows = p.model.flows;
    if (!flows.length) return '<div class="box empty">아직 작성된 플로우가 없습니다. Task별 플로우가 다이어그램 단계(S3)에서 만들어지면 여기로 통합됩니다.</div>';
    var withLanes = p.model.systems.filter(function (s) { return flows.some(function (f) { return f.lanes.some(function (l) { return l.systemCode === s.code; }); }); });
    var cur = state.flowSys;
    var chips = '<div class="filters"><button class="fchip" data-fsys="ALL" aria-pressed="' + (cur === "ALL") + '">전체 통합</button>' + withLanes.map(function (s) {
      return '<button class="fchip" data-fsys="' + esc(s.code) + '" aria-pressed="' + (cur === s.code) + '"><i style="background:' + s.color + '"></i>' + esc(s.code + " " + s.name) + "</button>";
    }).join("") + "</div>";
    var body = flows.map(function (f) {
      var g = cur === "ALL" ? f : Flow.forSystem(f, cur);
      if (!g) return "";
      return '<section class="section"><h2>' + esc(f.title) + " <small>" + esc(f.id) + (cur === "ALL" ? " · 전체 시스템" : " · " + esc(cur) + " 영역만") + '</small></h2><div class="box flow-box">' + Flow.svg(g, { color: sysColor }) + "</div></section>";
    }).join("") || '<div class="box empty">이 시스템이 들어간 플로우가 없습니다.</div>';
    return '<section class="section">' + chips + '<p class="hint">시스템을 고르면 그 시스템 레인만 남기고, 다른 시스템으로 넘어가는 지점은 “→ 다른 시스템” 연결 노드로 보여 줍니다. 점선 화살표는 되돌아가는 흐름입니다.</p></section>' + body;
  }

  // ── 버전 ───────────────────────────────────────
  function renderVer() {
    var p = P(), pr = p.model.project;
    var snaps = p.snapshots.map(function (s) {
      return '<div class="box snap"><span class="v">v' + esc(s.version) + '</span><span class="d">' + esc(fmtDate(s.takenAt)) + "</span><span>" + esc(s.note || "—") + "</span></div>";
    }).join("") + '<div class="box snap current"><span class="v">v' + esc(pr.version) + ' (작업 중)</span><span class="d">마지막 저장 ' + esc(fmtDate(pr.updatedAt)) + "</span><span>현재 모델</span></div>";
    var diff;
    if (!p.diff) diff = '<div class="box empty">스냅샷이 없습니다. 기준 버전을 고정하면 이후 변경 사항을 비교할 수 있습니다.' + copyBox('planning -p ' + pr.code + ' snapshot --note "착수 기준선"') + "</div>";
    else {
      var groups = Object.keys(p.diff.entries);
      if (!groups.length) diff = '<div class="box empty">v' + esc(p.diff.from) + " 이후 변경 사항이 없습니다.</div>";
      else diff = '<div class="box">' + groups.map(function (g) {
        var e = p.diff.entries[g];
        var rows = e.added.map(function (id) { return '<div class="drow"><span class="k add">추가</span><code>' + esc(id) + "</code></div>"; })
          .concat(e.removed.map(function (id) { return '<div class="drow"><span class="k del">삭제</span><code>' + esc(id) + "</code></div>"; }))
          .concat(e.changed.map(function (c) {
            return '<div><div class="drow"><span class="k chg">변경</span><code>' + esc(c.id) + '</code></div><div class="fields">' + c.fields.map(function (fd) {
              return "<span>" + esc(fd.path) + ": <del>" + esc(val(fd.before)) + "</del> → <ins>" + esc(val(fd.after)) + "</ins></span>";
            }).join("") + "</div></div>";
          }));
        return '<div class="diff-group"><h3>' + esc(COLL[g] || g) + "</h3>" + rows.join("") + "</div>";
      }).join("") + "</div>";
    }
    return '<section class="section"><h2>스냅샷</h2><div class="snaps">' + snaps + "</div></section>" +
      '<section class="section"><h2>변경 사항' + (p.diff ? " <small>v" + esc(p.diff.from) + " → 현재 v" + esc(pr.version) + "</small>" : "") + "</h2>" + diff + "</section>";
  }
  function val(v) { return v === undefined ? "(없음)" : typeof v === "string" ? v : JSON.stringify(v); }

  // ── 이벤트 ─────────────────────────────────────
  function go(route) { state.route = route; persist(); render(); window.scrollTo(0, 0); }
  document.addEventListener("click", function (ev) {
    var target = ev.target;
    var frame = target.closest && target.closest("#proto-frame");
    if (frame) { if (protoClick(target)) ev.preventDefault(); return; }
    var t = target.closest("button");
    if (!t) return;
    var d = t.dataset, r = state.route;
    if (d.copy != null) {
      var done = function () { t.textContent = "복사함"; setTimeout(function () { t.textContent = "복사"; }, 1500); };
      try {
        navigator.clipboard.writeText(d.copy).then(done, function () { selectText(t.previousElementSibling); });
      } catch (e) { selectText(t.previousElementSibling); }
      return;
    }
    if (d.nav === "home") go({ view: "home" });
    else if (d.open != null) go({ view: "project", p: Number(d.open), page: "dash" });
    else if (d.task) go({ view: "task", p: r.p, taskId: d.task, tab: r.view === "task" ? r.tab || "flow" : "flow" });
    else if (d.page) {
      if (d.dsys) state.dsSys[P().model.project.code] = d.dsys;
      go({ view: "project", p: r.p, page: d.page });
    }
    else if (d.ttab) { r.tab = d.ttab; persist(); render(); }
    else if (d.view) { state.rtmView = d.view; persist(); render(); }
    else if (d.sys) { var key = P().model.project.code + ":" + d.sys; state.off[key] = !state.off[key]; render(); }
    else if (d.fsys) { state.flowSys = d.fsys; render(); }
    else if (d.dsys) { state.dsSys[P().model.project.code] = d.dsys; render(); }
    else if (d.pscreen) { state.proto[r.taskId] = d.pscreen; renderProto(); }
  });
  function selectText(el) {
    if (!el) return;
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  document.addEventListener("input", function (ev) {
    if (ev.target.id === "kb-q") { state.kbQ = ev.target.value; runSearch(); }
  });
  document.addEventListener("change", function (ev) {
    if (ev.target.id !== "lnb-select") return;
    var v = ev.target.value;
    if (v === "home") go({ view: "home" });
    else if (v.charAt(0) === "p" && /^p\d+$/.test(v)) go({ view: "project", p: Number(v.slice(1)), page: "dash" });
    else go({ view: "project", p: state.route.p, page: v });
  });
  render();
})();
