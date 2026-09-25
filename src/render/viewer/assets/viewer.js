(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("planning-data").textContent);
  // 저장소 기준 모델. AI 적용본(overlay)은 이 위에 덧씌워 p.model을 만든다
  DATA.projects.forEach(function (p) { p.base = JSON.parse(JSON.stringify(p.model)); });
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

  // ── 실제 규격 스테이지 ─────────────────────────
  // 설계 화면은 항상 1920px 폭으로 배치한 뒤 통째로 축소한다(transform). 반응형 재배치가 없으므로 줄바꿈이 생기지 않는다.
  var VW = DATA.viewport ? DATA.viewport.width : 1920, VH = DATA.viewport ? DATA.viewport.height : 1080;
  function stage(html, o) {
    o = o || {};
    var w = o.w || VW, h = o.h;
    var cls = "stage-in " + (h ? "fixed" : "full") + (o.page ? " pg" : "");
    return '<div class="stage' + (o.cls ? " " + o.cls : "") + '" data-w="' + w + '"' + (h ? ' data-h="' + h + '"' : "") + (o.max ? ' data-max="' + o.max + '"' : "") + '><div class="' + cls + '" style="width:' + w + "px" + (h ? ";height:" + h + "px" : "") + '">' + html +
      (o.page ? '<div class="fold" style="top:' + VH + 'px"><span>' + VH + "px · 첫 화면 끝</span></div>" : "") + "</div></div>" +
      (o.cap === false ? "" : '<div class="stage-cap"><span>' + esc(o.label || (w + " × " + (h || "가변"))) + '</span><span class="pct"></span></div>');
  }
  function fitStages(root) {
    (root || document).querySelectorAll(".stage").forEach(function (st) {
      var inner = st.firstElementChild, w = Number(st.dataset.w), avail = st.clientWidth;
      if (!avail || !inner) return;
      var sc = Math.min(Number(st.dataset.max || 1), avail / w);
      inner.style.transform = "scale(" + sc + ")";
      var h = st.dataset.h ? Number(st.dataset.h) : inner.offsetHeight;
      st.style.height = Math.ceil(h * sc) + "px";
      st.dataset.sc = sc;
      if (st.classList.contains("rv")) placeMarks(st);
      var fold = inner.querySelector(":scope > .fold");
      if (fold) fold.hidden = inner.offsetHeight <= VH + 4;
      var cap = st.nextElementSibling;
      if (cap && cap.classList.contains("stage-cap")) cap.querySelector(".pct").textContent = "실제 크기의 " + Math.round(sc * 1000) / 10 + "%";
    });
  }
  var previews = [];
  function previewBtn(title, html, h, label) {
    previews.push({ title: title, html: html, h: h });
    return '<button class="btn-sm" data-preview="' + (previews.length - 1) + '">' + esc(label || "크게 보기") + "</button>";
  }
  function aiBtn(key, label) {
    var p = P();
    if (!p.prompts || !p.prompts[key]) return "";
    return '<button class="ai-btn" data-ai="' + esc(key) + '"><span aria-hidden="true">✦</span> ' + esc(label || "AI 요청") + "</button>";
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
    previews = [];
    renderLnb();
    var r = state.route, html;
    if (r.view === "home") html = renderHome();
    else if (r.view === "task") html = renderTask();
    else {
      var info = PAGES[r.page] || PAGES.dash, pr = P().model.project;
      html = '<header class="page-head"><span class="eyebrow">' + esc(pr.name) + '</span><h1>' + info[0] + "</h1><p>" + esc(info[1]) + "</p></header>" + overlayBanner() + renderPage(r.page);
    }
    document.getElementById("main").innerHTML = html;
    afterRender();
  }
  function overlayBanner() {
    var p = P();
    if (!p.appliedCount) return "";
    var list = Object.keys(overlays).map(function (k) { return overlays[k]; }).filter(function (o) { return o.project === p.model.project.code && o.applied; });
    return '<div class="note ov"><b>AI 적용본 ' + list.length + '건이 반영된 화면입니다</b><p class="hint">' + list.map(function (o) { return esc((p.gens[o.kind + ":" + o.target] || {}).title || o.target) + " v" + o.applied; }).join(" · ") +
      ". 저장소 반영 전이라 요구사항 추적표·누락 수치는 저장소 기준입니다. 저장소에 반영하려면 Claude에 “뷰어의 AI 적용본을 저장소에 반영해 줘”라고 요청하거나 JSON을 <code>planning gen apply</code>로 넣으세요.</p></div>";
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
    fitStages();
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
    return overlayBanner() + '<header class="page-head"><nav class="crumbs"><button data-page="req">요구사항·Task</button><span>›</span><span>' + esc(row.requirementId) + " " + esc(row.title) + "</span></nav>" +
      '<h1><span class="mono">' + esc(shortTask(t.taskId, row.requirementId)) + "</span> " + esc(t.action) + "</h1>" +
      '<div class="meta">' + sysChip(t.systemCode) + '<span class="tag">' + esc((sysOf(p, t.systemCode) || {}).name || "") + "</span>" + (t.actor ? '<span class="tag">행위자 ' + esc(t.actor) + "</span>" : "") + pill(t.status) + '<span class="tag mono">' + esc(t.taskId) + "</span></div></header>" +
      '<dl class="box info">' + info.map(function (i) { return "<div><dt>" + i[0] + "</dt><dd>" + i[1] + "</dd></div>"; }).join("") + "</dl>" +
      '<nav class="tabs" role="tablist">' + tabs.map(function (x) { return '<button class="tab" role="tab" data-ttab="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</nav>" +
      '<div class="panel">' + body + "</div>";
  }

  function taskFlow(p, t) {
    var fbar = '<div class="ai-bar">' + genBtn("flow:" + t.requirementId, "이 요구사항 플로우 AI 생성·조정") + "</div>";
    return fbar + taskFlowBody(p, t);
  }
  function taskFlowBody(p, t) {
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
      if (!sb) return '<article class="box sheet">' + headRow + '<div class="empty">화면설계서가 아직 없습니다. 이 화면은 요구사항 추적표에서 “스토리보드 미작성”으로 잡힙니다.<div class="ai-bar center">' + genBtn("sb:" + sid, "AI로 화면설계서 생성") + "</div></div></article>";
      var wire = screenWire(p, sb, true);
      var ds = designOf(p, sb.systemCode);
      var left = wire ? '<div class="wire-box">' + stage(wire, { page: true, label: VW + " × 가변 (첫 화면 " + VH + ")" }) + "</div>" :
        '<div class="wire-missing"><b>와이어프레임을 그릴 수 없습니다</b><p class="hint">' + esc(sb.systemCode) + " 디자인 시스템 컨셉이 " + (ds ? "아직 선택되지 않았습니다(제안 3종 검토 중)." : "아직 제안되지 않았습니다.") + " 오른쪽 설명만 글로 작성된 상태입니다.</p><button class=\"btn-sm\" data-page=\"design\" data-dsys=\"" + esc(sb.systemCode) + '">디자인 시스템 보기</button></div>';
      var desc = '<table class="desc"><thead><tr><th>No</th><th>항목</th><th>설명</th><th>옵션·유효성</th></tr></thead><tbody>' + sb.components.map(function (c) {
        return '<tr><td><span class="no">' + c.no + "</span></td><td><b>" + esc(c.label) + '</b><br><span class="hint mono">' + esc(c.ui ? c.ui.component : c.kind) + "</span>" + (c.ui && c.ui.link ? '<br><span class="hint">→ ' + esc(c.ui.link) + "</span>" : "") + "</td><td>" + descCell(c) + "</td><td>" + ruleCell(c) + "</td></tr>";
      }).join("") + "</tbody></table>";
      var bar = '<div class="sheet-bar"><b>화면설계서</b><span class="hint mono">' + esc(sid) + '</span><span class="sp"></span>' + (wire ? previewBtn(sid + " " + sb.title, wire, null, "실제 규격 크게 보기") : "") + genBtn("sb:" + sid, appliedOverlay("sb:" + sid) ? "AI 적용본 v" + appliedOverlay("sb:" + sid).applied + " · 조정" : "AI 생성·조정") + aiBtn("sb:" + sid, "AI 요청 · Figma / Claude") + "</div>" + revBadge(p, sb);
      return '<article class="box sheet">' + bar + headRow + '<div class="sheet-body">' + left + '<div class="desc-wrap">' + desc + "</div></div></article>";
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
    var wire = screenWire(p, sb, false), ds = selectedDesign(p, sb.systemCode);
    box.innerHTML = '<div class="proto-bar"><span class="hint">화면</span>' + list.map(function (s) {
      var own = t.screens.indexOf(s) >= 0;
      return '<button class="chip-s' + (s === cur ? " on" : "") + '" data-pscreen="' + esc(s) + '">' + esc(s) + (own ? "" : ' <em>연결</em>') + "</button>";
    }).join("") + '<span class="sp"></span>' + aiBtn("proto:" + t.taskId, "AI 요청 · Figma / Claude") + "</div>" +
      (wire ? '<div class="proto-frame" id="proto-frame">' + stage('<div class="wf-vp" style="' + Wire.vars(ds) + '">' + wire + "</div>", { w: VW, h: VH, label: VW + " × " + VH + " 뷰포트 · 화면 안에서 스크롤" }) + "</div>" : '<div class="box empty">' + esc(sb.systemCode) + " 디자인 시스템 컨셉을 먼저 선택해야 프로토타입을 볼 수 있습니다.</div>") +
      '<p class="hint">원본 ' + VW + "×" + VH + ' 화면을 비율만 줄여 보여 줍니다. 화면설계서로 자동 생성한 프로토타입입니다. 목록 행, 버튼을 눌러 이동해 보세요. 필수 항목을 비우고 신청하면 설계한 오류 문구가 나옵니다. <em>연결</em> 표시는 이 Task 화면에서 이동하는 다른 화면입니다.</p>';
    fitStages(box);
  }
  function protoRoot() { var f = document.getElementById("proto-frame"); return f ? f.querySelector(".wf-vp") : null; }
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
  var FULLW = { gnb: 1, footer: 1 };
  var WIDE = /search-panel|data-table|card-list|hero-banner|quick-links|stat-cards|step-indicator|tabs|detail-table|notice-list|breadcrumb|review/;
  function sampleRaw(ds, c, ctx) {
    var props = SAMPLE_PROPS[c.id];
    if (!props) {
      props = {};
      P().model.storyboard.screens.forEach(function (s) { s.components.forEach(function (x) { if (x.ui && x.ui.component === c.id) props = x.ui.props; }); });
    }
    var w = FULLW[c.id] ? VW : WIDE.test(c.id) || !SAMPLE_PROPS[c.id] ? ds.tokens.grid.maxWidth : 560;
    return { w: w, html: '<div class="wf ds-sample' + (FULLW[c.id] ? " flush" : "") + '" style="' + Wire.vars(ds) + '">' + Wire.component(ds, c.id, props, ctx) + "</div>" };
  }
  function sample(ds, c, ctx) {
    var props = SAMPLE_PROPS[c.id];
    if (!props) {
      props = {};
      var sbc = null;
      P().model.storyboard.screens.forEach(function (s) { s.components.forEach(function (x) { if (x.ui && x.ui.component === c.id) sbc = x; }); });
      if (sbc) props = sbc.ui.props;
    }
    var w = FULLW[c.id] ? VW : WIDE.test(c.id) || !SAMPLE_PROPS[c.id] ? ds.tokens.grid.maxWidth : 560;
    var html = '<div class="wf ds-sample' + (FULLW[c.id] ? " flush" : "") + '" style="' + Wire.vars(ds) + '">' + Wire.component(ds, c.id, props, ctx) + "</div>";
    return stage(html, { w: w, label: FULLW[c.id] ? "뷰포트 폭 " + w + "px" : w === 560 ? "기준 폭 560px" : "콘텐츠 최대 폭 " + w + "px" });
  }
  function thumbs(ds, ctx, title, reviewCode) {
    return '<div class="thumbs">' + TEMPLATES.map(function (t) {
      var html = Wire.template(ds, t[0], ctx);
      previews.push({ title: (title ? title + " · " : "") + t[1], html: html, h: VH });
      if (reviewCode) {
        var n = openComments(P(), reviewCode, "tpl:" + t[0]).length;
        return '<figure class="thumb"><div class="thumb-in" role="button" tabindex="0"' + reviewBtnAttrs("tpl", "tpl:" + t[0], t[1]) + ' aria-label="' + esc(t[1]) + ' 검토·댓글">' + stage(html, { w: VW, h: VH, cap: false }) + "</div><figcaption>" + t[1] + (n ? ' <span class="pill IN_DESIGN">댓글 ' + n + "</span>" : "") + '<span class="hint">' + VW + "×" + VH + "</span></figcaption></figure>";
      }
      // 미리보기 안에 버튼이 있으므로 감싸는 요소는 button이 아니라 role=button (버튼 중첩 금지)
      return '<figure class="thumb"><div class="thumb-in" role="button" tabindex="0" data-preview="' + (previews.length - 1) + '" aria-label="' + esc(t[1]) + ' 실제 규격으로 크게 보기">' + stage(html, { w: VW, h: VH, cap: false }) + "</div><figcaption>" + t[1] + '<span class="hint">' + VW + "×" + VH + "</span></figcaption></figure>";
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
    return '<section class="section"><div class="toolbar">' + chips + aiBtn("ds:" + code, "AI 요청 · Figma / Claude") + "</div></section>" + body;
  }

  function renderProposals(p, d, ctx) {
    var cols = d.proposals.map(function (c) {
      var ds = asDs(c);
      return '<article class="box concept"><div class="concept-h"><span class="cid">' + esc(c.id) + '</span><div><b>' + esc(c.name) + "</b><p>" + esc(c.summary) + '</p></div></div><p class="fit"><b>어울리는 경우</b> ' + esc(c.fit) + "</p>" +
        swatches(c.tokens) + '<p class="hint">글꼴 ' + esc(fontName(c.tokens.font.family)) + " · 본문 " + c.tokens.font.scale.body + "px · 버튼 높이 " + c.tokens.control.height + "px</p>" + layoutChips(c.layout) +
        thumbs(ds, ctx, c.id + ". " + c.name) + '<div class="pick"><span class="hint">이 컨셉으로 정하기</span>' + copyBox("planning -p " + p.model.project.code + " design select " + d.systemCode + " " + c.id) + "</div></article>";
    }).join("");
    return '<div class="note warn"><b>컨셉 선택 대기</b><p class="hint">' + esc(d.systemCode) + " 화면을 그리기 전에 아래 3개 컨셉 중 하나를 고르세요. 미리보기는 모두 " + VW + "×" + VH + " 실제 규격을 축소한 것이고, 누르면 크게 볼 수 있습니다. 컨셉마다 로그인·대시보드·메인·목록·상세·등록·확인 창·알림 창·토스트·모달 팝업을 같은 내용으로 그려 비교합니다. 고른 컨셉으로 디자인 시스템이 만들어집니다.</p></div>" +
      '<div class="concepts">' + cols + "</div>";
  }

  // ── 디자인 시스템: 섹션별 조정 · 이미지 댓글 ─────
  function secTune(code, scope, ph) {
    var sc = scopeInfo(scope);
    return '<div class="sec-tune"><span class="st-label"><span aria-hidden="true">✦</span> ' + esc(sc.label) + ' 조정</span><input id="st-' + esc(scope.replace(/[^a-z0-9-]/gi, "_")) + '" type="text" autocomplete="off" placeholder="' + esc(ph || sc.hint) + '" data-stin="' + esc(scope) + '" aria-label="' + esc(sc.label) + ' 조정 요청"><button class="btn-sm" data-strun="' + esc(scope) + '" data-sys="' + esc(code) + '">생성</button></div>';
  }
  function scopeInfo(id) {
    if (id.indexOf("cmp:") === 0) { var cid = id.slice(4); return { id: id, label: "컴포넌트 " + cid, allowed: ["componentStyles." + cid], hint: cid + "의 스타일 변수만" }; }
    return DATA.design.scopes.find(function (x) { return x.id === id; }) || DATA.design.scopes[0];
  }
  function styleVarsOf(cid) { return DATA.design.styleVars[cid] || DATA.design.addedVars; }
  function openComments(p, code, targetId) {
    var r = reviewsOf(p, code);
    return (r.items || []).filter(function (x) { return x.status === "open" && (!targetId || x.target.id === targetId); });
  }
  function reviewBtnAttrs(type, id, label) { return ' data-review="' + esc(type + "|" + id + "|" + label) + '"'; }

  function renderSystemDesign(p, d, ctx) {
    var t = d.tokens, L = d.layout, c = t.color, code = d.systemCode;
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
    var box = function (title, scope, body, ph) { return '<div class="box pad"><h3>' + title + "</h3>" + body + secTune(code, scope, ph) + "</div>"; };
    var foundation = '<div class="ds-grid2">' + box("색상", "colors", '<div class="colors">' + colors + "</div>", "예: 주 색을 조금 더 진한 파랑으로, 오류 색은 더 붉게") +
      box("글꼴 · " + esc(fontName(t.font.family)), "type", type, "예: 화면 제목을 2px 키우고 본문은 16px로") + "</div>" +
      '<div class="ds-grid3">' + box("간격·그리드", "spacing", '<div class="gridviz">' + gridCols + '</div><p class="hint">' + t.grid.columns + "단 · 최대 폭 " + t.grid.maxWidth + "px · 단 간격 " + t.grid.gutter + "px · 기본 간격 " + t.spacing + "px</p>", "예: 콘텐츠 최대 폭을 1280px로") +
      box("모서리·그림자", "shape", '<div class="radii">' + ["sm", "md", "lg"].map(function (k) { return '<span style="border-radius:' + t.radius[k] + "px;box-shadow:" + (t.shadow === "none" ? "none" : "0 2px 8px rgba(0,0,0,.12)") + '">' + k + " " + t.radius[k] + "px</span>"; }).join("") + '</div><p class="hint">그림자: ' + ({ none: "없음", soft: "약하게", strong: "강하게" }[t.shadow]) + "</p>", "예: 모서리를 조금 더 둥글게") +
      box("컨트롤", "control", '<p class="hint">입력·버튼 높이 ' + t.control.height + "px · 목록 행 높이 " + t.control.rowHeight + "px · 굵은 글자 " + t.font.weightBold + "</p>", "예: 목록 행 높이를 44px로") + "</div>";
    var rules = '<div class="box twrap"><table><tbody>' + Object.keys(LAYOUT_LABEL).map(function (k) { return "<tr><th>" + LAYOUT_LABEL[k][0] + "</th><td>" + LAYOUT_LABEL[k][1][L[k]] + "</td></tr>"; }).join("") + "</tbody></table></div>" + secTune(code, "layout", "예: 페이지네이션에 목록 개수 선택을 넣고, 버튼을 둥글게");
    var icons = '<div class="box icons">' + d.icons.map(function (n) { return '<div class="icon"><span style="color:' + c.primary + '">' + Wire.icon(n, 22) + '</span><b>' + esc(Wire.iconLabel[n] || n) + '</b><span class="mono">' + esc(n) + "</span></div>"; }).join("") + "</div>";
    var cats = {};
    d.components.forEach(function (x) { (cats[x.category] = cats[x.category] || []).push(x); });
    var cs = d.componentStyles || {};
    var comps = Object.keys(CATEGORY).filter(function (k) { return cats[k]; }).map(function (k) {
      return '<h3 class="cat">' + CATEGORY[k] + " <small>" + cats[k].length + "</small></h3>" + '<div class="comps">' + cats[k].map(function (x) {
        var wide = /gnb|footer|search-panel|data-table|hero-banner|quick-links|stat-cards|step-indicator|review/.test(x.id);
        var cur = cs[x.id] ? Object.keys(cs[x.id]).map(function (vn) { return '<span class="tag mono">' + esc(vn) + " " + esc(cs[x.id][vn]) + "</span>"; }).join("") : "";
        var nOpen = openComments(p, code, "cmp:" + x.id).length;
        return '<article class="box comp' + (wide ? " wide" : "") + (x.origin === "ADDED" ? " added" : "") + '"><div class="comp-h"><b>' + esc(x.name) + '</b><span class="mono">' + esc(x.id) + "</span>" +
          (x.origin === "ADDED" ? '<span class="pill IN_DESIGN">추가 · ' + esc(x.addedFor || "") + "</span>" : "") + (nOpen ? '<span class="pill IN_DESIGN">댓글 ' + nOpen + "</span>" : "") + "</div>" +
          '<p class="hint">' + esc(x.description) + (x.variants.length ? " · 변형: " + x.variants.map(esc).join(", ") : "") + "</p>" + (cur ? '<div class="lchips">' + cur + "</div>" : "") +
          '<div class="comp-demo rv-open' + (x.id === "gnb" || x.id === "footer" ? " flush" : "") + '" role="button" tabindex="0"' + reviewBtnAttrs("cmp", "cmp:" + x.id, x.name) + ' title="눌러서 댓글 달기">' + sample(d, x, ctx) + "</div>" +
          secTune(code, "cmp:" + x.id, "예: " + (styleVarsOf(x.id)[0] ? styleVarsOf(x.id)[0].label + " 바꾸기" : "모양 바꾸기")) + "</article>";
      }).join("") + "</div>";
    }).join("");
    var allOpen = openComments(p, code);
    var tune = p.gens["ds:" + code] ? '<section class="box tune"><div class="tune-h"><b>전역 · 새 컴포넌트</b><span class="pill DESIGNED mono">r' + d.revision + '</span><span class="hint">새 컴포넌트를 만들거나 여러 섹션에 걸쳐 바꿀 때 씁니다. 한 부분만 고칠 때는 각 섹션의 “조정” 입력란이나 이미지 댓글을 쓰세요. 적용하면 이 디자인 시스템을 쓰는 화면 ' + p.model.storyboard.screens.filter(function (x) { return x.systemCode === code; }).length + "개가 컴포넌트 단위로 한꺼번에 바뀝니다.</span></div>" +
      '<label class="sr" for="ds-tune">전역 조정 요청</label><textarea id="ds-tune" rows="2" placeholder="예: 공지 강조용 ‘안내 상자’ 컴포넌트를 추가해 줘 (제목·본문·아이콘, 정보/주의 변형)"></textarea>' +
      '<div class="tune-f">' + dsHistory(d) + '<span class="sp"></span>' + (dsUndoable(code) ? '<button class="btn-sm" data-dsundo="' + esc(code) + '">마지막 적용 되돌리기</button>' : "") + '<button class="btn-primary" data-dstune="' + esc(code) + '">전역 조정 생성</button></div></section>' : "";
    var cbar = '<div class="note cmt-bar"><div><b>이미지 댓글</b><p class="hint">화면 템플릿이나 컴포넌트 이미지를 누르면 실제 규격 검토 화면이 열립니다. 고칠 곳을 누르거나 “번호 라벨 보기”로 요소 번호를 눌러 댓글을 남기고, 모은 댓글로 수정 요청을 만듭니다.</p></div>' +
      (allOpen.length ? '<button class="btn-primary" data-cmtgen="' + esc(code) + '|">열린 댓글 ' + allOpen.length + "개로 수정 요청</button>" : '<span class="hint">열린 댓글 없음</span>') + "</div>";
    return tune + cbar + '<div class="ds-head box"><div><span class="eyebrow">선택한 컨셉 · 개정 r' + d.revision + '</span><h2>' + esc(chosen.id + ". " + chosen.name) + "</h2><p>" + esc(chosen.summary) + '</p><p class="hint">선택 ' + esc(fmtDate(d.selectedAt)) + " · 컴포넌트 " + d.components.length + "개(추가 " + d.components.filter(function (x) { return x.origin === "ADDED"; }).length + "개) · 아이콘 " + d.icons.length + '개</p></div><div class="pminis">' + others + "</div></div>" +
      '<section class="section"><h2>기초 <small>색상 · 글꼴 · 간격 · 모서리 · 컨트롤 — 섹션마다 조정 입력란</small></h2>' + foundation + "</section>" +
      '<section class="section"><h2>레이아웃 규칙 <small>GNB · 로고 · 검색 · 목록 · 페이지네이션</small></h2>' + rules + "</section>" +
      '<section class="section"><h2>화면 템플릿 <small>' + VW + "×" + VH + " 뷰포트를 그대로 축소 · 누르면 검토·댓글</small></h2>" + thumbs(d, ctx, chosen.name, code) + secTune(code, "templates", "예: 목록 화면의 검색 영역과 표 사이 여백을 넓게") + "</section>" +
      '<section class="section"><h2>컴포넌트 <small>' + d.components.length + "개 · 이미지를 누르면 댓글, 입력란으로 스타일 조정</small></h2>" + comps + "</section>" +
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
  function statusByScreen(p) {
    var st = {};
    allTasks(p).forEach(function (t) { t.screens.forEach(function (s) { (st[s] = st[s] || []).push(t.status); }); });
    return st;
  }
  /** 정보구조 트리. mark: {added:{id:true}} 이면 추가 노드를 강조 */
  function iaTree(nodes, st, mark) {
    var ids = {};
    nodes.forEach(function (n) { ids[n.id] = true; });
    function children(pid) { return nodes.filter(function (n) { return (n.parentId && ids[n.parentId] ? n.parentId : null) === pid; }); }
    function li(n) {
      var kids = children(n.id), status = minStatus(st[n.id] || []);
      var tk = n.kind === "MENU" ? "" : n.taskIds.length ? '<span class="tk">' + n.taskIds.map(function (t) { return mark ? esc(t) : '<button class="lnk" data-task="' + esc(t) + '">' + esc(t) + "</button>"; }).join(", ") + "</span>" :
        n.change === "KEPT" ? "" : '<span class="tk none">연결된 요구사항 없음</span>';
      return '<li><div class="node ' + n.kind + (mark && mark.added[n.id] ? " gen-added" : "") + '"><div class="top">' + (n.kind === "MENU" ? "" : '<span class="sid">' + esc(n.id) + "</span>") +
        '<span class="nm">' + esc(n.name) + "</span>" + (n.kind !== "MENU" && n.kind !== "PAGE" ? '<span class="kind">' + (KIND[n.kind] || n.kind) + "</span>" : "") +
        (n.loginRequired ? '<span class="kind">로그인</span>' : "") + '<span class="chg ' + n.change + '">' + (CHG[n.change] || n.change) + "</span>" + (status && !mark ? pill(status) : "") + (mark && mark.added[n.id] ? '<span class="pill IN_DESIGN">AI 추가</span>' : "") + "</div>" + tk +
        (n.changeReason ? '<span class="tk">' + esc(n.changeReason) + "</span>" : "") + "</div>" +
        (kids.length ? "<ul>" + kids.map(li).join("") + "</ul>" : "") + "</li>";
    }
    var roots = children(null);
    return roots.length ? '<ul class="tree">' + roots.map(li).join("") + "</ul>" : '<div class="empty">등록된 화면이 없습니다.</div>';
  }
  function renderIa() {
    var p = P(), m = p.model;
    var st = statusByScreen(p);
    var screens = m.ia.nodes.filter(function (n) { return n.kind !== "MENU"; });
    var done = screens.filter(function (n) { var s = minStatus(st[n.id] || []); return s === "DESIGNED" || s === "REVIEWED"; }).length;
    var cols = m.systems.filter(function (s) { return sysOn(s.code); }).map(function (s) {
      var nodes = m.ia.nodes.filter(function (n) { return n.systemCode === s.code; });
      if (!s.hasScreens) return '<div class="box ia-col"><h3><i style="background:' + s.color + '"></i>' + esc(s.name) + "<span>" + esc(s.code) + '</span></h3><div class="empty">화면 없는 시스템 (프로세스 플로우 레인으로만 표시)</div></div>';
      var d = selectedDesign(p, s.code), ov = appliedOverlay("ia:" + s.code);
      return '<div class="box ia-col"><h3><i style="background:' + s.color + '"></i>' + esc(s.name) + "<span>" + esc(s.code) + " · 화면 " + nodes.filter(function (n) { return n.kind !== "MENU"; }).length + (d ? " · 디자인 " + esc(d.selectedId) : "") + "</span></h3>" +
        '<div class="col-tools">' + genBtn("ia:" + s.code, ov ? "AI 적용본 v" + ov.applied + " · 조정" : "AI 생성·조정") + "</div>" + iaTree(nodes, st) + "</div>";
    }).join("");
    var aiBar = '<div class="ai-bar"><span class="hint">AI 요청(프롬프트 복사)</span>' + aiBtn("ia:ALL", "전체") + m.systems.filter(function (s) { return s.hasScreens; }).map(function (s) { return aiBtn("ia:" + s.code, s.code + " " + s.name); }).join("") + "</div>";
    return '<section class="section">' + aiBar + '<div class="toolbar"><p class="hint" style="margin:0">화면 ' + screens.length + "개 중 설계완료 " + done + "개. 화면 옆 상태는 연결된 Task의 진행 상태입니다. Task ID를 누르면 Task 상세로 갑니다.</p>" + sysFilters() + "</div>" +
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
    var genBar = '<div class="ai-bar"><span class="hint">AI 생성·조정</span>' + p.rtm.rows.filter(function (r) { return p.gens["flow:" + r.requirementId]; }).map(function (r) { return genBtn("flow:" + r.requirementId, r.requirementId + " " + r.title); }).join("") + "</div>";
    return '<section class="section">' + genBar + chips + '<p class="hint">시스템을 고르면 그 시스템 레인만 남기고, 다른 시스템으로 넘어가는 지점은 “→ 다른 시스템” 연결 노드로 보여 줍니다. 점선 화살표는 되돌아가는 흐름입니다.</p></section>' + body;
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

  // ── AI 생성 · 미세조정 · 적용 ─────────────────────
  // 생성 결과는 db의 gens 컬렉션에 (프로젝트, 대상)마다 문서 하나로 쌓인다: {versions:[…], applied:n}.
  // 적용본은 저장소 모델 위에 덧씌워져 화면설계서·프로토타입·정보구조도·플로우에 바로 반영된다.
  var AI = { sample: null, db: null, dbWrite: true };
  var overlays = {};
  function ovId(code, key) { return code + "__" + key.replace(":", "__"); }
  function overlayOf(key, p) { p = p || P(); return overlays[ovId(p.model.project.code, key)]; }
  function appliedOverlay(key, p) { var o = overlayOf(key, p); return o && o.applied ? o : null; }
  function appliedOutput(o) { var v = (o.versions || []).find(function (x) { return x.n === o.applied; }); return v ? v.output : null; }
  function genBtn(key, label) {
    var p = P();
    if (!p.gens || !p.gens[key]) return "";
    return '<button class="gen-btn" data-gen="' + esc(key) + '"><span aria-hidden="true">✦</span> ' + esc(label) + "</button>";
  }
  function merge(base, patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch === undefined ? base : patch;
    var out = Object.assign({}, base);
    Object.keys(patch).forEach(function (k) { out[k] = merge(out[k], patch[k]); });
    return out;
  }
  function flat(o, pre, out) {
    out = out || {};
    if (o && typeof o === "object" && !Array.isArray(o)) Object.keys(o).forEach(function (k) { flat(o[k], pre ? pre + "." + k : k, out); });
    else out[pre] = o;
    return out;
  }
  function designWithPatch(d, patch, rev) {
    var nd = JSON.parse(JSON.stringify(d));
    nd.tokens = merge(d.tokens, patch.tokens || {});
    nd.layout = Object.assign({}, d.layout, patch.layout || {});
    nd.componentStyles = merge(d.componentStyles || {}, patch.componentStyles || {});
    ((patch.components && patch.components.add) || []).forEach(function (c) {
      if (!nd.components.some(function (x) { return x.id === c.id; })) nd.components.push(Object.assign({ variants: [], description: "" }, c, { origin: "ADDED", addedFor: "디자인 조정" }));
    });
    if (rev) nd.revision = rev;
    return nd;
  }
  /** 누적 패치에 새 패치를 더한다 (섹션·댓글·전역 조정이 차례로 쌓인다) */
  function mergePatch(a, b) {
    a = a || {};
    var out = { tokens: merge(a.tokens || {}, b.tokens || {}), layout: Object.assign({}, a.layout || {}, b.layout || {}), componentStyles: merge(a.componentStyles || {}, b.componentStyles || {}), components: { add: ((a.components && a.components.add) || []).slice() } };
    ((b.components && b.components.add) || []).forEach(function (c) { if (!out.components.add.some(function (x) { return x.id === c.id; })) out.components.add.push(c); });
    return out;
  }
  function designChanges(before, after) {
    var a = flat({ tokens: before.tokens, layout: before.layout, componentStyles: before.componentStyles || {} }), b = flat({ tokens: after.tokens, layout: after.layout, componentStyles: after.componentStyles || {} });
    var out = Object.keys(b).filter(function (k) { return JSON.stringify(a[k]) !== JSON.stringify(b[k]); }).map(function (k) { return k + ": " + (a[k] === undefined ? "기본값" : a[k]) + " → " + b[k]; });
    after.components.forEach(function (c) { if (!before.components.some(function (x) { return x.id === c.id; })) out.push("컴포넌트 추가 " + c.id); });
    return out;
  }
  function patchPaths(patch) {
    var out = [];
    ["tokens", "layout", "componentStyles"].forEach(function (k) { if (patch[k]) Object.keys(flat(patch[k])).forEach(function (x) { out.push(k + "." + x); }); });
    if (patch.components && patch.components.add && patch.components.add.length) out.push("components.add");
    return out;
  }
  /** 저장소 모델 + 적용본 → 화면에 쓰는 모델 */
  function rebuild() {
    DATA.projects.forEach(function (p) {
      var m = JSON.parse(JSON.stringify(p.base)), code = m.project.code, n = 0;
      var mine = Object.keys(overlays).map(function (k) { return overlays[k]; }).filter(function (o) { return o.project === code && (o.kind === "ds" ? o.cumulative && o.appliedRev : o.applied); });
      var order = { ds: 0, ia: 1, sb: 2, flow: 3 };
      mine.sort(function (a, b) { return order[a.kind] - order[b.kind]; }).forEach(function (o) {
        var out = o.kind === "ds" ? o.cumulative : appliedOutput(o);
        if (!out) return;
        n++;
        try {
          if (o.kind === "ds") {
            m.design.systems = m.design.systems.map(function (d) { return d.systemCode === o.target && d.status === "SELECTED" ? designWithPatch(d, o.cumulative || {}, o.appliedRev) : d; });
          } else if (o.kind === "ia") {
            m.ia.nodes = m.ia.nodes.filter(function (x) { return x.systemCode !== o.target; }).concat(out.nodes.map(function (x) { return Object.assign({ roles: [], taskIds: [], loginRequired: false, change: "NEW", parentId: null }, x, { systemCode: o.target }); }));
          } else if (o.kind === "sb") {
            var node = m.ia.nodes.find(function (x) { return x.id === o.target; }) || {};
            var prev = m.storyboard.screens.find(function (x) { return x.screenId === o.target; });
            var ds = m.design.systems.find(function (x) { return x.systemCode === node.systemCode; });
            var next = { screenId: o.target, systemCode: node.systemCode || (prev && prev.systemCode), title: prev ? prev.title : node.name, template: out.template || (prev && prev.template), taskIds: prev ? prev.taskIds : [], components: out.components, status: "DRAFT", designRevision: o.designRev || (ds && ds.revision) };
            m.storyboard.screens = prev ? m.storyboard.screens.map(function (x) { return x.screenId === o.target ? next : x; }) : m.storyboard.screens.concat([next]);
          } else if (o.kind === "flow") {
            m.flows = m.flows.some(function (f) { return f.id === out.id; }) ? m.flows.map(function (f) { return f.id === out.id ? out : f; }) : m.flows.concat([out]);
          }
        } catch (e) { n--; }
      });
      p.model = m;
      p.appliedCount = n;
    });
  }
  function revBadge(p, sb) {
    var d = selectedDesign(p, sb.systemCode);
    if (!d || (sb.designRevision || 1) >= d.revision) return "";
    return '<div class="rev-note"><span class="pill IN_DESIGN">디자인 r' + d.revision + " 반영됨</span> 디자인 시스템이 r" + (sb.designRevision || 1) + "에서 r" + d.revision + "로 바뀌어 이 화면이 새 디자인으로 다시 그려졌습니다. 내용을 다시 검토하세요.</div>";
  }
  function dsHistory(d) {
    var o = overlayOf("ds:" + d.systemCode);
    var h = (d.history || []).filter(function (x) { return !o || !o.history || !o.history.some(function (y) { return y.rev === x.rev; }); }).map(function (x) { return "r" + x.rev + " " + (x.note || x.changes.length + "건"); });
    ((o && o.history) || []).forEach(function (x) { h.push("r" + x.rev + " [" + x.scopeLabel + "] " + (x.instruction || "").slice(0, 30)); });
    return '<span class="hint">개정 이력: ' + (h.length ? esc(h.slice(-6).join(" · ")) : "r1 (컨셉 선택)") + "</span>";
  }
  function dsUndoable(code) { var o = overlayOf("ds:" + code); return !!(o && o.history && o.history.length); }
  /** 저장소 기준 디자인 시스템 (미세조정 패치는 항상 이것을 기준으로 한다) */
  function baseDesign(p, code) { return p.base.design.systems.find(function (d) { return d.systemCode === code && d.status === "SELECTED"; }); }
  function validateOutput(kind, target, out, p, scope) {
    var errs = [], warns = [];
    if (!out || typeof out !== "object") return { errs: ["JSON 객체가 아닙니다"], warns: warns };
    if (kind === "ia") {
      if (!Array.isArray(out.nodes) || !out.nodes.length) errs.push("nodes 배열이 없습니다");
      else {
        var ids = {};
        out.nodes.forEach(function (n) {
          if (!n.id || !n.name) errs.push("id·name이 없는 노드가 있습니다");
          if (ids[n.id]) errs.push("중복 ID " + n.id);
          ids[n.id] = true;
          if (["MENU", "PAGE", "POPUP", "LAYER", "TAB", "EXTERNAL"].indexOf(n.kind) < 0) errs.push(n.id + " kind 값 오류: " + n.kind);
          if ((p.base.ia.retiredIds || []).indexOf(n.id) >= 0) errs.push("폐기된 ID 재사용 " + n.id);
        });
        out.nodes.forEach(function (n) { if (n.parentId && !ids[n.parentId]) errs.push(n.id + "의 상위 " + n.parentId + "가 없습니다"); });
        var tasks = allTasks(p).filter(function (t) { return t.systemCode === target && !t.screenless; });
        tasks.forEach(function (t) { if (!out.nodes.some(function (n) { return (n.taskIds || []).indexOf(t.taskId) >= 0; })) warns.push(t.taskId + " 에 연결된 화면이 없습니다"); });
        p.base.storyboard.screens.forEach(function (sbx) { if (sbx.systemCode === target && !ids[sbx.screenId]) warns.push("화면설계서가 있는 " + sbx.screenId + "가 빠졌습니다"); });
      }
    } else if (kind === "sb") {
      if (!Array.isArray(out.components) || !out.components.length) errs.push("components 배열이 없습니다");
      else {
        var node = p.model.ia.nodes.find(function (n) { return n.id === target; }) || {};
        var ds = selectedDesign(p, node.systemCode);
        out.components.forEach(function (c, i) {
          if (!c.label) errs.push((i + 1) + "번 항목에 label이 없습니다");
          if (c.ui && ds && !ds.components.some(function (x) { return x.id === c.ui.component; })) errs.push(c.no + ". " + c.ui.component + " 는 디자인 시스템에 없는 컴포넌트입니다");
          if (c.ui && c.ui.link && !p.model.ia.nodes.some(function (n) { return n.id === c.ui.link; })) warns.push(c.no + ". 이동 화면 " + c.ui.link + " 가 정보구조도에 없습니다");
          if (/API|DB|쿼리|서버|백엔드/.test((c.planner || "") + (c.customer || ""))) warns.push(c.no + ". 개발자 관점 표현이 들어 있습니다");
        });
        if (!ds) warns.push("디자인 시스템 컨셉이 없어 와이어프레임은 글로만 보입니다");
      }
    } else if (kind === "flow") {
      if (!Array.isArray(out.nodes) || !Array.isArray(out.edges) || !Array.isArray(out.lanes)) errs.push("lanes·nodes·edges 배열이 필요합니다");
      else {
        var nid = {};
        out.nodes.forEach(function (n) { nid[n.id] = true; if (!Array.isArray(n.taskIds)) n.taskIds = []; });
        out.edges.forEach(function (e) { if (!nid[e.from] || !nid[e.to]) errs.push("없는 노드를 잇는 연결 " + e.from + "→" + e.to); });
        if (!out.id) errs.push("flow id가 없습니다");
      }
    } else if (kind === "ds") {
      var d0 = selectedDesign(p, target);
      var nd = designWithPatch(d0, out);
      var hex = /^#[0-9A-Fa-f]{6}$/;
      Object.keys(nd.tokens.color).forEach(function (k) { if (!hex.test(nd.tokens.color[k])) errs.push("색상 " + k + " 값 오류: " + nd.tokens.color[k]); });
      var allowed = { nav: ["top", "top-mega", "side"], logo: ["left", "center"], search: ["header", "hero", "panel"], list: ["table", "card"], pagination: ["numbered", "numbered-size", "more"], button: ["square", "rounded", "pill"], density: ["comfortable", "compact"], footer: ["full", "simple", "none"] };
      Object.keys(nd.layout).forEach(function (k) { if (allowed[k] && allowed[k].indexOf(nd.layout[k]) < 0) errs.push("레이아웃 " + k + " 값 오류: " + nd.layout[k]); });
      var known = {};
      nd.components.forEach(function (x) { known[x.id] = true; });
      Object.keys(out.componentStyles || {}).forEach(function (cid) {
        if (!known[cid]) { errs.push("디자인 시스템에 없는 컴포넌트: " + cid); return; }
        var vars = styleVarsOf(cid);
        Object.keys(out.componentStyles[cid] || {}).forEach(function (vn) {
          var sv = vars.find(function (x) { return x.name === vn; }), val = String(out.componentStyles[cid][vn]);
          if (!sv) errs.push(cid + "에서 조정할 수 없는 변수: " + vn);
          else if (sv.type === "color" ? !hex.test(val) : sv.type === "px" ? !/^\d{1,4}(\.\d+)?px$/.test(val) : !/^\d{1,4}$/.test(val)) errs.push(cid + " " + vn + " 값 형식 오류: " + val);
        });
      });
      if (scope) {
        var sc = scopeInfo(scope);
        patchPaths(out).forEach(function (pth) { if (!sc.allowed.some(function (a) { return pth === a || pth.indexOf(a + ".") === 0; })) errs.push("‘" + sc.label + "’ 범위 밖 값: " + pth); });
      }
      if (!designChanges(d0, nd).length) errs.push("바뀐 내용이 없습니다");
    }
    return { errs: errs, warns: warns };
  }
  function saveOverlay(key, doc) {
    var p = P(), id = ovId(p.model.project.code, key);
    overlays[id] = doc;
    rebuild();
    if (!AI.db || !AI.dbWrite) return Promise.resolve(false);
    return AI.db.collection("gens").doc(id).set(doc).then(function () { return true; }, function (e) {
      if (e && e.code === "invalid_argument") AI.dbWrite = false;
      return false;
    });
  }
  var SAMPLE_ERR = {
    not_granted: "이 페이지에서 Claude 사용이 허락되지 않았습니다.", sampling_disabled: "이 계정에서는 Claude를 쓸 수 없습니다.",
    rate_limited: "요청이 많습니다. 잠시 뒤 다시 눌러 주세요.", invalid_json: "결과를 JSON으로 읽지 못했습니다. 다시 생성하거나 요청을 줄여 주세요.",
    prompt_too_large: "보낼 내용이 너무 깁니다. 요청을 줄여 주세요.", refused: "Claude가 이 요청을 처리하지 않았습니다. 요청을 바꿔 주세요.",
    session_expired: "다시 로그인해 주세요.", empty_completion: "결과가 비었습니다. 요청을 바꿔 다시 시도해 주세요."
  };
  /** 디자인 미세조정 프롬프트 채우기 (src/ai/generate.ts fillDsPrompt와 같은 규칙) */
  function fillDs(template, p, code, scope, commentIds) {
    var d = selectedDesign(p, code), sc = scopeInfo(scope), slots = DATA.design.slots;
    var ids = scope.indexOf("cmp:") === 0 ? [scope.slice(4)] : d.components.map(function (x) { return x.id; });
    var vars = ids.map(function (id) {
      return "- " + id + ": " + styleVarsOf(id).map(function (v) { var cur = d.componentStyles && d.componentStyles[id] && d.componentStyles[id][v.name]; return v.name + "(" + v.label + ", " + v.type + ", 기본 " + v.base + (cur ? ", 현재 " + cur : "") + ")"; }).join(" · ");
    }).join("\n");
    return template
      .replace(slots.scope, "- " + sc.label + ": " + sc.hint + "\n- 바꿀 수 있는 경로: " + sc.allowed.join(", "))
      .replace(slots.design, JSON.stringify({ tokens: d.tokens, layout: d.layout, componentStyles: d.componentStyles || {} }))
      .replace(slots.vars, vars)
      .replace(slots.comments, commentText(p, code, commentIds) || "- (없음)");
  }
  function commentText(p, code, ids) {
    if (!ids || !ids.length) return "";
    var items = (reviewsOf(p, code).items || []).filter(function (x) { return ids.indexOf(x.id) >= 0; });
    return items.map(function (x) {
      return "- [" + x.target.label + "] " + x.n + "번 · 컴포넌트 " + (x.cmp || "(빈 곳)") + " · 위치 x=" + Math.round(x.x) + ", y=" + Math.round(x.y) + " (1920×1080 기준)" + (x.snippet ? " · 요소 글자 “" + x.snippet + "”" : "") + "\n  댓글: " + x.comment;
    }).join("\n");
  }
  function genRun(instruction) {
    var p = P(), key = layer.key, g = p.gens[key], doc = overlayOf(key) || { project: p.model.project.code, kind: g.kind, target: g.target, versions: [], applied: null };
    var base = layer.sel != null && !layer.fresh ? doc.versions[layer.sel] : null;
    var scope = base ? base.scope || "global" : layer.scope || "global";
    var cids = base ? base.commentIds || [] : layer.commentIds || [];
    if (g.requiresInstruction && !base && !instruction && !cids.length) { layer.err = "조정 요청을 적어 주세요."; renderLayer(); return; }
    if (base && !instruction) { layer.err = "미세조정 프롬프트를 적어 주세요."; renderLayer(); return; }
    var tpl = g.kind === "ds" ? fillDs(g.prompt, p, g.target, scope, cids) : g.prompt;
    var rootText = base ? base.root || "" : instruction || (cids.length ? "위 댓글을 모두 반영해 주세요." : "");
    var first = tpl + (g.requiresInstruction ? rootText : (!base && instruction ? "\n## 추가 지시\n" + instruction + "\n" : ""));
    var input = base ? [{ role: "user", content: first }, { role: "assistant", content: JSON.stringify(base.output) }, { role: "user", content: DATA.refine + instruction }] : first;
    layer.ctl = new AbortController();
    layer.busy = true; layer.err = ""; layer.stream = 0;
    renderLayer();
    AI.sample.json(input, { signal: layer.ctl.signal, cache: false, onText: function (u) { var b = document.getElementById("gen-busy"); if (b) b.textContent = "작성 중… " + u.text.length.toLocaleString() + "자"; } })
      .then(function (out) {
        var n = doc.versions.reduce(function (a, v) { return Math.max(a, v.n); }, 0) + 1;
        var v = { n: n, scope: scope, scopeLabel: scopeInfo(scope).label, commentIds: cids, instruction: instruction || (cids.length ? "댓글 " + cids.length + "개 반영" : "(1차 생성)"), from: base ? base.n : null, root: g.requiresInstruction ? rootText : null, output: out, at: new Date().toISOString() };
        if (g.kind !== "ds") { delete v.scope; delete v.scopeLabel; delete v.commentIds; }
        doc = Object.assign({}, doc, { versions: doc.versions.concat([v]).slice(-10), updatedAt: v.at });
        layer.sel = doc.versions.length - 1;
        layer.fresh = false;
        layer.draft = "";
        return saveOverlay(key, doc).then(function (saved) { layer.saved = saved; });
      }, function (e) {
        layer.err = e && e.code === "cancelled" ? "" : (SAMPLE_ERR[e && e.code] || "생성하지 못했습니다(" + (e && e.code) + "). 다시 눌러 주세요.");
      })
      .then(function () { layer.busy = false; layer.ctl = null; if (layer) { render(); renderLayer(); } });
  }
  function genApply(apply) {
    var p = P(), key = layer.key, doc = JSON.parse(JSON.stringify(overlayOf(key)));
    var v = doc.versions[layer.sel];
    if (doc.kind === "ds") {
      if (apply) {
        var chk = validateOutput("ds", doc.target, v.output, p, v.scope);
        if (chk.errs.length) { layer.err = "적용할 수 없습니다: " + chk.errs[0]; renderLayer(); return; }
        var d0 = baseDesign(p, doc.target), cur = selectedDesign(p, doc.target);
        var before = doc.cumulative || null;
        var rev = (doc.appliedRev || d0.revision) + 1;
        doc.cumulative = mergePatch(before, v.output);
        doc.history = (doc.history || []).concat([{ rev: rev, n: v.n, scope: v.scope, scopeLabel: v.scopeLabel, instruction: v.root || v.instruction, summary: v.output.summary || "", changes: designChanges(cur, designWithPatch(cur, v.output)), before: before, at: new Date().toISOString() }]);
        doc.appliedRev = rev;
        doc.applied = v.n;
        if (v.commentIds && v.commentIds.length) resolveComments(p, doc.target, v.commentIds, rev);
      } else {
        var last = (doc.history || []).pop();
        if (!last) return;
        doc.cumulative = last.before;
        doc.appliedRev = doc.history.length ? doc.history[doc.history.length - 1].rev : null;
        doc.applied = doc.history.length ? doc.history[doc.history.length - 1].n : null;
        if (!doc.cumulative) { doc.cumulative = null; doc.appliedRev = null; }
        reopenComments(p, doc.target, last.rev);
      }
    } else if (apply) {
      var chk2 = validateOutput(doc.kind, doc.target, v.output, p);
      if (chk2.errs.length) { layer.err = "적용할 수 없습니다: " + chk2.errs[0]; renderLayer(); return; }
      doc.applied = v.n;
      if (doc.kind === "sb") { var nd = p.model.ia.nodes.find(function (x) { return x.id === doc.target; }) || {}; var ds = selectedDesign(p, nd.systemCode); doc.designRev = ds ? ds.revision : null; }
    } else doc.applied = null;
    saveOverlay(key, doc).then(function (saved) { layer.saved = saved; render(); if (layer) renderLayer(); });
  }
  /** 디자인 시스템 화면의 “마지막 적용 되돌리기” */
  function dsUndo(code) {
    var p = P(), key = "ds:" + code, doc = JSON.parse(JSON.stringify(overlayOf(key)));
    var last = (doc.history || []).pop();
    if (!last) return;
    doc.cumulative = last.before;
    doc.appliedRev = doc.history.length ? doc.history[doc.history.length - 1].rev : null;
    doc.applied = doc.history.length ? doc.history[doc.history.length - 1].n : null;
    reopenComments(p, code, last.rev);
    saveOverlay(key, doc).then(function () { render(); });
  }

  // ── 이미지 댓글 (reviews 컬렉션: 프로젝트·시스템마다 문서 하나) ──
  var reviews = {};
  function revId(code, sys) { return code + "__" + sys; }
  function reviewsOf(p, sys) { return reviews[revId(p.model.project.code, sys)] || { items: [] }; }
  function saveReviews(p, sys, doc) {
    var id = revId(p.model.project.code, sys);
    reviews[id] = doc;
    if (!AI.db || !AI.dbWrite) return Promise.resolve(false);
    return AI.db.collection("reviews").doc(id).set(doc).then(function () { return true; }, function (e) { if (e && e.code === "invalid_argument") AI.dbWrite = false; return false; });
  }
  function resolveComments(p, sys, ids, rev) {
    var doc = JSON.parse(JSON.stringify(reviewsOf(p, sys)));
    doc.items = (doc.items || []).map(function (x) { return ids.indexOf(x.id) >= 0 ? Object.assign(x, { status: "resolved", rev: rev }) : x; });
    saveReviews(p, sys, doc);
  }
  function reopenComments(p, sys, rev) {
    var doc = JSON.parse(JSON.stringify(reviewsOf(p, sys)));
    var changed = false;
    doc.items = (doc.items || []).map(function (x) { if (x.status === "resolved" && x.rev === rev) { changed = true; return Object.assign(x, { status: "open", rev: null }); } return x; });
    if (changed) saveReviews(p, sys, doc);
  }

  function genPreview(p, g, out) {
    if (!out) return '<div class="empty">아직 생성한 결과가 없습니다. 왼쪽에서 생성하세요.</div>';
    if (g.kind === "ia") {
      var before = {};
      p.base.ia.nodes.forEach(function (n) { if (n.systemCode === g.target) before[n.id] = true; });
      var added = {}, nodes = out.nodes.map(function (n) { if (!before[n.id]) added[n.id] = true; return Object.assign({ roles: [], taskIds: [], change: "NEW" }, n); });
      var removed = Object.keys(before).filter(function (id) { return !nodes.some(function (n) { return n.id === id; }); });
      return '<p class="hint">추가 ' + Object.keys(added).length + " · 삭제 " + removed.length + (removed.length ? " (" + removed.map(esc).join(", ") + ")" : "") + "</p>" + iaTree(nodes, statusByScreen(p), { added: added });
    }
    if (g.kind === "flow") return '<div class="flow-box">' + Flow.svg(out, { color: sysColor, suffix: "-gen" }) + "</div>";
    if (g.kind === "sb") {
      var node = p.model.ia.nodes.find(function (n) { return n.id === g.target; }) || {};
      var sb = { screenId: g.target, systemCode: node.systemCode, title: node.name, template: out.template, components: out.components || [] };
      var wire = screenWire(p, sb, true);
      var desc = '<table class="desc"><thead><tr><th>No</th><th>항목</th><th>설명</th><th>옵션·유효성</th></tr></thead><tbody>' + sb.components.map(function (c) {
        return '<tr><td><span class="no">' + esc(c.no) + "</span></td><td><b>" + esc(c.label) + '</b><br><span class="hint mono">' + esc(c.ui ? c.ui.component : c.kind) + "</span></td><td>" + descCell(c) + "</td><td>" + ruleCell(c) + "</td></tr>";
      }).join("") + "</tbody></table>";
      return (wire ? stage(wire, { page: true }) : '<p class="hint">디자인 시스템이 없어 와이어프레임 없이 설명만 보입니다.</p>') + '<div class="desc-wrap">' + desc + "</div>";
    }
    if (g.kind === "ds") {
      var d0 = selectedDesign(p, g.target), nd = designWithPatch(d0, out, d0.revision + 1), ch = designChanges(d0, nd), ctx = wireCtx(p, g.target, null);
      var screens = p.model.storyboard.screens.filter(function (x) { return x.systemCode === g.target; });
      var shots = screens.slice(0, 4).map(function (sb) {
        var node = p.model.ia.nodes.find(function (n) { return n.id === sb.screenId; }) || {};
        var c2 = wireCtx(p, sb.systemCode, sb.screenId);
        if (node.kind === "POPUP") { c2.popup = true; c2.parent = p.model.storyboard.screens.find(function (s) { return s.screenId === node.parentId; }); }
        return '<figure class="thumb"><div class="thumb-in">' + stage(Wire.screen(nd, sb, c2), { w: VW, h: VH, cap: false }) + "</div><figcaption>" + esc(sb.screenId) + "</figcaption></figure>";
      }).join("");
      return (out.summary ? "<p><b>" + esc(out.summary) + "</b></p>" : "") + '<ul class="changes">' + ch.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
        '<h4 class="gen-sub">바뀐 디자인으로 다시 그린 화면 <small>이 디자인 시스템을 쓰는 화면 ' + screens.length + "개 중 " + Math.min(4, screens.length) + "개</small></h4>" + '<div class="thumbs">' + shots + "</div>" +
        '<h4 class="gen-sub">템플릿</h4><div class="thumbs">' + ["list", "form", "confirm", "modal"].map(function (t) { return '<figure class="thumb"><div class="thumb-in">' + stage(Wire.template(nd, t, ctx), { w: VW, h: VH, cap: false }) + "</div><figcaption>" + t + "</figcaption></figure>"; }).join("") + "</div>";
    }
    return "";
  }

  function renderGenLayer() {
    var p = P(), key = layer.key, g = p.gens[key], doc = overlayOf(key) || { versions: [], applied: null };
    // 섹션·댓글·전역 요청으로 연 경우(fresh)는 기존 버전을 고르지 않고 새로 생성한다
    if (layer.sel == null && doc.versions.length && !layer.fresh) layer.sel = doc.versions.findIndex ? Math.max(0, doc.versions.findIndex(function (v) { return v.n === doc.applied; })) : 0;
    if (layer.sel != null && layer.sel >= doc.versions.length) layer.sel = doc.versions.length - 1;
    var sel = layer.sel != null && !layer.fresh ? doc.versions[layer.sel] : null;
    var vlist = doc.versions.map(function (v, i) {
      return '<button class="ver-item' + (i === layer.sel ? " on" : "") + '" data-gsel="' + i + '"><b>v' + v.n + "</b>" + (v.n === doc.applied ? '<span class="pill DESIGNED">적용 중</span>' : "") + (v.scopeLabel ? '<span class="tag">' + esc(v.scopeLabel) + "</span>" : "") + "<span>" + esc(v.from ? "v" + v.from + "에서 조정: " : "") + esc(v.instruction) + '</span><em class="hint">' + esc(fmtDate(v.at)) + "</em></button>";
    }).join("");
    var canGen = !!AI.sample;
    var label = !sel ? (g.requiresInstruction ? "조정 요청" : "추가 지시 (선택)") : "미세조정 프롬프트 · v" + sel.n + " 기준";
    var ph = !sel ? (g.requiresInstruction ? "예: 주 색을 더 진하게, 버튼을 둥글게" : "예: 목록은 50건까지 보이게, 반려 사유 보기 버튼 추가") : "예: 검색 조건에 '신청인' 추가, 버튼 문구를 '공개 신청하기'로";
    var chk = sel ? validateOutput(g.kind, g.target, sel.output, p, sel.scope) : null;
    var scopeNow = sel ? sel.scope : layer.scope;
    var scopeNote = g.kind === "ds" ? '<p class="scope-note"><b>조정 범위</b> ' + esc(scopeInfo(scopeNow || "global").label) + ' <span class="hint">' + esc(scopeInfo(scopeNow || "global").hint) + "</span>" + ((sel ? sel.commentIds : layer.commentIds) && (sel ? sel.commentIds : layer.commentIds).length ? '<br><span class="hint">댓글 ' + (sel ? sel.commentIds : layer.commentIds).length + "개 반영 요청</span>" : "") + "</p>" : "";
    var left = '<div class="gen-left">' + scopeNote + '<div class="gen-status">' + (g.kind === "ds" ? (doc.appliedRev ? '<span class="pill DESIGNED">누적 적용 r' + doc.appliedRev + "</span>" : '<span class="pill NOT_STARTED">저장소 기본값</span>') : doc.applied ? '<span class="pill DESIGNED">적용: v' + doc.applied + "</span>" : '<span class="pill NOT_STARTED">저장소 기본값</span>') +
      (AI.db ? (AI.dbWrite ? '<span class="hint">결과와 적용 상태는 이 페이지를 보는 모두에게 공유됩니다</span>' : '<span class="hint warn-t">저장 권한이 없어 이 화면에서만 보입니다</span>') : '<span class="hint">저장 공간이 없어 새로고침하면 사라집니다</span>') + "</div>" +
      (vlist ? '<div class="ver-list">' + vlist + "</div>" : "") +
      (canGen ? '<label class="gen-label" for="gen-in">' + label + '</label><textarea id="gen-in" rows="4" placeholder="' + esc(ph) + '">' + esc(layer.draft || "") + "</textarea>" +
        '<div class="gen-actions">' + (layer.busy ? '<span id="gen-busy" class="hint">생각 중… (5~60초)</span><button class="btn-sm" data-gstop>멈춤</button>' : '<button class="btn-primary" data-grun>' + (!sel ? (g.requiresInstruction ? "미세조정 생성" : "1차 생성") : "미세조정") + "</button>" + (sel ? '<button class="btn-sm" data-gnew>처음부터 다시 생성</button>' : "")) + "</div>"
        : '<div class="note warn"><b>여기서는 생성할 수 없습니다</b><p class="hint">claude.ai에서 이 페이지를 열면 Claude로 바로 생성합니다. 지금은 아래 프롬프트를 복사해 Claude에 붙여 넣고, 받은 JSON을 <code>planning gen apply</code>로 반영하세요.</p><button class="btn-sm" data-gcopy>생성 프롬프트 복사</button></div>') +
      (layer.err ? '<p class="gen-err" role="alert">' + esc(layer.err) + "</p>" : "") +
      (chk && (chk.errs.length || chk.warns.length) ? '<ul class="chk">' + chk.errs.map(function (x) { return '<li class="e">' + esc(x) + "</li>"; }).join("") + chk.warns.map(function (x) { return '<li class="w">' + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
    var right = '<div class="gen-right">' + (sel ? genPreview(p, g, sel.output) : '<div class="empty">' + (g.kind === "ds" ? "바꾸고 싶은 점을 적고 ‘미세조정 생성’을 누르세요. 결과를 확인한 뒤 적용하면 이 디자인 시스템을 쓰는 모든 화면이 한꺼번에 바뀝니다." : "‘1차 생성’을 누르면 저장소의 요구사항·Task·참조자료·디자인 시스템을 근거로 Claude가 만듭니다. 결과를 본 뒤 미세조정 프롬프트로 이어서 고칠 수 있습니다.") + "</div>") + "</div>";
    var foot = '<footer class="layer-f"><span class="hint">' + (sel ? "v" + sel.n + (sel.n === doc.applied ? " 적용 중" : " 미리보기") : "") + '</span><span class="sp"></span>' +
      (sel ? '<button class="btn-sm" data-gjson>JSON 복사</button>' : "") + (g.kind === "ds" ? (doc.history && doc.history.length ? '<button class="btn-sm" data-gunapply>마지막 적용 되돌리기</button>' : "") : doc.applied ? '<button class="btn-sm" data-gunapply>적용 해제</button>' : "") +
      (sel && (g.kind === "ds" ? !(doc.history || []).some(function (h) { return h.n === sel.n; }) : sel.n !== doc.applied) ? '<button class="btn-primary" data-gapply' + (chk && chk.errs.length ? " disabled" : "") + ">v" + sel.n + " 적용</button>" : "") + "</footer>";
    return '<header class="layer-h"><div><span class="eyebrow">AI 생성 · 미세조정</span><h2 id="layer-t">' + esc(g.title) + '</h2></div><button class="x" data-close-layer aria-label="닫기">✕</button></header>' +
      '<div class="gen-body">' + left + right + "</div>" + foot;
  }
  function copyText(text, btn, okLabel) {
    var old = btn.textContent;
    var ok = function () { btn.textContent = okLabel || "복사했습니다"; setTimeout(function () { btn.textContent = old; }, 1600); };
    try { navigator.clipboard.writeText(text).then(ok, function () { btn.textContent = "복사하지 못했습니다"; }); } catch (e) { btn.textContent = "복사하지 못했습니다"; }
  }

  // ── 검토 레이어: 실제 규격 이미지 + 번호 핀 댓글 + 번호 라벨 ──
  function reviewHtml(p, sys, targetId) {
    var d = selectedDesign(p, sys), ctx = wireCtx(p, sys, null);
    if (targetId.indexOf("tpl:") === 0) return { html: Wire.template(d, targetId.slice(4), ctx), w: VW, h: VH };
    var comp = d.components.find(function (x) { return x.id === targetId.slice(4); });
    var r = sampleRaw(d, comp, ctx);
    return { html: r.html, w: r.w, h: null };
  }
  function renderReviewLayer() {
    var p = P(), l = layer, all = reviewsOf(p, l.sys).items || [];
    var mine = all.filter(function (x) { return x.target.id === l.target.id; }).sort(function (a, b) { return a.n - b.n; });
    var openMine = mine.filter(function (x) { return x.status === "open"; }), openAll = all.filter(function (x) { return x.status === "open"; });
    var v = reviewHtml(p, l.sys, l.target.id);
    var nextN = mine.reduce(function (a, x) { return Math.max(a, x.n); }, 0) + 1;
    var pend = l.pending ? '<div class="rv-new"><div class="rv-new-h"><span class="rv-n new">' + nextN + "</span><b>" + nextN + '번 댓글</b><span class="tag mono">' + esc(l.pending.cmp || "빈 곳") + "</span></div>" + (l.pending.snippet ? '<span class="hint">“' + esc(l.pending.snippet) + "”</span>" : "") +
      '<label class="sr" for="rv-in">댓글</label><textarea id="rv-in" rows="3" placeholder="예: 이 표 머리글 배경을 더 진하게, 글자는 흰색으로">' + esc(l.rvDraft || "") + '</textarea><div class="gen-actions"><button class="btn-primary" data-rvsave>댓글 남기기</button><button class="btn-sm" data-rvcancel>취소</button></div></div>' : "";
    var list = mine.map(function (x) {
      return '<div class="rv-item ' + x.status + '"><span class="rv-n">' + x.n + '</span><div><span class="tag mono">' + esc(x.cmp || "빈 곳") + "</span> " + (x.status === "resolved" ? '<span class="pill DESIGNED">반영됨 r' + esc(x.rev) + "</span>" : '<span class="pill IN_DESIGN">열림</span>') + "<p>" + esc(x.comment) + "</p></div>" + (x.status === "open" ? '<button class="btn-sm" data-rvdel="' + esc(x.id) + '" aria-label="' + x.n + '번 댓글 삭제">삭제</button>' : "") + "</div>";
    }).join("");
    var body = '<header class="layer-h"><div><span class="eyebrow">디자인 검토 · ' + esc(l.sys) + " · 실제 규격 " + v.w + " × " + (v.h || "가변") + '</span><h2 id="layer-t">' + esc(l.target.label) + '</h2></div><button class="x" data-close-layer aria-label="닫기">✕</button></header>' +
      '<div class="rv-body"><div class="rv-main">' + stage(v.html, { w: v.w, h: v.h, cls: "rv", cap: false }) + '</div><div class="rv-side">' +
      '<p class="hint">고칠 곳을 누르면 그 자리에 번호 핀이 꽂히고, 핀 아래 컴포넌트와 글자가 함께 기록됩니다.</p><button class="btn-sm" data-rvlabels aria-pressed="' + !!l.labels + '">' + (l.labels ? "번호 라벨 숨기기" : "번호 라벨 보기") + "</button>" +
      (l.labels ? '<p class="hint">파란 번호를 누르면 그 컴포넌트에 댓글을 답니다.</p>' : "") + pend + (list ? '<div class="rv-list">' + list + "</div>" : '<p class="hint">아직 댓글이 없습니다.</p>') + "</div></div>" +
      '<footer class="layer-f"><span class="hint">열린 댓글: 이 대상 ' + openMine.length + " · " + esc(l.sys) + " 전체 " + openAll.length + '</span><span class="sp"></span>' +
      (openMine.length ? '<button class="btn-sm" data-cmtgen="' + esc(l.sys + "|" + l.target.id) + '">이 대상 댓글로 수정 요청</button>' : "") +
      (openAll.length ? '<button class="btn-primary" data-cmtgen="' + esc(l.sys + "|") + '">전체 열린 댓글 ' + openAll.length + "개로 수정 요청</button>" : "") + "</footer>";
    return body;
  }
  /** 핀·번호 라벨을 스테이지 위에 놓는다 (스케일이 바뀔 때마다 다시 계산) */
  function placeMarks(st) {
    if (!layer || layer.kind !== "review") return;
    st.querySelectorAll(".rv-mark, .rv-catch").forEach(function (e) { e.parentNode.removeChild(e); });
    var sc = Number(st.dataset.sc || 1), inner = st.firstElementChild, p = P();
    var catcher = document.createElement("div");
    catcher.className = "rv-catch";
    catcher.setAttribute("data-rvcatch", "1");
    st.appendChild(catcher);
    var add = function (cls, x, y, text, attrs) {
      var b = document.createElement("button");
      b.className = "rv-mark " + cls;
      b.style.left = x * sc + "px";
      b.style.top = y * sc + "px";
      b.textContent = text;
      Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
      st.appendChild(b);
    };
    if (layer.labels) {
      var sr = st.getBoundingClientRect(), seen = [];
      inner.querySelectorAll("[data-cmp]").forEach(function (el) {
        var r = el.getBoundingClientRect();
        if ((!r.width || !r.height) && el.firstElementChild) r = el.firstElementChild.getBoundingClientRect();
        if (!r.width || !r.height) return;
        seen.push(el);
        var snip = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
        add("rv-lbl", (r.left - sr.left) / sc, (r.top - sr.top) / sc, String(seen.length), { "data-lcmp": el.getAttribute("data-cmp"), "data-lsnip": snip, "data-lx": String((r.left - sr.left) / sc + 12), "data-ly": String((r.top - sr.top) / sc + 12), title: el.getAttribute("data-cmp") + " 에 댓글", "aria-label": seen.length + "번 " + el.getAttribute("data-cmp") + " 에 댓글" });
      });
    }
    (reviewsOf(p, layer.sys).items || []).filter(function (x) { return x.target.id === layer.target.id; }).forEach(function (x) {
      add("rv-pin " + x.status, x.x, x.y, String(x.n), { title: x.comment, "aria-label": x.n + "번 댓글: " + x.comment });
    });
    if (layer.pending) add("rv-pin new", layer.pending.x, layer.pending.y, "+", { "aria-label": "새 댓글 위치" });
  }
  function reviewClick(target, ev) {
    var st = target.closest(".stage.rv");
    if (target.hasAttribute("data-rvcatch") && st) {
      var sc = Number(st.dataset.sc || 1), inner = st.firstElementChild, r = inner.getBoundingClientRect();
      var catcher = target;
      catcher.style.pointerEvents = "none";
      var el = document.elementFromPoint(ev.clientX, ev.clientY);
      catcher.style.pointerEvents = "";
      var cmpEl = el && el.closest && el.closest("[data-cmp]");
      var draft = document.getElementById("rv-in");
      layer.rvDraft = draft ? draft.value : "";
      layer.pending = { x: (ev.clientX - r.left) / sc, y: (ev.clientY - r.top) / sc, cmp: cmpEl ? cmpEl.getAttribute("data-cmp") : "", snippet: el && inner.contains(el) ? (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) : "" };
      renderLayer();
      return true;
    }
    var lbl = target.closest(".rv-lbl");
    if (lbl) {
      var dr = document.getElementById("rv-in");
      layer.rvDraft = dr ? dr.value : "";
      layer.pending = { x: Number(lbl.getAttribute("data-lx")), y: Number(lbl.getAttribute("data-ly")), cmp: lbl.getAttribute("data-lcmp"), snippet: lbl.getAttribute("data-lsnip") };
      renderLayer();
      return true;
    }
    var b = target.closest("button");
    if (!b) return false;
    var p = P();
    if (b.hasAttribute("data-rvlabels")) { layer.labels = !layer.labels; renderLayer(); return true; }
    if (b.hasAttribute("data-rvcancel")) { layer.pending = null; layer.rvDraft = ""; renderLayer(); return true; }
    if (b.hasAttribute("data-rvsave")) {
      var txt = (document.getElementById("rv-in") || {}).value || "";
      if (!txt.trim()) { document.getElementById("rv-in").focus(); return true; }
      var doc = JSON.parse(JSON.stringify(reviewsOf(p, layer.sys)));
      doc.project = p.model.project.code; doc.system = layer.sys; doc.items = doc.items || [];
      var n = doc.items.filter(function (x) { return x.target.id === layer.target.id; }).reduce(function (a, x) { return Math.max(a, x.n); }, 0) + 1;
      doc.items.push({ id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), target: layer.target, n: n, x: layer.pending.x, y: layer.pending.y, cmp: layer.pending.cmp, snippet: layer.pending.snippet, comment: txt.trim(), status: "open", at: new Date().toISOString() });
      doc.items = doc.items.slice(-300);
      layer.pending = null; layer.rvDraft = "";
      saveReviews(p, layer.sys, doc);
      render(); renderLayer();
      return true;
    }
    if (b.dataset.rvdel) {
      var d2 = JSON.parse(JSON.stringify(reviewsOf(p, layer.sys)));
      d2.items = (d2.items || []).filter(function (x) { return x.id !== b.dataset.rvdel; });
      saveReviews(p, layer.sys, d2);
      render(); renderLayer();
      return true;
    }
    return false;
  }
  function commentGen(val) {
    var parts = val.split("|"), sys = parts[0], tid = parts[1];
    var ids = openComments(P(), sys, tid || null).map(function (x) { return x.id; });
    if (!ids.length) return;
    openLayer({ kind: "gen", key: "ds:" + sys, sel: null, fresh: true, scope: "comments", commentIds: ids });
    if (AI.sample) genRun("");
  }
  function sectionTune(scope, sys) {
    var inp = document.querySelector('[data-stin="' + scope + '"]');
    var txt = inp ? inp.value.trim() : "";
    if (!txt) { if (inp) { inp.focus(); inp.placeholder = "조정할 내용을 적어 주세요"; } return; }
    openLayer({ kind: "gen", key: "ds:" + sys, sel: null, fresh: true, scope: scope, draft: txt });
    if (AI.sample) genRun(txt);
  }

  // ── 레이어 팝업: AI 요청 미리보기 · 실제 규격 미리보기 ──
  var layer = null, lastFocus = null;
  function openLayer(l) {
    lastFocus = document.activeElement;
    layer = l;
    renderLayer();
  }
  function closeLayer() {
    layer = null;
    document.getElementById("layer").innerHTML = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function renderLayer() {
    var root = document.getElementById("layer");
    if (!layer) { root.innerHTML = ""; return; }
    var body;
    var draftEl = document.getElementById("gen-in");
    if (draftEl && layer.kind === "gen") layer.draft = draftEl.value;
    var rvDraftEl = document.getElementById("rv-in");
    if (rvDraftEl && layer.kind === "review") layer.rvDraft = rvDraftEl.value;
    if (layer.kind === "review") {
      body = renderReviewLayer();
    } else if (layer.kind === "gen") {
      body = renderGenLayer();
    } else if (layer.kind === "ai") {
      var ps = P().prompts[layer.key], text = ps[layer.target];
      var TARGET = {
        figma: ["Figma에 그리기", "Figma MCP가 연결된 Claude(Claude Code, Claude 앱)에 붙여 넣으면 Figma 파일에 바로 그립니다. 등록된 Figma 파일이 없으면 새 파일을 만들어 링크를 알려 줍니다."],
        claude: ["Claude에 요청", "Claude에 붙여 넣으면 검토 결과와 planning 도구에 다시 넣을 수 있는 형식의 결과를 돌려줍니다."]
      };
      body = '<header class="layer-h"><div><span class="eyebrow">AI 요청 미리보기</span><h2 id="layer-t">' + esc(ps.title) + '</h2></div><button class="x" data-close-layer aria-label="닫기">✕</button></header>' +
        '<div class="layer-tools"><div class="seg" role="group" aria-label="요청 대상">' + ["figma", "claude"].map(function (k) {
          return '<button data-ltarget="' + k + '" aria-pressed="' + (layer.target === k) + '">' + TARGET[k][0] + "</button>";
        }).join("") + '</div><p class="hint">' + TARGET[layer.target][1] + "</p></div>" +
        '<div class="layer-meta"><div><b>포함된 참조 URL</b>' + (ps.urls.length ? "<ul>" + ps.urls.map(function (u) { return "<li>" + esc(u.label) + ' <a href="' + esc(u.url) + '" target="_blank" rel="noopener">' + esc(u.url) + "</a></li>"; }).join("") + "</ul>" : '<p class="hint">등록된 참조 URL이 없습니다. <code>planning link add &lt;URL&gt; --label "…"</code></p>') +
        '</div><div><b>참조자료 근거</b><p class="hint">' + (ps.evidence ? "관련 문단 " + ps.evidence + "개를 프롬프트에 넣었습니다." : "관련 문단을 찾지 못했습니다.") + "</p></div></div>" +
        '<pre id="layer-pre" class="layer-pre" tabindex="0">' + esc(text) + "</pre>" +
        '<footer class="layer-f"><span class="hint">' + text.length.toLocaleString() + '자</span><button class="btn-primary" data-copy-layer>프롬프트 복사</button></footer>';
    } else {
      var pv = previews[layer.index];
      body = '<header class="layer-h"><div><span class="eyebrow">실제 규격 미리보기 · ' + VW + " × " + (pv.h || "가변") + '</span><h2 id="layer-t">' + esc(pv.title) + '</h2></div><button class="x" data-close-layer aria-label="닫기">✕</button></header>' +
        '<div class="layer-stage">' + stage(pv.html, { w: VW, h: pv.h, page: !pv.h }) + "</div>";
    }
    root.innerHTML = '<div class="layer" data-backdrop><div class="layer-box' + (layer.kind === "ai" ? "" : " wide") + '" role="dialog" aria-modal="true" aria-labelledby="layer-t">' + body + "</div></div>";
    fitStages(root);
    var gi = document.getElementById("gen-in") || document.getElementById("rv-in");
    if (gi && !layer.busy) gi.focus();
    else { var x = root.querySelector("[data-close-layer]"); if (x) x.focus(); }
  }
  function copyLayer(btn) {
    var ps = P().prompts[layer.key], text = ps[layer.target];
    var ok = function () { btn.textContent = "복사했습니다"; setTimeout(function () { btn.textContent = "프롬프트 복사"; }, 1800); };
    var fail = function () { selectText(document.getElementById("layer-pre")); btn.textContent = "선택했습니다. Ctrl+C로 복사하세요"; };
    try { navigator.clipboard.writeText(text).then(ok, fail); } catch (e) { fail(); }
  }
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && layer) { if (layer.busy && layer.ctl) layer.ctl.abort(); closeLayer(); return; }
    if (ev.key === "Enter" && ev.target.dataset && ev.target.dataset.stin) { ev.preventDefault(); var bt = ev.target.parentNode.querySelector("[data-strun]"); if (bt) bt.click(); return; }
    var pv = ev.target.closest && ev.target.closest("[data-preview][role=button], [data-review][role=button]");
    if (pv && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); pv.click(); }
  });

  // ── 이벤트 ─────────────────────────────────────
  function go(route) { state.route = route; persist(); render(); window.scrollTo(0, 0); }
  document.addEventListener("click", function (ev) {
    var target = ev.target;
    if (layer) {
      if (target.hasAttribute && target.hasAttribute("data-backdrop")) { if (layer.busy) return; closeLayer(); return; }
      var lb = target.closest("button");
      if (lb && lb.hasAttribute("data-close-layer")) { if (layer.ctl) layer.ctl.abort(); closeLayer(); return; }
      if (lb && lb.dataset.ltarget) { layer.target = lb.dataset.ltarget; renderLayer(); return; }
      if (lb && lb.hasAttribute("data-copy-layer")) { copyLayer(lb); return; }
      if (layer.kind === "review" && reviewClick(target, ev)) return;
      if (lb && lb.dataset.cmtgen != null) { commentGen(lb.dataset.cmtgen); return; }
      if (lb && layer.kind === "gen") {
        var gin = document.getElementById("gen-in");
        if (lb.dataset.gsel != null) { layer.sel = Number(lb.dataset.gsel); layer.fresh = false; layer.err = ""; renderLayer(); return; }
        if (lb.hasAttribute("data-grun")) { genRun(gin ? gin.value.trim() : ""); return; }
        if (lb.hasAttribute("data-gnew")) { var cur0 = (overlayOf(layer.key) || { versions: [] }).versions[layer.sel]; if (cur0 && cur0.scope) { layer.scope = cur0.scope; layer.commentIds = cur0.commentIds; } layer.sel = null; layer.fresh = true; layer.err = ""; renderLayer(); return; }
        if (lb.hasAttribute("data-gstop")) { if (layer.ctl) layer.ctl.abort(); return; }
        if (lb.hasAttribute("data-gapply")) { genApply(true); return; }
        if (lb.hasAttribute("data-gunapply")) { genApply(false); return; }
        if (lb.hasAttribute("data-gjson")) { var dj = overlayOf(layer.key); copyText(JSON.stringify(dj.versions[layer.sel].output, null, 2), lb); return; }
        if (lb.hasAttribute("data-gcopy")) { copyText(P().gens[layer.key].prompt, lb); return; }
      }
      if (target.closest(".layer")) return;
    }
    var pvb = target.closest && target.closest("[data-preview]");
    if (pvb) { openLayer({ kind: "preview", index: Number(pvb.dataset.preview) }); return; }
    var rvb = target.closest && target.closest("[data-review]");
    if (rvb) {
      var rp = rvb.dataset.review.split("|");
      openLayer({ kind: "review", sys: state.dsSys[P().model.project.code] || (P().model.systems.find(function (s) { return s.hasScreens; }) || {}).code, target: { type: rp[0], id: rp[1], label: rp[2] }, pending: null, labels: false });
      return;
    }
    var stb = target.closest && target.closest("[data-strun]");
    if (stb) { sectionTune(stb.dataset.strun, stb.dataset.sys); return; }
    var cgb = target.closest && target.closest("[data-cmtgen]");
    if (cgb) { commentGen(cgb.dataset.cmtgen); return; }
    var udb = target.closest && target.closest("[data-dsundo]");
    if (udb) { dsUndo(udb.dataset.dsundo); return; }
    var gb = target.closest && target.closest("[data-gen]");
    if (gb) { openLayer({ kind: "gen", key: gb.dataset.gen, sel: null }); return; }
    var tb = target.closest && target.closest("[data-dstune]");
    if (tb) {
      var ta = document.getElementById("ds-tune"), txt = ta ? ta.value.trim() : "";
      openLayer({ kind: "gen", key: "ds:" + tb.dataset.dstune, sel: null, fresh: true, draft: txt, scope: "global" });
      if (txt && AI.sample) genRun(txt);
      return;
    }
    var aib = target.closest && target.closest("[data-ai]");
    if (aib) { openLayer({ kind: "ai", key: aib.dataset.ai, target: "figma" }); return; }
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
  var rt = null;
  window.addEventListener("resize", function () { cancelAnimationFrame(rt); rt = requestAnimationFrame(function () { fitStages(); }); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitStages(); });
  rebuild();
  render();
  // claude.ai 뷰어에서 열리면 Claude 생성(sample)과 공유 저장(db)을 켠다. 아니면 프롬프트 복사로 대신한다
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("sample").then(function (s) { AI.sample = s; if (layer && layer.kind === "gen") renderLayer(); }, function () {});
    window.claude.use("db").then(function (db) {
      AI.db = db;
      if (!db) return;
      try {
        db.collection("reviews").onSnapshot(function (snap) {
          var next = {};
          snap.docs.forEach(function (d) { if (d.exists) next[d.id] = d.data(); });
          reviews = next;
          if (!(layer && (layer.busy || layer.pending))) { render(); if (layer) renderLayer(); }
        }, function () {});
        db.collection("gens").onSnapshot(function (snap) {
          var next = {};
          snap.docs.forEach(function (d) { if (d.exists) next[d.id] = d.data(); });
          overlays = next;
          rebuild();
          if (!(layer && layer.busy)) { render(); if (layer) renderLayer(); }
        }, function () {});
      } catch (e) { /* 구독 실패: 이 화면에서만 동작 */ }
    }, function () {});
  }
})();
