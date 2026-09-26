(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("planning-data").textContent);
  // 저장소 기준 모델. AI 적용본(overlay)은 이 위에 덧씌워 p.model을 만든다
  DATA.projects.forEach(function (p) { p.base = JSON.parse(JSON.stringify(p.model)); });
  // server: `planning serve` 웹 서비스(로그인·편집), 그 밖: 파일 하나로 여는 읽기 전용 뷰어
  var SRV = DATA.mode === "server";
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
    ver: ["버전 이력", "스냅샷과 최근 스냅샷 이후 변경 사항"],
    members: ["멤버", "프로젝트 공동 작업자와 권한, 초대"],
    aiset: ["AI 설정", "이 프로젝트에서 AI를 부르는 방법 — 로컬 LLM 또는 외부 API"]
  };

  var state = { route: { view: "home" }, rtmView: "matrix", off: {}, flowSys: "ALL", dsSys: {}, kbQ: "", proto: {} };
  if (!SRV) try {
    var saved = JSON.parse(localStorage.getItem("planning-viewer-2") || "{}");
    if (saved.route && (saved.route.view === "home" || (typeof saved.route.p === "number" && saved.route.p < DATA.projects.length))) state.route = saved.route;
    if (saved.rtmView) state.rtmView = saved.rtmView;
  } catch (e) { /* 저장소 없음 */ }
  var hash = (location.hash || "").slice(1);
  if (!SRV) DATA.projects.forEach(function (p, i) { if (p.model.project.code === hash) state.route = { view: "project", p: i, page: "dash" }; });

  function persist() {
    if (SRV) return syncUrl();
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
      if (!avail || !inner || !w) return;
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
    if (r.view === "home" || r.view === "account" || r.view === "admin") {
      html += '<nav class="nav-group"><span class="side-label">메뉴</span>' + navItem("전체 프로젝트", 'data-nav="home"', r.view === "home", DATA.projects.length) + (SRV ? navItem("내 계정 · AI 설정", 'data-nav="account"', r.view === "account") : "") + (SRV && ME && ME.isAdmin ? navItem("계정 관리 (관리자)", 'data-nav="admin"', r.view === "admin") : "") + "</nav>";
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
      if (SRV) groups.push(["설정 · " + ROLE_LABEL[p.role], [["members", null], ["aiset", null]]]);
      groups.forEach(function (g) {
        html += '<nav class="nav-group"><span class="side-label">' + g[0] + "</span>" + g[1].map(function (it) {
          opts.push([it[0], g[0] + " · " + PAGES[it[0]][0]]);
          return navItem(PAGES[it[0]][0], 'data-page="' + it[0] + '"', page === it[0], it[1]);
        }).join("") + "</nav>";
      });
      opts.unshift(["home", "← 전체 프로젝트"]);
    }
    var cur = r.view === "home" || r.view === "account" || r.view === "admin" ? "home" : r.view === "task" ? "req" : r.page;
    html += '<label class="sr" for="lnb-select">메뉴</label><select id="lnb-select" class="lnb-select">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + esc(o[1]) + "</option>";
    }).join("") + "</select>";
    html += SRV && ME ? '<div class="side-foot user-foot">' + (installEvt ? actBtn("install", "⤓ 앱으로 설치", null, "btn-primary install-btn") : "") + "<b>" + esc(ME.name) + "</b><span>" + esc(ME.email) + '</span><span class="row-actions">' + actBtn("account", "내 계정") + actBtn("logout", "로그아웃") + "</span></div>" :
      '<div class="side-foot">생성 ' + esc(fmtDate(DATA.generatedAt)) + "<br><code>planning view</code></div>";
    document.getElementById("side").innerHTML = html;
  }

  // ── 본문 ────────────────────────────────────────
  function render() {
    previews = [];
    renderLnb();
    var r = state.route, html;
    if (r.view === "home") html = renderHome();
    else if (r.view === "account") html = renderAccount();
    else if (r.view === "admin") html = renderAdmin();
    else if (r.view === "task") html = renderTask();
    else {
      var info = PAGES[r.page] || PAGES.dash, pr = P().model.project;
      html = '<header class="page-head"><span class="eyebrow">' + esc(pr.name) + '</span><h1>' + info[0] + "</h1><p>" + esc(info[1]) + "</p></header>" + overlayBanner() + renderPage(r.page);
    }
    document.getElementById("main").innerHTML = html;
    afterRender();
    syncUrl();
  }
  function overlayBanner() {
    var p = P();
    if (SRV || !p.appliedCount) return "";
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
      case "members": return SRV ? renderMembers() : renderDash();
      case "aiset": return SRV ? renderAiSettings() : renderDash();
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
        '<span class="pc-foot">' + (p.role ? ROLE_LABEL[p.role] + " · " : "") + esc(TEMPLATE[pr.submissionTemplate]) + " · 수정 " + esc(fmtDate(pr.updatedAt)) + "</span></button>";
    }).join("");
    var newCard = SRV ? '<button class="box pcard new" data-act="new-project"><b>+ 새 프로젝트</b><p class="hint">서비스 유형, 변경 범위, 시스템 구분을 정해 만듭니다. 만든 사람이 운영자가 되어 공동 작업자를 초대합니다.</p></button>' :
      '<div class="box pcard new"><b>새 프로젝트</b><p class="hint">서비스 유형, 변경 범위, 시스템 구분을 정해 만듭니다.</p>' + copyBox('planning init <코드> --name "<프로젝트명>" --type NEW --preset public-civil') + "</div>";
    return '<header class="page-head"><span class="eyebrow">Planning Studio</span><h1>프로젝트</h1><p>' + (SRV && ME ? esc(ME.name) + "님이 참여한 " : "") + "프로젝트 " + DATA.projects.length + "개 · 요구사항 " + totals.req + "건 · Task " + totals.task + "건 · 누락 " + totals.gap + "건</p></header>" +
      (SRV ? invitesBanner() : "") + '<section class="pgrid">' + cards + newCard + "</section>";
  }

  // ── 대시보드 ────────────────────────────────────
  function renderDash() {
    var p = P(), pr = p.model.project, rtm = p.rtm, c = rtm.coverage;
    var stages = STAGE_ORDER.filter(function (s) { return pr.stages[s]; }).map(function (s) {
      var st = pr.stages[s];
      var inner = '<span class="sid">' + (s === "S0A" ? "S0-A" : s) + '</span><span class="sname">' + STAGE[s] + '</span><span class="sst">' + STAGE_ST[st] + "</span>";
      return canEdit() ? '<button class="stage ' + st + ' editable" data-act="stage" data-arg="' + s + '" title="단계 상태 바꾸기">' + inner + "</button>" : '<div class="stage ' + st + '">' + inner + "</div>";
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

    var links = pr.links.map(function (l) {
      return '<div class="mini-row static"><span class="tag">' + esc({ SERVICE: "운영", FIGMA: "Figma", REFERENCE: "참고", VIEWER: "뷰어", OTHER: "기타" }[l.kind] || l.kind) + '</span><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + "</a><em>" + esc(l.systemCode || "") + "</em>" + (canEdit() ? '<button class="btn-sm" data-act="link-rm" data-arg="' + esc(l.url) + '" aria-label="' + esc(l.label) + ' 삭제">삭제</button>' : "") + "</div>";
    }).join("");
    var sysList = p.model.systems.map(function (s) { return '<div class="mini-row static">' + sysChip(s.code) + "<span>" + esc(s.name) + '</span><em class="hint">' + esc((s.users || []).join(", ") || (s.hasScreens ? "" : "화면 없음")) + "</em></div>"; }).join("");
    var setup = SRV ? '<div class="dash-grid">' +
      '<section class="section"><h2>시스템 구분 <small>' + p.model.systems.length + "개</small>" + editBtn("sys-add", "+ 시스템") + '</h2><div class="box mini">' + (sysList || '<div class="empty">시스템이 없습니다.</div>') + "</div></section>" +
      '<section class="section"><h2>참조 URL <small>AI 요청 프롬프트에 담김</small>' + editBtn("link-add", "+ URL") + '</h2><div class="box mini">' + (links || '<div class="empty">등록된 URL이 없습니다.</div>') + "</div></section></div>" : "";
    return '<section class="section"><h2>단계 진행' + (canEdit() ? " <small>단계를 누르면 상태를 바꿉니다</small>" : "") + '</h2><div class="box stages">' + stages + "</div></section>" +
      '<section class="kpis">' + kpis + "</section>" +
      '<div class="dash-3">' +
      '<section class="section"><h2>참조자료 <small>프로젝트 지식</small></h2><button class="box tile" data-page="kb"><b>' + p.model.sources.length + "<small>건</small></b><span>검색 색인 " + chunks + "조각</span></button></section>" +
      '<section class="section"><h2>디자인 시스템 <small>시스템 영역별</small></h2><div class="box mini">' + (dsRows || '<div class="empty">화면이 있는 시스템이 없습니다.</div>') + "</div></section>" +
      '<section class="section"><h2>최근 요구사항 변경</h2><div class="box mini">' + (hist || '<div class="empty">변경 이력이 없습니다.</div>') + "</div></section></div>" +
      '<div class="dash-grid">' +
      '<section class="section"><h2>시스템별 설계완료 <small>설계완료·검토완료 Task / 전체 Task</small></h2><div class="box bars">' + bars + axis +
      '<div class="stack-wrap"><span class="hint">Task 상태 분포 (전체 ' + c.tasks.total + '건)</span><div class="stack">' + stack + '</div><div class="legend">' + legend + "</div></div></div></section>" +
      '<section class="section"><h2>확인할 항목 <small>누락 ' + rtm.gaps.length + " · 근거 없음 " + rtm.orphans.length + '</small></h2><div class="box issues">' + (issues || '<div class="empty">누락이나 근거 없는 산출물이 없습니다.</div>') + "</div></section></div>" + setup;
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
        '</td><td class="num">' + (s.index ? s.index.chunks + "조각 · " + s.index.chars.toLocaleString() + "자" : "—") + '</td><td class="id">' + (used.map(esc).join("<br>") || '<span class="dash">—</span>') + "</td><td>" + esc(fmtDate(s.addedAt)) + "</td>" + (canEdit() ? "<td>" + (used.length ? "" : actBtn("kb-rm", "삭제", s.id)) + "</td>" : "") + "</tr>";
    }).join("");
    return '<section class="section"><div class="box kb-search"><label for="kb-q" class="kb-label">프로젝트 지식 검색</label><div class="kb-row"><input id="kb-q" type="search" placeholder="예: 반려 사유, 목록 50건, 부분공개" value="' + esc(state.kbQ) + '" autocomplete="off"></div>' +
      '<div id="kb-results" class="kb-results"></div></div></section>' +
      '<section class="section"><h2>올린 자료 <small>' + p.model.sources.length + "건</small>" + editBtn("kb-upload", "+ 자료 올리기", null, "btn-primary") + "</h2>" +
      '<div class="box twrap"><table><thead><tr><th>ID</th><th>자료</th><th>유형</th><th>색인</th><th>분량</th><th>근거로 쓴 요구사항</th><th>올린 날</th>' + (canEdit() ? "<th></th>" : "") + "</tr></thead><tbody>" +
      (rows || '<tr><td colspan="8" class="empty">아직 올린 자료가 없습니다.</td></tr>') + "</tbody></table></div>" +
      (SRV ? "" : '<div class="note"><b>자료 올리기</b><p class="hint">지원 형식: txt, md, csv, json, html, eml(메일), docx, pdf. 같은 파일은 한 번만 색인합니다. 한글(hwp)·pptx·xlsx는 보관만 하고 P1에서 지원합니다. 이 화면은 읽기 전용 뷰어라 파일 올리기는 명령어로 합니다(웹 업로드는 서버 모드 P7).</p>' +
      copyBox("planning -p " + P().model.project.code + " kb add <파일> [<파일>...]") + "</div>") + "</section>";
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
          steps ? '<div class="chain">' + steps + "</div>" : '<div class="notask">시스템별 Task가 아직 없습니다.' + (SRV ? "" : copyBox("planning -p " + m.project.code + " task auto " + row.requirementId)) + "</div>") +
        (canEdit() && row.status !== "EXCLUDED" ? '<div class="row-actions">' + actBtn("task-auto", "Task 자동 생성", row.requirementId) + actBtn("task-add", "+ Task 직접 추가", row.requirementId) + '<span class="sp"></span>' + actBtn("req-exclude", "제외", row.requirementId) + "</div>" : "") +
        "</article>";
    }).join("");
    return '<section class="section"><div class="note row"><div><b>요구사항 등록과 Task 생성</b><p class="hint">' + (SRV ? "등록할 때 ‘시스템별 Task 자동 생성’을 켜면" : "등록할 때 <code>--auto-tasks</code>를 붙이면") + ' 업무 동사(신청·심사·공개·알림·연계)를 시스템 성격에 맞춰 Task를 자동으로 만듭니다. <span class="auto">자동</span> 표시에 마우스를 올리면 근거가 보입니다. ' + (SRV ? "직접 만들려면 요구사항 아래 ‘Task 직접 추가’를 누릅니다." : "직접 만들려면 <code>task add</code>를 씁니다.") + '</p></div>' +
      (SRV ? editBtn("req-add", "+ 요구사항 등록", null, "btn-primary") : copyBox('planning -p ' + m.project.code + ' req add --title "<요구사항>" --desc "<설명>" --auto-tasks')) + "</div>" + (rows || '<div class="box empty">등록된 요구사항이 없습니다.</div>') + "</section>";
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
      (canEdit() ? '<div class="row-actions">' + actBtn("task-review", t.reviewer ? "검토 다시 기록" : "검토 완료 기록", t.taskId) + actBtn("task-rm", "Task 삭제", t.taskId) + "</div>" : "") +
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
    if (!d) body = '<div class="box empty">아직 컨셉을 제안받지 않았습니다. 와이어프레임을 그리기 전에 컨셉 3종을 제안받아 하나를 고릅니다.' + (SRV ? '<div class="row-actions center">' + editBtn("ds-propose", "컨셉 3종 제안받기", code, "btn-primary") + "</div>" : copyBox("planning -p " + p.model.project.code + " design propose " + code)) + "</div>";
    else if (d.status !== "SELECTED") body = renderProposals(p, d, ctx);
    else body = renderSystemDesign(p, d, ctx);
    return '<section class="section"><div class="toolbar">' + chips + aiBtn("ds:" + code, "AI 요청 · Figma / Claude") + "</div></section>" + body;
  }

  function renderProposals(p, d, ctx) {
    var cols = d.proposals.map(function (c) {
      var ds = asDs(c);
      return '<article class="box concept"><div class="concept-h"><span class="cid">' + esc(c.id) + '</span><div><b>' + esc(c.name) + "</b><p>" + esc(c.summary) + '</p></div></div><p class="fit"><b>어울리는 경우</b> ' + esc(c.fit) + "</p>" +
        swatches(c.tokens) + '<p class="hint">글꼴 ' + esc(fontName(c.tokens.font.family)) + " · 본문 " + c.tokens.font.scale.body + "px · 버튼 높이 " + c.tokens.control.height + "px</p>" + layoutChips(c.layout) +
        thumbs(ds, ctx, c.id + ". " + c.name) + (SRV ? (canEdit() ? '<div class="pick">' + actBtn("ds-select", "컨셉 " + esc(c.id) + " 으로 정하기", d.systemCode + "|" + c.id, "btn-primary") + "</div>" : "") : '<div class="pick"><span class="hint">이 컨셉으로 정하기</span>' + copyBox("planning -p " + p.model.project.code + " design select " + d.systemCode + " " + c.id) + "</div>") + "</article>";
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
      '<section class="section"><h2>컴포넌트 <small>' + d.components.length + "개 · 이미지를 누르면 댓글, 입력란으로 스타일 조정</small>" + editBtn("ds-comp-add", "+ 컴포넌트 추가", code) + "</h2>" + comps + "</section>" +
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
    if (!p.diff) diff = '<div class="box empty">스냅샷이 없습니다. 기준 버전을 고정하면 이후 변경 사항을 비교할 수 있습니다.' + (SRV ? "" : copyBox('planning -p ' + pr.code + ' snapshot --note "착수 기준선"')) + "</div>";
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
    return '<section class="section"><h2>스냅샷' + editBtn("snapshot", "+ 스냅샷 찍기", null, "btn-primary") + '</h2><div class="snaps">' + snaps + "</div></section>" +
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
    if (!p.gens || !p.gens[key] || (SRV && !canEdit())) return "";
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
  /** AI 값 보정: "30px"·"30" → 30, "#fff" → #FFFFFF (서버 normalizeDesignPatch 와 같은 규칙) */
  function normHex(v) {
    var t = String(v).trim(), sh = t.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i), full = t.match(/^#?([0-9a-f]{6})$/i);
    return sh ? ("#" + sh[1] + sh[1] + sh[2] + sh[2] + sh[3] + sh[3]).toUpperCase() : full ? "#" + full[1].toUpperCase() : t;
  }
  function coerceLike(base, patch) {
    if (patch == null) return patch;
    if (typeof base === "number" && typeof patch === "string") { var m = patch.trim().match(/^(-?\d+(?:\.\d+)?)\s*(px|rem)?$/i); return m ? (m[2] && m[2].toLowerCase() === "rem" ? Math.round(Number(m[1]) * 16) : Number(m[1])) : patch; }
    if (typeof base === "string" && /^#[0-9A-Fa-f]{6}$/.test(base) && typeof patch === "string") return normHex(patch);
    if (base && typeof base === "object" && !Array.isArray(base) && patch && typeof patch === "object" && !Array.isArray(patch)) {
      var o = {};
      Object.keys(patch).forEach(function (k) { o[k] = coerceLike(base[k], patch[k]); });
      return o;
    }
    return patch;
  }
  function normDsPatch(out, d) {
    if (!out || typeof out !== "object" || !d) return out;
    var o = Object.assign({}, out);
    if (o.tokens) o.tokens = coerceLike(d.tokens, o.tokens);
    if (o.componentStyles && typeof o.componentStyles === "object") {
      var cs = {};
      Object.keys(o.componentStyles).forEach(function (cid) {
        var vars = styleVarsOf(cid), src = o.componentStyles[cid] || {};
        cs[cid] = {};
        Object.keys(src).forEach(function (vn) {
          var sv = vars.find(function (x) { return x.name === vn; }), v = src[vn];
          cs[cid][vn] = !sv ? v : sv.type === "px" ? (typeof v === "number" || /^\s*\d+(\.\d+)?\s*$/.test(String(v)) ? String(v).trim() + "px" : String(v).replace(/\s+/g, "")) : sv.type === "color" ? normHex(v) : String(v).replace(/px$/i, "").trim();
        });
      });
      o.componentStyles = cs;
    }
    return o;
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
      // 서비스 모드에서는 AI 결과를 적용하면 서버 모델이 바로 바뀌므로 덧씌우지 않는다
      if (SRV) { p.model = p.base; p.appliedCount = 0; return; }
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
    if (SRV) return api("PUT", "/api/projects/" + enc(p.model.project.code) + "/kv/gens/" + enc(id), { doc: doc }).then(function () { return true; }, function (e) { toast(e.message, "err"); return false; });
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
        if (g.kind === "ds") out = normDsPatch(out, selectedDesign(p, g.target));
        var n = doc.versions.reduce(function (a, v) { return Math.max(a, v.n); }, 0) + 1;
        var v = { n: n, scope: scope, scopeLabel: scopeInfo(scope).label, commentIds: cids, instruction: instruction || (cids.length ? "댓글 " + cids.length + "개 반영" : "(1차 생성)"), from: base ? base.n : null, root: g.requiresInstruction ? rootText : null, output: out, at: new Date().toISOString() };
        if (g.kind !== "ds") { delete v.scope; delete v.scopeLabel; delete v.commentIds; }
        doc = Object.assign({}, doc, { versions: doc.versions.concat([v]).slice(-10), updatedAt: v.at });
        layer.sel = doc.versions.length - 1;
        layer.fresh = false;
        layer.draft = "";
        return saveOverlay(key, doc).then(function (saved) { layer.saved = saved; });
      }, function (e) {
        layer.err = e && e.code === "cancelled" ? "" : e && e.code === "server" ? e.message : (SAMPLE_ERR[e && e.code] || "생성하지 못했습니다(" + (e && e.code) + "). 다시 눌러 주세요.");
      })
      .then(function () { layer.busy = false; layer.ctl = null; if (layer) { render(); renderLayer(); } });
  }
  /** 서비스 모드: 생성 결과를 서버 모델에 바로 반영한다. 디자인은 적용 전 디자인을 기록해 되돌릴 수 있다 */
  function genApplySrv(apply) {
    var p = P(), key = layer.key, doc = JSON.parse(JSON.stringify(overlayOf(key))), v = doc.versions[layer.sel];
    var out = doc.kind === "ds" ? normDsPatch(v.output, selectedDesign(p, doc.target)) : v.output;
    var chk = apply ? validateOutput(doc.kind, doc.target, out, p, v.scope) : { errs: [] };
    if (chk.errs.length) { layer.err = "적용할 수 없습니다: " + chk.errs[0]; renderLayer(); return; }
    var before = doc.kind === "ds" ? JSON.parse(JSON.stringify(selectedDesign(p, doc.target))) : null;
    var run;
    if (apply) run = cmd({ op: "gen.apply", kind: doc.kind, target: doc.target, output: out, instruction: v.root || v.instruction, scope: v.scope });
    else {
      var last = (doc.history || [])[doc.history.length - 1];
      if (!last) return;
      run = cmd({ op: "design.revert", systemCode: doc.target, design: last.beforeDesign });
    }
    layer.busy = true; renderLayer();
    run.then(function () {
      if (doc.kind === "ds") {
        var after = selectedDesign(P(), doc.target);
        if (apply) {
          doc.history = (doc.history || []).concat([{ rev: after.revision, n: v.n, scope: v.scope, scopeLabel: v.scopeLabel, instruction: v.root || v.instruction, summary: v.output.summary || "", changes: designChanges(before, after), beforeDesign: before, at: new Date().toISOString() }]).slice(-10);
          doc.appliedRev = after.revision;
          doc.applied = v.n;
          layer.err = "";
          if (v.commentIds && v.commentIds.length) resolveComments(p, doc.target, v.commentIds, after.revision);
        } else {
          var gone = doc.history.pop();
          doc.applied = doc.history.length ? doc.history[doc.history.length - 1].n : null;
          doc.appliedRev = doc.history.length ? doc.history[doc.history.length - 1].rev : null;
          reopenComments(p, doc.target, gone.rev);
        }
      } else doc.applied = v.n;
      return saveOverlay(key, doc);
    }, function (e) { layer.err = e.message; }).then(function () { layer.busy = false; render(); if (layer) renderLayer(); });
  }
  function genApply(apply) {
    if (SRV) return genApplySrv(apply);
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
    if (SRV) { openLayer({ kind: "gen", key: "ds:" + code, sel: null }); genApplySrv(false); return; }
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
    if (SRV) return api("PUT", "/api/projects/" + enc(p.model.project.code) + "/kv/reviews/" + enc(id), { doc: doc }).then(function () { return true; }, function (e) { toast(e.message, "err"); return false; });
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

  /** 결과 형식이 틀려도(로컬 LLM 등) 레이어가 깨지지 않게 한다 — 오류 목록은 왼쪽 검사 결과에 나온다 */
  function genPreview(p, g, out) {
    try { return genPreviewRaw(p, g, out); } catch (e) { return '<div class="empty">결과 형식이 올바르지 않아 미리보기를 그릴 수 없습니다. 왼쪽 검사 결과를 확인하고 다시 생성하거나 미세조정하세요.</div>'; }
  }
  function genPreviewRaw(p, g, out) {
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
      return '<button class="ver-item' + (i === layer.sel ? " on" : "") + '" data-gsel="' + i + '"><b>v' + v.n + "</b>" + (v.n === doc.applied ? '<span class="pill DESIGNED">적용 중</span>' : (doc.history || []).some(function (h) { return h.n === v.n; }) ? '<span class="pill DESIGNED">적용됨</span>' : "") + (v.scopeLabel ? '<span class="tag">' + esc(v.scopeLabel) + "</span>" : "") + "<span>" + esc(v.from ? "v" + v.from + "에서 조정: " : "") + esc(v.instruction) + '</span><em class="hint">' + esc(fmtDate(v.at)) + "</em></button>";
    }).join("");
    var canGen = !!AI.sample && (!SRV || !!P().ai);
    if (SRV && aiCache.code !== P().model.project.code) loadAiInfo(P().model.project.code).then(function () { if (layer && layer.kind === "gen") renderLayer(); }, function () {});
    var label = !sel ? (g.requiresInstruction ? "조정 요청" : "추가 지시 (선택)") : "미세조정 프롬프트 · v" + sel.n + " 기준";
    var ph = !sel ? (g.requiresInstruction ? "예: 주 색을 더 진하게, 버튼을 둥글게" : "예: 목록은 50건까지 보이게, 반려 사유 보기 버튼 추가") : "예: 검색 조건에 '신청인' 추가, 버튼 문구를 '공개 신청하기'로";
    var appliedHist = sel && g.kind === "ds" ? (doc.history || []).find(function (h) { return h.n === sel.n; }) : null;
    var isApplied = sel && (appliedHist || (g.kind !== "ds" && sel.n === doc.applied));
    var chk = sel && !isApplied ? validateOutput(g.kind, g.target, SRV && g.kind === "ds" ? normDsPatch(sel.output, selectedDesign(p, g.target)) : sel.output, p, sel.scope) : null;
    var scopeNow = sel ? sel.scope : layer.scope;
    var scopeNote = g.kind === "ds" ? '<p class="scope-note"><b>조정 범위</b> ' + esc(scopeInfo(scopeNow || "global").label) + ' <span class="hint">' + esc(scopeInfo(scopeNow || "global").hint) + "</span>" + ((sel ? sel.commentIds : layer.commentIds) && (sel ? sel.commentIds : layer.commentIds).length ? '<br><span class="hint">댓글 ' + (sel ? sel.commentIds : layer.commentIds).length + "개 반영 요청</span>" : "") + "</p>" : "";
    var left = '<div class="gen-left">' + scopeNote + '<div class="gen-status">' + (g.kind === "ds" ? (doc.appliedRev ? '<span class="pill DESIGNED">누적 적용 r' + doc.appliedRev + "</span>" : '<span class="pill NOT_STARTED">저장소 기본값</span>') : doc.applied ? '<span class="pill DESIGNED">적용: v' + doc.applied + "</span>" : '<span class="pill NOT_STARTED">저장소 기본값</span>') +
      (SRV ? '<span class="hint">결과는 프로젝트 멤버와 공유되고, 적용하면 저장소 모델이 바로 바뀝니다</span><span class="gen-ai"><label for="gen-ai-switch">AI</label>' + (aiCache.code === P().model.project.code ? aiSwitch("gen-ai-switch") : '<span class="hint">' + esc(effLabel(P().ai)) + "</span>") + "</span>" : AI.db ? (AI.dbWrite ? '<span class="hint">결과와 적용 상태는 이 페이지를 보는 모두에게 공유됩니다</span>' : '<span class="hint warn-t">저장 권한이 없어 이 화면에서만 보입니다</span>') : '<span class="hint">저장 공간이 없어 새로고침하면 사라집니다</span>') + "</div>" +
      (vlist ? '<div class="ver-list">' + vlist + "</div>" : "") +
      (canGen ? '<label class="gen-label" for="gen-in">' + label + '</label><textarea id="gen-in" rows="4" placeholder="' + esc(ph) + '">' + esc(layer.draft || "") + "</textarea>" +
        '<div class="gen-actions">' + (layer.busy ? '<span id="gen-busy" class="hint">생각 중… (5~60초)</span><button class="btn-sm" data-gstop>멈춤</button>' : '<button class="btn-primary" data-grun>' + (!sel ? (g.requiresInstruction ? "미세조정 생성" : "1차 생성") : "미세조정") + "</button>" + (sel ? '<button class="btn-sm" data-gnew>처음부터 다시 생성</button>' : "")) + "</div>"
        : SRV ? '<div class="note warn"><b>AI 설정이 없습니다</b><p class="hint">운영자가 프로젝트 AI 설정을 등록하거나 내 계정에서 개인 설정을 등록하세요.</p></div>' : '<div class="note warn"><b>여기서는 생성할 수 없습니다</b><p class="hint">claude.ai에서 이 페이지를 열면 Claude로 바로 생성합니다. 지금은 아래 프롬프트를 복사해 Claude에 붙여 넣고, 받은 JSON을 <code>planning gen apply</code>로 반영하세요.</p><button class="btn-sm" data-gcopy>생성 프롬프트 복사</button></div>') +
      (isApplied ? '<div class="applied-note" role="status"><b>✓ 적용됨' + (appliedHist ? " (r" + appliedHist.rev + ")" : "") + "</b><span>" + (g.kind === "ds" ? "이 결과는 디자인 시스템에 반영돼 있습니다. 이 버전을 바탕으로 더 고치려면 위에 미세조정 프롬프트를 적으세요." : "이 결과가 저장소에 반영돼 있습니다.") + "</span>" + (appliedHist && appliedHist.changes && appliedHist.changes.length ? '<ul class="changes">' + appliedHist.changes.slice(0, 8).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "</div>" : "") +
      (layer.err ? '<p class="gen-err" role="alert">' + esc(layer.err) + "</p>" : "") +
      (chk && (chk.errs.length || chk.warns.length) ? '<ul class="chk">' + chk.errs.map(function (x) { return '<li class="e">' + esc(x) + "</li>"; }).join("") + chk.warns.map(function (x) { return '<li class="w">' + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
    var right = '<div class="gen-right">' + (sel ? genPreview(p, g, sel.output) : '<div class="empty">' + (g.kind === "ds" ? "바꾸고 싶은 점을 적고 ‘미세조정 생성’을 누르세요. 결과를 확인한 뒤 적용하면 이 디자인 시스템을 쓰는 모든 화면이 한꺼번에 바뀝니다." : "‘1차 생성’을 누르면 저장소의 요구사항·Task·참조자료·디자인 시스템을 근거로 AI가 만듭니다. 결과를 본 뒤 미세조정 프롬프트로 이어서 고칠 수 있습니다.") + "</div>") + "</div>";
    var foot = '<footer class="layer-f"><span class="hint">' + (sel ? "v" + sel.n + (isApplied ? " 적용됨" : " 미리보기") : "") + '</span><span class="sp"></span>' +
      (sel ? '<button class="btn-sm" data-gjson>JSON 복사</button>' : "") + (g.kind === "ds" ? (doc.history && doc.history.length ? '<button class="btn-sm" data-gunapply>마지막 적용 되돌리기</button>' : "") : doc.applied && !SRV ? '<button class="btn-sm" data-gunapply>적용 해제</button>' : "") +
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
    if (layer.kind === "aiconn") {
      body = renderConnLayer();
    } else if (layer.kind === "form") {
      body = renderFormLayer();
    } else if (layer.kind === "review") {
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
    root.innerHTML = '<div class="layer" data-backdrop><div class="layer-box' + (layer.kind === "ai" ? "" : layer.kind === "form" ? " form" : layer.kind === "aiconn" ? " conn" : " wide") + '" role="dialog" aria-modal="true" aria-labelledby="layer-t">' + body + "</div></div>";
    fitStages(root);
    if (layer.kind === "aiconn") { if (!layer.opened) { layer.opened = true; var fi = document.getElementById("ac-label"); if (fi) fi.focus(); } return; }
    var gi = document.getElementById("gen-in") || document.getElementById("rv-in") || root.querySelector("#fm input, #fm select, #fm textarea");
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

  // ── 웹 서비스 모드 (planning serve) ─────────────
  // 로그인한 사람의 프로젝트만 서버에서 받아 오고, 편집은 서버 명령(API)으로 한다. 권한: OWNER 운영자 · EDITOR 작업자 · VIEWER 열람자
  var ME = null, CFG = {}, INVITES = [], MY_AI = null;
  var ROLE_LABEL = { OWNER: "운영자", EDITOR: "작업자", VIEWER: "열람자" };
  var PROVIDER_LABEL = { anthropic: "Anthropic (Claude API)", "openai-compatible": "OpenAI 호환 API · 로컬 LLM" };
  var SOURCE_LABEL = { project: "프로젝트 설정", personal: "내 개인 설정", server: "서버 기본 설정" };
  function enc(s) { return encodeURIComponent(s); }
  function api(method, url, body, signal) {
    return fetch(url, { method: method, credentials: "same-origin", signal: signal, headers: { "content-type": "application/json", "x-planning": "1" }, body: method === "GET" ? undefined : JSON.stringify(body === undefined ? {} : body) })
      .then(function (res) {
        checkVersion(res.headers.get("x-app-version"));
        return res.text().then(function (t) {
          var j;
          try { j = t ? JSON.parse(t) : {}; } catch (e) { j = { error: "응답을 읽지 못했습니다 (" + res.status + ")" }; }
          if (!res.ok) { var err = new Error(j.error || "오류 " + res.status); err.status = res.status; err.code = "server"; if (res.status === 401 && ME) { ME = null; showAuth("login"); } throw err; }
          return j;
        });
      });
  }
  function role() { var p = SRV && state.route.view !== "home" && state.route.view !== "account" && state.route.view !== "admin" ? P() : null; return p ? p.role : null; }
  function canEdit() { var r = role(); return r === "OWNER" || r === "EDITOR"; }
  function isOwner() { return role() === "OWNER"; }
  function actBtn(act, label, arg, cls) { return '<button class="' + (cls || "btn-sm") + '" data-act="' + act + '"' + (arg != null ? ' data-arg="' + esc(arg) + '"' : "") + ">" + label + "</button>"; }
  function editBtn(act, label, arg, cls) { return canEdit() ? actBtn(act, label, arg, cls) : ""; }

  function setProject(view) {
    view.base = view.model;
    view.full = true;
    var i = DATA.projects.findIndex(function (x) { return x.model.project.code === view.model.project.code; });
    if (i < 0) { DATA.projects.push(view); i = DATA.projects.length - 1; } else DATA.projects[i] = view;
    return i;
  }
  function loadProjects() {
    return api("GET", "/api/projects").then(function (r) {
      DATA.projects = r.projects.map(function (v) { v.base = v.model; v.full = false; return v; });
    });
  }
  function loadKv(code) {
    return api("GET", "/api/projects/" + enc(code) + "/kv").then(function (r) {
      Object.keys(r.gens || {}).forEach(function (k) { overlays[k] = r.gens[k]; });
      Object.keys(r.reviews || {}).forEach(function (k) { reviews[k] = r.reviews[k]; });
    }, function () {});
  }
  /** at: 메뉴 이름("dash" 등) 또는 routeFromUrl() 결과 */
  function openProject(code, at) {
    return api("GET", "/api/projects/" + enc(code)).then(function (r) {
      var i = setProject(r.project);
      return loadKv(code).then(function () {
        rebuild();
        if (at && typeof at === "object") {
          if (at.sys) state.dsSys[code] = at.sys;
          if (at.view === "task" && findTrace(DATA.projects[i], at.taskId)) return go({ view: "task", p: i, taskId: at.taskId, tab: at.tab });
          return go({ view: "project", p: i, page: at.page || "dash" });
        }
        go({ view: "project", p: i, page: at || "dash" });
      });
    }, function (e) { toast(e.message, "err"); goHome(); });
  }
  function goHome() { return loadProjects().then(function () { go({ view: "home" }); }); }
  function refreshMe() {
    return api("GET", "/api/me").then(function (r) { ME = r.user; MY_AI = r.ai; INVITES = r.invites || []; });
  }
  /** 편집 명령 실행 → 서버가 저장하고 새 프로젝트 데이터를 돌려준다 */
  function cmd(c) {
    var code = P().model.project.code;
    return api("POST", "/api/projects/" + enc(code) + "/commands", { cmd: c }).then(function (r) {
      setProject(r.project);
      rebuild();
      render();
      toast(r.message);
      return r;
    });
  }
  /** 주소에 지금 화면을 담는다 — 새로고침해도 같은 화면으로 돌아온다
   *  /p/코드/메뉴[?sys=시스템] · /p/코드/task/TaskID/탭 · /account · /admin */
  function syncUrl() {
    if (!SRV || location.pathname.indexOf("/invite/") === 0) return;
    var r = state.route, want = "/";
    if ((r.view === "project" || r.view === "task") && P()) {
      var code = P().model.project.code;
      if (r.view === "task") want = "/p/" + enc(code) + "/task/" + enc(r.taskId) + "/" + (r.tab || "flow");
      else {
        want = "/p/" + enc(code) + "/" + (r.page || "dash");
        if (r.page === "design" && state.dsSys[code]) want += "?sys=" + enc(state.dsSys[code]);
      }
    } else if (r.view === "account") want = "/account";
    else if (r.view === "admin") want = "/admin";
    if (location.pathname + location.search !== want) history.replaceState(null, "", want);
  }
  /** 주소 → 화면 (새로고침·링크로 들어올 때) */
  function routeFromUrl() {
    var m = location.pathname.match(/^\/p\/([^/]+)(?:\/(.*))?$/);
    if (!m) return null;
    var rest = (m[2] || "").split("/").filter(Boolean).map(decodeURIComponent), code = decodeURIComponent(m[1]);
    var sys = new URLSearchParams(location.search).get("sys");
    if (rest[0] === "task" && rest[1]) return { code: code, view: "task", taskId: rest[1], tab: ["flow", "sb", "proto"].indexOf(rest[2]) >= 0 ? rest[2] : "flow" };
    return { code: code, view: "project", page: PAGES[rest[0]] ? rest[0] : "dash", sys: sys };
  }

  // 알림 토스트
  function toast(msg, tone) {
    if (!msg) return;
    var box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
    var t = document.createElement("div");
    t.className = "toast" + (tone === "err" ? " err" : "");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, tone === "err" ? 6000 : 3200);
  }

  // ── 입력 폼 레이어 ─────────────────────────────
  function openForm(f) { openLayer({ kind: "form", form: f, err: "" }); }
  function fieldHtml(x) {
    var id = "f-" + x.name, req = x.required ? ' <em class="fm-req">필수</em>' : "";
    var hint = x.hint ? '<span class="hint">' + x.hint + "</span>" : "";
    if (x.type === "html") return '<div class="fm-html">' + x.html + "</div>";
    if (x.type === "checkbox") return '<label class="fm-check"><input type="checkbox" id="' + id + '" name="' + x.name + '"' + (x.value ? " checked" : "") + "> " + esc(x.label) + "</label>" + hint;
    var input;
    if (x.type === "textarea") input = '<textarea id="' + id + '" name="' + x.name + '" rows="' + (x.rows || 3) + '" placeholder="' + esc(x.placeholder || "") + '">' + esc(x.value || "") + "</textarea>";
    else if (x.type === "select") input = '<select id="' + id + '" name="' + x.name + '">' + x.options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(x.value == null ? "" : x.value) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>";
    else if (x.type === "file") input = '<input type="file" id="' + id + '" name="' + x.name + '" multiple' + (x.accept ? ' accept="' + esc(x.accept) + '"' : "") + ">";
    else input = '<input type="' + (x.type || "text") + '" id="' + id + '" name="' + x.name + '" value="' + esc(x.value || "") + '" placeholder="' + esc(x.placeholder || "") + '" autocomplete="' + (x.type === "password" ? "new-password" : "off") + '"' + (x.maxlength ? ' maxlength="' + x.maxlength + '"' : "") + ">";
    return '<div class="fm-row"><label for="' + id + '">' + esc(x.label) + req + "</label>" + input + hint + "</div>";
  }
  function renderFormLayer() {
    var f = layer.form;
    if (layer.done) {
      return '<header class="layer-h"><div><span class="eyebrow">' + esc(f.eyebrow || "") + '</span><h2 id="layer-t">' + esc(f.title) + '</h2></div><button class="x" data-close-layer aria-label="닫기">✕</button></header>' +
        '<div class="fm">' + layer.done + '</div><footer class="layer-f"><span class="sp"></span><button class="btn-primary" data-close-layer>닫기</button></footer>';
    }
    return '<header class="layer-h"><div><span class="eyebrow">' + esc(f.eyebrow || "") + '</span><h2 id="layer-t">' + esc(f.title) + '</h2></div><button class="x" data-close-layer aria-label="닫기">✕</button></header>' +
      '<form class="fm" id="fm" novalidate>' + (f.intro ? '<p class="hint">' + f.intro + "</p>" : "") + f.fields.map(fieldHtml).join("") +
      '<p class="gen-err" id="fm-err" role="alert"' + (layer.err ? "" : " hidden") + ">" + esc(layer.err) + "</p>" +
      '<div class="fm-actions"><button type="button" class="btn-sm" data-close-layer>취소</button><button type="submit" class="btn-primary' + (f.danger ? " danger" : "") + '" id="fm-submit">' + esc(f.submit || "저장") + "</button></div></form>";
  }
  function formValues(form, f) {
    var v = {};
    f.fields.forEach(function (x) {
      if (x.type === "html") return;
      var el = form.elements[x.name];
      if (!el) return;
      v[x.name] = x.type === "checkbox" ? el.checked : x.type === "file" ? Array.prototype.slice.call(el.files || []) : el.value.trim();
    });
    return v;
  }
  function submitForm(form) {
    var f = layer.form, v = formValues(form, f), errEl = document.getElementById("fm-err"), btn = document.getElementById("fm-submit");
    var miss = f.fields.find(function (x) { return x.required && (x.type === "file" ? !v[x.name].length : !v[x.name]); });
    var showErr = function (m) { errEl.textContent = m; errEl.hidden = false; };
    if (miss) { showErr(miss.label + "을(를) 입력하세요"); var el = form.elements[miss.name]; if (el && el.focus) el.focus(); return; }
    btn.disabled = true;
    btn.textContent = "처리 중…";
    Promise.resolve().then(function () { return f.onSubmit(v); }).then(function (res) {
      if (res && res.done) { layer.done = res.done; renderLayer(); } else closeLayer();
    }, function (e) {
      btn.disabled = false;
      btn.textContent = f.submit || "저장";
      showErr(e.message || String(e));
    });
  }
  function confirmAct(title, message, submit, fn) {
    openForm({ title: title, intro: esc(message), fields: [], submit: submit, danger: true, onSubmit: fn });
  }
  function readB64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1] || ""); };
      r.onerror = function () { reject(new Error(file.name + "을(를) 읽지 못했습니다")); };
      r.readAsDataURL(file);
    });
  }
  function systemOptions(p, screensOnly) { return p.model.systems.filter(function (s) { return !screensOnly || s.hasScreens; }).map(function (s) { return [s.code, s.code + " " + s.name]; }); }
  function list(s) { return String(s || "").split(/[,\n]/).map(function (x) { return x.trim(); }).filter(Boolean); }

  // ── 편집 동작 ──────────────────────────────────
  var ACTIONS = {
    "new-project": function () {
      openForm({
        eyebrow: "새 프로젝트", title: "프로젝트 만들기", submit: "만들기", intro: "만든 사람이 이 프로젝트의 운영자가 됩니다. 운영자는 공동 작업자를 초대하고 AI 설정을 관리합니다.",
        fields: [
          { name: "code", label: "프로젝트 코드", required: true, placeholder: "예: PUBINFO", hint: "영문 대문자로 시작, 2~20자. 화면 ID·파일 이름에 쓰입니다.", maxlength: 20 },
          { name: "name", label: "프로젝트 이름", required: true, placeholder: "예: 정보공개 통합 서비스" },
          { name: "serviceType", label: "서비스 유형", type: "select", options: [["NEW", "신규 구축"], ["EXISTING", "기존 서비스"]], value: "NEW" },
          { name: "changeScope", label: "변경 범위 (기존 서비스일 때)", type: "select", options: [["", "—"], ["NEW_MENU", "신규 메뉴 추가"], ["MODIFY", "기존 메뉴 수정 (정보구조도 단계 패스)"], ["RENEWAL", "전면 개편"]] },
          { name: "submissionTemplate", label: "출력 양식", type: "select", options: [["GENERAL", "일반 양식"], ["PUBLIC", "공공기관 제출 양식"]] },
          { name: "preset", label: "시스템 구분", type: "select", options: [["public-civil", "공공 민원형 (대국민 · 민원포털 · 심사자)"], ["general", "일반 서비스 (사용자 · 관리자)"], ["none", "직접 추가"]], value: "public-civil" }
        ],
        onSubmit: function (v) {
          if (v.serviceType === "EXISTING" && !v.changeScope) throw new Error("기존 서비스는 변경 범위를 고르세요");
          return api("POST", "/api/projects", v).then(function (r) { return loadProjects().then(function () { return openProject(r.code); }); });
        }
      });
    },
    logout: function () { api("POST", "/api/logout").then(function () { location.href = "/"; }); },
    account: function () { go({ view: "account" }); },
    "inv-accept": function (id) {
      api("POST", "/api/invites/" + enc(id) + "/accept").then(function (r) { toast("초대를 수락했습니다"); return refreshMe().then(loadProjects).then(function () { return openProject(r.project); }); }, function (e) { toast(e.message, "err"); });
    },
    "inv-decline": function (id) { api("POST", "/api/invites/" + enc(id) + "/decline").then(refreshMe).then(render); },
    stage: function (sid) {
      var p = P();
      openForm({
        eyebrow: p.model.project.name, title: (sid === "S0A" ? "S0-A" : sid) + " " + STAGE[sid] + " 단계 상태", submit: "바꾸기",
        fields: [{ name: "status", label: "상태", type: "select", options: Object.keys(STAGE_ST).map(function (k) { return [k, STAGE_ST[k]]; }), value: p.model.project.stages[sid] }],
        onSubmit: function (v) { return cmd({ op: "stage.set", stage: sid, status: v.status }); }
      });
    },
    "sys-add": function () {
      openForm({
        eyebrow: "시스템 구분", title: "시스템 추가", submit: "추가", intro: "대국민·민원포털·심사자처럼 사용자와 화면이 다른 영역을 나눕니다. 요구사항 하나가 시스템마다 Task로 나뉩니다.",
        fields: [
          { name: "code", label: "코드", required: true, placeholder: "예: PUB", hint: "영문 대문자 2~6자", maxlength: 6 },
          { name: "name", label: "이름", required: true, placeholder: "예: 대국민 포털" },
          { name: "users", label: "주 사용자", placeholder: "예: 국민(비회원), 민원인(회원)", hint: "쉼표로 구분" },
          { name: "color", label: "구분 색", type: "color", value: "#2563EB" },
          { name: "hasScreens", label: "화면이 있는 시스템 (외부 연계처럼 화면이 없으면 끄기)", type: "checkbox", value: true }
        ],
        onSubmit: function (v) { return cmd({ op: "system.add", system: { code: v.code.toUpperCase(), name: v.name, users: list(v.users), color: v.color.toUpperCase(), hasScreens: v.hasScreens } }); }
      });
    },
    "link-add": function () {
      var p = P();
      openForm({
        eyebrow: "참조 URL", title: "참조 URL 추가", submit: "추가", intro: "운영 중인 서비스, Figma 파일, 참고 사이트 주소를 등록하면 AI 요청 프롬프트에 함께 담깁니다.",
        fields: [
          { name: "label", label: "이름", required: true, placeholder: "예: 현행 정보공개 포털" },
          { name: "url", label: "URL", type: "url", required: true, placeholder: "https://" },
          { name: "kind", label: "종류", type: "select", options: [["SERVICE", "운영 서비스"], ["FIGMA", "Figma 파일"], ["REFERENCE", "참고 사이트"], ["OTHER", "기타"]], value: "REFERENCE" },
          { name: "systemCode", label: "시스템 (특정 시스템에만 해당하면)", type: "select", options: [["", "전체"]].concat(systemOptions(p)) }
        ],
        onSubmit: function (v) { var l = { label: v.label, url: v.url, kind: v.kind }; if (v.systemCode) l.systemCode = v.systemCode; return cmd({ op: "link.add", link: l }); }
      });
    },
    "link-rm": function (url) { confirmAct("참조 URL 삭제", url + " 을(를) 삭제할까요?", "삭제", function () { return cmd({ op: "link.rm", url: url }); }); },
    "kb-upload": function () {
      var p = P();
      openForm({
        eyebrow: "참조자료", title: "자료 올리기", submit: "올리기", intro: "올린 문서는 이 프로젝트의 지식이 됩니다. 지원: " + esc((CFG.uploadExt || []).join(", ")) + ". 그 밖의 형식은 보관만 합니다. 한 번에 " + (CFG.maxUploadMb || 22) + "MB까지.",
        fields: [{ name: "files", label: "파일", type: "file", required: true }],
        onSubmit: function (v) {
          var total = v.files.reduce(function (a, f) { return a + f.size; }, 0);
          var max = CFG.maxUploadMb || 22;
          if (total > max * 1024 * 1024) throw new Error("한 번에 " + max + "MB까지 올릴 수 있습니다. 나눠서 올려 주세요");
          return Promise.all(v.files.map(function (f) { return readB64(f).then(function (d) { return { name: f.name, data: d }; }); })).then(function (files) {
            return api("POST", "/api/projects/" + enc(p.model.project.code) + "/sources", { files: files });
          }).then(function (r) { setProject(r.project); rebuild(); render(); toast(r.message); });
        }
      });
    },
    "kb-rm": function (id) { confirmAct("참조자료 삭제", id + " 자료와 검색 색인을 삭제할까요? 요구사항 출처로 쓰는 자료는 삭제할 수 없습니다.", "삭제", function () { return cmd({ op: "kb.rm", sourceId: id }); }); },
    "req-add": function () {
      var p = P();
      openForm({
        eyebrow: "요구사항", title: "요구사항 등록", submit: "등록",
        fields: [
          { name: "title", label: "요구사항", required: true, placeholder: "예: 대국민 정보공개" },
          { name: "description", label: "설명", type: "textarea", rows: 4, placeholder: "예: 민원인이 자료를 등록하면 심사자가 검토 후 승인·반려하고, 승인된 자료는 대국민 포털에 공개한다.", hint: "누가 무엇을 하는지(신청·심사·공개·알림·연계) 적으면 시스템별 Task를 더 정확히 만듭니다." },
          p.model.project.requirementIdMode === "ORIGINAL" ? { name: "originalId", label: "원본 요구사항 ID", required: true, placeholder: "예: SFR-001" } : { type: "html", html: "" },
          { name: "type", label: "유형", type: "select", options: [["FUNCTIONAL", "기능"], ["NON_FUNCTIONAL", "비기능"], ["POLICY", "정책"], ["CONTENT", "콘텐츠"], ["CONSTRAINT", "제약"]] },
          { name: "priority", label: "우선순위", type: "select", options: [["MUST", "필수 (MUST)"], ["SHOULD", "권장 (SHOULD)"], ["COULD", "선택 (COULD)"]] },
          { name: "sourceId", label: "출처 자료", type: "select", options: [["", "없음"]].concat(p.model.sources.map(function (s) { return [s.id, s.id + " " + s.title]; })) },
          { name: "locator", label: "출처 위치", placeholder: "예: p.14, 3.2절" },
          { name: "autoTasks", label: "시스템별 Task 자동 생성", type: "checkbox", value: true }
        ],
        onSubmit: function (v) {
          var input = { title: v.title, description: v.description, type: v.type, priority: v.priority };
          if (v.originalId) input.originalId = v.originalId;
          if (v.sourceId) input.sources = [{ sourceId: v.sourceId, locator: v.locator }];
          return cmd({ op: "req.add", input: input, autoTasks: v.autoTasks });
        }
      });
    },
    "task-auto": function (rid) { cmd({ op: "task.auto", requirementId: rid }).catch(function (e) { toast(e.message, "err"); }); },
    "task-add": function (rid) {
      var p = P(), req = p.model.requirements.find(function (r) { return r.id === rid; });
      openForm({
        eyebrow: rid + " " + req.title, title: "Task 추가", submit: "추가", intro: "요구사항을 시스템 영역별 처리 단계로 나눕니다. 예: 민원포털 자료 등록 → 심사자 승인 → 대국민 공개.",
        fields: [
          { name: "systemCode", label: "시스템", type: "select", options: systemOptions(p), required: true },
          { name: "actor", label: "행위자", placeholder: "예: 심사자" },
          { name: "action", label: "처리 내용", required: true, placeholder: "예: 검토 후 승인·반려" },
          { name: "after", label: "선행 Task", type: "select", options: [["", "없음"]].concat(req.tasks.map(function (t) { return [t.id, shortTask(t.id, rid) + " [" + t.systemCode + "] " + t.action]; })), value: req.tasks.length ? req.tasks[req.tasks.length - 1].id : "" },
          { name: "to", label: "처리 후 자료 상태", placeholder: "예: 공개" },
          { name: "noScreenReason", label: "화면이 없다면 사유", placeholder: "예: 외부 시스템 자동 연계" }
        ],
        onSubmit: function (v) {
          var input = { systemCode: v.systemCode, action: v.action, actor: v.actor || undefined, after: v.after ? [v.after] : [] };
          if (v.to) input.transition = { to: v.to };
          if (v.noScreenReason) input.noScreenReason = v.noScreenReason;
          return cmd({ op: "task.add", requirementId: rid, input: input });
        }
      });
    },
    "req-exclude": function (rid) {
      openForm({ eyebrow: rid, title: "요구사항 제외", submit: "제외", danger: true, fields: [{ name: "reason", label: "제외 사유", type: "textarea", required: true, placeholder: "예: 2차 사업 범위로 이관 (CR-003)" }], onSubmit: function (v) { return cmd({ op: "req.exclude", id: rid, reason: v.reason }); } });
    },
    "task-review": function (tid) {
      openForm({
        eyebrow: tid, title: "검토 완료 기록", submit: "기록", intro: "요구사항 추적표의 검토완료 상태는 사람이 확인해야 합니다.",
        fields: [{ name: "reviewer", label: "검토자", required: true, value: ME ? ME.name : "" }, { name: "note", label: "메모", type: "textarea" }],
        onSubmit: function (v) { return cmd({ op: "task.review", taskId: tid, reviewer: v.reviewer, note: v.note }); }
      });
    },
    "task-rm": function (tid) {
      confirmAct("Task 삭제", tid + " 를 삭제할까요? 선행으로 쓰는 Task가 있으면 삭제할 수 없습니다.", "삭제", function () {
        return cmd({ op: "task.rm", taskId: tid }).then(function () { go({ view: "project", p: state.route.p, page: "req" }); });
      });
    },
    "ds-propose": function (sys) { cmd({ op: "design.propose", systemCode: sys }).catch(function (e) { toast(e.message, "err"); }); },
    "ds-select": function (arg) {
      var a = arg.split("|");
      confirmAct("컨셉 " + a[1] + " 선택", a[0] + " 디자인 시스템을 컨셉 " + a[1] + "(으)로 만듭니다. 이 시스템의 화면설계서와 프로토타입이 이 디자인으로 그려집니다.", "이 컨셉으로 정하기", function () { return cmd({ op: "design.select", systemCode: a[0], conceptId: a[1] }); });
    },
    "ds-comp-add": function (sys) {
      openForm({
        eyebrow: sys + " 디자인 시스템", title: "컴포넌트 추가", submit: "추가", intro: "화면설계서에서 새 컴포넌트가 필요하면 먼저 디자인 시스템에 추가하고 씁니다.",
        fields: [
          { name: "id", label: "컴포넌트 ID", required: true, placeholder: "예: review-timeline", hint: "영문 소문자·숫자·하이픈" },
          { name: "name", label: "이름", required: true, placeholder: "예: 심사 이력 타임라인" },
          { name: "category", label: "분류", type: "select", options: Object.keys(CATEGORY).map(function (k) { return [k, CATEGORY[k]]; }) },
          { name: "description", label: "설명", type: "textarea" },
          { name: "variants", label: "변형", placeholder: "예: 기본, 간단히", hint: "쉼표로 구분" },
          { name: "addedFor", label: "필요한 화면·Task", placeholder: "예: ADM_INF_REV_020" }
        ],
        onSubmit: function (v) { return cmd({ op: "design.component", systemCode: sys, input: { id: v.id, name: v.name, category: v.category, description: v.description, variants: list(v.variants), addedFor: v.addedFor || undefined } }); }
      });
    },
    snapshot: function () {
      var p = P();
      openForm({
        eyebrow: "버전", title: "스냅샷 찍기 · v" + p.model.project.version, submit: "스냅샷", intro: "지금 상태를 기준 버전으로 고정합니다. 이후 변경 사항은 이 버전과 비교해 보여 줍니다.",
        fields: [{ name: "note", label: "메모", placeholder: "예: 착수 기준선, 1차 보고" }, { name: "major", label: "큰 버전 올리기 (0.x → 1.0)", type: "checkbox" }],
        onSubmit: function (v) { return cmd({ op: "snapshot", note: v.note, major: v.major }); }
      });
    },
    "proj-rename": function () {
      var p = P();
      openForm({ title: "프로젝트 이름 바꾸기", submit: "바꾸기", fields: [{ name: "name", label: "이름", required: true, value: p.model.project.name }], onSubmit: function (v) { return cmd({ op: "project.update", name: v.name }); } });
    },
    "proj-delete": function () {
      var code = P().model.project.code;
      openForm({
        title: "프로젝트 삭제", submit: "삭제", danger: true, intro: "프로젝트와 멤버·초대·AI 설정이 모두 지워집니다. 서버 보관함(.service/trash)에만 남습니다. 확인하려면 프로젝트 코드 <b>" + esc(code) + "</b>를 입력하세요.",
        fields: [{ name: "confirm", label: "프로젝트 코드", required: true }],
        onSubmit: function (v) { return api("DELETE", "/api/projects/" + enc(code), { confirm: v.confirm }).then(function () { toast("프로젝트를 삭제했습니다"); return goHome(); }); }
      });
    },
    "mem-invite": function () {
      var code = P().model.project.code;
      openForm({
        eyebrow: "공동 작업자", title: "초대하기", submit: "초대 링크 만들기", intro: "초대받은 사람은 이 이메일로 가입하거나 로그인하면 첫 화면에서 초대를 수락할 수 있습니다. 만든 링크를 메일·메신저로 보내도 됩니다(14일 유효).",
        fields: [
          { name: "email", label: "이메일", type: "email", required: true, placeholder: "name@example.com" },
          { name: "role", label: "권한", type: "select", options: [["EDITOR", "작업자 — 요구사항·산출물 편집, AI 생성"], ["VIEWER", "열람자 — 보기, 디자인 댓글"], ["OWNER", "운영자 — 멤버·AI 설정 관리까지"]], value: "EDITOR" }
        ],
        onSubmit: function (v) {
          return api("POST", "/api/projects/" + enc(code) + "/invites", v).then(function (r) {
            renderMembersAsync();
            return { done: '<p><b>' + esc(r.invite.email) + "</b> 님을 " + ROLE_LABEL[r.invite.role] + "(으)로 초대했습니다.</p><p class=\"hint\">이 링크는 지금만 볼 수 있습니다. 복사해서 보내 주세요.</p>" + copyBox(r.link) };
          });
        }
      });
    },
    "inv-cancel": function (id) { api("DELETE", "/api/projects/" + enc(P().model.project.code) + "/invites/" + enc(id)).then(renderMembersAsync, function (e) { toast(e.message, "err"); }); },
    "mem-rm": function (uid) {
      confirmAct("멤버 내보내기", "이 멤버를 프로젝트에서 내보낼까요?", "내보내기", function () { return api("DELETE", "/api/projects/" + enc(P().model.project.code) + "/members/" + enc(uid)).then(renderMembersAsync); });
    },
    leave: function () {
      confirmAct("프로젝트 나가기", "이 프로젝트에서 나갈까요? 다시 들어오려면 초대를 받아야 합니다.", "나가기", function () { return api("DELETE", "/api/projects/" + enc(P().model.project.code) + "/members/me").then(goHome); });
    },
    "pw-change": function () {
      openForm({
        title: "비밀번호 바꾸기", submit: "바꾸기",
        fields: [{ name: "current", label: "현재 비밀번호", type: "password", required: true }, { name: "next", label: "새 비밀번호 (8자 이상)", type: "password", required: true }],
        onSubmit: function (v) { return api("POST", "/api/me/password", v).then(function () { toast("비밀번호를 바꿨습니다"); }); }
      });
    }
  };

  // ── 멤버 · AI 설정 · 내 계정 화면 ───────────────
  var memCache = null, aiCache = {};
  function renderMembersAsync() { memCache = null; if (state.route.page === "members") render(); }
  function renderMembers() {
    var p = P(), code = p.model.project.code;
    if (!memCache || memCache.code !== code) {
      api("GET", "/api/projects/" + enc(code) + "/members").then(function (r) { memCache = Object.assign({ code: code }, r); render(); }, function (e) { toast(e.message, "err"); });
      return '<div class="box empty">멤버를 불러오는 중…</div>';
    }
    var own = isOwner();
    var rows = memCache.members.map(function (m) {
      var me = ME && m.userId === ME.id;
      var roleCell = own && !me ? '<select data-memrole="' + esc(m.userId) + '" aria-label="' + esc(m.name) + ' 권한">' + ["OWNER", "EDITOR", "VIEWER"].map(function (r) { return '<option value="' + r + '"' + (r === m.role ? " selected" : "") + ">" + ROLE_LABEL[r] + "</option>"; }).join("") + "</select>" : '<span class="pill ' + (m.role === "OWNER" ? "REVIEWED" : m.role === "EDITOR" ? "DESIGNED" : "NOT_STARTED") + '">' + ROLE_LABEL[m.role] + "</span>";
      return "<tr><td><b>" + esc(m.name) + "</b>" + (me ? ' <span class="tag">나</span>' : "") + '</td><td class="mono">' + esc(m.email) + "</td><td>" + roleCell + "</td><td>" + esc(fmtDate(m.addedAt)) + "</td><td>" + (own && !me ? actBtn("mem-rm", "내보내기", m.userId) : me && !(m.role === "OWNER" && memCache.members.filter(function (x) { return x.role === "OWNER"; }).length === 1) ? actBtn("leave", "나가기") : "") + "</td></tr>";
    }).join("");
    var inv = own ? '<section class="section"><h2>대기 중인 초대 <small>' + memCache.invites.length + "건</small></h2>" + (memCache.invites.length ? '<div class="box twrap"><table><thead><tr><th>이메일</th><th>권한</th><th>보낸 날</th><th>만료</th><th></th></tr></thead><tbody>' + memCache.invites.map(function (i) {
      return '<tr><td class="mono">' + esc(i.email) + "</td><td>" + ROLE_LABEL[i.role] + "</td><td>" + esc(fmtDate(i.createdAt)) + "</td><td>" + esc(fmtDate(i.expiresAt)) + "</td><td>" + actBtn("inv-cancel", "취소", i.id) + "</td></tr>";
    }).join("") + "</tbody></table></div>" : '<div class="box empty">대기 중인 초대가 없습니다.</div>') + "</section>" : "";
    var danger = own ? '<section class="section"><h2>프로젝트 관리</h2><div class="box pad row-actions">' + actBtn("proj-rename", "이름 바꾸기") + actBtn("proj-delete", "프로젝트 삭제", null, "btn-sm danger") + "</div></section>" : "";
    return '<section class="section"><div class="toolbar"><p class="hint" style="margin:0">운영자는 멤버를 초대하고 권한을 바꾸며 프로젝트 AI 설정을 관리합니다. 작업자는 편집과 AI 생성을, 열람자는 보기와 디자인 댓글을 할 수 있습니다.</p>' + (own ? actBtn("mem-invite", "+ 공동 작업자 초대", null, "btn-primary") : "") + "</div>" +
      '<div class="box twrap"><table><thead><tr><th>이름</th><th>이메일</th><th>권한</th><th>참여</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></section>" + inv + danger;
  }
  // ── AI 연결 (여러 개 저장 · 모델 목록 불러오기 · 빠른 전환) ──
  var AI_PRESETS = {
    nvidia: { label: "NVIDIA", provider: "openai-compatible", baseUrl: "https://integrate.api.nvidia.com/v1", key: "nvapi-… (build.nvidia.com에서 발급)", hint: "NVIDIA API 카탈로그(build.nvidia.com)의 OpenAI 호환 주소입니다. ‘모델 불러오기’로 쓸 모델을 고르세요." },
    lmstudio: { label: "LM Studio", provider: "openai-compatible", baseUrl: "http://localhost:1234/v1", key: "보통 비움", hint: "LM Studio → Developer(개발자) 탭 → Start Server. 이 서비스가 인터넷(Vercel)에 있으면 localhost 로는 닿지 않습니다. 외부에서 접속 가능한 주소(포트 포워딩, cloudflared·ngrok 터널 등)를 넣으세요." },
    ollama: { label: "Ollama", provider: "openai-compatible", baseUrl: "http://localhost:11434/v1", key: "보통 비움", hint: "ollama serve 주소의 /v1. 인터넷 배포 서비스에서 쓰려면 외부 접속 가능한 주소가 필요합니다." },
    anthropic: { label: "Anthropic", provider: "anthropic", baseUrl: "", key: "sk-ant-… (필수)", hint: "Claude API. 주소는 비워 두면 기본 주소를 씁니다." },
    custom: { label: "직접 입력", provider: "openai-compatible", baseUrl: "", key: "필요하면 입력", hint: "OpenAI 호환 /v1 주소 (vLLM, OpenRouter, Together, 사내 게이트웨이 등)" }
  };
  var PRESET_ORDER = ["nvidia", "lmstudio", "ollama", "anthropic", "custom"];
  function aiBase(scope) { return scope === "project" ? "/api/projects/" + enc(P().model.project.code) + "/ai" : "/api/me/ai"; }
  function aiSetOf(scope) { return scope === "project" ? (aiCache.project || { conns: [], active: null }) : (MY_AI || { conns: [], active: null }); }
  function afterAiChange(scope) {
    return (scope === "project" ? loadAiInfo(P().model.project.code) : refreshMe().then(function () { if (state.route.view !== "account" && state.route.view !== "home" && state.route.view !== "admin") return loadAiInfo(P().model.project.code); })).then(function () { render(); if (layer && layer.kind === "gen") renderLayer(); });
  }
  function effLabel(e) { return e ? (e.label ? e.label + " · " : "") + e.model : "설정 없음"; }

  /** 빠른 전환 드롭다운: 프로젝트 기본 / 프로젝트 연결의 모델 / 내 연결의 모델 */
  function aiSwitch(id) {
    var a = aiCache, cur = a.choice ? a.choice.scope + "|" + a.choice.conn + "|" + a.choice.model : "";
    var proj = a.project || { conns: [] }, mine = a.personal || { conns: [] };
    var pa = proj.active && proj.conns.find(function (c) { return c.id === proj.active.conn; });
    var opt = function (v, t) { return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(t) + "</option>"; };
    var group = function (label, scope, set) {
      if (!set.conns.length) return "";
      return '<optgroup label="' + esc(label) + '">' + set.conns.map(function (c) { return c.models.map(function (m) { return opt(scope + "|" + c.id + "|" + m, c.label + " · " + m); }).join(""); }).join("") + "</optgroup>";
    };
    var html = opt("", "프로젝트 기본" + (pa ? " — " + pa.label + " · " + proj.active.model : mine.active ? " (없음 → 내 기본)" : "")) + group("프로젝트 연결", "project", proj) + group("내 연결", "personal", mine);
    return '<select id="' + id + '" class="ai-switch" data-aiswitch aria-label="이 프로젝트에서 쓸 AI 연결·모델">' + html + "</select>";
  }
  function switchAi(val) {
    var parts = val ? val.split("|") : null;
    var choice = parts ? { scope: parts[0], conn: parts[1], model: parts.slice(2).join("|") } : null;
    api("PATCH", "/api/projects/" + enc(P().model.project.code) + "/members/me", { aiChoice: choice }).then(function (r) {
      P().ai = r.ai; aiCache.choice = choice; aiCache.effective = r.ai;
      toast("AI: " + effLabel(r.ai));
      render(); if (layer && layer.kind === "gen") renderLayer();
    }, function (e) { toast(e.message, "err"); });
  }

  /** 연결 카드 — 모델마다 기본 지정·연결 확인 */
  function connCards(scope, set, manage, canTest) {
    if (!set.conns.length) return '<div class="box empty">저장한 연결이 없습니다.' + (manage ? '<div class="row-actions center">' + actBtn("ai-conn-add", "+ 연결 추가", scope, "btn-primary") + "</div>" : "") + "</div>";
    return '<div class="conns">' + set.conns.map(function (c) {
      var models = c.models.map(function (m) {
        var isDef = set.active && set.active.conn === c.id && set.active.model === m, key = scope + "|" + c.id + "|" + m;
        return '<li class="' + (isDef ? "on" : "") + '"><span class="mono">' + esc(m) + "</span>" + (isDef ? '<span class="pill DESIGNED">기본</span>' : manage ? actBtn("ai-default", "기본으로", key) : "") + (canTest ? actBtn("ai-test", "확인", key) : "") + "</li>";
      }).join("");
      return '<article class="box conn"><div class="conn-h"><b>' + esc(c.label) + '</b><span class="tag">' + esc(c.preset && AI_PRESETS[c.preset] ? AI_PRESETS[c.preset].label : c.provider === "anthropic" ? "Anthropic" : "OpenAI 호환") + "</span>" +
        (c.baseUrl ? '<span class="hint mono">' + esc(c.baseUrl) + "</span>" : "") + '<span class="sp"></span><span class="hint">키 ' + (c.hasKey ? "저장됨" : "없음") + (c.maxTokens ? " · 최대 " + c.maxTokens + "토큰" : "") + "</span></div>" +
        '<ul class="models">' + models + "</ul>" + (manage ? '<div class="row-actions">' + actBtn("ai-conn-edit", "편집 · 모델 추가", scope + "|" + c.id) + actBtn("ai-conn-del", "삭제", scope + "|" + c.id, "btn-sm danger") + "</div>" : "") + "</article>";
    }).join("") + "</div>" + (manage ? '<div class="row-actions">' + actBtn("ai-conn-add", "+ 연결 추가", scope) + "</div>" : "");
  }

  Object.assign(ACTIONS, {
    "ai-conn-add": function (scope) { openConn(scope, null); },
    "ai-conn-edit": function (arg) { var a = arg.split("|"); openConn(a[0], aiSetOf(a[0]).conns.find(function (c) { return c.id === a[1]; })); },
    "ai-conn-del": function (arg) {
      var a = arg.split("|"), c = aiSetOf(a[0]).conns.find(function (x) { return x.id === a[1]; });
      confirmAct("연결 삭제", c.label + " 연결과 저장한 키·모델을 지웁니다." + (a[0] === "project" ? " 이 연결을 고른 멤버는 프로젝트 기본으로 돌아갑니다." : ""), "삭제", function () {
        return api("DELETE", aiBase(a[0]) + "/conns/" + enc(a[1])).then(function () { toast("연결을 삭제했습니다"); return afterAiChange(a[0]); });
      });
    },
    "ai-default": function (arg) {
      var a = arg.split("|");
      api("PUT", aiBase(a[0]) + "/active", { conn: a[1], model: a.slice(2).join("|") }).then(function () { toast("기본 모델: " + a.slice(2).join("|")); return afterAiChange(a[0]); }, function (e) { toast(e.message, "err"); });
    },
    "ai-test": function (arg, btn) {
      var a = arg ? arg.split("|") : [], inProject = state.route.view === "project" || state.route.view === "task";
      var url = inProject ? "/api/projects/" + enc(P().model.project.code) + "/ai/test" : "/api/me/ai/test";
      var old = btn.textContent;
      btn.disabled = true; btn.textContent = "확인 중…";
      api("POST", url, a.length ? { scope: a[0], conn: a[1], model: a.slice(2).join("|") } : {}).then(function (r) {
        toast("연결됨 · " + (r.label ? r.label + " · " : "") + r.model + " · " + (r.ms / 1000).toFixed(1) + "초");
      }, function (e) { toast(e.message, "err"); }).then(function () { btn.disabled = false; btn.textContent = old; });
    }
  });

  // 연결 추가·편집 레이어: 종류 고르기 → 주소·키(선택) → 모델 불러오기 → 여러 개 고르기 → 저장
  function openConn(scope, conn) {
    var preset = conn ? conn.preset || (conn.provider === "anthropic" ? "anthropic" : "custom") : "nvidia";
    var ps = AI_PRESETS[preset];
    openLayer({ kind: "aiconn", ac: {
      scope: scope, id: conn ? conn.id : null, preset: preset, hasKey: conn ? conn.hasKey : false,
      label: conn ? conn.label : ps.label, baseUrl: conn ? conn.baseUrl || "" : ps.baseUrl, apiKey: "", clearKey: false, maxTokens: conn && conn.maxTokens ? String(conn.maxTokens) : "",
      models: conn ? conn.models.slice() : [], fetched: [], filter: "", busy: false, err: ""
    } });
  }
  function acSync() {
    var ac = layer && layer.ac;
    if (!ac) return;
    var v = function (id) { var el = document.getElementById(id); return el ? el.value : null; };
    if (v("ac-label") != null) ac.label = v("ac-label");
    if (v("ac-url") != null) ac.baseUrl = v("ac-url").trim();
    if (v("ac-key") != null) ac.apiKey = v("ac-key");
    if (v("ac-max") != null) ac.maxTokens = v("ac-max").trim();
    var ck = document.getElementById("ac-clear");
    if (ck) ac.clearKey = ck.checked;
  }
  /** 모델 불러오기 결과 — 성공/실패와 원인·해결 방법·요청 정보 */
  function acProbeBox() {
    var ac = layer.ac, r = ac.probe;
    if (ac.busy) return '<div class="ac-probe busy" role="status"><b>불러오는 중…</b><span>최대 20초 · GET ' + esc((ac.baseUrl || "").replace(/\/$/, "") + "/models") + "</span></div>";
    if (!r) return "";
    var meta = [r.url ? "GET " + r.url : "", r.status ? "HTTP " + r.status : "", r.code ? r.code : "", r.ms != null ? (r.ms / 1000).toFixed(1) + "초" : ""].filter(Boolean).join(" · ");
    if (r.ok) return '<div class="ac-probe ok" role="status"><b>✓ 불러오기 성공 — 모델 ' + r.models.length + "개</b>" + (meta ? '<span class="mono">' + esc(meta) + "</span>" : "") + "<span>아래 목록에서 쓸 모델을 체크하세요.</span></div>";
    return '<div class="ac-probe fail" role="alert"><b>✕ 불러오기 실패 — ' + esc(r.error || "알 수 없는 오류") + "</b>" + (r.hint ? '<span class="fix"><em>해결</em> ' + esc(r.hint) + "</span>" : "") +
      (meta ? '<span class="mono">' + esc(meta) + "</span>" : "") + (r.detail ? '<span class="mono detail">서버 응답: ' + esc(r.detail) + "</span>" : "") + '<span>목록 없이도 아래 칸에 모델 이름을 직접 입력해 저장할 수 있습니다.</span></div>';
  }
  function acChips() {
    var ac = layer.ac;
    return ac.models.length ? ac.models.map(function (m) { return '<span class="chip-m"><span class="mono">' + esc(m) + '</span><button data-acrm="' + esc(m) + '" aria-label="' + esc(m) + ' 빼기">✕</button></span>'; }).join("") : '<span class="hint">아직 고른 모델이 없습니다</span>';
  }
  function acList() {
    var ac = layer.ac, q = ac.filter.trim().toLowerCase();
    var rows = ac.fetched.filter(function (m) { return !q || m.toLowerCase().indexOf(q) >= 0; });
    if (!ac.fetched.length) return ac.probe ? "" : '<p class="hint">‘모델 불러오기’를 누르면 이 연결에서 쓸 수 있는 모델이 나옵니다</p>';
    return rows.length ? rows.slice(0, 300).map(function (m) {
      return '<label class="ac-model"><input type="checkbox" data-acmodel="' + esc(m) + '"' + (ac.models.indexOf(m) >= 0 ? " checked" : "") + '> <span class="mono">' + esc(m) + "</span></label>";
    }).join("") + (rows.length > 300 ? '<p class="hint">' + (rows.length - 300) + "개 더 — 검색어로 좁혀 주세요</p>" : "") : '<p class="hint">' + (ac.fetched.length ? "검색 결과가 없습니다" : "‘모델 불러오기’를 누르면 이 연결에서 쓸 수 있는 모델이 나옵니다") + "</p>";
  }
  function renderConnLayer() {
    var ac = layer.ac, ps = AI_PRESETS[ac.preset], anth = ps.provider === "anthropic";
    var presets = '<div class="seg" role="group" aria-label="연결 종류">' + PRESET_ORDER.map(function (k) { return '<button data-acpreset="' + k + '" aria-pressed="' + (ac.preset === k) + '">' + AI_PRESETS[k].label + "</button>"; }).join("") + "</div>";
    var chips = acChips();
    return '<header class="layer-h"><div><span class="eyebrow">' + (ac.scope === "project" ? "프로젝트 AI 연결 · 운영자" : "내 AI 연결") + '</span><h2 id="layer-t">' + (ac.id ? "연결 편집" : "연결 추가") + '</h2></div><button class="x" data-close-layer aria-label="닫기">✕</button></header>' +
      '<div class="fm ac">' + presets + '<p class="hint">' + ps.hint + "</p>" +
      '<div class="ac-grid"><div class="fm-row"><label for="ac-label">연결 이름</label><input id="ac-label" type="text" value="' + esc(ac.label) + '" maxlength="60"></div>' +
      '<div class="fm-row"><label for="ac-url">API 주소' + (anth ? " (선택)" : "") + '</label><input id="ac-url" type="url" value="' + esc(ac.baseUrl) + '" placeholder="' + esc(ps.baseUrl || "https://…/v1") + '"></div>' +
      '<div class="fm-row"><label for="ac-key">API 키 ' + (anth ? '<em class="fm-req">필수</em>' : '<span class="hint">(선택)</span>') + '</label><input id="ac-key" type="password" autocomplete="new-password" value="' + esc(ac.apiKey) + '" placeholder="' + esc(ac.hasKey ? "저장됨 — 바꿀 때만 입력" : ps.key) + '">' + (ac.hasKey ? '<label class="fm-check"><input type="checkbox" id="ac-clear"' + (ac.clearKey ? " checked" : "") + "> 저장한 키 지우기</label>" : "") + "</div>" +
      '<div class="fm-row"><label for="ac-max">최대 출력 토큰 <span class="hint">(선택, 기본 8192)</span></label><input id="ac-max" type="text" inputmode="numeric" value="' + esc(ac.maxTokens) + '" placeholder="8192"></div></div>' +
      '<div class="ac-models"><div class="ac-mh"><b>모델</b><span class="hint">여러 개 골라 저장해 두면 드롭다운으로 바로 바꿀 수 있습니다</span><span class="sp"></span><button class="btn-sm" data-acfetch' + (ac.busy ? " disabled" : "") + ">" + (ac.busy ? "불러오는 중…" : "모델 불러오기") + "</button></div>" +
      acProbeBox() + '<div class="ac-chips" id="ac-chips">' + chips + "</div>" +
      (ac.fetched.length ? '<input id="ac-filter" type="search" placeholder="모델 검색 (예: llama, qwen, 70b)" value="' + esc(ac.filter) + '" autocomplete="off">' : "") + '<div id="ac-list" class="ac-list">' + acList() + "</div>" +
      '<div class="ac-manual"><input id="ac-manual" type="text" placeholder="목록에 없으면 모델 이름을 직접 입력" autocomplete="off"><button class="btn-sm" data-acadd>추가</button></div></div>' +
      '<p class="gen-err" role="alert"' + (ac.err ? "" : " hidden") + ">" + esc(ac.err) + "</p>" +
      '<p class="hint">키는 서버에 암호화해 저장하고 화면에 다시 보여 주지 않습니다.' + (ac.scope === "project" ? " 멤버에게는 연결 이름과 모델 이름만 보입니다." : "") + "</p></div>" +
      '<footer class="layer-f"><span class="hint" id="ac-count">고른 모델 ' + ac.models.length + '개</span><span class="sp"></span><button class="btn-sm" data-close-layer>취소</button><button class="btn-primary" data-acsave' + (ac.busy ? " disabled" : "") + ">저장</button></footer>";
  }
  function connClick(b) {
    var ac = layer.ac;
    if (b.dataset.acpreset) {
      acSync();
      var old = AI_PRESETS[ac.preset], ps = AI_PRESETS[b.dataset.acpreset];
      if (!ac.label || ac.label === old.label) ac.label = ps.label;
      if (!ac.baseUrl || ac.baseUrl === old.baseUrl) ac.baseUrl = ps.baseUrl;
      if (old.provider !== ps.provider) { ac.hasKey = false; ac.fetched = []; }
      ac.preset = b.dataset.acpreset; ac.err = "";
      renderLayer(); return true;
    }
    if (b.hasAttribute("data-acfetch")) {
      acSync();
      var ps2 = AI_PRESETS[ac.preset];
      ac.busy = true; ac.err = ""; ac.probe = null; renderLayer();
      api("POST", aiBase(ac.scope) + "/models", { connId: ac.id, provider: ps2.provider, baseUrl: ac.baseUrl, apiKey: ac.apiKey }).then(function (r) {
        ac.probe = r;
        if (r.ok) { ac.fetched = r.models || []; toast("모델 불러오기 성공 · " + ac.fetched.length + "개"); }
        else toast("모델 불러오기 실패 · " + r.error, "err");
      }, function (e) {
        ac.probe = { ok: false, error: e.message, url: "", hint: e.status === 400 ? "입력한 주소를 확인하세요." : "" };
        toast("모델 불러오기 실패 · " + e.message, "err");
      }).then(function () { ac.busy = false; if (layer && layer.ac === ac) renderLayer(); });
      return true;
    }
    if (b.dataset.acrm) { acSync(); ac.models = ac.models.filter(function (m) { return m !== b.dataset.acrm; }); renderLayer(); return true; }
    if (b.hasAttribute("data-acadd")) {
      acSync();
      var inp = document.getElementById("ac-manual"), m = inp ? inp.value.trim() : "";
      if (m && ac.models.indexOf(m) < 0) ac.models.push(m);
      renderLayer(); return true;
    }
    if (b.hasAttribute("data-acsave")) {
      acSync();
      var ps3 = AI_PRESETS[ac.preset];
      if (!ac.models.length) { ac.err = "모델을 하나 이상 고르거나 직접 입력하세요"; renderLayer(); return true; }
      ac.busy = true; ac.err = ""; renderLayer();
      api("PUT", aiBase(ac.scope) + "/conns", { id: ac.id, label: ac.label, provider: ps3.provider, preset: ac.preset, baseUrl: ac.baseUrl, apiKey: ac.apiKey, clearKey: ac.clearKey, models: ac.models, maxTokens: ac.maxTokens || null }).then(function () {
        toast("연결을 저장했습니다: " + ac.label + " · 모델 " + ac.models.length + "개");
        var scope = ac.scope;
        closeLayer();
        return afterAiChange(scope);
      }, function (e) { ac.busy = false; ac.err = e.message; if (layer && layer.ac === ac) renderLayer(); });
      return true;
    }
    return false;
  }

  function loadAiInfo(code) {
    return api("GET", "/api/projects/" + enc(code) + "/ai").then(function (r) { aiCache = Object.assign({ code: code }, r); P().ai = r.effective; });
  }
  function renderAiSettings() {
    var p = P(), code = p.model.project.code;
    if (aiCache.code !== code) { loadAiInfo(code).then(render, function (e) { toast(e.message, "err"); }); return '<div class="box empty">불러오는 중…</div>'; }
    var a = aiCache, eff = a.effective;
    var effLine = eff ? "<b>" + esc(effLabel(eff)) + '</b> <span class="hint">' + SOURCE_LABEL[eff.source] + "</span>" : '<b class="warn-t">AI 설정 없음</b> — 운영자가 프로젝트 연결을 추가하거나, 내 연결을 추가하세요.';
    var hasAny = (a.project && a.project.conns.length) || (a.personal && a.personal.conns.length);
    return '<section class="section"><div class="box pad now"><div class="now-h"><b>지금 이 프로젝트에서 쓰는 AI</b>' + effLine + "</div>" +
      (hasAny ? '<div class="row-actions"><label for="ai-switch" class="hint">나만 바꾸기</label>' + aiSwitch("ai-switch") + (eff && canEdit() ? actBtn("ai-test", "연결 확인", null) : "") + "</div>" : "") +
      '<p class="hint">바꾸면 나에게만 적용됩니다. 모두의 기본은 운영자가 아래 프로젝트 연결에서 ‘기본으로’를 눌러 정합니다. 설정이 없으면 서버 기본 설정' + (a.serverDefault ? "(있음)" : "(없음)") + "을 씁니다.</p></div></section>" +
      '<section class="section"><h2>프로젝트 연결 <small>멤버 공통 · ' + (a.canManage ? "주소·키는 운영자에게만 보임" : "운영자가 관리 — 주소·키는 보이지 않음") + "</small></h2>" + connCards("project", a.project, a.canManage, canEdit()) + "</section>" +
      '<section class="section"><h2>내 연결 <small>나만 씀 · <button class="lnk" data-act="account">내 계정</button>에서도 관리</small></h2>' + connCards("personal", a.personal, true, canEdit()) + "</section>";
  }
  function renderAccount() {
    var mine = MY_AI || { conns: [], active: null };
    var act = mine.active && mine.conns.find(function (c) { return c.id === mine.active.conn; });
    return '<header class="page-head"><span class="eyebrow">Planning Studio</span><h1>내 계정</h1><p>' + esc(ME.name) + " · " + esc(ME.email) + "</p></header>" +
      '<section class="section"><h2>내 AI 연결 <small>기본: ' + (act ? esc(act.label + " · " + mine.active.model) : "없음") + " · 프로젝트 AI 설정에서 프로젝트마다 골라 쓸 수 있음</small></h2>" + connCards("personal", mine, true, !!mine.conns.length) + "</section>" +
      '<div class="ds-grid2">' + installBox() + '<div class="box pad"><h3>계정</h3><dl class="kv"><div><dt>이름</dt><dd>' + esc(ME.name) + "</dd></div><div><dt>이메일</dt><dd>" + esc(ME.email) + "</dd></div><div><dt>가입</dt><dd>" + esc(fmtDate(ME.createdAt)) + '</dd></div></dl><div class="row-actions">' + actBtn("pw-change", "비밀번호 바꾸기") + actBtn("logout", "로그아웃") + "</div></div></div>";
  }

  function invitesBanner() {
    if (!INVITES.length) return "";
    return '<section class="section"><h2>받은 초대 <small>' + INVITES.length + "건</small></h2>" + INVITES.map(function (i) {
      return '<div class="note row"><div><b>' + esc(i.projectName) + "</b> 프로젝트에 " + ROLE_LABEL[i.role] + '(으)로 초대받았습니다<p class="hint">만료 ' + esc(fmtDate(i.expiresAt)) + "</p></div><div class=\"row-actions\">" + actBtn("inv-decline", "거절", i.id) + actBtn("inv-accept", "수락", i.id, "btn-primary") + "</div></div>";
    }).join("") + "</section>";
  }

  // ── 계정 관리 (서비스 관리자) ──────────────────
  var adminCache = null, adminSel = {};
  function renderAdmin() {
    if (!ME || !ME.isAdmin) return '<div class="box empty">서비스 관리자만 볼 수 있습니다.</div>';
    if (!adminCache) {
      api("GET", "/api/admin/users").then(function (r) { adminCache = r; adminSel = {}; render(); }, function (e) { toast(e.message, "err"); });
      return '<header class="page-head"><span class="eyebrow">Planning Studio</span><h1>계정 관리</h1></header><div class="box empty">불러오는 중…</div>';
    }
    var users = adminCache.users, nSel = Object.keys(adminSel).filter(function (k) { return adminSel[k]; }).length;
    var rows = users.map(function (u) {
      var locked = u.isAdmin || u.id === adminCache.me;
      var owns = u.projects.filter(function (p) { return p.role === "OWNER"; }).length;
      return '<tr data-admrow="' + esc((u.name + " " + u.email).toLowerCase()) + '"><td>' + (locked ? "" : '<input type="checkbox" data-admsel="' + esc(u.id) + '"' + (adminSel[u.id] ? " checked" : "") + ' aria-label="' + esc(u.email) + ' 선택">') + "</td><td><b>" + esc(u.name) + "</b>" +
        (u.isAdmin ? ' <span class="pill REVIEWED">관리자</span>' : "") + (u.id === adminCache.me ? ' <span class="tag">나</span>' : "") + '</td><td class="mono">' + esc(u.email) + "</td><td>" + esc(fmtDate(u.createdAt)) + "</td><td>" +
        (u.projects.length ? u.projects.map(function (p) { return '<span class="tag mono">' + esc(p.code) + " · " + ROLE_LABEL[p.role] + "</span>"; }).join(" ") : '<span class="dash">—</span>') + "</td><td>" +
        (locked ? "" : actBtn("adm-del", "삭제", u.id, "btn-sm danger")) + (owns ? '<br><span class="hint">운영 ' + owns + "개</span>" : "") + "</td></tr>";
    }).join("");
    var test = users.filter(function (u) { return /^claude-qa-/.test(u.email) && !u.isAdmin; }).length;
    return '<header class="page-head"><span class="eyebrow">Planning Studio · 서비스 관리자</span><h1>계정 관리</h1><p>회원 ' + users.length + "명. 혼자 운영하는 프로젝트가 있는 회원은 삭제할 수 없습니다(다른 멤버를 운영자로 지정하거나 프로젝트를 먼저 삭제). 삭제하면 그 회원은 바로 로그아웃되고 모든 프로젝트에서 빠집니다.</p></header>" +
      '<section class="section"><div class="toolbar"><input id="adm-q" type="search" placeholder="이름·이메일 검색" autocomplete="off" aria-label="회원 검색">' +
      (test ? actBtn("adm-seltest", "테스트 계정 " + test + "개 선택 (claude-qa-)") : "") + '<span class="sp"></span>' + actBtn("adm-delsel", "선택 삭제 (" + nSel + ")", null, nSel ? "btn-primary danger" : "btn-sm") + actBtn("adm-reload", "새로고침") + "</div>" +
      '<div class="box twrap"><table><thead><tr><th></th><th>이름</th><th>이메일</th><th>가입</th><th>프로젝트 · 권한</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<p class="hint">관리자는 첫 가입자입니다. 관리자를 더 두려면 서버 환경변수 <code>PLANNING_ADMINS</code>에 이메일을 쉼표로 적습니다.</p></section>';
  }
  function deleteUsers(ids) {
    var done = [], fail = [];
    return ids.reduce(function (pr, id) {
      return pr.then(function () {
        return api("DELETE", "/api/admin/users/" + enc(id)).then(function (r) { done.push(r.email); }, function (e) { fail.push(e.message); });
      });
    }, Promise.resolve()).then(function () {
      adminCache = null;
      render();
      if (done.length) toast("삭제했습니다: " + done.length + "명");
      if (fail.length) toast(fail.join("\n"), "err");
    });
  }
  ACTIONS["adm-del"] = function (id) {
    var u = adminCache.users.find(function (x) { return x.id === id; });
    confirmAct("회원 삭제", u.name + " (" + u.email + ") 계정을 삭제할까요? 되돌릴 수 없습니다.", "삭제", function () { return deleteUsers([id]); });
  };
  ACTIONS["adm-delsel"] = function () {
    var ids = Object.keys(adminSel).filter(function (k) { return adminSel[k]; });
    if (!ids.length) { toast("삭제할 회원을 선택하세요"); return; }
    confirmAct("선택한 회원 삭제", ids.length + "명의 계정을 삭제할까요? 되돌릴 수 없습니다.", ids.length + "명 삭제", function () { return deleteUsers(ids); });
  };
  ACTIONS["adm-seltest"] = function () {
    adminCache.users.forEach(function (u) { if (/^claude-qa-/.test(u.email) && !u.isAdmin && u.id !== adminCache.me) adminSel[u.id] = true; });
    render();
  };
  ACTIONS["adm-reload"] = function () { adminCache = null; render(); };

  // ── 새 버전 알림 ────────────────────────────────
  // 서버가 SSE(/api/events)로 버전을 밀어 주고, 모든 API 응답 머리(x-app-version)에도 버전이 실린다.
  // 다르면 자동으로 새로고침하지 않고 "저장한 뒤 새로고침"을 안내한다.
  var APP_VERSION = DATA.version || null, newVersion = null, updateHidden = false, es = null, lastAct = Date.now();
  var IDLE_MS = 10 * 60 * 1000;
  function checkVersion(v) {
    if (!SRV || !v || !APP_VERSION || v === APP_VERSION || newVersion === v) return;
    newVersion = v;
    updateHidden = false;
    sseOff();
    showUpdate();
  }
  function hasUnsaved() {
    if (!layer) return false;
    if (layer.kind === "form" || layer.kind === "aiconn") return true;
    if (layer.kind === "gen") { var g = document.getElementById("gen-in"); return !!(layer.busy || (g && g.value.trim())); }
    if (layer.kind === "review") { var r = document.getElementById("rv-in"); return !!(layer.pending || (r && r.value.trim())); }
    return false;
  }
  function showUpdate() {
    var bar = document.getElementById("update-bar");
    if (!bar) { bar = document.createElement("div"); bar.id = "update-bar"; document.body.appendChild(bar); }
    if (!newVersion) { bar.remove(); return; }
    bar.className = updateHidden ? "mini" : "";
    bar.setAttribute("role", updateHidden ? "status" : "alert");
    bar.innerHTML = updateHidden ? '<button data-upd="open">새 버전 · 새로고침</button>' :
      '<div class="upd-t"><b>새 버전이 배포됐습니다</b><span>작업 중인 내용을 먼저 저장한 뒤 새로고침하세요. 저장하지 않은 입력은 새로고침하면 사라집니다.</span></div>' +
      '<div class="upd-a"><button class="btn-sm" data-upd="later">나중에</button><button class="btn-primary" data-upd="reload">저장했어요 · 새로고침</button></div>';
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-upd]");
    if (!b) return;
    ev.stopPropagation();
    var a = b.getAttribute("data-upd");
    if (a === "later") { updateHidden = true; showUpdate(); }
    else if (a === "open") { updateHidden = false; showUpdate(); }
    else if (a === "reload") {
      if (hasUnsaved() && !window.confirm("열려 있는 창에 저장하지 않은 입력이 있습니다. 새로고침하면 사라집니다. 계속할까요?")) return;
      location.reload();
    }
  }, true);
  function sseOn() {
    if (!SRV || es || newVersion || document.hidden || Date.now() - lastAct > IDLE_MS || typeof EventSource === "undefined") return;
    es = new EventSource("/api/events");
    es.addEventListener("version", function (e) { try { checkVersion(JSON.parse(e.data).version); } catch (x) { /* 무시 */ } });
  }
  function sseOff() { if (es) { es.close(); es = null; } }
  function versionPing() {
    fetch("/api/events?once=1", { method: "HEAD", cache: "no-store" }).then(function (r) { checkVersion(r.headers.get("x-app-version")); }, function () {});
  }
  if (SRV) {
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) sseOff();
      else { lastAct = Date.now(); versionPing(); sseOn(); }
    });
    ["pointerdown", "keydown"].forEach(function (t) { document.addEventListener(t, function () { var idle = Date.now() - lastAct > IDLE_MS; lastAct = Date.now(); if (idle) versionPing(); if (!es) sseOn(); }, { passive: true, capture: true }); });
    // 10분 넘게 조작이 없으면 연결을 쉰다 (서버 비용). 다시 움직이면 버전부터 확인한다
    setInterval(function () { if (Date.now() - lastAct > IDLE_MS) sseOff(); }, 60 * 1000);
    window.addEventListener("load", sseOn);
  }

  // ── 설치형 앱 (PWA) ────────────────────────────
  // Chrome·Edge가 설치할 수 있다고 알려 주면(beforeinstallprompt) 메뉴에 "앱으로 설치" 버튼을 띄운다
  var installEvt = null;
  var standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  if (SRV) {
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvt = e; if (ME) { renderLnb(); if (state.route.view === "account") render(); } });
    window.addEventListener("appinstalled", function () { installEvt = null; standalone = true; toast("앱으로 설치했습니다. 바탕화면·시작 메뉴에서 Planning Studio를 여세요"); if (ME) render(); });
    if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () { /* 설치 기능만 빠진다 */ }); });
  }
  ACTIONS.install = function () {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt.userChoice.then(function () { installEvt = null; render(); });
  };
  function installBox() {
    var how = standalone ? "<p>지금 설치한 앱으로 열려 있습니다.</p>" : installEvt ? '<p class="hint">바탕화면·시작 메뉴·작업 표시줄에서 바로 여는 앱으로 설치합니다. 창이 따로 열리고 주소창이 없습니다.</p><div class="row-actions">' + actBtn("install", "⤓ 앱으로 설치", null, "btn-primary") + "</div>" :
      '<p class="hint">설치 버튼이 안 보이면: Chrome 주소창 오른쪽의 설치 아이콘(⊕ 또는 모니터 모양), 또는 ⋮ 메뉴 → <b>전송, 저장, 공유 → 페이지를 앱으로 설치</b>(버전에 따라 “Planning Studio 설치”). 이미 설치했다면 ⋮ 메뉴에 “Planning Studio 열기”가 보입니다. 아이폰 Safari는 공유 버튼 → <b>홈 화면에 추가</b>.</p>';
    return '<div class="box pad"><h3>앱으로 설치</h3>' + how + "</div>";
  }

  // ── 로그인 · 가입 · 초대 링크 ───────────────────
  var authState = { mode: "login", invite: null, token: null, err: "" };
  function showAuth(mode) {
    authState.mode = mode || authState.mode;
    document.body.classList.add("auth-on");
    document.getElementById("side").innerHTML = "";
    var inv = authState.invite;
    var signup = authState.mode === "signup";
    var html = '<div class="auth"><div class="auth-box box"><div class="brand"><b>Planning Studio</b><span>서비스 기획 산출물 관리</span></div>' +
      (inv ? '<div class="note"><b>' + esc(inv.projectName) + "</b> 프로젝트 초대<p class=\"hint\">" + esc(inv.email) + " 계정으로 " + (inv.hasAccount ? "로그인" : "가입") + "하면 " + ROLE_LABEL[inv.role] + "(으)로 참여합니다.</p></div>" : "") +
      '<div class="seg" role="group" aria-label="로그인 또는 가입"><button data-authmode="login" aria-pressed="' + !signup + '">로그인</button><button data-authmode="signup" aria-pressed="' + signup + '"' + (CFG.openSignup === false && !inv ? " disabled" : "") + ">회원가입</button></div>" +
      '<form id="auth-form" class="fm" novalidate>' +
      (signup ? fieldHtml({ name: "name", label: "이름", required: true, placeholder: "예: 홍길동" }) : "") +
      fieldHtml({ name: "email", label: "이메일", type: "email", required: true, value: inv ? inv.email : "" }) +
      fieldHtml({ name: "password", label: signup ? "비밀번호 (8자 이상)" : "비밀번호", type: "password", required: true }) +
      '<p class="gen-err" id="auth-err" role="alert"' + (authState.err ? "" : " hidden") + ">" + esc(authState.err) + '</p><button type="submit" class="btn-primary wide" id="auth-submit">' + (signup ? "가입하고 시작하기" : "로그인") + "</button></form>" +
      (!CFG.users ? '<p class="hint">첫 가입자가 이 서버에 이미 있는 프로젝트의 운영자가 됩니다.</p>' : CFG.openSignup === false ? '<p class="hint">이 서버는 초대받은 이메일만 가입할 수 있습니다.</p>' : "") + "</div></div>";
    document.getElementById("main").innerHTML = html;
    var first = document.querySelector("#auth-form input:not([value]), #auth-form input[value='']") || document.querySelector("#auth-form input");
    if (first) first.focus();
  }
  function submitAuth(form) {
    var signup = authState.mode === "signup";
    var v = { email: form.elements.email.value.trim(), password: form.elements.password.value };
    if (signup) v.name = form.elements.name.value.trim();
    var btn = document.getElementById("auth-submit"), err = document.getElementById("auth-err");
    btn.disabled = true;
    api("POST", signup ? "/api/signup" : "/api/login", v).then(function (r) {
      ME = r.user;
      document.body.classList.remove("auth-on");
      return enterApp();
    }, function (e) { btn.disabled = false; err.textContent = e.message; err.hidden = false; });
  }
  function enterApp() {
    return api("GET", "/api/config").then(function (c) { CFG = c; }).then(refreshMe).then(function () {
      if (authState.token) {
        var tk = authState.token;
        authState.token = null; authState.invite = null;
        history.replaceState(null, "", "/");
        return api("POST", "/api/invite-links/" + enc(tk) + "/accept").then(function (r) {
          toast("초대를 수락했습니다");
          return refreshMe().then(loadProjects).then(function () { return openProject(r.project); });
        }, function (e) { toast(e.message, "err"); history.replaceState(null, "", "/"); return goHome(); });
      }
      var at = routeFromUrl();
      return loadProjects().then(function () {
        if (at) return openProject(at.code, at);
        if (location.pathname === "/account") return go({ view: "account" });
        if (location.pathname === "/admin" && ME && ME.isAdmin) return go({ view: "admin" });
        go({ view: "home" });
      });
    });
  }
  function bootServer() {
    document.getElementById("main").innerHTML = '<div class="box empty">불러오는 중…</div>';
    var m = location.pathname.match(/^\/invite\/([^/]+)/);
    var pre = m ? api("GET", "/api/invite-links/" + enc(m[1])).then(function (r) { authState.invite = r; authState.token = m[1]; authState.mode = r.hasAccount ? "login" : "signup"; }, function (e) { authState.err = e.message; history.replaceState(null, "", "/"); }) : Promise.resolve();
    AI.sample = {
      json: function (input, opts) {
        return api("POST", "/api/projects/" + enc(P().model.project.code) + "/generate", { input: input }, opts && opts.signal).then(function (r) { return r.output; }, function (e) {
          if (e.name === "AbortError") { var c = new Error("cancelled"); c.code = "cancelled"; throw c; }
          throw e;
        });
      }
    };
    pre.then(function () { return api("GET", "/api/config"); }).then(function (c) {
      CFG = c;
      return api("GET", "/api/me").then(function (r) {
        ME = r.user;
        if (authState.token && authState.invite && authState.invite.email !== ME.email) {
          authState.err = "지금 로그인한 계정(" + ME.email + ")은 이 초대를 받을 수 없습니다. 로그아웃하고 초대받은 이메일로 로그인하세요.";
          toast(authState.err, "err");
          authState.token = null;
        }
        return enterApp();
      }, function () { showAuth(); });
    }, function (e) { document.getElementById("main").innerHTML = '<div class="box empty">서버에 연결하지 못했습니다: ' + esc(e.message) + "</div>"; });
  }

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
      if (lb && layer.kind === "form" && lb.dataset.copy != null) { copyText(lb.dataset.copy, lb, "복사함"); return; }
      if (lb && layer.kind === "aiconn" && connClick(lb)) return;
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
    var amb = target.closest && target.closest("[data-authmode]");
    if (amb) { authState.err = ""; showAuth(amb.dataset.authmode); return; }
    var acb = target.closest && target.closest("[data-act]");
    if (acb && ACTIONS[acb.dataset.act]) { ACTIONS[acb.dataset.act](acb.dataset.arg, acb); return; }
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
    if (d.nav === "home") SRV ? goHome() : go({ view: "home" });
    else if (d.nav === "account") go({ view: "account" });
    else if (d.nav === "admin") { adminCache = null; go({ view: "admin" }); }
    else if (d.open != null) SRV ? openProject(DATA.projects[Number(d.open)].model.project.code) : go({ view: "project", p: Number(d.open), page: "dash" });
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
    if (ev.target.id === "ac-filter" && layer && layer.ac) { layer.ac.filter = ev.target.value; document.getElementById("ac-list").innerHTML = acList(); }
    if (ev.target.id === "adm-q") {
      var q = ev.target.value.trim().toLowerCase();
      document.querySelectorAll("[data-admrow]").forEach(function (tr) { tr.hidden = q && tr.getAttribute("data-admrow").indexOf(q) < 0; });
    }
  });
  document.addEventListener("submit", function (ev) {
    if (ev.target.id === "fm" && layer && layer.kind === "form") { ev.preventDefault(); submitForm(ev.target); }
    else if (ev.target.id === "auth-form") { ev.preventDefault(); submitAuth(ev.target); }
  });
  document.addEventListener("change", function (ev) {
    var tg = ev.target;
    if (tg.dataset && tg.dataset.memrole) {
      api("PATCH", "/api/projects/" + enc(P().model.project.code) + "/members/" + enc(tg.dataset.memrole), { role: tg.value }).then(function () { toast("권한을 바꿨습니다"); renderMembersAsync(); }, function (e) { toast(e.message, "err"); renderMembersAsync(); });
      return;
    }
    if (tg.dataset && tg.dataset.admsel) { adminSel[tg.dataset.admsel] = tg.checked; render(); return; }
    if (tg.hasAttribute && tg.hasAttribute("data-aiswitch")) { switchAi(tg.value); return; }
    if (tg.dataset && tg.dataset.acmodel != null && layer && layer.ac) {
      var acm = tg.dataset.acmodel, ac = layer.ac;
      acSync();
      if (tg.checked) { if (ac.models.indexOf(acm) < 0) ac.models.push(acm); } else ac.models = ac.models.filter(function (x) { return x !== acm; });
      // 목록 스크롤을 지키려고 고른 모델 칩과 개수만 다시 그린다
      document.getElementById("ac-chips").innerHTML = acChips();
      document.getElementById("ac-count").textContent = "고른 모델 " + ac.models.length + "개";
      return;
    }
    if (ev.target.id !== "lnb-select") return;
    var v = ev.target.value;
    if (v === "home") SRV ? goHome() : go({ view: "home" });
    else if (v.charAt(0) === "p" && /^p\d+$/.test(v)) SRV ? openProject(DATA.projects[Number(v.slice(1))].model.project.code) : go({ view: "project", p: Number(v.slice(1)), page: "dash" });
    else go({ view: "project", p: state.route.p, page: v });
  });
  var rt = null;
  window.addEventListener("resize", function () { cancelAnimationFrame(rt); rt = requestAnimationFrame(function () { fitStages(); }); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitStages(); });
  if (SRV) bootServer();
  else { rebuild(); render(); }
  // claude.ai 뷰어에서 열리면 Claude 생성(sample)과 공유 저장(db)을 켠다. 아니면 프롬프트 복사로 대신한다
  if (!SRV && window.claude && typeof window.claude.use === "function") {
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
