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
    sb: ["화면설계서", "시스템별 모든 화면의 화면설계서 — Task 연결과 상관없이 작성하고, 화면과 Task를 직접 연결합니다"],
    qa: ["테스트", "정보구조도 화면 기준 테스트 케이스와 채널별(웹·모바일·태블릿 …) 결과 — 화면설계서로 초안을 만들거나 AI로 작성합니다"],
    proto: ["프로토타입 통합본", "시스템 구분별로 모든 화면을 메뉴 순서대로 이어 붙인 클릭 가능한 프로토타입과 설계 진행 순서"],
    rtm: ["요구사항 추적표", "요구사항 → 시스템별 Task → 산출물 연결과 충족 상태"],
    flow: ["시스템별 프로세스 플로우", "Task별 흐름을 통합한 프로세스를 시스템 영역별로 나눠 봅니다"],
    ver: ["버전 이력", "스냅샷과 최근 스냅샷 이후 변경 사항"],
    members: ["멤버", "프로젝트 공동 작업자와 권한, 초대"],
    aiset: ["AI 설정", "이 프로젝트에서 AI를 부르는 방법 — 로컬 LLM 또는 외부 API"]
  };

  var ACTIONS_LATE = {};
  var state = { route: { view: "home" }, rtmView: "matrix", off: {}, flowSys: "ALL", dsSys: {}, kbQ: "", proto: {} };
  if (!SRV) try {
    var saved = JSON.parse(localStorage.getItem("planning-viewer-2") || "{}");
    if (saved.route && (saved.route.view === "home" || (typeof saved.route.p === "number" && saved.route.p < DATA.projects.length))) state.route = saved.route;
    if (saved.rtmView) state.rtmView = saved.rtmView;
  } catch (e) { /* 저장소 없음 */ }
  try { state.iaView = localStorage.getItem("planning-ia-view") || "tree"; } catch (e) { state.iaView = "tree"; }
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
  /** 와이어프레임에 쓸 디자인: 고른 디자인 시스템, 없으면 임시 기본 컨셉 (저장하면 같은 컨셉으로 정해진다) */
  function wireDesign(p, code) { return selectedDesign(p, code) || (p.provisionalDesigns && p.provisionalDesigns[code]) || null; }
  function isProvisional(p, code) { return !selectedDesign(p, code) && !!(p.provisionalDesigns && p.provisionalDesigns[code]); }
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
    layoutCanvases(root);
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
        ["통합 산출물", [["ia", null], ["sb", p.model.storyboard.screens.length + "/" + p.model.ia.nodes.filter(function (n) { return n.kind !== "MENU"; }).length], ["rtm", p.rtm.gaps.length + p.rtm.orphans.length || null], ["flow", null], ["qa", (p.model.ia.tests || []).length || null], ["proto", (p.work ? p.work.systems.filter(function (x) { return x.designDone; }).length : 0) + "/" + ds.length]]],
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
    if (layer && layer.kind === "sbfull") renderLayer();
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
      case "proto": return renderProtoPage();
      case "sb": return renderSb();
      case "qa": return renderQa();
      case "ver": return renderVer();
      case "members": return SRV ? renderMembers() : renderDash();
      case "aiset": return SRV ? renderAiSettings() : renderDash();
      default: return renderDash();
    }
  }
  function afterRender() {
    var r = state.route;
    if ((r.view === "task" && r.tab === "proto") || (r.view === "project" && r.page === "proto")) renderProto();
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
      return '<div class="pcard-wrap">' + (SRV && p.role === "OWNER" ? '<button class="pc-del" data-act="proj-delete-card" data-arg="' + esc(pr.code) + '" title="프로젝트 삭제" aria-label="' + esc(pr.name) + ' 삭제">삭제</button>' : "") + '<button class="box pcard" data-open="' + i + '">' +
        '<div class="pc-top"><span class="code">' + esc(pr.code) + " · v" + esc(pr.version) + '</span><span class="tag">' + esc(TYPE[pr.serviceType] + (pr.changeScope ? " · " + SCOPE[pr.changeScope] : "")) + "</span></div>" +
        '<b class="pc-name">' + esc(pr.name) + '</b><div class="pc-sys">' + sysChips + '</div><div class="track">' + track + "</div>" +
        '<div class="pc-rate"><div class="bar"><b style="width:' + c.designedRate + '%;background:var(--accent)"></b></div><span>설계완료 ' + c.designedRate + "%</span></div>" +
        '<dl class="pc-nums"><div><dt>요구사항</dt><dd>' + p.rtm.rows.length + "</dd></div><div><dt>Task</dt><dd>" + c.tasks.total + "</dd></div><div><dt>참조자료</dt><dd>" + p.model.sources.length +
        '</dd></div><div class="' + (p.rtm.gaps.length ? "warn" : "") + '"><dt>누락</dt><dd>' + p.rtm.gaps.length + "</dd></div></dl>" +
        '<span class="pc-foot">' + (p.sample ? '<span class="tag sample-t">샘플</span> ' : "") + (p.role ? ROLE_LABEL[p.role] + " · " : "") + esc(TEMPLATE[pr.submissionTemplate]) + " · 수정 " + esc(fmtDate(pr.updatedAt)) + "</span></button></div>";
    }).join("");
    var newCard = SRV ? '<button class="box pcard new" data-act="new-project"><b>+ 새 프로젝트</b><p class="hint">서비스 유형, 변경 범위, 시스템 구분을 정해 만듭니다. 만든 사람이 운영자가 되어 공동 작업자를 초대합니다.</p></button>' :
      '<div class="box pcard new"><b>새 프로젝트</b><p class="hint">서비스 유형, 변경 범위, 시스템 구분을 정해 만듭니다.</p>' + copyBox('planning init <코드> --name "<프로젝트명>" --type NEW --preset public-civil') + "</div>";
    return '<header class="page-head"><span class="eyebrow">Planning Studio</span><h1>프로젝트</h1><p>' + (SRV && ME ? esc(ME.name) + "님이 참여한 " : "") + "프로젝트 " + DATA.projects.length + "개 · 요구사항 " + totals.req + "건 · Task " + totals.task + "건 · 누락 " + totals.gap + "건</p></header>" +
      (SRV ? invitesBanner() + sampleBanner() : "") + '<section class="pgrid">' + cards + newCard + "</section>";
  }

  /** 샘플(더미) 프로젝트 안내 + 일괄 삭제 */
  function sampleBanner() {
    var mine = DATA.projects.filter(function (p) { return p.sample; });
    if (!mine.length) return "";
    var own = mine.filter(function (p) { return p.role === "OWNER"; });
    return '<div class="note row sample-n"><div><b>샘플 프로젝트 ' + mine.length + '개가 있습니다</b><p class="hint">' + mine.map(function (p) { return esc(p.model.project.name + " (" + p.model.project.code + ")"); }).join(" · ") + ". 둘러본 뒤 필요 없으면 삭제하세요. 삭제한 샘플은 다시 생기지 않습니다.</p></div>" +
      (own.length ? actBtn("sample-del", "샘플 " + own.length + "개 모두 삭제", null, "btn-sm danger") : '<span class="hint">삭제는 운영자만 할 수 있습니다</span>') + "</div>";
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
    var wrows = (p.work ? p.work.systems : []).filter(function (x) { return x.hasScreens; }).map(function (x) {
      return '<div class="wsys">' + sysChip(x.code) + "<b>" + esc(x.name) + '</b><span class="wcell"><span class="wl">정보구조도</span>' + workPill(p, "ia:" + x.code) + '</span><span class="wcell"><span class="wl">디자인</span>' + workPill(p, "ds:" + x.code) + "</span>" +
        '<div class="wcell grow"><span class="wl">화면설계서 ' + x.screens.length + "</span>" + workStack(x.counts, x.screens.length) + "</div>" + protoLink(p, x.code) + "</div>";
    }).join("");
    var outRows = p.model.systems.filter(function (s) { return s.hasScreens; }).map(function (s) {
      var nSb = p.model.storyboard.screens.filter(function (x) { return x.systemCode === s.code; }).length, nSc = systemScreens(p, s.code).length, d = selectedDesign(p, s.code);
      var nFl = p.model.flows.filter(function (f) { return f.lanes.some(function (l) { return l.systemCode === s.code; }); }).length;
      return '<div class="orow">' + sysChip(s.code) + "<b>" + esc(s.name) + "</b>" +
        '<span class="ocell"><span class="ol">정보구조도</span><em>' + nSc + '화면</em><button class="btn-sm" data-iaxlsx="1">xlsx</button></span>' +
        '<span class="ocell"><span class="ol">화면설계서</span><em>' + nSb + "/" + nSc + "</em>" + (nSb ? '<button class="btn-sm" data-sbx="' + esc(s.code) + '|pptx">PPTX</button><button class="btn-sm" data-sbx="' + esc(s.code) + '|pdf">PDF</button>' : '<span class="hint">없음</span>') + "</span>" +
        '<span class="ocell"><span class="ol">프로토타입</span>' + (nSb && d ? '<button class="btn-sm" data-protox="' + esc(s.code) + '">HTML</button>' : '<span class="hint">' + (d ? "화면설계서 없음" : "디자인 미선택") + "</span>") + "</span>" +
        '<span class="ocell"><span class="ol">플로우</span><em>' + nFl + '개</em><button class="btn-sm" data-page="flows">보기</button></span>' +
        '<span class="ocell"><span class="ol">테스트</span><button class="btn-sm" data-qaxlsx="' + esc(s.code) + '">xlsx</button></span>' +
        '<span class="ocell"><span class="ol">디자인</span>' + (d ? '<button class="btn-sm" data-figx="' + esc(s.code) + '|tokens">토큰 JSON</button>' : '<span class="hint">미선택</span>') + "</span>" +
        '<span class="sp"></span><button class="btn-sm btn-primary" data-pkg="' + esc(s.code) + '" title="이 시스템의 모든 산출물을 zip 하나로">⬇ 패키지</button></div>';
    }).join("");
    return '<section class="section"><h2>단계 진행' + (canEdit() ? " <small>단계를 누르면 상태를 바꿉니다</small>" : "") + '</h2><div class="box stages">' + stages + "</div></section>" +
      (wrows ? '<section class="section"><h2>시스템별 설계 진행 <small>미진행 · 진행중 · 재검토 필요 · 완료 — AI가 만든 결과는 검토 후 완료로 표시합니다</small></h2><div class="box wsyss">' + wrows + "</div></section>" : "") +
      (outRows ? '<section class="section"><h2>산출물 내려받기 <small>정보구조도 · 화면설계서 · 프로토타입 · 플로우 · 테스트 · 디자인 토큰</small><button class="btn-sm btn-primary" data-pkg="" title="모든 시스템의 산출물을 zip 하나로">⬇ 전체 패키지 (zip)</button></h2><div class="box outs">' + outRows + "</div></section>" : "") +
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
        var html = '<button class="step" data-task="' + esc(t.taskId) + '" style="--sys:' + sysColor(t.systemCode) + '"><span class="tid">' + esc(shortTask(t.taskId, row.requirementId)) + "</span>" +
          sysChip(t.systemCode) + '<span class="act"><span class="who">' + esc(t.actor) + "</span><b>" + esc(t.action) + "</b>" +
          (raw.origin === "AUTO" ? '<span class="auto" title="' + esc(raw.suggestReason || "") + '">자동</span>' : "") +
          '<span class="tr">' + sub + "</span></span>" + pill(t.status) + '<span class="go">›</span></button>';
        if (SRV && canEdit() && row.status !== "EXCLUDED") html = '<div class="step-wrap">' + html + '<button class="step-ed" data-act="task-edit" data-arg="' + esc(t.taskId) + '" title="Task 고치기 (행위자·처리 내용·시스템)" aria-label="' + esc(t.taskId) + ' 고치기">✎</button></div>';
        return html;
      }).join("");
      var sub = [];
      if (row.originalId && row.originalId !== row.requirementId) sub.push("원본 " + esc(row.originalId));
      sub.push(esc(req.type) + " · " + esc(req.priority));
      if (row.sources.length) sub.push("출처 " + esc(row.sources.join(", ")));
      if (row.crIds.length) sub.push("변경 요청 " + esc(row.crIds.join(", ")));
      return '<article class="box req"><div class="req-head"><span class="req-id">' + esc(row.requirementId) + '</span><span class="req-title">' + esc(row.title) + "</span>" + pill(row.status) + "</div>" +
        '<div class="req-sub">' + sub.map(function (s) { return "<span>" + s + "</span>"; }).join("") + "</div>" +
        (req.description ? '<p class="req-desc">' + esc(req.description) + "</p>" : "") + specLine(p, row.requirementId) +
        (row.status === "EXCLUDED" ? '<div class="hint">제외 사유: ' + esc(row.excludeReason) + "</div>" :
          steps ? '<div class="chain">' + steps + "</div>" : '<div class="notask">시스템별 Task가 아직 없습니다.' + (SRV ? "" : copyBox("planning -p " + m.project.code + " task auto " + row.requirementId)) + "</div>") +
        (canEdit() && row.status !== "EXCLUDED" ? '<div class="row-actions">' + actBtn("task-auto", "Task 자동 생성", row.requirementId) + actBtn("task-add", "+ Task 직접 추가", row.requirementId) + flowEditBtn(p, row.requirementId, flowOfReq(p, row.requirementId) ? "플로우 편집" : "플로우 그리기") + (flowOfReq(p, row.requirementId) ? "" : genBtn("flow:" + row.requirementId, "AI 플로우")) + '<span class="sp"></span>' + actBtn("req-edit", "요구사항 수정", row.requirementId) + actBtn("req-exclude", "제외", row.requirementId) + "</div>" : "") +
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
    var sbDone = t.screens.filter(function (s) { return workOf(p, "sb:" + s).status === "DONE"; }).length;
    var tabs = [["flow", "프로세스 플로우 · " + WORK_LABEL[workOf(p, "flow:" + t.requirementId).status]], ["sb", "화면설계서 " + sbCount + "/" + t.screens.length + (sbCount ? " · 완료 " + sbDone : "")], ["proto", "프로토타입"]];
    var body = tab === "sb" ? taskSheets(p, t) : tab === "proto" ? '<div id="proto"></div>' : taskFlow(p, t);
    return overlayBanner() + '<header class="page-head"><nav class="crumbs"><button data-page="req">요구사항·Task</button><span>›</span><span>' + esc(row.requirementId) + " " + esc(row.title) + "</span></nav>" +
      '<h1><span class="mono">' + esc(shortTask(t.taskId, row.requirementId)) + "</span> " + esc(t.action) + "</h1>" +
      '<div class="meta">' + sysChip(t.systemCode) + '<span class="tag">' + esc((sysOf(p, t.systemCode) || {}).name || "") + "</span>" + (t.actor ? '<span class="tag">행위자 ' + esc(t.actor) + "</span>" : "") + pill(t.status) + '<span class="tag mono">' + esc(t.taskId) + "</span></div></header>" +
      (canEdit() ? '<div class="row-actions">' + actBtn("task-edit", "Task 수정", t.taskId) + actBtn("task-review", t.reviewer ? "검토 다시 기록" : "검토 완료 기록", t.taskId) + actBtn("task-rm", "Task 삭제", t.taskId) + "</div>" : "") +
      '<dl class="box info">' + info.map(function (i) { return "<div><dt>" + i[0] + "</dt><dd>" + i[1] + "</dd></div>"; }).join("") + "</dl>" +
      '<nav class="tabs" role="tablist">' + tabs.map(function (x) { return '<button class="tab" role="tab" data-ttab="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</nav>" +
      '<div class="panel">' + body + "</div>";
  }

  function taskFlow(p, t) {
    var fbar = '<div class="ai-bar">' + genBtn("flow:" + t.requirementId, "이 요구사항 플로우 AI 생성·조정") + "</div>" + workCtl(p, "flow:" + t.requirementId, "프로세스 플로우");
    return fbar + taskFlowBody(p, t);
  }
  // ── 플로우차트 캔버스 편집기 연결 ──
  /** 플로우가 속한 요구사항 (노드 Task ID → 요구사항, 없으면 PF-요구사항ID) */
  function reqOfFlow(p, f) {
    var tids = {};
    allTasks(p).forEach(function (t) { tids[t.taskId] = t.requirementId; });
    for (var i = 0; i < f.nodes.length; i++) for (var j = 0; j < (f.nodes[i].taskIds || []).length; j++) if (tids[f.nodes[i].taskIds[j]]) return tids[f.nodes[i].taskIds[j]];
    var m = /^PF-(.+)$/.exec(f.id);
    return m && p.model.requirements.some(function (r) { return r.id === m[1]; }) ? m[1] : null;
  }
  function flowOfReq(p, reqId) {
    return p.model.flows.find(function (f) { return f.id === "PF-" + reqId; }) || p.model.flows.find(function (f) { return reqOfFlow(p, f) === reqId; });
  }
  /** 새로 그릴 때의 기본 틀: Task 시스템별 레인, 시작 → Task 처리 → 종료 */
  function flowTemplate(p, reqId) {
    var row = p.rtm.rows.find(function (r) { return r.requirementId === reqId; }), lanes = [], seen = {}, nodes = [{ id: "n1", shape: "TERMINATOR", label: "시작", taskIds: [], change: "NEW" }], edges = [];
    (row ? row.tasks : []).forEach(function (t, i) {
      if (!seen[t.systemCode]) { seen[t.systemCode] = "L-" + t.systemCode; var s = sysOf(p, t.systemCode); lanes.push({ id: "L-" + t.systemCode, label: (s ? s.name : t.systemCode) + (t.actor ? " · " + t.actor : ""), systemCode: t.systemCode }); }
      nodes.push({ id: "n" + (i + 2), shape: "PROCESS", label: t.action, lane: seen[t.systemCode], taskIds: [t.taskId], change: "NEW" });
    });
    if (!lanes.length) lanes.push({ id: "L1", label: "처리" });
    nodes[0].lane = lanes[0].id;
    nodes.push({ id: "n" + (nodes.length + 1), shape: "TERMINATOR", label: "종료", lane: nodes[nodes.length - 1].lane || lanes[0].id, taskIds: [], change: "NEW" });
    for (var i = 0; i + 1 < nodes.length; i++) edges.push({ from: nodes[i].id, to: nodes[i + 1].id, label: "" });
    return { id: "PF-" + reqId, kind: "PROCESS", title: (row ? row.title : reqId) + " 처리 프로세스", lanes: lanes, nodes: nodes, edges: edges };
  }
  /** 캔버스 열기. flow가 없으면 저장된 플로우(없으면 기본 틀), onSaved: 저장 뒤 할 일 */
  function openFlowEditor(reqId, flow, onSaved) {
    var p = P(), g = reqId ? p.gens["flow:" + reqId] : null;
    flow = flow || (reqId ? flowOfReq(p, reqId) : null) || flowTemplate(p, reqId);
    var canAi = !!(g && AI.sample && (!SRV || p.ai));
    FlowEdit.open({
      flow: flow,
      editable: SRV ? canEdit() && !!reqId : true,
      systems: p.model.systems.map(function (s) { return { code: s.code, name: s.name, color: s.color }; }),
      screens: p.model.ia.nodes.filter(function (n) { return n.kind !== "MENU"; }).map(function (n) { return { id: n.id, name: n.name, systemCode: n.systemCode }; }),
      tasks: allTasks(p).map(function (t) { return { id: t.taskId, label: (t.actor ? t.actor + ": " : "") + t.action, systemCode: t.systemCode }; }),
      color: sysColor,
      project: p.model.project.name,
      save: SRV && canEdit() && reqId ? function (doc) { return cmd({ op: "flow.save", requirementId: reqId, flow: doc }).then(function (r) { if (onSaved) onSaved(r); return r; }); } : null,
      ai: g ? { available: canAi, label: p.ai ? effLabel(p.ai) : "", refine: DATA.refine, prompt: function () { return fillSpecs(g.prompt, g); }, run: function (input, signal) { return AI.sample.json(input, { signal: signal, cache: false }); } } : null,
      toast: toast,
      onClose: function () { render(); }
    });
  }
  /** 플로우 그림을 누르면 전체 화면 캔버스로 */
  function flowOpenAttr(reqId) { return reqId ? ' data-flowedit="' + esc(reqId) + '" role="button" tabindex="0" title="눌러서 전체 화면 캔버스로 크게 보기"' : ""; }
  function flowEditBtn(p, reqId, label) {
    return reqId ? '<button class="btn-sm fe-open" data-flowedit="' + esc(reqId) + '">▣ ' + esc(label || "캔버스 · 전체보기") + "</button>" : "";
  }
  /** 정보구조도 캔버스 (시스템 하나). select: 처음 고를 화면 ID */
  function openIaEditor(code, select) {
    var p = P(), s = sysOf(p, code), g = p.gens["ia:" + code];
    if (!s) return;
    var hasSb = function (id) { return P().model.storyboard.screens.some(function (x) { return x.screenId === id; }); };
    var nodesOf = function () { return P().model.ia.nodes.filter(function (n) { return n.systemCode === code; }); };
    IaEdit.open({
      system: { code: s.code, name: s.name, color: s.color },
      nodes: nodesOf(),
      select: select,
      editable: SRV ? canEdit() : false,
      tasks: allTasks(p).map(function (t) { return { id: t.taskId, label: (t.actor ? t.actor + ": " : "") + t.action, systemCode: t.systemCode }; }),
      channels: channels(p),
      status: function (id) { var w = workOf(P(), "sb:" + id); return { status: w.status, label: WORK_LABEL[w.status] || w.status }; },
      hasSb: hasSb,
      project: p.model.project.name,
      save: SRV && canEdit() ? function (nodes) {
        var keep = {};
        nodes.forEach(function (n) { keep[n.id] = true; });
        var lost = nodesOf().filter(function (n) { return !keep[n.id] && hasSb(n.id); });
        if (lost.length && !window.confirm("화면설계서가 있는 화면 " + lost.length + "개를 지웁니다 (" + lost.map(function (n) { return n.id; }).join(", ") + ").\n화면설계서도 함께 지울까요?")) return Promise.resolve(false);
        return cmd({ op: "ia.save", systemCode: code, nodes: nodes, dropStoryboards: lost.length > 0 }).then(function () { return nodesOf(); });
      } : null,
      openScreen: function (id) { state.sbSel = state.sbSel || {}; state.sbSel[code] = id; state.dsSys[P().model.project.code] = code; go({ view: "project", p: state.route.p, page: "sb" }); },
      ai: g && SRV && canEdit() ? { available: !!(AI.sample && p.ai), label: p.ai ? effLabel(p.ai) : "", refine: DATA.refine, prompt: function () { return fillSpecs(g.prompt, g); }, run: function (input, signal) { return AI.sample.json(input, { signal: signal, cache: false }); } } : null,
      toast: toast,
      onClose: function () { render(); }
    });
  }
  /** 디자인 시스템 프레임 편집기 열기. id가 비면 새 컴포넌트 */
  function frameStarter(c) {
    var label = { id: "t1", type: "text", name: "라벨", text: c.name || "텍스트", size: "body", weight: 600, color: "text", bind: "label" };
    if (/button/.test(c.id)) return { id: "root", type: "frame", name: c.name, w: "hug", h: "hug", layout: { mode: "row", gap: 8, pad: [10, 18, 10, 18], align: "center", justify: "center", wrap: false }, fill: "primary", radius: "md", children: [Object.assign(label, { text: "확인", color: "onPrimary" })] };
    if (/badge/.test(c.id)) return { id: "root", type: "frame", name: c.name, w: "hug", h: "hug", layout: { mode: "row", gap: 4, pad: [2, 10, 2, 10], align: "center", justify: "center", wrap: false }, fill: "surfaceAlt", stroke: "primary", strokeW: 1, radius: "full", children: [Object.assign(label, { text: "심사중", size: "small", color: "primary" })] };
    if (/input|select|textarea/.test(c.id)) return { id: "root", type: "frame", name: c.name, w: 360, h: "hug", layout: { mode: "column", gap: 6, pad: [0, 0, 0, 0], align: "stretch", justify: "start", wrap: false }, children: [Object.assign(label, { text: "항목명", size: "small" }), { id: "f1", type: "frame", name: "입력칸", w: "fill", h: 44, layout: { mode: "row", gap: 8, pad: [0, 12, 0, 12], align: "center", justify: "between", wrap: false }, fill: "surface", stroke: "border", strokeW: 1, radius: "sm", children: [{ id: "t2", type: "text", name: "안내 문구", text: "입력하세요", size: "small", color: "textMuted", bind: "placeholder" }] }] };
    return { id: "root", type: "frame", name: c.name || "카드", w: 320, h: "hug", layout: { mode: "column", gap: 8, pad: [16, 16, 16, 16], align: "stretch", justify: "start", wrap: false }, fill: "surface", stroke: "border", strokeW: 1, radius: "md", shadow: "soft", children: [Object.assign(label, { size: "h3", weight: 700, text: c.name || "제목", bind: "title" }), { id: "t2", type: "text", name: "본문", text: "설명을 적습니다.", w: "fill", size: "small", color: "textMuted", bind: "text" }] };
  }
  /** 지금 화면에 그려지는 기본 모양을 프레임 노드로 바꿔 편집 초안으로 쓴다 */
  function compDraft(ds, c) {
    if (!window.Frames || !Frames.fromHtml) return null;
    try {
      var props = SAMPLE_PROPS[c.id];
      if (!props) { props = {}; P().model.storyboard.screens.forEach(function (s) { s.components.forEach(function (x) { if (x.ui && x.ui.component === c.id) props = x.ui.props; }); }); }
      var w = WIDE.test(c.id) || !SAMPLE_PROPS[c.id] ? ds.tokens.grid.maxWidth : 560;
      var tree = Frames.fromHtml(Wire.component(ds, c.id, props, wireCtx(P(), ds.systemCode)), { vars: Wire.vars(ds), cls: "wf " + Wire.useCss(ds), width: w, select: ".wf-c", props: props, name: c.name });
      if (!tree) return null;
      // 폭이 넓은 컴포넌트는 채우기로 두고 미리보기 폭을 맞춘다
      if (typeof tree.w === "number" && tree.w >= w - 2) tree.w = "fill";
      return { tree: tree, w: w };
    } catch (e) { return null; }
  }
  function openFrameEditor(code, id) {
    var p = P(), d = selectedDesign(p, code), s = sysOf(p, code);
    if (!d || !window.FrameEdit) return;
    var comp = id ? d.components.find(function (x) { return x.id === id; }) : null;
    var draft = comp && !comp.tree ? compDraft(d, comp) : null;
    var start = comp ? { id: comp.id, name: comp.name, category: comp.category, description: comp.description, frameW: comp.frameW || (draft && draft.w), tree: comp.tree || (draft && draft.tree) || frameStarter(comp), variantTrees: comp.variantTrees } : { name: "", category: "content", tree: frameStarter({ id: "", name: "" }) };
    FrameEdit.open({
      ds: d, vars: Wire.vars(d), cls: Wire.useCss(d), comp: start, comps: d.components,
      note: draft ? "지금 그려지는 기본 모양을 옮긴 초안입니다. 저장하면 이 컴포넌트는 이 모양으로 그려지고, 화면설계서 항목 값은 ‘props 연결’한 글자에만 들어갑니다" + (/table|list|cards|stat|tabs|steps|step|pagination|search-panel|detail/.test(comp.id) ? " — 표·목록처럼 항목 데이터로 행·열을 채우던 부분은 그린 모양 그대로 고정됩니다(화면별 내용은 화면설계서에서 항목을 프레임으로 편집)." : ".") : "",
      categories: Object.keys(CATEGORY).map(function (k) { return [k, CATEGORY[k]]; }),
      editable: SRV && canEdit(), title: code + " " + (s ? s.name : ""),
      save: function (doc) {
        return cmd({ op: "design.frame", systemCode: code, component: { id: doc.id || undefined, name: doc.name, category: doc.category, description: doc.description, tree: doc.tree, frameW: doc.frameW, variantTrees: doc.variantTrees || [] } }).then(function (r) { return r.detail && r.detail.id; });
      },
      ai: { available: !!(AI.sample && p.ai), label: p.ai ? effLabel(p.ai) : "", run: function (input, signal) { return AI.sample.json(input, { signal: signal, cache: false }); } },
      parse: looseJson,
      toast: toast,
      onClose: function () { render(); }
    });
  }
  /** 디자인 시스템 전체를 Figma로 */
  function figmaExport(code, kind, btn) {
    var p = P(), d = selectedDesign(p, code), s = sysOf(p, code), title = p.model.project.name + " · " + code + " " + (s ? s.name : "");
    if (!d) return;
    if (kind === "tokens") return FlowExport.download(new Blob([Frames.tokensJson(d, title)], { type: "application/json" }), code + "_design-tokens.json");
    if (kind === "plugin") return FlowExport.download(new Blob([FlowExport.zip(Frames.figmaPlugin(d, d.components, { title: title }))], { type: "application/zip" }), code + "_figma-plugin.zip");
    if (kind === "xscript") return copyText(Frames.figmaExportScript(d), btn, "복사함 · Figma에서 프레임을 고르고 Scripter로 실행");
    if (kind === "xprompt") return copyText(figmaImportPrompt(d, title), btn, "복사함 · Figma MCP가 연결된 Claude에 붙여 넣기");
    var text = kind === "script" ? Frames.figmaScript(d, d.components, { title: title }) : Frames.figmaPrompt(d, d.components, { title: title });
    copyText(text, btn, kind === "script" ? "복사함 · Figma ▸ 플러그인 ▸ Scripter에 붙여 넣기" : "복사함 · Figma MCP가 연결된 Claude에 붙여 넣기");
  }
  function taskFlowBody(p, t) {
    var ids = p.rtm.rows.find(function (r) { return r.requirementId === t.requirementId; }).tasks.map(function (x) { return x.taskId; });
    var flows = p.model.flows.filter(function (f) { return f.nodes.some(function (n) { return n.taskIds.some(function (id) { return ids.indexOf(id) >= 0; }); }); });
    if (!flows.length) return '<div class="box empty">이 요구사항의 Task는 아직 프로세스 플로우에 연결되지 않았습니다.' + (canEdit() || !SRV ? '<div class="row-actions center">' + flowEditBtn(p, t.requirementId, "캔버스에서 직접 그리기") + genBtn("flow:" + t.requirementId, "AI로 그리기") + "</div>" : "") + "</div>";
    var mine = t.flowNodes.length;
    return flows.map(function (f) {
      return '<section class="section"><h2>' + esc(f.title) + " <small>" + esc(f.id) + " · 진하게 표시한 노드가 이 Task" + (mine ? "" : " (이 Task는 아직 노드가 없습니다)") + '</small></h2><div class="flow-tools">' + flowEditBtn(p, reqOfFlow(p, f) || t.requirementId, canEdit() ? "캔버스로 편집 · 전체보기" : "전체보기 · 내보내기") + '</div><div class="box flow-box fit"' + flowOpenAttr(reqOfFlow(p, f) || t.requirementId) + ">" +
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
    var ds = wireDesign(p, sb.systemCode);
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

  /** Task 탭: 연결된 화면마다 화면설계서. 편집자는 화면 연결을 직접 고치고 새 화면을 추가할 수 있다 */
  function taskSheets(p, t) {
    if (t.screenless) return '<div class="box empty">화면이 없는 Task입니다. 프로세스 플로우로 설계를 확인합니다.</div>';
    var tools = SRV && canEdit() ? '<div class="link-bar"><span class="hint">이 Task의 화면 ' + t.screens.length + "개 · 한 Task에 화면을 여러 개 연결할 수 있습니다</span>" + actBtn("task-screens", "화면 연결 편집", t.taskId) + actBtn("screen-new", "+ 새 화면 만들어 연결", t.taskId) + "</div>" : "";
    if (!t.screens.length) return tools + '<div class="box empty">아직 연결된 화면이 없습니다. ' + (SRV && canEdit() ? "위에서 기존 화면을 연결하거나 새 화면을 만들어 연결하세요. 화면설계서 메뉴에서는 Task 없이도 화면마다 작성할 수 있습니다." : "정보구조도에서 화면을 이 Task에 연결하면 화면설계서를 작성할 수 있습니다.") + "</div>";
    return tools + t.screens.map(function (sid) { return sheetHtml(p, sid, t.systemCode); }).join("") + '<p class="hint">설명은 기획자 관점(정책·규칙·예외)과 고객 관점(보이는 것·할 수 있는 것)으로 적고, 개발자 관점은 넣지 않습니다.</p>';
  }
  /** 화면 하나의 화면설계서 (캔버스 + 설명 표). opts.full: 전체 화면 편집기 안 */
  function sheetHtml(p, sid, fallbackSys, opts) {
    opts = opts || {};
    var ed = SRV && canEdit();
    var sb = p.model.storyboard.screens.find(function (s) { return s.screenId === sid; });
    var node = p.model.ia.nodes.find(function (n) { return n.id === sid; }) || {};
    var ctx = wireCtx(p, node.systemCode || fallbackSys, sid);
    var tasks = (node.taskIds || []).map(function (id) { var t = findTrace(p, id); return '<span class="tag mono" title="' + esc(t ? t.action : "") + '">' + esc(id) + "</span>"; }).join(" ");
    var headRow = '<table class="sheet-head"><tbody><tr><th>화면 ID</th><td class="mono">' + esc(sid) + "</td><th>화면명</th><td>" + esc(node.name || (sb && sb.title) || "") + "</td><th>시스템</th><td>" + esc(ctx.systemName) + "</td></tr>" +
      "<tr><th>Location</th><td colspan=\"3\">" + esc(ctx.crumbs.join(" > ")) + "</td><th>화면 유형</th><td>" + esc(KIND[node.kind] || "") + (sb && sb.template ? " · " + esc(sb.template) : "") + "</td></tr>" +
      '<tr><th>연결 Task</th><td colspan="5">' + (tasks || '<span class="warn-t">연결된 Task 없음</span>') + (ed ? " " + actBtn("screen-tasks", "Task 연결 편집", sid) : "") + "</td></tr></tbody></table>";
    if (!sb) return '<article class="box sheet" data-sheet="' + esc(sid) + '">' + headRow + workCtl(p, "sb:" + sid, "화면설계서") + '<div class="empty">화면설계서가 아직 없습니다.' + (tasks ? "" : " Task가 없어도 화면 이름·메뉴 위치·참조자료로 AI가 작성할 수 있고, 나중에 Task를 연결하면 됩니다.") + '<div class="ai-bar center">' + genBtn("sb:" + sid, "AI로 화면설계서 생성") + (ed ? actBtn("sb-create", "빈 화면설계서 만들기", sid) : "") + "</div></div></article>";
    var wire = screenWire(p, sb, true);
    var ds = designOf(p, sb.systemCode);
    var left = wire ? sbCanvas(p, sb) :
      '<div class="wire-missing"><b>와이어프레임을 그릴 수 없습니다</b><p class="hint">' + esc(sb.systemCode) + " 디자인 시스템 컨셉이 " + (ds ? "아직 선택되지 않았습니다(제안 3종 검토 중)." : "아직 제안되지 않았습니다.") + " 오른쪽 설명만 글로 작성된 상태입니다.</p><button class=\"btn-sm\" data-page=\"design\" data-dsys=\"" + esc(sb.systemCode) + '">디자인 시스템 보기</button></div>';
    var n = sb.components.length;
    var desc = '<table class="desc dpanel"><thead><tr><th>No</th><th>항목</th><th>Description</th></tr></thead><tbody>' + (sb.components.map(function (c, i) {
      var rowTools = ed ? '<div class="row-tools">' + actBtn("sb-edit", "편집", sid + "|" + c.no) + (wire ? actBtn("sb-frame", "모양", sid + "|" + c.no) : "") + actBtn("sb-desc", "AI 설명", sid + "|" + c.no) + (i ? actBtn("sb-up", "↑", sid + "|" + c.no) : "") + (i < n - 1 ? actBtn("sb-down", "↓", sid + "|" + c.no) : "") + actBtn("sb-rm", "삭제", sid + "|" + c.no) + "</div>" : "";
      return '<tr data-dno="' + esc(sid + "|" + c.no) + '"' + (state.sbHl === sid + "|" + c.no ? ' class="hl"' : "") + '><td><span class="no">' + c.no + '</span></td><td class="d-item"><b>' + esc(c.label) + '</b><span class="hint mono">' + esc(c.ui ? c.ui.component : c.kind) + "</span>" + (c.ui && c.ui.link ? '<span class="hint">→ ' + esc(c.ui.link) + "</span>" : "") + rowTools + '</td><td class="d-text">' + descCell(c) + (ruleCell(c).indexOf("dash") < 0 ? '<div class="d-rules">' + ruleCell(c) + "</div>" : "") + "</td></tr>";
    }).join("") || '<tr><td colspan="3" class="empty">항목이 없습니다. ‘+ 항목 추가’로 직접 적거나 AI로 생성하세요.</td></tr>') + "</tbody></table>" + (ed ? '<div class="desc-tools">' + actBtn("sb-add", "+ 항목 추가", sid) + (n ? actBtn("sb-desc", "✦ 설명 전체 AI 작성", sid + "|", "btn-sm ai") : "") + '<span class="hint">설명을 직접 고치거나, AI에게 기능 명세·요구사항을 근거로 설명만 다시 쓰게 합니다. 항목·와이어프레임은 그대로 둡니다.</span></div>' : "");
    var bar = '<div class="sheet-bar"><b>화면설계서</b><span class="hint mono">' + esc(sid) + '</span><span class="sp"></span>' + (opts.full ? "" : '<button class="btn-sm fe-open" data-sbfull="' + esc(sid) + '">▣ 전체 화면으로 편집</button>') + (wire ? previewBtn(sid + " " + sb.title, wire, null, "실제 규격 크게 보기") : "") + '<button class="btn-sm" data-sbx="' + esc(sb.systemCode) + "|pptx|" + esc(sid) + '" title="이 화면만 PPTX로">⬇ PPTX</button>' + genBtn("sb:" + sid, appliedOverlay("sb:" + sid) ? "AI 적용본 v" + appliedOverlay("sb:" + sid).applied + " · 조정" : "AI 생성·조정") + aiBtn("sb:" + sid, "AI 요청 · Figma / Claude") + "</div>" + workCtl(p, "sb:" + sid, "화면설계서") + revBadge(p, sb);
    return '<article class="box sheet' + (opts.full ? " full" : "") + '" data-sheet="' + esc(sid) + '">' + bar + headRow + '<div class="sheet-body">' + left + '<div class="desc-wrap">' + desc + "</div></div></article>";
  }

  // ── 화면설계서 페이지: 시스템별 모든 화면 (Task 연결과 상관없이 작성·AI 생성) ──
  function renderSb() {
    var p = P(), systems = p.model.systems.filter(function (s) { return s.hasScreens; }), ed = SRV && canEdit();
    if (!systems.length) return '<div class="box empty">화면이 있는 시스템이 없습니다.</div>';
    var code = protoSys(p), screens = systemScreens(p, code);
    var chips = '<div class="filters">' + systems.map(function (s) {
      var list = systemScreens(p, s.code), done = list.filter(function (n) { return workOf(p, "sb:" + n.id).status === "DONE"; }).length;
      return '<button class="fchip" data-dsys="' + esc(s.code) + '" aria-pressed="' + (s.code === code) + '"><i style="background:' + s.color + '"></i>' + esc(s.code + " " + s.name) + '<em class="' + (list.length && done === list.length ? "ok" : "wait") + '">' + done + "/" + list.length + "</em></button>";
    }).join("") + "</div>";
    var sel = state.sbSel && state.sbSel[code];
    if (!screens.some(function (n) { return n.id === sel; })) sel = screens.length ? screens[0].id : null;
    var noTask = screens.filter(function (n) { return !(n.taskIds || []).length; }).length;
    var rows = screens.map(function (n) {
      var has = p.model.storyboard.screens.some(function (s) { return s.screenId === n.id; });
      var tk = (n.taskIds || []).length ? n.taskIds.map(function (id) { return '<span class="tag mono">' + esc(id) + "</span>"; }).join("") : '<span class="warn-t">Task 없음</span>';
      return '<button class="sb-row' + (n.id === sel ? " on" : "") + '" data-sbsel="' + esc(n.id) + '"><span class="mono">' + esc(n.id) + "</span><b>" + esc(n.name) + '</b><span class="tk">' + tk + "</span>" + (has ? workPill(p, "sb:" + n.id) : '<span class="pill NOT_STARTED">미작성</span>') + "</button>";
    }).join("");
    var nSb = screens.filter(function (n) { return p.model.storyboard.screens.some(function (s) { return s.screenId === n.id; }); }).length;
    var xbtns = nSb ? '<span class="xgrp"><b>⬇ 화면설계서 문서</b><button class="btn-sm" data-sbx="' + esc(code) + '|pptx" title="화면 이미지 + 편집 가능한 Description 표, 화면마다 한 장">PPTX</button><button class="btn-sm" data-sbx="' + esc(code) + '|pdf">PDF</button><button class="btn-sm" data-sbx="' + esc(code) + '|print" title="새 창에서 인쇄용 문서 열기">인쇄용 HTML</button><span class="hint">' + nSb + "개 화면</span></span>" : "";
    return '<section class="section"><div class="toolbar">' + chips + (ed ? actBtn("screen-new", "+ 새 화면", "|" + code) : "") + '<button class="btn-sm fe-open" data-iaedit="' + esc(code) + '"' + (sel ? ' data-iasel="' + esc(sel) + '"' : "") + ">▣ 정보구조도 캔버스에서 Task 연결·구조 편집</button>" + xbtns + "</div>" +
      (noTask ? '<div class="note row"><div><b>Task가 없는 화면 ' + noTask + '개</b><p class="hint">Task 자동 연결이 맞지 않으면 화면을 고른 뒤 ‘Task 연결 편집’으로 직접 연결하세요. Task 없이도 화면설계서를 작성·AI 생성할 수 있습니다.</p></div></div>' : "") +
      '<div class="sb-page"><nav class="sb-list" aria-label="' + esc(code) + ' 화면 목록">' + (rows || '<div class="empty">정보구조도에 화면이 없습니다.</div>') + "</nav>" +
      '<div class="sb-main">' + (sel ? sheetHtml(p, sel, code) : '<div class="box empty">화면을 고르세요.</div>') + "</div></div></section>";
  }

  // ── 기능 명세 보기·편집 (요구사항·추적표) ──
  function specOf(p, reqId) { return (p.specs && p.specs[reqId]) || { id: reqId, title: "", draft: "", from: [] }; }
  function specBtn(p, reqId) {
    var sp = specOf(p, reqId), has = sp.saved != null, dr = !!sp.draft;
    return '<button class="btn-sm spec-b' + (has ? " on" : "") + '" data-act="spec-edit" data-arg="' + esc(reqId) + '">명세 ' + (has ? "✓" : dr ? "초안" : "없음") + "</button>";
  }
  function specLine(p, reqId) {
    var sp = specOf(p, reqId), text = sp.saved != null ? sp.saved : sp.draft;
    return '<div class="spec-line">' + specBtn(p, reqId) + (text ? '<span class="hint">' + esc(text.replace(/\s+/g, " ").slice(0, 140)) + (text.length > 140 ? "…" : "") + "</span>" : '<span class="hint">기능 명세 없음 — 참조자료에 기능명세서를 올리거나 직접 적으세요</span>') + "</div>";
  }
  ACTIONS_LATE["spec-edit"] = function (reqId) {
    var p = P(), sp = specOf(p, reqId), req = p.model.requirements.find(function (r) { return r.id === reqId; }) || {};
    var from = sp.from && sp.from.length ? "참조자료 초안 출처: " + sp.from.map(esc).join(" · ") : "참조자료에서 요구사항 ID(" + esc(sp.originalId || reqId) + ")로 찾은 항목이 없습니다.";
    openForm({
      eyebrow: reqId + " " + (req.title || ""), title: "기능 명세", submit: canEdit() ? "저장" : null,
      intro: "화면설계서·프로세스 플로우를 AI로 만들 때 프롬프트에 그대로 실립니다. 저장하면 이 요구사항과 연결된 완료 산출물은 ‘재검토 필요’가 됩니다.",
      fields: [
        { name: "spec", label: "기능 명세", type: "textarea", rows: 14, value: sp.saved != null ? sp.saved : sp.draft, placeholder: "예: 입력 항목과 필수 여부, 검증 규칙, 처리 조건·상태 변화, 예외, 안내 메시지" },
        { type: "html", html: '<div class="fm-tools"><span class="hint">' + from + "</span>" + (sp.draft && canEdit() ? '<button type="button" class="btn-sm" data-specdraft>참조자료 초안 넣기</button>' : "") + (sp.saved != null && canEdit() ? '<button type="button" class="btn-sm" data-specclear>저장본 지우기 (초안 사용)</button>' : "") + "</div>" }
      ],
      onSubmit: function (v) { if (!canEdit()) return; return cmd({ op: "req.spec", id: reqId, spec: layer.clear ? "" : v.spec }); }
    });
    layer.specDraft = sp.draft;
  };

  // ── 화면설계서 항목 편집 ──
  function sbCompForm(sid, c) {
    var p = P(), sb = p.model.storyboard.screens.find(function (x) { return x.screenId === sid; });
    var ds = wireDesign(p, sb.systemCode), v = c.validation || {}, o = c.options || {};
    var comps = ds ? ds.components.map(function (x) { return [x.id, x.id + " · " + x.name + (x.tree ? " ✎" : "") + (c.ui && c.ui.tree && c.ui.component === x.id ? " — 이 화면에서 직접 그린 모양 유지" : "")]; }) : [];
    if (c.ui && c.ui.tree && !comps.some(function (x) { return x[0] === c.ui.component; })) comps.unshift([c.ui.component, "직접 그린 모양 (유지)"]);
    var variantOpts = function (cid) { var fc = ds && ds.components.find(function (x) { return x.id === cid; }); return [["", "기본"]].concat(fc && fc.variantTrees ? fc.variantTrees.map(function (v) { return [v.name, v.name]; }) : []); };
    var frameProps = function (cc) { var fc = ds && cc.ui && ds.components.find(function (x) { return x.id === cc.ui.component && x.tree; }); if (!fc) return ""; var pr = cc.ui.props || {}; return Frames.binds(fc.tree).filter(function (k) { return pr[k] != null; }).map(function (k) { return k + " = " + pr[k]; }).join("\n"); };
    var screens = p.model.ia.nodes.filter(function (n) { return n.kind !== "MENU" && n.systemCode === sb.systemCode; }).map(function (n) { return [n.id, n.id + " " + n.name]; });
    openForm({
      eyebrow: sid + (c.no ? " · " + c.no + "번" : ""), title: c.no ? c.no + ". " + c.label + " 편집" : "항목 추가", submit: "저장",
      fields: [
        { name: "label", label: "항목명", required: true, value: c.label },
        { name: "component", label: "와이어프레임 컴포넌트", type: "select", options: [["", "(없음 — 글로만)"]].concat(comps), value: c.ui ? c.ui.component : "" },
        { name: "planner", label: "기획자 관점 (정책·조건·규칙·예외)", type: "textarea", rows: 3, value: c.planner },
        { name: "customer", label: "고객 관점 (보이는 것·할 수 있는 것·안내 문구)", type: "textarea", rows: 3, value: c.customer },
        { name: "values", label: "선택지 (쉼표로 구분)", value: (o.values || []).join(", "), placeholder: "예: 전체공개, 부분공개" },
        { name: "default", label: "기본 선택", value: o.default || "" },
        { name: "required", label: "필수 입력", type: "checkbox", value: !!v.required },
        { name: "minLength", label: "최소 글자수", type: "number", value: v.minLength != null ? String(v.minLength) : "" },
        { name: "maxLength", label: "최대 글자수", type: "number", value: v.maxLength != null ? String(v.maxLength) : "" },
        { name: "format", label: "형식", value: v.format || "", placeholder: "예: 이메일, YYYY-MM-DD" },
        { name: "timing", label: "검증 시점", type: "select", options: [["", "(없음)"], ["ON_SUBMIT", "제출할 때"], ["ON_BLUR", "칸을 벗어날 때"], ["ON_INPUT", "입력 중"], ["ON_BLUR,ON_SUBMIT", "칸을 벗어날 때 + 제출할 때"]], value: (v.timing || []).join(",") },
        { name: "messages", label: "안내 문구 (한 줄에 하나, ‘조건 → 문구’)", type: "textarea", rows: 3, value: (v.messages || []).map(function (m) { return m.condition + " → " + m.text; }).join("\n"), placeholder: "미입력 → 제목을 입력해 주세요." },
        { name: "link", label: "누르면 이동할 화면", type: "select", options: [["", "(없음)"]].concat(screens), value: c.ui && c.ui.link || "" },
        { name: "variant", label: "변형 (프레임 컴포넌트)", type: "select", options: variantOpts(c.ui && c.ui.component), value: c.ui && c.ui.props && c.ui.props.variant || "" },
        { name: "fprops", label: "글자 값 (프레임 컴포넌트 props — 한 줄에 ‘이름 = 값’)", type: "textarea", rows: 3, value: frameProps(c), hint: "비우면 항목명이 label·title에, 고객 관점 설명이 text에 들어갑니다." }
      ],
      onSubmit: function (f) {
        var input = { no: c.no, label: f.label, kind: f.component || c.kind || "text", planner: f.planner, customer: f.customer };
        var vals = f.values.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
        if (vals.length) input.options = { values: vals, default: f.default || undefined, note: o.note };
        var val = { required: f.required, timing: f.timing ? f.timing.split(",") : [], messages: f.messages.split("\n").map(function (l) { var m = l.split(/\s*(?:→|->)\s*/); return l.trim() ? { condition: m.length > 1 ? m[0].trim() : "", text: (m.length > 1 ? m.slice(1).join(" → ") : l).trim() } : null; }).filter(Boolean) };
        if (f.minLength) val.minLength = Number(f.minLength);
        if (f.maxLength) val.maxLength = Number(f.maxLength);
        if (f.format) val.format = f.format;
        if (val.required || val.minLength != null || val.maxLength != null || val.format || val.timing.length || val.messages.length) input.validation = val;
        // 새로 고른 컴포넌트는 예시 데이터로 채워 와이어프레임에 바로 보이게 한다 (AI 생성·편집으로 바꿀 수 있음)
        if (f.component) input.ui = { component: f.component, props: c.ui && c.ui.component === f.component ? c.ui.props : JSON.parse(JSON.stringify(SAMPLE_PROPS[f.component] || {})), link: f.link || undefined };
        if (c.ui && c.ui.tree && f.component === c.ui.component) input.ui.tree = c.ui.tree;
        var fc = f.component && ds && ds.components.find(function (x) { return x.id === f.component && x.tree; });
        if (fc && !input.ui.tree) {
          var pr = Object.assign({}, input.ui.props || {});
          Frames.binds(fc.tree).concat((fc.variantTrees || []).reduce(function (a, v) { return a.concat(Frames.binds(v.tree)); }, [])).forEach(function (k) { delete pr[k]; });
          f.fprops.split("\n").forEach(function (l) { var m = /^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(.*)$/.exec(l); if (m) pr[m[1]] = m[2].trim(); });
          if (f.variant) pr.variant = f.variant; else delete pr.variant;
          input.ui.props = pr;
        }
        if (c.marker) input.marker = c.marker;
        return cmd({ op: "sb.component", screenId: sid, no: c.no, input: input });
      }
    });
    // 컴포넌트를 바꾸면 변형 목록도 그 컴포넌트 것으로
    var csel = document.getElementById("f-component");
    if (csel) csel.addEventListener("change", function () { var vs = document.getElementById("f-variant"); if (vs) vs.innerHTML = variantOpts(csel.value).map(function (o2) { return '<option value="' + esc(o2[0]) + '">' + esc(o2[1]) + "</option>"; }).join(""); });
  }
  ACTIONS_LATE["sb-edit"] = function (arg) {
    var a = arg.split("|"), p = P(), sb = p.model.storyboard.screens.find(function (x) { return x.screenId === a[0]; });
    var c = sb && sb.components.find(function (x) { return x.no === Number(a[1]); });
    if (c) sbCompForm(a[0], c);
  };
  ACTIONS_LATE["sb-add"] = function (sid) { sbCompForm(sid, { label: "", planner: "", customer: "" }); };
  ACTIONS_LATE["sb-rm"] = function (arg) {
    var a = arg.split("|");
    confirmAct("항목 삭제", a[0] + " " + a[1] + "번 항목을 삭제할까요? 뒤 번호가 앞으로 당겨집니다.", "삭제", function () { return cmd({ op: "sb.component", screenId: a[0], no: Number(a[1]), remove: true }); });
  };
  /** 설명만 AI로 다시 쓰기 — 항목 하나 또는 화면 전체 */
  ACTIONS_LATE["sb-desc"] = function (arg, btn) {
    var a = arg.split("|"), sid = a[0], only = a[1] ? Number(a[1]) : null, p = P();
    var g = p.gens["desc:" + sid], sb = p.model.storyboard.screens.find(function (x) { return x.screenId === sid; });
    if (!g || !sb) { toast("이 화면의 설명 작성 프롬프트가 없습니다", "err"); return; }
    if (!AI.sample || (SRV && !p.ai)) { toast("AI 설정이 없습니다. AI 설정에서 연결을 등록하세요", "err"); return; }
    var targets = sb.components.filter(function (c) { return only == null || c.no === only; });
    var lines = targets.map(function (c) { return "- no " + c.no + " · " + c.label + " · " + (c.ui ? c.ui.component : c.kind) + (c.options ? " · 선택지: " + c.options.values.join("/") : "") + "\n  현재 기획: " + (c.planner || "(없음)") + "\n  현재 고객: " + (c.customer || "(없음)"); }).join("\n");
    var prompt = fillSpecs(g.prompt, g).replace(DATA.descSlot || "{{COMPONENTS}}", function () { return lines; });
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = "작성 중…";
    document.querySelectorAll('[data-act="sb-desc"]').forEach(function (b) { b.disabled = true; });
    AI.sample.json(prompt, { cache: false }).then(function (out) {
      var comps = out && Array.isArray(out.components) ? out.components : Array.isArray(out) ? out : null;
      if (!comps) throw new Error("AI 결과에 components 목록이 없습니다");
      if (only != null) comps = comps.filter(function (c) { return Number(c.no) === only; });
      return cmd({ op: "sb.desc", screenId: sid, components: comps });
    }).catch(function (e) {
      toast(e.message || String(e), "err");
      btn.disabled = false; btn.textContent = old;
      document.querySelectorAll('[data-act="sb-desc"]').forEach(function (b) { b.disabled = false; });
    });
  };

  // ── 화면 ↔ Task 수동 연결 · 새 화면 · 화면설계서 순서 ──
  function checkList(name, groups) {
    return '<div class="chk-list">' + groups.map(function (g) {
      return '<fieldset><legend>' + g.title + "</legend>" + g.items.map(function (it) {
        return '<label class="chk-item"><input type="checkbox" data-' + name + '="' + esc(it.id) + '"' + (it.on ? " checked" : "") + '><span class="mono">' + esc(it.id) + "</span><span>" + esc(it.label) + "</span>" + (it.note ? '<em class="hint">' + esc(it.note) + "</em>" : "") + "</label>";
      }).join("") + "</fieldset>";
    }).join("") + "</div>";
  }
  function picked(name) { return Array.prototype.map.call(document.querySelectorAll("[data-" + name + "]:checked"), function (e) { return e.getAttribute("data-" + name); }); }
  // 디자인 시스템 직접 편집 — 색·글꼴·크기·모서리·레이아웃을 AI 없이 바꾼다 (개정 이력에 ‘직접 편집’으로 남음)
  var DS_COLORS = [["primary", "주 색"], ["onPrimary", "주 색 위 글자"], ["accent", "강조 색"], ["nav", "메뉴(GNB) 배경"], ["onNav", "메뉴 글자"], ["bg", "화면 배경"], ["surface", "카드·표 배경"], ["surfaceAlt", "보조 배경(표 머리 등)"], ["border", "테두리"], ["text", "글자"], ["textMuted", "보조 글자"]];
  var DS_FONTS = [['"Pretendard Variable", "Pretendard", "Malgun Gothic", sans-serif', "Pretendard"], ['"Noto Sans KR", "Malgun Gothic", sans-serif', "Noto Sans KR"], ['"IBM Plex Sans KR", "Malgun Gothic", sans-serif', "IBM Plex Sans KR"], ['"Gothic A1", "Malgun Gothic", sans-serif', "Gothic A1"], ['"Nanum Gothic", "Malgun Gothic", sans-serif', "나눔고딕"]];
  ACTIONS_LATE["ds-edit"] = function (code) {
    var p = P(), d = selectedDesign(p, code);
    if (!d) return;
    var t = d.tokens, L = d.layout;
    var fonts = DS_FONTS.some(function (f) { return f[0] === t.font.family; }) ? DS_FONTS : [[t.font.family, fontName(t.font.family) + " (현재)"]].concat(DS_FONTS);
    var nums = [["fBody", "본문 글자 크기(px)", t.font.scale.body], ["fH1", "페이지 제목 크기(px)", t.font.scale.h1], ["rMd", "모서리 둥글기(px)", t.radius.md], ["cH", "입력칸·버튼 높이(px)", t.control.height], ["cRow", "표 행 높이(px)", t.control.rowHeight], ["maxW", "본문 최대 폭(px)", t.grid.maxWidth]];
    openForm({
      eyebrow: code + " 디자인 시스템 r" + d.revision, title: "디자인 시스템 직접 편집", submit: "저장 (새 개정)",
      intro: "바꾼 값만 반영해 새 개정을 만듭니다. 이 디자인 시스템을 쓰는 화면설계서·프로토타입이 모두 다시 그려지고, 완료된 화면설계서는 ‘재검토 필요’가 됩니다.",
      fields: [{ type: "html", html: '<h4 class="fm-sec">색</h4><div class="ds-grid">' + DS_COLORS.map(function (c) { return '<label class="ds-color"><input type="color" name="c_' + c[0] + '" value="' + esc(t.color[c[0]]) + '"><span>' + esc(c[1]) + '<em class="mono">' + esc(t.color[c[0]]) + "</em></span></label>"; }).join("") + "</div>" }]
        .concat([{ type: "html", html: '<h4 class="fm-sec">글꼴·크기</h4>' }, { name: "family", label: "글꼴", type: "select", options: fonts, value: t.font.family }])
        .concat(nums.map(function (n) { return { name: n[0], label: n[1], type: "number", value: String(n[2]) }; }))
        .concat([{ name: "shadow", label: "그림자", type: "select", options: [["none", "없음"], ["soft", "약하게"], ["strong", "강하게"]], value: t.shadow }, { type: "html", html: '<h4 class="fm-sec">레이아웃</h4>' }])
        .concat(Object.keys(LAYOUT_LABEL).map(function (k) { return { name: "L_" + k, label: LAYOUT_LABEL[k][0], type: "select", options: Object.keys(LAYOUT_LABEL[k][1]).map(function (o) { return [o, LAYOUT_LABEL[k][1][o]]; }), value: L[k] }; }))
        .concat([{ name: "note", label: "변경 메모 (선택)", placeholder: "예: 기관 CI 색으로 변경" }]),
      onSubmit: function (v) {
        var color = {}, patch = { tokens: {}, layout: {} };
        DS_COLORS.forEach(function (c) { var el = document.querySelector('[name="c_' + c[0] + '"]'), val = el && el.value.toUpperCase(); if (val && val !== String(t.color[c[0]]).toUpperCase()) color[c[0]] = val; });
        if (Object.keys(color).length) patch.tokens.color = color;
        var num = function (k) { var x = Number(v[k]); return isFinite(x) && x > 0 ? x : null; };
        var font = {};
        if (v.family !== t.font.family) font.family = v.family;
        var sc = {};
        if (num("fBody") && num("fBody") !== t.font.scale.body) sc.body = num("fBody");
        if (num("fH1") && num("fH1") !== t.font.scale.h1) sc.h1 = num("fH1");
        if (Object.keys(sc).length) font.scale = sc;
        if (Object.keys(font).length) patch.tokens.font = font;
        if (num("rMd") != null && num("rMd") !== t.radius.md) patch.tokens.radius = { md: num("rMd") };
        var ctl = {};
        if (num("cH") && num("cH") !== t.control.height) ctl.height = num("cH");
        if (num("cRow") && num("cRow") !== t.control.rowHeight) ctl.rowHeight = num("cRow");
        if (Object.keys(ctl).length) patch.tokens.control = ctl;
        if (num("maxW") && num("maxW") !== t.grid.maxWidth) patch.tokens.grid = { maxWidth: num("maxW") };
        if (v.shadow !== t.shadow) patch.tokens.shadow = v.shadow;
        Object.keys(LAYOUT_LABEL).forEach(function (k) { if (v["L_" + k] && v["L_" + k] !== L[k]) patch.layout[k] = v["L_" + k]; });
        if (!Object.keys(patch.tokens).length && !Object.keys(patch.layout).length) return Promise.reject(new Error("바꾼 값이 없습니다"));
        return cmd({ op: "design.edit", systemCode: code, patch: patch, note: v.note });
      }
    });
  };
  /** Claude + Figma MCP로 Figma 프레임을 이 서비스 JSON으로 바꾸게 하는 프롬프트 */
  function figmaImportPrompt(d, title) {
    return ["# Figma 프레임 → Planning Studio 컴포넌트 JSON (" + title + ")",
      "Figma MCP로 지금 선택한(또는 아래 링크의) 프레임·컴포넌트·컴포넌트 세트를 읽고(get_metadata·get_design_context), 아래 형식의 JSON 하나로 바꿔 주세요.",
      "- 오토 레이아웃: layoutMode HORIZONTAL=row, VERTICAL=column, NONE=none(자식에 x·y), itemSpacing=gap, 패딩=[위,오른쪽,아래,왼쪽], primaryAxisAlignItems→justify(start·center·end·between), counterAxisAlignItems→align(자식이 모두 STRETCH면 stretch)",
      "- 크기: FIXED=숫자, HUG=hug, FILL=fill · 색: Figma 변수 color/<이름>에 묶여 있으면 그 이름, 아니면 #RRGGBB · 글자 크기 변수 font-size/<이름>, 모서리 변수 radius/<이름>",
      "- 텍스트 레이어 이름이 {label}처럼 중괄호로 시작하면 bind: \"label\"",
      "- 인스턴스: 원본 컴포넌트 이름 끝의 (id)를 ref로, 세트의 ‘변형=값’을 variant로, {이름} 텍스트 값을 props로",
      "- 컴포넌트 세트는 ‘변형=기본’(없으면 첫 번째)을 tree, 나머지를 variantTrees[{name, tree}]",
      "- 이름 끝에 (id)가 있으면 id로 쓴다 (기존 컴포넌트를 바꿈)",
      "- 디자인 토큰 색 이름: " + Object.keys(Frames.COLOR_VAR).join(", "),
      "",
      '출력: {"planningStudio":1,"items":[{"id":"(있으면)","name":"이름","tree":{"id":"root","type":"frame",…},"variantTrees":[]}]}'].join("\n");
  }
  ACTIONS_LATE["ds-figimport"] = function (code) {
    var d = selectedDesign(P(), code);
    openForm({
      eyebrow: code + " 디자인 시스템", title: "Figma에서 가져오기", submit: "가져오기",
      intro: "Figma에서 프레임·컴포넌트·컴포넌트 세트를 선택하고 ‘내보내기 스크립트’(Scripter) 또는 내려받은 플러그인의 ‘선택한 프레임을 Planning Studio로 보내기’를 실행하면 JSON이 나옵니다. 그 JSON을 붙여 넣으세요. 이름 끝에 (id)가 있으면 그 컴포넌트를, 없으면 같은 이름의 컴포넌트를 바꾸고, 없으면 새로 만듭니다. 변형은 그대로 변형이 됩니다.",
      fields: [{ name: "json", label: "Figma에서 받은 JSON", type: "textarea", rows: 10, required: true, placeholder: '{"planningStudio":1,"items":[…]}' }],
      onSubmit: function (v) {
        var data = looseJson(v.json), items = Array.isArray(data) ? data : data && data.items;
        if (!Array.isArray(items) || !items.length) return Promise.reject(new Error("items 목록이 없습니다"));
        var known = d.components.concat(items.filter(function (it) { return it && it.id; }).map(function (it) { return { id: it.id }; }));
        var clean = Frames.ordered(items.map(function (it, i) {
          var t = Frames.sanitize(it.tree, known);
          if (!t) throw new Error((i + 1) + "번째 항목에 프레임(tree)이 없습니다");
          t.id = "root";
          var vts = (it.variantTrees || it.variants || []).map(function (vt) { var tt = Frames.sanitize(vt.tree, known); if (tt) tt.id = "root"; return tt ? { name: String(vt.name || "변형").slice(0, 40), tree: tt } : null; }).filter(Boolean);
          return { id: it.id && /^[a-z][a-z0-9-]*$/.test(it.id) ? it.id : undefined, name: String(it.name || "Figma 컴포넌트 " + (i + 1)).slice(0, 60), category: it.category, description: it.description, tree: t, variantTrees: vts };
        }));
        return cmd({ op: "design.frame.import", systemCode: code, items: clean });
      }
    });
  };
  ACTIONS_LATE["ds-frame-rm"] = function (arg) {
    var a = arg.split("|"), d = selectedDesign(P(), a[0]), c = d && d.components.find(function (x) { return x.id === a[1]; });
    if (!c) return;
    if (!window.confirm(c.origin === "BASE" ? c.name + " 컴포넌트를 기본 모양으로 되돌릴까요? 프레임으로 그린 모양은 지워집니다." : c.name + " 컴포넌트를 지울까요?")) return;
    cmd({ op: "design.frame.rm", systemCode: a[0], id: a[1] }).catch(function (e) { toast(e.message, "err"); });
  };
  ACTIONS_LATE["task-screens"] = function (taskId) {
    var p = P(), t = findTrace(p, taskId);
    var groups = p.model.systems.filter(function (s) { return s.hasScreens; }).sort(function (a, b) { return (b.code === t.systemCode) - (a.code === t.systemCode); }).map(function (s) {
      return { title: sysChip(s.code) + " " + esc(s.name) + (s.code === t.systemCode ? " (이 Task의 시스템)" : ""), items: systemScreens(p, s.code).map(function (n) {
        var others = (n.taskIds || []).filter(function (x) { return x !== taskId; });
        return { id: n.id, label: n.name, on: t.screens.indexOf(n.id) >= 0, note: others.length ? "다른 Task " + others.length : "" };
      }) };
    }).filter(function (g) { return g.items.length; });
    openForm({
      eyebrow: taskId + " · " + t.action, title: "화면 연결 편집", submit: "저장",
      intro: "이 Task를 처리하는 화면을 모두 고르세요. 한 Task에 화면 여러 개(목록·상세·등록·팝업 등)를 연결할 수 있고, 한 화면이 여러 Task에 쓰여도 됩니다.",
      fields: [{ type: "html", html: groups.length ? checkList("lnk-screen", groups) : '<p class="hint">정보구조도에 화면이 없습니다. ‘+ 새 화면 만들어 연결’을 쓰세요.</p>' }],
      onSubmit: function () { return cmd({ op: "task.screens", taskId: taskId, screenIds: picked("lnk-screen") }); }
    });
  };
  ACTIONS_LATE["screen-tasks"] = function (sid) {
    var p = P(), node = p.model.ia.nodes.find(function (n) { return n.id === sid; });
    var groups = p.rtm.rows.filter(function (r) { return r.status !== "EXCLUDED" && r.tasks.length; }).map(function (r) {
      return { title: '<span class="mono">' + esc(r.requirementId) + "</span> " + esc(r.title), items: r.tasks.map(function (t) {
        return { id: t.taskId, label: "[" + t.systemCode + "] " + (t.actor ? t.actor + ": " : "") + t.action, on: (node.taskIds || []).indexOf(t.taskId) >= 0, note: t.systemCode !== node.systemCode ? "다른 시스템" : t.screens.length ? "화면 " + t.screens.length : "" };
      }) };
    });
    openForm({
      eyebrow: sid + " · " + node.name, title: "Task 연결 편집", submit: "저장",
      intro: "이 화면이 처리하는 Task를 고르세요. 자동 연결이 잘못됐으면 여기서 바로잡습니다. 연결하면 화면설계서 AI 생성에 그 Task의 요구사항·기능 명세가 함께 실립니다.",
      fields: [{ type: "html", html: checkList("lnk-task", groups) }],
      onSubmit: function () { return cmd({ op: "screen.tasks", screenId: sid, taskIds: picked("lnk-task") }); }
    });
  };
  /** arg: "TaskID" (그 Task에 연결) 또는 "|시스템" */
  ACTIONS_LATE["screen-new"] = function (arg) {
    var p = P(), a = String(arg || ""), taskId = a.indexOf("|") === 0 ? "" : a, t = taskId ? findTrace(p, taskId) : null;
    var sys = t ? t.systemCode : a.slice(1) || protoSys(p);
    var systems = p.model.systems.filter(function (s) { return s.hasScreens; });
    var parents = function (code) { return [["", "(맨 위)"]].concat(p.model.ia.nodes.filter(function (n) { return n.systemCode === code; }).map(function (n) { return [n.id, (n.kind === "MENU" ? "▸ 메뉴 " : "   화면 ") + n.name + " · " + n.id]; })); };
    openForm({
      eyebrow: t ? taskId + " · " + t.action : "화면설계서", title: "새 화면 만들기", submit: "만들기",
      intro: "화면 ID는 프로젝트 화면 ID 규칙(상위 메뉴 약어 + 순번)으로 붙습니다. 팝업은 부모 화면 아래에 두면 부모 ID + _P01 처럼 붙습니다." + (t ? " 만든 화면은 이 Task에 바로 연결됩니다." : ""),
      fields: [
        { name: "system", label: "시스템", type: "select", options: systems.map(function (s) { return [s.code, s.code + " " + s.name]; }), value: sys },
        { name: "parent", label: "상위 메뉴·화면", type: "select", options: parents(sys), value: "" },
        { name: "name", label: "화면 이름", required: true, placeholder: "예: 공개 신청 내역" },
        { name: "kind", label: "화면 유형", type: "select", options: [["PAGE", "페이지"], ["POPUP", "팝업"], ["LAYER", "레이어"], ["TAB", "탭"]], value: "PAGE" },
        { name: "screenId", label: "화면 ID (선택)", placeholder: "비우면 규칙으로 자동" }
      ],
      onSubmit: function (v) {
        return cmd({ op: "screen.add", systemCode: v.system, parentId: v.parent || null, name: v.name, kind: v.kind, id: v.screenId || undefined, taskIds: taskId ? [taskId] : [] }).then(function (r) {
          if (r.detail && r.detail.id) { state.sbSel = state.sbSel || {}; state.sbSel[v.system] = r.detail.id; state.dsSys[P().model.project.code] = v.system; render(); }
        });
      }
    });
    // 시스템을 바꾸면 상위 목록도 바꾼다
    var sel = document.getElementById("f-system");
    if (sel) sel.addEventListener("change", function () { var ps = document.getElementById("f-parent"); if (ps) ps.innerHTML = parents(sel.value).map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + "</option>"; }).join(""); });
  };
  ACTIONS_LATE["sb-create"] = function (sid) { cmd({ op: "sb.create", screenId: sid }).catch(function (e) { toast(e.message, "err"); }); };
  function sbMove(arg, d) {
    var a = arg.split("|"), sb = P().model.storyboard.screens.find(function (x) { return x.screenId === a[0]; });
    var order = sb.components.map(function (c) { return c.no; }), i = order.indexOf(Number(a[1])), j = i + d;
    if (i < 0 || j < 0 || j >= order.length) return;
    var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    cmd({ op: "sb.reorder", screenId: a[0], order: order }).catch(function (e) { toast(e.message, "err"); });
  }
  ACTIONS_LATE["sb-up"] = function (arg) { sbMove(arg, -1); };
  ACTIONS_LATE["sb-down"] = function (arg) { sbMove(arg, 1); };

  // ── 화면설계서 캔버스: 화면 원본(1920) 위에 설명 번호를 올리고, 번호는 끌어서 옮긴다 ──
  var CV_PAD = 44, MK = 24;
  state.sbZoom = state.sbZoom || {};
  function sbCanvas(p, sb, opts) {
    opts = opts || {};
    var sid = opts.key || sb.screenId, wire = screenWire(p, sb, "pos"), z = state.sbZoom[sid] || 1;
    var movable = SRV && canEdit() && !opts.preview;
    var moved = sb.components.filter(function (c) { return c.marker; }).length;
    return '<div class="wire-box sb-canvas' + (movable ? " edit" : "") + '" data-sbc="' + esc(sid) + '">' +
      '<div class="sbc-tools">' + (isProvisional(p, sb.systemCode) ? '<span class="pill IN_DESIGN" title="디자인 시스템을 아직 고르지 않아 기본 컨셉으로 그렸습니다. 저장하면 이 컨셉으로 정해지고, 디자인 시스템 화면에서 바꿀 수 있습니다">임시 기본 디자인</span>' : "") +
      (movable ? actBtn("sb-draw", "+ 새 항목 그리기", sid, "btn-sm btn-primary") : "") +
      '<span class="hint">' + (movable ? "항목을 누르면 편집 도구 · 두 번 누르면 모양 편집 · 번호는 끌어 옮김" : "번호를 누르면 해당 설명이 강조됩니다.") + '</span><span class="sp"></span>' +
      '<button class="btn-sm" data-sbzoom="-1" aria-label="축소">−</button><span class="sbc-z">' + Math.round(z * 100) + '%</span><button class="btn-sm" data-sbzoom="1" aria-label="확대">+</button><button class="btn-sm" data-sbzoom="0">화면 맞춤</button>' +
      (movable && moved ? '<button class="btn-sm" data-sbreset="' + esc(sid) + '">번호 위치 초기화 (' + moved + ")</button>" : "") + "</div>" +
      '<div class="sbc-view"><div class="sbc-board"><div class="sbc-frame"><div class="sbc-inner" style="width:' + VW + 'px">' + wire + "</div></div>" +
      '<svg class="sbc-lines" aria-hidden="true"></svg>' + (movable ? '<div class="sbc-hov" hidden></div><div class="sbc-sel" hidden></div>' : "") +
      sb.components.map(function (c) {
        return '<button class="sbc-mk' + (c.marker ? " moved" : "") + (movable ? " drag" : "") + (state.sbHl === sid + "|" + c.no ? " hl" : "") + '" data-mk="' + c.no + '"' + (c.marker ? ' data-mx="' + c.marker.x + '" data-my="' + c.marker.y + '"' : "") + ' title="' + esc(c.no + ". " + c.label) + '" aria-label="' + esc(c.no + "번 " + c.label) + '">' + c.no + "</button>";
      }).join("") + "</div></div>" +
      '<div class="stage-cap"><span>' + VW + " × 가변 (첫 화면 " + VH + ') · 본문 영역 기준으로 표시</span><span class="pct"></span></div></div>';
  }
  /** 캔버스 배치: 맞춤 배율 × 확대, 번호 기본 위치 = 컴포넌트 왼쪽 위 */
  function layoutCanvases(root) {
    (root || document).querySelectorAll(".sb-canvas").forEach(function (cv) {
      var sid = cv.getAttribute("data-sbc"), view = cv.querySelector(".sbc-view"), board = cv.querySelector(".sbc-board"), frame = cv.querySelector(".sbc-frame"), inner = cv.querySelector(".sbc-inner");
      if (!view.clientWidth) return;
      // 내용 영역만 잘라 보여 준다: 1920 프레임 가운데 놓인 본문(약 1200px)에 맞추면 같은 폭에서 화면이 1.5배쯤 크게 보인다.
      // 좌표(번호 위치)는 1920 프레임 기준 그대로라 저장된 번호 위치가 바뀌지 않는다
      inner.style.transform = "none";
      var i0 = inner.getBoundingClientRect(), L = 0, R = VW;
      var cons = inner.querySelectorAll(".wf-container");
      if (cons.length && !inner.querySelector(".wf-sshell")) {
        L = VW; R = 0;
        Array.prototype.forEach.call(cons, function (e) { var r = e.getBoundingClientRect(); if (r.width) { L = Math.min(L, r.left - i0.left); R = Math.max(R, r.right - i0.left); } });
        inner.querySelectorAll("[data-no]").forEach(function (e) { var r = e.getBoundingClientRect(); if (r.width) { L = Math.min(L, r.left - i0.left); R = Math.max(R, r.right - i0.left); } });
        L = Math.max(0, Math.floor(L - 48)); R = Math.min(VW, Math.ceil(R + 48));
        if (R - L < 600) { L = 0; R = VW; }
      }
      var CW = R - L;
      var fit = Math.max(0.1, (view.clientWidth - CV_PAD * 2) / CW), z = fit * (state.sbZoom[sid] || 1);
      inner.style.transform = "scale(" + z + ") translateX(" + -L + "px)";
      var h = inner.offsetHeight;
      frame.style.width = Math.round(CW * z) + "px";
      frame.style.height = Math.round(h * z) + "px";
      board.style.width = Math.round(CW * z + CV_PAD * 2) + "px";
      board.style.height = Math.round(h * z + CV_PAD * 2) + "px";
      cv.dataset.z = z;
      cv.dataset.cl = L;
      // 설명 번호 크기도 화면 배율을 따른다 (실제 화면에서 32px 원 기준, 너무 작거나 크지 않게)
      var ms = Math.round(Math.max(12, Math.min(40, 32 * z)));
      cv.dataset.ms = ms;
      cv.style.setProperty("--mk", ms + "px");
      var ir = inner.getBoundingClientRect(), lines = [];
      cv.querySelectorAll(".sbc-mk").forEach(function (mk) {
        var no = mk.getAttribute("data-mk"), el = inner.querySelector('[data-no="' + no + '"]'), dx = 0, dy = 0;
        if (el) { var r = el.getBoundingClientRect(); if ((!r.width || !r.height) && el.firstElementChild) r = el.firstElementChild.getBoundingClientRect(); dx = (r.left - ir.left) / z; dy = (r.top - ir.top) / z; }
        mk.dataset.dx = dx; mk.dataset.dy = dy;
        var x = mk.hasAttribute("data-mx") ? Number(mk.getAttribute("data-mx")) : dx, y = mk.hasAttribute("data-my") ? Number(mk.getAttribute("data-my")) : dy;
        placeMk(mk, x, y, z, L, ms);
        if (el && mk.hasAttribute("data-mx") && Math.hypot(x - dx, y - dy) * z > 24) lines.push([x, y, dx, dy]);
      });
      drawLines(cv, lines, z, L);
      drawSel(cv);
      var z0 = cv.querySelector(".sbc-z"); if (z0) z0.textContent = Math.round((state.sbZoom[sid] || 1) * 100) + "%";
      var cap = cv.querySelector(".stage-cap .pct"); if (cap) cap.textContent = "실제 크기의 " + Math.round(z * 1000) / 10 + "%";
    });
  }
  function placeMk(mk, x, y, z, L, ms) { L = L || 0; ms = ms || MK; mk.style.left = Math.round(CV_PAD + (x - L) * z - ms / 2) + "px"; mk.style.top = Math.round(CV_PAD + y * z - ms / 2) + "px"; }
  function drawLines(cv, lines, z, L) {
    L = L || 0;
    var svg = cv.querySelector(".sbc-lines"), board = cv.querySelector(".sbc-board");
    svg.setAttribute("width", board.offsetWidth); svg.setAttribute("height", board.offsetHeight);
    var X = function (v) { return CV_PAD + (v - L) * z; };
    svg.innerHTML = lines.map(function (l) { return '<line x1="' + X(l[0]) + '" y1="' + (CV_PAD + l[1] * z) + '" x2="' + X(l[2]) + '" y2="' + (CV_PAD + l[3] * z) + '"/><circle cx="' + X(l[2]) + '" cy="' + (CV_PAD + l[3] * z) + '" r="3"/>'; }).join("");
  }
  var mkDrag = null;
  document.addEventListener("pointerdown", function (ev) {
    var mk = ev.target.closest && ev.target.closest(".sbc-mk.drag");
    if (!mk || ev.button > 0) return;
    var cv = mk.closest(".sb-canvas"), z = Number(cv.dataset.z || 1);
    mkDrag = { mk: mk, cv: cv, z: z, L: Number(cv.dataset.cl || 0), ms: Number(cv.dataset.ms || MK), sx: ev.clientX, sy: ev.clientY, l: parseFloat(mk.style.left), t: parseFloat(mk.style.top), moved: false };
    try { mk.setPointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
    ev.preventDefault();
  });
  document.addEventListener("pointermove", function (ev) {
    if (!mkDrag) return;
    var dx = ev.clientX - mkDrag.sx, dy = ev.clientY - mkDrag.sy;
    if (!mkDrag.moved && Math.hypot(dx, dy) < 4) return;
    mkDrag.moved = true;
    var b = mkDrag.cv.querySelector(".sbc-board");
    mkDrag.mk.style.left = Math.max(0, Math.min(b.offsetWidth - mkDrag.ms, mkDrag.l + dx)) + "px";
    mkDrag.mk.style.top = Math.max(0, Math.min(b.offsetHeight - mkDrag.ms, mkDrag.t + dy)) + "px";
    mkDrag.mk.classList.add("dragging");
  });
  document.addEventListener("pointerup", function () {
    if (!mkDrag) return;
    var d = mkDrag;
    mkDrag = null;
    d.mk.classList.remove("dragging");
    var sid = d.cv.getAttribute("data-sbc"), no = Number(d.mk.getAttribute("data-mk"));
    if (!d.moved) { mkHighlight(sid, no); return; }
    var x = (parseFloat(d.mk.style.left) + d.ms / 2 - CV_PAD) / d.z + d.L, y = (parseFloat(d.mk.style.top) + d.ms / 2 - CV_PAD) / d.z;
    d.mk.setAttribute("data-mx", Math.round(x)); d.mk.setAttribute("data-my", Math.round(y)); d.mk.classList.add("moved");
    layoutCanvases(d.cv.parentNode);
    cmd({ op: "sb.marker", screenId: sid, no: no, pos: { x: x, y: y } }).catch(function (e) { toast(e.message, "err"); render(); });
  });
  function mkHighlight(sid, no, keep) {
    state.sbHl = state.sbHl === sid + "|" + no && !keep ? null : sid + "|" + no;
    document.querySelectorAll(".sb-canvas.edit").forEach(drawSel);
    document.querySelectorAll(".sbc-mk.hl, tr[data-dno].hl").forEach(function (e) { e.classList.remove("hl"); });
    if (!state.sbHl) return;
    document.querySelectorAll('.sb-canvas[data-sbc="' + sid + '"] .sbc-mk[data-mk="' + no + '"]').forEach(function (e) { e.classList.add("hl"); });
    var row = document.querySelector('tr[data-dno="' + sid + "|" + no + '"]');
    if (row) { row.classList.add("hl"); row.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }

  // ── 화면설계서 문서 내보내기 (PPTX·PDF·인쇄용 HTML) ──
  function sbExportItems(p, code, onlyId) {
    var list = systemScreens(p, code).filter(function (n) { return (!onlyId || n.id === onlyId) && p.model.storyboard.screens.some(function (s) { return s.screenId === n.id; }); });
    return list.map(function (n) {
      var sb = p.model.storyboard.screens.find(function (s) { return s.screenId === n.id; }), ctx = wireCtx(p, code, n.id);
      var html = screenWire(p, sb, "pos");
      // 설명 번호 위치: 캔버스에서 옮긴 위치가 있으면 그대로, 없으면 요소 왼쪽 위 (그릴 때 잰다)
      return { sb: sb, html: html, head: { system: code + " " + ctx.systemName, location: ctx.crumbs.join(" > "), kind: KIND[n.kind] || "", tasks: n.taskIds || [] }, marks: null };
    });
  }
  /** 번호 위치 재기: 와이어프레임을 실제 폭으로 잠깐 그려 data-no 요소 좌표를 얻는다 */
  function measureMarks(items) {
    var host = document.createElement("div");
    host.setAttribute("style", "position:fixed;left:-30000px;top:0;width:" + VW + "px;z-index:-1");
    document.body.appendChild(host);
    items.forEach(function (it) {
      if (!it.html) return;
      host.innerHTML = it.html;
      var r0 = host.getBoundingClientRect(), by = {};
      host.querySelectorAll("[data-no]").forEach(function (e) { var r = e.getBoundingClientRect(); if ((!r.width || !r.height) && e.firstElementChild) r = e.firstElementChild.getBoundingClientRect(); by[e.getAttribute("data-no")] = { x: r.left - r0.left, y: r.top - r0.top }; });
      it.marks = it.sb.components.map(function (c) { var m = c.marker || by[String(c.no)]; return m ? { no: c.no, x: m.x, y: m.y } : null; }).filter(Boolean);
      // 본문 영역만 잘라 크게 (캔버스와 같은 기준): 컨테이너·항목 상자의 좌우 끝 ± 48px
      var L = VW, R = 0, cons = host.querySelectorAll(".wf-container, [data-no]");
      if (cons.length && !host.querySelector(".wf-sshell")) {
        Array.prototype.forEach.call(cons, function (e) { var r = e.getBoundingClientRect(); if (r.width) { L = Math.min(L, r.left - r0.left); R = Math.max(R, r.right - r0.left); } });
        L = Math.max(0, Math.floor(L - 48)); R = Math.min(VW, Math.ceil(R + 48));
        if (R - L >= 600) it.crop = { x: L, w: R - L };
      }
    });
    document.body.removeChild(host);
  }
  function sbExport(code, kind, onlyId, btn) {
    var p = P(), items = sbExportItems(p, code, onlyId), s = sysOf(p, code);
    if (!items.length) return toast("내보낼 화면설계서가 없습니다", "err");
    if (!window.SbExport) return toast("내보내기 모듈이 없습니다 — 새로고침하세요", "err");
    measureMarks(items);
    var opts = { project: p.model.project.name, system: code + " " + (s ? s.name : ""), date: new Date().toISOString().slice(0, 10), version: p.model.project.version, vw: VW };
    var base = (p.model.project.code + "_" + code + "_화면설계서" + (onlyId ? "_" + onlyId : "") + "_" + opts.date).replace(/[\\/:*?"<>|\s]+/g, "_");
    var label = btn ? btn.textContent : "";
    var step = function (i, n, id) { if (btn) btn.textContent = "그리는 중 " + i + "/" + n; };
    if (btn) btn.disabled = true;
    var done = function () { if (btn) { btn.disabled = false; btn.textContent = label; } };
    var job = kind === "pdf" ? SbExport.pdf(items, opts, step).then(function (bl) { FlowExport.download(bl, base + ".pdf"); }) :
      kind === "print" ? SbExport.printHtml(items, opts, step).then(function (html) { var w = window.open("", "_blank"); if (!w) throw new Error("팝업이 막혔습니다 — 이 사이트의 팝업을 허용하세요"); w.document.open(); w.document.write(html); w.document.close(); }) :
      SbExport.deck(items, opts, step).then(function (bytes) { FlowExport.download(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), base + ".pptx"); });
    job.then(function () { done(); toast("화면설계서 " + items.length + "개 화면을 " + { pdf: "PDF", print: "인쇄용 문서", pptx: "PPTX" }[kind] + "로 만들었습니다"); }, function (e) { done(); toast("내보내기 실패: " + (e && e.message || e), "err"); });
  }

  // ── 프로토타입 독립 HTML (한 파일, 클릭 이동·확인 창·토스트 동작) ──
  function protoHtml(code) {
    var p = P(), s = sysOf(p, code), list = systemScreens(p, code).filter(function (n) { return p.model.storyboard.screens.some(function (x) { return x.screenId === n.id; }); });
    if (!list.length) return null;
    var ds = wireDesign(p, code);
    if (!ds) return null;
    var css = (window.SbExport && SbExport.pageCss ? SbExport.pageCss() : "");
    var screens = list.map(function (n) {
      var sb = p.model.storyboard.screens.find(function (x) { return x.screenId === n.id; });
      return { id: n.id, name: n.name, kind: KIND[n.kind] || "", path: wireCtx(p, code, n.id).crumbs.join(" > "), html: screenWire(p, sb, false) || "" };
    });
    var nav = (function () {
      var nodes = p.model.ia.nodes.filter(function (n) { return n.systemCode === code; }), ids = {}; nodes.forEach(function (n) { ids[n.id] = true; });
      var has = {}; screens.forEach(function (x) { has[x.id] = true; });
      var out = "";
      (function walk(pid, d) {
        nodes.filter(function (n) { return (n.parentId && ids[n.parentId] ? n.parentId : null) === pid; }).forEach(function (n) {
          out += n.kind === "MENU" ? '<div class="m" style="padding-left:' + (8 + d * 12) + 'px">' + esc(n.name) + "</div>" : '<button class="s' + (has[n.id] ? "" : " off") + '" data-go="' + esc(n.id) + '" style="padding-left:' + (8 + d * 12) + 'px"' + (has[n.id] ? "" : " disabled") + ">" + esc(n.name) + (has[n.id] ? "" : " <i>미작성</i>") + "</button>";
          walk(n.id, d + 1);
        });
      })(null, 0);
      return out;
    })();
    var confirmT = Wire.component(null, "confirm-dialog", { title: "확인", message: "{{MSG}}", confirm: "확인", cancel: "취소" }), alertT = Wire.component(null, "alert-dialog", { title: "입력 내용을 확인해 주세요", message: "{{MSG}}", tone: "danger" }), toastT = Wire.component(null, "toast", { message: "{{MSG}}", tone: "success" });
    var title = p.model.project.name + " · " + code + " " + (s ? s.name : "") + " 프로토타입";
    var app = [
      "(function(){",
      "var S=" + JSON.stringify(screens).replace(/<\//g, "<\\/") + ",T=" + JSON.stringify({ confirm: confirmT, alert: alertT, toast: toastT }).replace(/<\//g, "<\\/") + ",vars=" + JSON.stringify(Wire.vars(ds)) + ",cur=null,pend=null;",
      "var fr=document.getElementById('fr'),vp=document.getElementById('vp'),hd=document.getElementById('hd');",
      "function esc(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];});}",
      "function fit(){var w=fr.clientWidth,z=Math.min(1,w/" + VW + ");vp.style.transform='scale('+z+')';fr.style.height=Math.round(" + VH + "*z)+'px';document.getElementById('pct').textContent=Math.round(z*100)+'%';}",
      "function go(id,msg){var sc=S.find(function(x){return x.id===id;});if(!sc){toast('화면설계서가 없는 화면입니다: '+id,'danger');return;}cur=id;vp.innerHTML=sc.html;hd.innerHTML='<b>'+esc(sc.id)+'</b> '+esc(sc.name)+' <span>'+esc(sc.path)+' · '+esc(sc.kind)+'</span>';document.querySelectorAll('#nav [data-go]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-go')===id);});history.replaceState(null,'','#'+id);if(msg)toast(msg);var i=S.indexOf(sc);document.getElementById('prev').disabled=i<=0;document.getElementById('next').disabled=i>=S.length-1;document.getElementById('pos').textContent=(i+1)+' / '+S.length;}",
      "function overlay(html){var o=document.createElement('div');o.className='wf-overlay';o.innerHTML=html;vp.appendChild(o);}",
      "function toast(msg,tone){var w=document.createElement('div');w.className='wf-toast-wrap';w.innerHTML=T.toast.replace('{{MSG}}',esc(msg)).replace('success',tone||'success');vp.appendChild(w);setTimeout(function(){if(w.parentNode)w.parentNode.removeChild(w);},2200);}",
      "document.addEventListener('click',function(ev){var el=ev.target;var g=el.closest('[data-go]');if(g){go(g.getAttribute('data-go'));return;}",
      "if(el.closest('[data-close]')){var o=el.closest('.wf-overlay');if(o)o.parentNode.removeChild(o);return;}",
      "if(el.closest('[data-ok]')){var ov=el.closest('.wf-overlay');if(ov)ov.parentNode.removeChild(ov);if(pend){var pd=pend;pend=null;if(pd.link)go(pd.link,pd.message);else toast(pd.message||'처리했습니다.');}return;}",
      "var b=el.closest('[data-action]');if(b){var act=b.getAttribute('data-action'),msg=b.getAttribute('data-message');if(act==='toast'){toast(msg||'저장했습니다.');return;}if(act==='submit'){var bad=[];vp.querySelectorAll('[data-required]').forEach(function(inp){var err=inp.parentNode.querySelector('.wf-err');if(!inp.value.trim()){bad.push(inp);inp.classList.add('invalid');if(err){err.textContent=inp.getAttribute('data-msg');err.hidden=false;}}else{inp.classList.remove('invalid');if(err)err.hidden=true;}});if(bad.length){overlay(T.alert.replace('{{MSG}}',esc(bad[0].getAttribute('data-msg'))));return;}pend={link:b.getAttribute('data-link'),message:msg};overlay(T.confirm.replace('{{MSG}}',esc(b.getAttribute('data-confirm')||'진행할까요?')));return;}}",
      "var l=el.closest('[data-link]');if(l&&vp.contains(l)){go(l.getAttribute('data-link'));}});",
      "document.getElementById('prev').onclick=function(){var i=S.findIndex(function(x){return x.id===cur;});if(i>0)go(S[i-1].id);};document.getElementById('next').onclick=function(){var i=S.findIndex(function(x){return x.id===cur;});if(i<S.length-1)go(S[i+1].id);};",
      "vp.setAttribute('style',vars);window.addEventListener('resize',fit);go((location.hash||'').slice(1)||S[0].id);fit();",
      "})();"
    ].join("\n");
    return "<!doctype html><" + "html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + esc(title) + "</title><style>" + css.replace(/<\//g, "<\\/") +
      "\nhtml,body{margin:0;height:100%;background:#eef1f5;font-family:Pretendard,'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#16202c}.top{display:flex;align-items:center;gap:12px;padding:10px 16px;background:#fff;border-bottom:1px solid #d9dee5}.top h1{font-size:15px;margin:0}.top .sp{flex:1}.top button{font:inherit;font-size:12px;padding:5px 10px;border:1px solid #d9dee5;border-radius:6px;background:#fff;cursor:pointer}.top button:disabled{opacity:.4;cursor:default}.wrap{display:grid;grid-template-columns:240px minmax(0,1fr);gap:14px;padding:14px 16px;box-sizing:border-box;min-height:calc(100% - 50px)}#nav{background:#fff;border:1px solid #d9dee5;border-radius:10px;padding:8px 0;align-self:start;position:sticky;top:14px;max-height:calc(100vh - 80px);overflow:auto}#nav .m{font-size:12px;font-weight:700;color:#4a5566;padding:8px 8px 4px}#nav .s{display:block;width:100%;text-align:left;font:inherit;font-size:13px;padding:6px 8px;border:0;background:none;cursor:pointer;border-left:3px solid transparent}#nav .s.on{background:#e3edf5;border-left-color:#1f5e8c;font-weight:600}#nav .s.off{color:#9aa3af;cursor:default}#nav .s i{font-style:normal;font-size:11px}#hd{font-size:13px;padding:0 0 8px}#hd b{font-family:ui-monospace,Menlo,monospace;color:#1f5e8c}#hd span{color:#6b7280;margin-left:8px}#fr{position:relative;width:100%;overflow:hidden;background:#fff;border:1px solid #d9dee5;border-radius:8px}#vp{position:absolute;left:0;top:0;width:" + VW + "px;height:" + VH + "px;transform-origin:0 0}.cap{font-size:11px;color:#6b7280;padding:6px 2px;display:flex;justify-content:space-between}@media(max-width:800px){.wrap{grid-template-columns:1fr}#nav{position:static;max-height:none}}" +
      "</style></head><body><div class=\"top\"><h1>" + esc(title) + "</h1><span class=\"sp\"></span><span id=\"pos\"></span><button id=\"prev\">← 이전</button><button id=\"next\">다음 →</button></div><div class=\"wrap\"><nav id=\"nav\">" + nav + "</nav><div><div id=\"hd\"></div><div id=\"fr\"><div id=\"vp\" class=\"wf-vp\"></div></div><div class=\"cap\"><span>" + VW + " × " + VH + " 뷰포트 · 목록 행·버튼을 눌러 이동, 필수 항목을 비우고 신청하면 설계한 오류 문구</span><span id=\"pct\"></span></div></div></div><script>" + app + "</" + "script></body></" + "html>";
  }
  function protoExport(code, btn) {
    var p = P(), html = protoHtml(code);
    if (!html) return toast("프로토타입으로 만들 화면설계서가 없습니다", "err");
    FlowExport.download(new Blob([html], { type: "text/html;charset=utf-8" }), (p.model.project.code + "_" + code + "_프로토타입_" + new Date().toISOString().slice(0, 10)).replace(/[\\/:*?"<>|\s]+/g, "_") + ".html");
    toast(code + " 프로토타입을 HTML 한 파일로 내려받았습니다 — 브라우저에서 열면 바로 클릭해 볼 수 있습니다");
  }

  // ── 산출물 패키지 (zip): 정보구조도 xlsx · 화면설계서 PPTX·PDF · 프로토타입 HTML · 테스트 xlsx · 플로우 PPTX · 디자인 토큰 ──
  function packageExport(code, btn) {
    var p = P(), pr = p.model.project, date = new Date().toISOString().slice(0, 10), label = btn ? btn.textContent : "";
    var systems = p.model.systems.filter(function (s) { return s.hasScreens && (!code || s.code === code); });
    if (!systems.length) return toast("화면이 있는 시스템이 없습니다", "err");
    if (btn) { btn.disabled = true; btn.textContent = "묶는 중…"; }
    var step = function (t) { if (btn) btn.textContent = t; };
    var files = [], notes = [];
    var safe = function (n) { return String(n).replace(/[\\/:*?"<>|]+/g, "_"); };
    try {
      var ia = iaXlsxBytes(); files.push({ name: safe(ia.name) + ".xlsx", data: ia.bytes });
      var qa = qaXlsxBytes(code || null); files.push({ name: safe(qa.name) + ".xlsx", data: qa.bytes });
    } catch (e) { notes.push("엑셀: " + e.message); }
    // 플로우 PPTX (시스템 레인이 있는 플로우)
    p.model.flows.forEach(function (f) {
      if (code && !f.lanes.some(function (l) { return l.systemCode === code; })) return;
      try { var b = FlowExport.build(f, { project: pr.name }); files.push({ name: "플로우/" + safe(FlowExport.fileName(f, "pptx")), data: FlowExport.pptx(f, b, { project: pr.name }) }); files.push({ name: "플로우/" + safe(FlowExport.fileName(f, "svg")), data: b.svg }); } catch (e) { notes.push("플로우 " + f.id + ": " + e.message); }
    });
    var chain = Promise.resolve();
    systems.forEach(function (s) {
      var dir = safe(s.code + "_" + s.name) + "/";
      chain = chain.then(function () {
        var d = selectedDesign(p, s.code);
        if (d) files.push({ name: dir + "디자인토큰_" + s.code + ".json", data: Frames.tokensJson(d, pr.name + " · " + s.code) });
        var ph = protoHtml(s.code);
        if (ph) files.push({ name: dir + "프로토타입_" + s.code + ".html", data: ph });
        var items = sbExportItems(p, s.code, null);
        if (!items.length) return;
        measureMarks(items);
        var opts = { project: pr.name, system: s.code + " " + s.name, date: date, version: pr.version, vw: VW };
        return SbExport.deck(items, opts, function (i, n) { step(s.code + " 화면설계서 " + i + "/" + n); }).then(function (bytes) {
          files.push({ name: dir + "화면설계서_" + s.code + "_" + date + ".pptx", data: bytes });
          // PDF는 같은 그림을 다시 쓰므로 빠르다
          return SbExport.pdf(items, opts, function () {}).then(function (bl) { return bl.arrayBuffer(); }).then(function (ab) { files.push({ name: dir + "화면설계서_" + s.code + "_" + date + ".pdf", data: new Uint8Array(ab) }); });
        });
      });
    });
    chain.then(function () {
      var readme = ["# " + pr.name + " 기획 산출물 패키지", "", "- 만든 날짜: " + date + " · 작업 버전 v" + pr.version, "- 시스템: " + systems.map(function (s) { return s.code + " " + s.name; }).join(", "), "", "## 파일", ""].concat(files.map(function (f) { return "- " + f.name; })).concat(notes.length ? ["", "## 만들지 못한 것", ""].concat(notes.map(function (n) { return "- " + n; })) : []).concat(["", "정보구조도·테스트는 엑셀, 화면설계서는 PPTX(편집 가능)와 PDF, 프로토타입은 HTML 한 파일(브라우저에서 열어 클릭), 플로우는 PPTX·SVG, 디자인 토큰은 DTCG JSON(Figma 변수)입니다."]).join("\n");
      files.unshift({ name: "README.md", data: readme });
      FlowExport.download(new Blob([FlowExport.zip(files)], { type: "application/zip" }), safe(pr.code + (code ? "_" + code : "") + "_기획산출물_" + date) + ".zip");
      toast("산출물 " + files.length + "개를 묶어 내려받았습니다" + (notes.length ? " (일부 실패: " + notes.length + ")" : ""));
    }).catch(function (e) { toast("패키지 실패: " + (e && e.message || e), "err"); }).then(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
  }

  // ── 화면설계서 캔버스 편집 도구: 항목 고르기 · 모양(프레임) 편집 · 내용(props) 편집 · 복제 · 순서 · 새 항목 그리기 ──
  function sbOf(sid) { return P().model.storyboard.screens.find(function (x) { return x.screenId === sid; }); }
  function sbItem(sid, no) { var sb = sbOf(sid); return sb ? sb.components.find(function (c) { return c.no === Number(no); }) : null; }
  /** 화면 안 항목 상자 (보드 기준 좌표) */
  function itemBoxes(cv) {
    var board = cv.querySelector(".sbc-board"), br = board.getBoundingClientRect(), out = [];
    cv.querySelectorAll(".sbc-inner [data-no]").forEach(function (e) {
      var r = e.getBoundingClientRect();
      if ((!r.width || !r.height) && e.firstElementChild) r = e.firstElementChild.getBoundingClientRect();
      if (r.width && r.height) out.push({ no: Number(e.getAttribute("data-no")), x: r.left - br.left, y: r.top - br.top, w: r.width, h: r.height });
    });
    return out;
  }
  function hitItem(cv, ev) {
    var br = cv.querySelector(".sbc-board").getBoundingClientRect(), x = ev.clientX - br.left, y = ev.clientY - br.top, best = null;
    itemBoxes(cv).forEach(function (b) { if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h && (!best || b.w * b.h < best.w * best.h)) best = b; });
    return best;
  }
  function boxCss(b) { return "left:" + Math.round(b.x) + "px;top:" + Math.round(b.y) + "px;width:" + Math.round(b.w) + "px;height:" + Math.round(b.h) + "px"; }
  function drawSel(cv) {
    var sel = cv.querySelector(".sbc-sel");
    if (!sel) return;
    var sid = cv.getAttribute("data-sbc"), hl = state.sbHl && state.sbHl.split("|"), b = null;
    if (hl && hl[0] === sid) b = itemBoxes(cv).find(function (x) { return x.no === Number(hl[1]); });
    var c = b && sbItem(sid, b.no);
    if (!b || !c) { sel.hidden = true; return; }
    var own = c.ui && c.ui.tree, n = sbOf(sid).components.length, a = sid + "|" + c.no;
    sel.hidden = false;
    sel.setAttribute("style", boxCss(b));
    sel.innerHTML = '<div class="sbc-bar' + (b.y < 44 ? " below" : "") + '" role="toolbar" aria-label="' + esc(c.no + "번 " + c.label + " 편집") + '"><b>' + c.no + ". " + esc(c.label) + "</b>" +
      actBtn("sb-frame", "✎ 모양 편집", a, "btn-sm btn-primary") + (c.ui && !own ? actBtn("sb-props", "내용", a) : "") + actBtn("sb-edit", "설명·컴포넌트", a) +
      (c.no > 1 ? actBtn("sb-up", "↑", a) : "") + (c.no < n ? actBtn("sb-down", "↓", a) : "") + actBtn("sb-dup", "복제", a) +
      (own && c.ui.component !== "frame" ? actBtn("sb-frame-reset", "기본 모양으로", a) : "") + actBtn("sb-rm", "삭제", a, "btn-sm danger") + "</div>" +
      (own ? '<span class="sbc-own">직접 그린 모양</span>' : "");
  }
  document.addEventListener("pointermove", function (ev) {
    var cv = ev.target.closest && ev.target.closest(".sb-canvas.edit");
    document.querySelectorAll(".sbc-hov:not([hidden])").forEach(function (h) { if (!cv || !cv.contains(h)) h.hidden = true; });
    if (!cv || mkDrag || ev.target.closest(".sbc-mk, .sbc-bar, .sbc-tools")) { if (cv) cv.querySelector(".sbc-hov").hidden = true; return; }
    var b = hitItem(cv, ev), hov = cv.querySelector(".sbc-hov");
    if (!b) { hov.hidden = true; return; }
    hov.hidden = false; hov.setAttribute("style", boxCss(b));
  });
  document.addEventListener("click", function (ev) {
    var cv = ev.target.closest && ev.target.closest(".sb-canvas.edit");
    if (!cv || !ev.target.closest(".sbc-board") || ev.target.closest(".sbc-mk, .sbc-bar")) return;
    var b = hitItem(cv, ev), sid = cv.getAttribute("data-sbc");
    if (b) mkHighlight(sid, b.no, true);
    else if (state.sbHl && state.sbHl.split("|")[0] === sid) mkHighlight(sid, Number(state.sbHl.split("|")[1]));
  });
  document.addEventListener("dblclick", function (ev) {
    var cv = ev.target.closest && ev.target.closest(".sb-canvas.edit");
    if (!cv || ev.target.closest(".sbc-mk, .sbc-bar")) return;
    var b = hitItem(cv, ev);
    if (b) openItemFrame(cv.getAttribute("data-sbc"), b.no);
  });

  /** 화면에 그려진 항목 모양 → 프레임 노드 초안 (주변 CSS 문맥을 그대로 감싸 재므로 실제 모양과 같다) */
  function itemDraft(sid, c) {
    var el = document.querySelector('.sb-canvas[data-sbc="' + sid + '"] .sbc-inner [data-no="' + c.no + '"]');
    if (!el || !window.Frames || !Frames.fromHtml) return null;
    var root = el.closest(".wf");
    if (!root) return null;
    var tag = function (a) { return a.tagName.toLowerCase(); };
    var html = el.outerHTML.replace(/^<([a-zA-Z0-9]+)/, '<$1 data-pick="1"');
    for (var a = el.parentElement; a && a !== root; a = a.parentElement) html = "<" + tag(a) + ' class="' + esc(a.getAttribute("class") || "") + '"' + (a.getAttribute("style") ? ' style="' + esc(a.getAttribute("style")) + '"' : "") + ">" + html + "</" + tag(a) + ">";
    try {
      var tree = Frames.fromHtml(html, { vars: root.getAttribute("style"), cls: root.getAttribute("class"), width: root.offsetWidth, select: "[data-pick]", props: {}, name: c.label }); // 항목 모양은 글자를 그대로 고정 (편집기에서 바로 고친다)
      if (!tree) return null;
      var pw = el.parentElement ? el.parentElement.clientWidth : 0;
      if (typeof tree.w === "number" && pw && Math.abs(el.offsetWidth - pw) < 3) tree.w = "fill";
      return { tree: tree, w: el.offsetWidth };
    } catch (e) { return null; }
  }
  function itemInput(c, ui) {
    return { label: c.label, kind: c.kind, planner: c.planner || "", customer: c.customer || "", options: c.options, validation: c.validation, ui: ui };
  }
  function openItemFrame(sid, no) {
    var p = P(), sb = sbOf(sid), c = sbItem(sid, no);
    if (!sb || !c || !window.FrameEdit) return;
    var ds = wireDesign(p, sb.systemCode);
    if (!ds) return toast("디자인 시스템이 없어 모양을 편집할 수 없습니다", "err");
    var el = document.querySelector('.sb-canvas[data-sbc="' + sid + '"] .sbc-inner [data-no="' + c.no + '"]');
    var draft = c.ui && c.ui.tree ? null : itemDraft(sid, c);
    var tree = c.ui && c.ui.tree ? JSON.parse(JSON.stringify(c.ui.tree)) : draft ? draft.tree : frameStarter({ id: "", name: c.label });
    var cur = c.no;
    FrameEdit.open({
      mode: "item", ds: ds, vars: Wire.vars(ds), cls: Wire.useCss(ds), comps: ds.components, editable: SRV && canEdit(), title: sid + " · " + c.no + "번",
      comp: { id: "", name: c.label, category: "content", frameW: draft ? draft.w : el ? el.offsetWidth : 960, tree: tree },
      note: draft ? "지금 화면에 그려진 모양을 옮긴 초안입니다. 저장하면 이 화면의 이 항목만 이 모양으로 바뀝니다(디자인 시스템은 그대로)." : "",
      aiContext: "[화면설계서 문맥] " + sid + " " + (sb.title || "") + " 화면의 " + c.no + "번 항목 ‘" + c.label + "’" + (c.customer ? " · 고객에게 보이는 것: " + c.customer : "") + (c.planner ? " · 정책: " + c.planner : ""),
      save: function (doc) {
        var now = sbItem(sid, cur) || c;
        return cmd({ op: "sb.component", screenId: sid, no: now.no, input: Object.assign(itemInput(now, { component: now.ui ? now.ui.component : "frame", props: now.ui ? now.ui.props : {}, link: now.ui && now.ui.link || undefined, tree: doc.tree }), { label: doc.name || now.label }) }).then(function () { return "item"; });
      },
      ai: { available: !!(AI.sample && p.ai), label: p.ai ? effLabel(p.ai) : "", run: function (input, signal) { return AI.sample.json(input, { signal: signal, cache: false }); } },
      parse: looseJson, toast: toast,
      onClose: function () { render(); }
    });
  }
  ACTIONS_LATE["sb-frame"] = function (arg) { var a = arg.split("|"); openItemFrame(a[0], Number(a[1])); };
  ACTIONS_LATE["sb-frame-reset"] = function (arg) {
    var a = arg.split("|"), c = sbItem(a[0], a[1]);
    if (!c || !c.ui) return;
    confirmAct("기본 모양으로", a[1] + "번 ‘" + c.label + "’을(를) 직접 그린 모양 대신 디자인 시스템 컴포넌트(" + c.ui.component + ") 모양으로 되돌릴까요?", "되돌리기", function () {
      return cmd({ op: "sb.component", screenId: a[0], no: c.no, input: itemInput(c, { component: c.ui.component, props: c.ui.props || {}, link: c.ui.link || undefined }) });
    });
  };
  ACTIONS_LATE["sb-dup"] = function (arg) {
    var a = arg.split("|");
    cmd({ op: "sb.dup", screenId: a[0], no: Number(a[1]) }).then(function (r) { if (r.detail && r.detail.no) { state.sbHl = a[0] + "|" + r.detail.no; render(); } }).catch(function (e) { toast(e.message, "err"); });
  };
  ACTIONS_LATE["sb-draw"] = function (sid) {
    var p = P(), sb = sbOf(sid);
    if (!sb || !window.FrameEdit) return;
    var ds = wireDesign(p, sb.systemCode);
    if (!ds) return toast("디자인 시스템이 없어 그릴 수 없습니다", "err");
    var cur = null;
    FrameEdit.open({
      mode: "item", ds: ds, vars: Wire.vars(ds), cls: Wire.useCss(ds), comps: ds.components, editable: true, title: sid + " · 새 항목",
      comp: { id: "", name: "", category: "content", frameW: 960, tree: { id: "root", type: "frame", name: "새 항목", w: "fill", h: "hug", layout: { mode: "column", gap: 12, pad: [20, 20, 20, 20], align: "stretch", justify: "start", wrap: false }, fill: "surface", stroke: "border", strokeW: 1, radius: "md", children: [{ id: "t1", type: "text", name: "제목", text: "제목", size: "h3", weight: 700 }, { id: "t2", type: "text", name: "본문", text: "내용을 적습니다.", w: "fill", size: "small", color: "textMuted" }] } },
      aiContext: "[화면설계서 문맥] " + sid + " " + (sb.title || "") + " 화면에 새로 넣을 항목",
      save: function (doc) {
        var now = cur != null ? sbItem(sid, cur) : null;
        var input = now ? Object.assign(itemInput(now, { component: now.ui ? now.ui.component : "frame", props: now.ui ? now.ui.props : {}, link: now.ui && now.ui.link || undefined, tree: doc.tree }), { label: doc.name }) :
          { label: doc.name, kind: "frame", planner: "", customer: "", ui: { component: "frame", props: {}, tree: doc.tree } };
        return cmd({ op: "sb.component", screenId: sid, no: now ? now.no : undefined, input: input }).then(function () { if (cur == null) cur = sbOf(sid).components.length; state.sbHl = sid + "|" + cur; return "item"; });
      },
      ai: { available: !!(AI.sample && p.ai), label: p.ai ? effLabel(p.ai) : "", run: function (input, signal) { return AI.sample.json(input, { signal: signal, cache: false }); } },
      parse: looseJson, toast: toast,
      onClose: function () { render(); }
    });
  };

  /** 항목 내용(props) 편집 — 표의 열·행, 탭·버튼·선택지 같은 값을 줄 단위로 */
  var PROP_LABEL = { label: "라벨", placeholder: "안내 문구", columns: "열 이름", rows: "행 데이터", items: "항목", options: "선택지", buttons: "버튼", title: "제목", total: "전체 건수", active: "선택된 탭(0부터)", steps: "단계", current: "현재 단계(0부터)", message: "메시지", text: "본문", hint: "도움말", fields: "조건 항목", files: "파일", value: "선택값", values: "선택값들", variant: "변형", required: "필수", badgeColumn: "상태 뱃지 열(0부터)", view: "보기 방식(table·card)", placement: "위치", tone: "톤", confirm: "확인 버튼", cancel: "취소 버튼", stacked: "위아래로 배치" };
  function propKind(v) {
    if (typeof v === "boolean") return "bool";
    if (typeof v === "number") return "num";
    if (Array.isArray(v)) {
      if (v.every(function (x) { return x == null || typeof x !== "object"; })) return "lines";
      if (v.every(function (x) { return Array.isArray(x); })) return "grid";
      if (v.every(function (x) { return x && typeof x === "object" && !Array.isArray(x); })) return "objs";
      return "json";
    }
    if (v && typeof v === "object") return "json";
    return "str";
  }
  ACTIONS_LATE["sb-props"] = function (arg) {
    var a = arg.split("|"), c = sbItem(a[0], a[1]);
    if (!c || !c.ui) return;
    var props = c.ui.props || {}, base = SAMPLE_PROPS[c.ui.component] || {}, keys = Object.keys(props);
    Object.keys(base).forEach(function (k) { if (keys.indexOf(k) < 0 && k !== "body") keys.push(k); });
    var specs = keys.map(function (k, i) {
      var v = props[k] !== undefined ? props[k] : undefined, kind = propKind(v !== undefined ? v : base[k]), cols = null, val = "";
      if (kind === "objs") { cols = []; (v || base[k] || []).forEach(function (o) { Object.keys(o).forEach(function (kk) { if (cols.indexOf(kk) < 0) cols.push(kk); }); }); }
      if (v !== undefined) {
        if (kind === "lines") val = v.join("\n");
        else if (kind === "grid") val = v.map(function (r) { return r.join(" | "); }).join("\n");
        else if (kind === "objs") val = v.map(function (o) { return cols.map(function (kk) { return o[kk] == null ? "" : typeof o[kk] === "object" ? JSON.stringify(o[kk]) : String(o[kk]); }).join(" | "); }).join("\n");
        else if (kind === "json") val = JSON.stringify(v, null, 1);
        else if (kind === "bool") val = !!v;
        else val = String(v);
      }
      var hint = { lines: "한 줄에 하나", grid: "한 줄에 한 행 · 칸은 | 로 구분", objs: "한 줄에 하나 · " + (cols || []).join(" | "), json: "JSON" }[kind] || "";
      var ph = base[k] !== undefined && v === undefined ? (kind === "lines" ? base[k].join(", ") : kind === "str" || kind === "num" ? String(base[k]) : "") : "";
      return { k: k, kind: kind, cols: cols, field: { name: "p" + i, label: (PROP_LABEL[k] || k) + " (" + k + ")", type: kind === "bool" ? "checkbox" : kind === "num" ? "number" : kind === "str" && String(val).length < 80 ? undefined : "textarea", rows: kind === "str" ? 2 : 4, value: val, hint: hint, placeholder: ph ? "예: " + ph : "" } };
    });
    openForm({
      eyebrow: a[0] + " · " + c.no + "번 " + c.label, title: "내용 편집 — " + c.ui.component, submit: "저장",
      intro: c.ui.tree ? "이 항목은 직접 그린 모양이라 ‘props 연결’한 글자만 이 값으로 바뀝니다. 표·목록 모양은 ‘✎ 모양 편집’에서 고치세요." : "와이어프레임에 보이는 값입니다. 비워 두면 기본 예시 값으로 그립니다.",
      fields: specs.map(function (x) { return x.field; }).concat([{ name: "px_new", label: "새 속성 추가 (‘이름 = 값’, 한 줄에 하나)", type: "textarea", rows: 2, value: "", placeholder: "예: note = 최근 3개월만 표시" }]),
      onSubmit: function (f) {
        var out = {};
        try {
          specs.forEach(function (x) {
            var raw = f[x.field.name];
            if (x.kind === "bool") { if (raw || props[x.k] !== undefined) out[x.k] = !!raw; return; }
            if (raw == null || String(raw).trim() === "") return;
            var lines = String(raw).split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
            if (x.kind === "num") out[x.k] = Number(raw);
            else if (x.kind === "lines") out[x.k] = lines;
            else if (x.kind === "grid") out[x.k] = lines.map(function (l) { return l.split("|").map(function (y) { return y.trim(); }); });
            else if (x.kind === "objs") out[x.k] = lines.map(function (l) { var cells = l.split("|").map(function (y) { return y.trim(); }), o = {}; x.cols.forEach(function (kk, j) { var cv = cells[j]; if (cv == null || cv === "") return; o[kk] = /^[\[{]/.test(cv) ? JSON.parse(cv) : cv; }); return o; });
            else if (x.kind === "json") out[x.k] = JSON.parse(raw);
            else out[x.k] = String(raw);
          });
        } catch (e) { return Promise.reject(new Error("JSON 형식이 맞지 않습니다: " + e.message)); }
        String(f.px_new || "").split("\n").forEach(function (l) { var m = /^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(.*)$/.exec(l); if (m) out[m[1]] = m[2].trim(); });
        return cmd({ op: "sb.component", screenId: a[0], no: c.no, input: itemInput(c, Object.assign({}, c.ui, { props: out })) });
      }
    });
  };

  // ── 프로토타입 ──────────────────────────────────
  /** 프로토타입 문맥: Task 탭(그 Task 화면 + 이동 화면) 또는 시스템 통합본(시스템 전체 화면, 메뉴 순서) */
  function protoCtx() {
    var p = P(), r = state.route;
    if (r.view === "project" && r.page === "proto") {
      var code = protoSys(p);
      return { key: "sys:" + code, list: systemScreens(p, code).filter(function (n) { return p.model.storyboard.screens.some(function (s) { return s.screenId === n.id; }); }).map(function (n) { return n.id; }), sys: code };
    }
    var t = findTrace(p, r.taskId);
    return { key: t.taskId, list: protoScreens(p, t), t: t };
  }
  function protoSys(p) {
    var list = p.model.systems.filter(function (s) { return s.hasScreens; }), code = state.dsSys[p.model.project.code];
    return list.some(function (s) { return s.code === code; }) ? code : list.length ? list[0].code : "";
  }
  /** IA 트리 순서(메뉴 → 화면, 깊이 우선)로 이 시스템의 화면 노드 */
  function systemScreens(p, code) {
    var nodes = p.model.ia.nodes.filter(function (n) { return n.systemCode === code; }), ids = {}, out = [];
    nodes.forEach(function (n) { ids[n.id] = true; });
    (function walk(pid) { nodes.filter(function (n) { return (n.parentId && ids[n.parentId] ? n.parentId : null) === pid; }).forEach(function (n) { if (n.kind !== "MENU") out.push(n); walk(n.id); }); })(null);
    return out;
  }
  function protoLink(p, code) {
    var sw = p.work && p.work.systems.find(function (x) { return x.code === code; });
    if (!sw || !sw.hasScreens) return "";
    return '<button class="btn-sm proto-go' + (sw.designDone ? " ready" : "") + '" data-page="proto" data-dsys="' + esc(code) + '">▶ 프로토타입 통합본' + (sw.designDone ? " · 설계 완료" : "") + "</button>";
  }
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
    var p = P(), pc = protoCtx(), t = pc.t;
    var list = pc.list;
    if (!list.length) { box.innerHTML = '<div class="box empty">화면설계서가 있는 화면이 없어 프로토타입을 만들 수 없습니다.' + (pc.sys ? " 정보구조도에서 화면을 만들고 화면설계서를 작성하면 여기로 이어집니다." : "") + "</div>"; return; }
    var cur = state.proto[pc.key];
    if (list.indexOf(cur) < 0) cur = state.proto[pc.key] = list[0];
    var sb = p.model.storyboard.screens.find(function (s) { return s.screenId === cur; });
    var wire = screenWire(p, sb, false), ds = wireDesign(p, sb.systemCode);
    if (pc.sys) {
      box.innerHTML = '<div class="proto-sys">' + protoNav(p, pc.sys, cur) + '<div class="proto-main"><div class="proto-cur"><b class="mono">' + esc(cur) + "</b> " + esc(sb.title) + workPill(p, "sb:" + cur, "설계서 ") + '<span class="sp"></span><span class="hint">' + (list.indexOf(cur) + 1) + " / " + list.length + '</span><button class="btn-sm" data-pstep="-1"' + (list.indexOf(cur) ? "" : " disabled") + '>← 이전 화면</button><button class="btn-sm" data-pstep="1"' + (list.indexOf(cur) < list.length - 1 ? "" : " disabled") + ">다음 화면 →</button></div>" +
        (wire ? '<div class="proto-frame" id="proto-frame">' + stage('<div class="wf-vp" style="' + Wire.vars(ds) + '">' + wire + "</div>", { w: VW, h: VH, label: VW + " × " + VH + " 뷰포트 · 화면 안에서 스크롤" }) + "</div>" : '<div class="box empty">' + esc(sb.systemCode) + " 디자인 시스템 컨셉을 먼저 선택해야 프로토타입을 볼 수 있습니다.</div>") +
        "</div></div>";
      fitStages(box);
      return;
    }
    box.innerHTML = '<div class="proto-bar"><span class="hint">화면</span>' + list.map(function (s) {
      var own = t.screens.indexOf(s) >= 0;
      return '<button class="chip-s' + (s === cur ? " on" : "") + '" data-pscreen="' + esc(s) + '">' + esc(s) + (own ? "" : ' <em>연결</em>') + "</button>";
    }).join("") + '<span class="sp"></span>' + (sb.systemCode ? protoLink(p, sb.systemCode) : "") + aiBtn("proto:" + t.taskId, "AI 요청 · Figma / Claude") + "</div>" +
      (wire ? '<div class="proto-frame" id="proto-frame">' + stage('<div class="wf-vp" style="' + Wire.vars(ds) + '">' + wire + "</div>", { w: VW, h: VH, label: VW + " × " + VH + " 뷰포트 · 화면 안에서 스크롤" }) + "</div>" : '<div class="box empty">' + esc(sb.systemCode) + " 디자인 시스템 컨셉을 먼저 선택해야 프로토타입을 볼 수 있습니다.</div>") +
      '<p class="hint">원본 ' + VW + "×" + VH + ' 화면을 비율만 줄여 보여 줍니다. 화면설계서로 자동 생성한 프로토타입입니다. 목록 행, 버튼을 눌러 이동해 보세요. 필수 항목을 비우고 신청하면 설계한 오류 문구가 나옵니다. <em>연결</em> 표시는 이 Task 화면에서 이동하는 다른 화면입니다.</p>';
    fitStages(box);
  }
  /** 통합본 왼쪽: 메뉴 구조 그대로 화면 목록 (설계서 상태 표시, 미작성 화면은 누를 수 없음) */
  function protoNav(p, code, cur) {
    var nodes = p.model.ia.nodes.filter(function (n) { return n.systemCode === code; }), ids = {};
    nodes.forEach(function (n) { ids[n.id] = true; });
    var has = {};
    p.model.storyboard.screens.forEach(function (s) { has[s.screenId] = true; });
    function li(n) {
      var kids = nodes.filter(function (x) { return (x.parentId && ids[x.parentId] ? x.parentId : null) === n.id; });
      var self = n.kind === "MENU" ? '<span class="pn-menu">' + esc(n.name) + "</span>" :
        has[n.id] ? '<button class="pn-s' + (n.id === cur ? " on" : "") + '" data-pscreen="' + esc(n.id) + '"><span>' + esc(n.name) + '</span><i class="wdot ws-' + workOf(p, "sb:" + n.id).status + '" title="' + esc(WORK_LABEL[workOf(p, "sb:" + n.id).status]) + '"></i></button>' :
        '<span class="pn-s off" title="화면설계서 미작성">' + esc(n.name) + " <em>미작성</em></span>";
      return "<li>" + self + (kids.length ? "<ul>" + kids.map(li).join("") + "</ul>" : "") + "</li>";
    }
    var roots = nodes.filter(function (n) { return !(n.parentId && ids[n.parentId]); });
    return '<nav class="proto-nav" aria-label="' + esc(code) + ' 화면 목록"><ul>' + roots.map(li).join("") + "</ul></nav>";
  }
  function renderProtoPage() {
    var p = P(), systems = p.model.systems.filter(function (s) { return s.hasScreens; });
    if (!systems.length) return '<div class="box empty">화면이 있는 시스템이 없습니다.</div>';
    var code = protoSys(p), sw = p.work.systems.find(function (x) { return x.code === code; });
    var chips = '<div class="filters">' + systems.map(function (s) {
      var w = p.work.systems.find(function (x) { return x.code === s.code; });
      return '<button class="fchip" data-dsys="' + esc(s.code) + '" aria-pressed="' + (s.code === code) + '"><i style="background:' + s.color + '"></i>' + esc(s.code + " " + s.name) +
        '<em class="' + (w && w.designDone ? "ok" : "wait") + '">' + (w && w.designDone ? "설계 완료" : "완료 " + (w ? w.counts.DONE : 0) + "/" + (w ? w.screens.length : 0)) + "</em></button>";
    }).join("") + "</div>";
    var withSb = sw.screens.filter(function (x) { return x.status !== "NOT_STARTED"; }).length;
    var banner = sw.designDone ? '<div class="note ok-n"><b>✓ ' + esc(sw.code + " " + sw.name) + " 설계 완료</b><p class=\"hint\">정보구조도와 화면설계서 " + sw.screens.length + "개가 모두 완료되어, 아래 통합본이 이 시스템의 확정 프로토타입입니다. 근거가 바뀌면 해당 화면이 ‘재검토 필요’로 바뀌고 이 표시가 풀립니다.</p></div>" :
      '<div class="note warn"><b>설계 진행 중 — 통합본 미리보기</b><p class="hint">화면 ' + sw.screens.length + "개 중 화면설계서 완료 " + sw.counts.DONE + "개 · 진행중 " + sw.counts.IN_PROGRESS + "개 · 재검토 필요 " + sw.counts.NEEDS_REVIEW + "개 · 미진행 " + sw.counts.NOT_STARTED + "개" + (sw.ia.status !== "DONE" ? " · 정보구조도 " + WORK_LABEL[sw.ia.status] : "") + ". 작성된 화면 " + withSb + "개를 메뉴 순서대로 이어 보여 줍니다. 모두 완료되면 확정 통합본이 됩니다.</p></div>";
    return '<section class="section"><div class="toolbar">' + chips + "</div>" + banner + '<div id="proto"></div></section>' + protoGuide(p, sw);
  }
  /** 통합본 아래: 이 시스템의 설계 진행 순서와 지금 할 일 */
  function protoGuide(p, sw) {
    var code = sw.code;
    var tasks = allTasks(p).filter(function (t) { return t.systemCode === code; });
    var reqs = p.rtm.rows.filter(function (r) { return r.status !== "EXCLUDED" && r.tasks.some(function (t) { return t.systemCode === code; }); });
    var flows = reqs.map(function (r) { return workOf(p, "flow:" + r.requirementId); });
    var fc = workCounts(flows), sc = sw.counts;
    var st = function (ok, partial) { return ok ? "done" : partial ? "doing" : "todo"; };
    var steps = [
      ["요구사항·Task 등록", "요구사항을 등록하면 시스템별 Task가 만들어집니다. 이 시스템 Task가 화면·플로우 설계의 기준입니다.", st(tasks.length > 0), "Task " + tasks.length + "건 · 요구사항 " + reqs.length + "건", '<button class="btn-sm" data-page="req">요구사항·Task</button>'],
      ["정보구조도", "메뉴와 화면 ID를 정하고 Task를 화면에 연결합니다. AI로 만들면 ‘진행중’이고, 검토 후 ‘완료’로 표시합니다.", st(sw.ia.status === "DONE", sw.ia.status !== "NOT_STARTED"), "", '<button class="btn-sm" data-page="ia">정보구조도</button>', "ia:" + code],
      ["디자인 시스템", "컨셉 3종 중 하나를 골라 디자인 시스템을 확정합니다. 개정이 올라가면 완료된 화면설계서가 ‘재검토 필요’가 됩니다.", st(sw.ds.status === "DONE", sw.ds.status !== "NOT_STARTED"), "", '<button class="btn-sm" data-page="design" data-dsys="' + esc(code) + '">디자인 시스템</button>', "ds:" + code],
      ["화면설계서", "화면마다 기능 명세를 확인해 AI로 만들고, 설명 번호 위치와 내용을 검토한 뒤 ‘완료’로 표시합니다.", st(sw.screens.length > 0 && sc.DONE === sw.screens.length, sc.DONE + sc.IN_PROGRESS + sc.NEEDS_REVIEW > 0), sw.screens.length ? workStack(sc, sw.screens.length) : "화면 없음", ""],
      ["프로세스 플로우", "이 시스템이 들어간 요구사항의 처리 흐름을 만들고 검토합니다.", st(flows.length > 0 && fc.DONE === flows.length, fc.DONE + fc.IN_PROGRESS + fc.NEEDS_REVIEW > 0), flows.length ? workStack(fc, flows.length) : "해당 요구사항 없음", '<button class="btn-sm" data-page="flow">프로세스 플로우</button>'],
      ["프로토타입 통합본 검토", "위 설계가 모두 완료되면 이 통합본이 확정본입니다. 메뉴 순서대로 화면을 넘기며 버튼·목록 이동과 입력 오류 문구를 확인합니다.", st(sw.designDone && fc.DONE === flows.length), sw.designDone ? "확정 가능" : "설계 완료 후 확정", ""]
    ];
    var next = steps.findIndex(function (x) { return x[2] !== "done"; });
    var review = Object.keys(p.work.items).map(function (k) { return p.work.items[k]; }).filter(function (w) {
      if (w.status !== "NEEDS_REVIEW") return false;
      if (w.key === "ia:" + code || w.key === "ds:" + code) return true;
      if (w.key.indexOf("sb:") === 0) return sw.screens.some(function (x) { return "sb:" + x.screenId === w.key; });
      return w.key.indexOf("flow:") === 0 && reqs.some(function (r) { return "flow:" + r.requirementId === w.key; });
    });
    var list = steps.map(function (x, i) {
      return '<li class="gstep ' + x[2] + (i === next ? " next" : "") + '"><span class="gnum">' + (x[2] === "done" ? "✓" : i + 1) + '</span><div class="gbody"><div class="gh"><b>' + x[0] + "</b>" + (x[5] ? workPill(p, x[5]) : '<span class="pill ' + (x[2] === "done" ? "DESIGNED" : x[2] === "doing" ? "IN_DESIGN" : "NOT_STARTED") + '">' + (x[2] === "done" ? "완료" : x[2] === "doing" ? "진행중" : "미진행") + "</span>") + (i === next ? '<span class="tag next-t">지금 할 일</span>' : "") + '<span class="sp"></span>' + x[4] + '</div><p class="hint">' + x[1] + "</p>" + (x[3] ? '<div class="gmeta">' + x[3] + "</div>" : "") + "</div></li>";
    }).join("");
    return '<section class="section"><h2>' + esc(code) + " 진행 순서 <small>요구사항 → 정보구조도 → 디자인 시스템 → 화면설계서 → 플로우 → 프로토타입 통합본</small></h2>" +
      '<div class="box pad guide"><ol class="gsteps">' + list + "</ol>" +
      (review.length ? '<div class="note warn"><b>재검토 필요 ' + review.length + '건</b><ul class="rv-list">' + review.map(function (w) { return "<li><span class=\"mono\">" + esc(w.key) + "</span> " + esc(w.reason || w.note || "") + (w.key.indexOf("sb:") === 0 ? ' <button class="lnk" data-pscreen="' + esc(w.key.slice(3)) + '">통합본에서 보기</button>' : "") + "</li>"; }).join("") + "</ul></div>" : "") +
      '<div class="rules"><b>상태 규칙</b><ul>' +
      "<li><b>미진행</b> — 아직 산출물이 없습니다.</li>" +
      "<li><b>진행중</b> — 산출물이 있습니다. AI로 생성·적용한 결과도 여기에 머뭅니다.</li>" +
      "<li><b>완료</b> — 작업자가 내용을 검토하고 ‘완료 처리’를 누른 상태입니다. 요구사항 추적표의 설계완료는 화면설계서가 완료일 때만 셉니다.</li>" +
      "<li><b>재검토 필요</b> — 완료 뒤에 근거(요구사항 설명·Task·기능 명세, 디자인 시스템 개정, 정보구조도)가 바뀌면 자동으로 바뀝니다. 직접 표시할 수도 있습니다.</li></ul></div></div></section>";
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
    var p = P(), pc = protoCtx();
    if (p.model.storyboard.screens.some(function (s) { return s.screenId === target; })) {
      state.proto[pc.key] = target;
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
    return { w: w, html: '<div class="wf ds-sample' + (FULLW[c.id] ? " flush" : "") + " " + Wire.useCss(ds) + '" style="' + Wire.vars(ds) + '">' + Wire.component(ds, c.id, props, ctx) + "</div>" };
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
    var html = '<div class="wf ds-sample' + (FULLW[c.id] ? " flush" : "") + " " + Wire.useCss(ds) + '" style="' + Wire.vars(ds) + '">' + Wire.component(ds, c.id, props, ctx) + "</div>";
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
    if (!d) body = '<div class="box empty">아직 컨셉을 제안받지 않았습니다. 와이어프레임을 그리기 전에 컨셉 3종을 제안받아 하나를 고릅니다.<br><span class="hint">AI 제안은 이 시스템의 사용자·채널·참조 URL·참조자료를 읽고 만들고, 기본 제안은 시스템 성격별로 정해 둔 규칙 기반 3종입니다.</span>' + (SRV ? '<div class="row-actions center">' + genBtn("dsc:" + code, "AI로 컨셉 3종 제안") + editBtn("ds-propose", "기본 컨셉 3종 (규칙 기반)", code) + "</div>" : copyBox("planning -p " + p.model.project.code + " design propose " + code)) + "</div>";
    else if (d.status !== "SELECTED") body = renderProposals(p, d, ctx);
    else body = renderSystemDesign(p, d, ctx);
    return '<section class="section"><div class="toolbar">' + chips + (d && d.status === "SELECTED" && SRV && canEdit() ? actBtn("ds-edit", "✎ 직접 편집", code) : "") + (d && d.status === "SELECTED" ? genBtn("dsc:" + code, "AI 새 컨셉 후보 제안") : "") + aiBtn("ds:" + code, "AI 요청 · Figma / Claude") + "</div>" + (d && d.status === "SELECTED" ? workCtl(p, "ds:" + code, "디자인 시스템") : "") + "</section>" + body;
  }

  function renderProposals(p, d, ctx) {
    var cols = d.proposals.map(function (c) {
      var ds = asDs(c);
      return '<article class="box concept"><div class="concept-h"><span class="cid">' + esc(c.id) + '</span><div><b>' + esc(c.name) + "</b><p>" + esc(c.summary) + '</p></div></div><p class="fit"><b>어울리는 경우</b> ' + esc(c.fit) + "</p>" +
        swatches(c.tokens) + '<p class="hint">글꼴 ' + esc(fontName(c.tokens.font.family)) + " · 본문 " + c.tokens.font.scale.body + "px · 버튼 높이 " + c.tokens.control.height + "px</p>" + layoutChips(c.layout) +
        thumbs(ds, ctx, c.id + ". " + c.name) + (SRV ? (canEdit() ? '<div class="pick">' + actBtn("ds-select", "컨셉 " + esc(c.id) + " 으로 정하기", d.systemCode + "|" + c.id, "btn-primary") + "</div>" : "") : '<div class="pick"><span class="hint">이 컨셉으로 정하기</span>' + copyBox("planning -p " + p.model.project.code + " design select " + d.systemCode + " " + c.id) + "</div>") + "</article>";
    }).join("");
    return '<div class="note warn"><b>컨셉 선택 대기</b><p class="hint">' + esc(d.systemCode) + " 화면을 그리기 전에 아래 3개 컨셉 중 하나를 고르세요. 미리보기는 모두 " + VW + "×" + VH + " 실제 규격을 축소한 것이고, 누르면 크게 볼 수 있습니다. 컨셉마다 로그인·대시보드·메인·목록·상세·등록·확인 창·알림 창·토스트·모달 팝업을 같은 내용으로 그려 비교합니다. 고른 컨셉으로 디자인 시스템이 만들어집니다.</p>" + (SRV && canEdit() ? '<div class="row-actions">' + genBtn("dsc:" + d.systemCode, "AI로 컨셉 다시 제안") + "</div>" : "") + "</div>" +
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
        var fe = SRV && canEdit() && x.id !== "gnb" && x.id !== "footer" ? '<span class="comp-fx"><button class="btn-sm" data-frameedit="' + esc(code + "|" + x.id) + '" title="피그마처럼 프레임·텍스트·도형·오토 레이아웃으로 모양 편집">✎ 프레임 편집</button>' + (x.tree ? actBtn("ds-frame-rm", x.origin === "BASE" ? "기본 모양으로" : "삭제", code + "|" + x.id) : "") + "</span>" : "";
        return '<article class="box comp' + (wide ? " wide" : "") + (x.origin === "ADDED" ? " added" : "") + '"><div class="comp-h"><b>' + esc(x.name) + '</b><span class="mono">' + esc(x.id) + "</span>" + (x.tree ? '<span class="pill DESIGNED">프레임</span>' : "") + fe +
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
    var tab = state.dsTab[code] || "style";
    var head = '<div class="ds-head box"><div><span class="eyebrow">디자인 시스템 · 개정 r' + d.revision + '</span><h2>' + esc(code) + " 디자인 시스템</h2>" +
      '<p class="ds-mix">' + DS_STAGES.slice(0, 3).map(function (st, i) { var b = briefOf(d, st[0]); return '<span class="tag"><b>' + (i + 1) + ". " + st[1] + "</b> " + esc(b.name || "미작성") + "</span>"; }).join("") + "</p>" +
      '<p class="hint">처음 고른 컨셉 ' + esc(chosen.id + ". " + chosen.name) + " · " + esc(fmtDate(d.selectedAt)) + " · 컴포넌트 " + d.components.length + "개(프레임 " + d.components.filter(function (x) { return x.tree; }).length + "개 · 초안 " + d.components.filter(function (x) { return x.draft; }).length + "개) · 아이콘 " + d.icons.length + "개" + (d.css ? " · 추가 CSS " + d.css.length + "자" : "") + "</p></div></div>";
    var tabs = '<nav class="ds-stages" role="tablist" aria-label="디자인 시스템 단계">' + DS_STAGES.map(function (st, i) {
      var b = st[0] === "review" ? null : briefOf(d, st[0]), done = st[0] === "comp" ? d.components.some(function (x) { return x.tree; }) : b && !!(d.brief && d.brief[st[0]] && d.brief[st[0]].summary);
      return '<button role="tab" data-dstab="' + esc(code + "|" + st[0]) + '" aria-selected="' + (tab === st[0]) + '"><span class="ds-n' + (done ? " ok" : "") + '">' + (st[0] === "review" ? "✓" : i + 1) + "</span><b>" + st[1] + "</b><small>" + st[2] + "</small></button>";
    }).join("") + "</nav>";
    var body;
    if (tab === "style") body = stageCard(d, "style") + mixBar(d, "style") +
      '<section class="section"><h2>기초 토큰 <small>색상 · 글꼴 · 간격 · 모서리 · 컨트롤 — 섹션마다 조정 입력란</small></h2>' + foundation + "</section>" + cssBox(d, ctx);
    else if (tab === "ux") body = stageCard(d, "ux") + mixBar(d, "ux") +
      '<section class="section"><h2>구성 규칙 <small>GNB · 로고 · 검색 · 목록 · 페이지네이션 · 버튼 · 밀도 · 푸터</small></h2>' + rules + "</section>" +
      '<section class="section"><h2>화면 템플릿 <small>이 구성으로 그린 ' + VW + "×" + VH + " 화면 · 누르면 검토·댓글</small></h2>" + thumbs(d, ctx, code, code) + secTune(code, "templates", "예: 목록 화면의 검색 영역과 표 사이 여백을 넓게") + "</section>";
    else if (tab === "comp") body = stageCard(d, "comp") + draftGen(p, d) +
      '<section class="section"><h2>컴포넌트 <small>' + d.components.length + "개 · 이미지를 누르면 댓글, 입력란으로 스타일 조정</small>" + (SRV && canEdit() ? '<button class="btn-sm btn-primary" data-frameedit="' + esc(code) + '|">+ 새 컴포넌트 (프레임 편집기)</button>' : "") + editBtn("ds-comp-add", "+ 컴포넌트 추가", code) + "</h2>" +
      '<div class="figx"><b>Figma로 내보내기</b><span class="hint">토큰은 Figma 변수로, 프레임으로 그린 컴포넌트(' + d.components.filter(function (x) { return x.tree; }).length + '개)는 오토 레이아웃 Figma 컴포넌트로 만듭니다.</span><button class="btn-sm" data-figx="' + esc(code) + '|script">플러그인 스크립트 복사 (Scripter)</button><button class="btn-sm" data-figx="' + esc(code) + '|plugin">Figma 플러그인 내려받기</button><button class="btn-sm" data-figx="' + esc(code) + '|tokens">토큰 JSON 내려받기</button><button class="btn-sm" data-figx="' + esc(code) + '|prompt">Figma AI 프롬프트 복사</button>' + (SRV && canEdit() ? '<span class="figx-sep"></span><b>Figma에서 가져오기</b><button class="btn-sm" data-figx="' + esc(code) + '|xscript">① 내보내기 스크립트 복사 (Scripter)</button>' + actBtn("ds-figimport", "② 붙여 넣어 가져오기", code, "btn-sm btn-primary") + '<button class="btn-sm" data-figx="' + esc(code) + '|xprompt">Claude(Figma MCP)로 가져오기 프롬프트</button>' : "") + '</div>' + comps + "</section>" +
      '<section class="section"><h2>아이콘 <small>' + d.icons.length + "개</small></h2>" + icons + "</section>";
    else body = tune + cbar + '<section class="section"><h2>화면 템플릿 <small>' + VW + "×" + VH + " 뷰포트를 그대로 축소 · 누르면 검토·댓글</small></h2>" + thumbs(d, ctx, chosen.name, code) + secTune(code, "templates", "예: 목록 화면의 검색 영역과 표 사이 여백을 넓게") + "</section>" +
      '<section class="section"><h2>개정 이력</h2><div class="box pad">' + dsHistory(d) + "</div></section>";
    return head + tabs + '<div class="ds-stage-body" role="tabpanel">' + body + "</div>";
  }

  // ── 디자인 시스템 단계: 톤앤매너·CSS / UI·UX / 컴포넌트 초안 / 검토 ──
  var DS_STAGES = [["style", "톤앤매너 · CSS", "색·글꼴·모서리·간격 + 추가 CSS로 ‘깔’ 잡기"], ["ux", "UI · UX", "메뉴·검색·목록·버튼·밀도 구성과 사용 원칙"], ["comp", "컴포넌트 초안", "화면 요소마다 이 톤·구성으로 제작 초안"], ["review", "검토 · 템플릿", "템플릿 댓글 · 전역 조정 · 이력"]];
  var STAGE_NAME = { style: "톤앤매너 · CSS", ux: "UI · UX", comp: "컴포넌트" };
  state.dsTab = state.dsTab || {};
  /** 단계 컨셉 (아직 안 썼으면 고른 컨셉에서 시작한 값) */
  function briefOf(d, stage) {
    var b = d.brief && d.brief[stage];
    if (b) return b;
    var c = d.proposals.find(function (x) { return x.id === d.selectedId; }) || {};
    if (stage === "comp") return { name: "", summary: "", keywords: [], rules: [] };
    return { name: c.id ? c.id + ". " + c.name : "", summary: stage === "style" ? c.summary || "" : c.fit || "", keywords: [], rules: [], from: c.id };
  }
  function stageCard(d, stage) {
    var b = briefOf(d, stage), code = d.systemCode, ed = SRV && canEdit();
    var empty = !b.summary && !b.rules.length && !b.keywords.length;
    var guide = { style: "어떤 인상(톤앤매너)으로 보일지 — 색의 성격, 글꼴의 분위기, 모서리·그림자·여백의 느낌, 강조 방식", ux: "어떻게 쓰게 할지 — 메뉴 구조, 검색·목록 방식, 정보 밀도, 버튼·확인 흐름, 접근성 원칙", comp: "컴포넌트를 어떤 규칙으로 만들지 — 카드·표·버튼의 형태, 아이콘 쓰임, 상태(비활성·오류) 표현, 재사용 단위" }[stage];
    return '<div class="box stage-card"><div class="sc-h"><span class="eyebrow">' + STAGE_NAME[stage] + " 컨셉</span>" + (b.from ? '<span class="tag">컨셉 ' + esc(b.from) + "에서 시작</span>" : "") + (d.brief && d.brief[stage] && d.brief[stage].updatedAt ? '<span class="hint">' + esc(fmtDate(d.brief[stage].updatedAt)) + "</span>" : "") + '<span class="sp"></span>' +
      (ed ? actBtn("ds-brief", "✎ 컨셉 쓰기", code + "|" + stage) + actBtn("ds-stai", "✦ AI로 이 단계 만들기", code + "|" + stage, "btn-sm ai") : "") + "</div>" +
      "<h3>" + esc(b.name || "(이름 없음)") + "</h3>" + (b.summary ? "<p>" + esc(b.summary) + "</p>" : "") +
      (b.keywords.length ? '<div class="lchips">' + b.keywords.map(function (k) { return '<span class="tag">#' + esc(k) + "</span>"; }).join("") + "</div>" : "") +
      (b.rules.length ? '<ul class="sc-rules">' + b.rules.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>" : "") +
      (empty ? '<p class="hint">' + guide + "을 적어 두면, AI 생성(화면설계서·컴포넌트 초안·조정)이 이 컨셉을 따릅니다.</p>" : "") + "</div>";
  }
  /** 다른 제안 컨셉에서 이 단계만 가져오기 */
  function mixBar(d, stage) {
    var b = briefOf(d, stage), ed = SRV && canEdit();
    return '<div class="mixbar"><span class="hint">' + (stage === "style" ? "다른 컨셉의 톤(색·글꼴·모서리)만 가져오기 — UI·UX 구성은 그대로" : "다른 컨셉의 구성(메뉴·검색·목록·버튼·밀도)만 가져오기 — 톤은 그대로") + "</span>" +
      '<div class="pminis">' + d.proposals.map(function (x) {
        var cur = b.from === x.id;
        return '<div class="box pmini' + (cur ? " on" : "") + '"><span class="cid">' + esc(x.id) + "</span><b>" + esc(x.name) + "</b>" + (stage === "style" ? swatches(x.tokens) : layoutChips(x.layout)) +
          (cur ? '<span class="pill DESIGNED">사용 중</span>' : ed ? actBtn("ds-mix", stage === "style" ? "이 톤 쓰기" : "이 구성 쓰기", d.systemCode + "|" + stage + "|" + x.id) : "") + "</div>";
      }).join("") + (ed ? '<div class="pmini add">' + genBtn("dsc:" + d.systemCode, "AI 새 컨셉 후보") + "</div>" : "") + "</div></div>";
  }
  var CSS_HINT = ".wf(화면 전체) · .wf-btn / .wf-btn.primary(버튼) · .wf-input(입력칸) · .wf-table th / td(표) · .wf-card(카드) · .wf-badge(상태 뱃지) · .wf-tabs span.on(선택 탭) · .wf-ptitle h1(화면 제목) · .wf-hbar / .wf-menu span(상단 메뉴) · .wf-footer(바닥) — 색은 var(--w-primary) 같은 토큰 변수로";
  function cssBox(d, ctx) {
    var ed = SRV && canEdit(), code = d.systemCode;
    return '<section class="section"><h2>추가 CSS <small>토큰으로 못 정하는 세부 표현(자간·선 굵기·호버·강조 방식) — 이 시스템 와이어프레임 안에서만 적용</small></h2><div class="box pad css-box">' +
      '<div class="css-ed"><textarea id="ds-css" class="mono" rows="14" spellcheck="false"' + (ed ? "" : " readonly") + ' placeholder=".wf-btn.primary { letter-spacing: -0.01em; box-shadow: 0 2px 0 rgba(0,0,0,.12); }&#10;.wf-table th { font-weight: 700; border-bottom: 2px solid var(--w-primary); }">' + esc(d.css || "") + "</textarea>" +
      '<p class="hint">' + esc(CSS_HINT) + '</p><div class="row-actions">' + (ed ? '<button class="btn-sm" data-dscss="' + esc(code) + '|preview">미리보기</button>' + actBtn("ds-stai", "✦ AI로 CSS·토큰 만들기", code + "|style", "btn-sm ai") + '<button class="btn-sm btn-primary" data-dscss="' + esc(code) + '|save">CSS 저장</button>' : "") + "</div></div>" +
      '<div class="css-prev" id="ds-css-prev">' + cssPreview(d, ctx) + "</div></div></section>";
  }
  function cssPreview(d, ctx) {
    return ["list", "form"].map(function (t) { return '<figure class="thumb">' + stage(Wire.template(d, t, ctx), { w: VW, h: VH, cap: false }) + "<figcaption>" + (t === "list" ? "목록" : "등록") + "</figcaption></figure>"; }).join("");
  }

  // ── 컴포넌트 초안 생성기: 화면 요소마다 이 톤·구성으로 제작 초안 ──
  var TPL_NEEDS = {
    list: ["search-panel", "tabs", "data-table", "card-list", "pagination", "button-group"], detail: ["detail-table", "status-badge", "file-list", "button-group"],
    form: ["step-indicator", "text-input", "textarea", "select", "radio-group", "checkbox-group", "date-range", "file-upload", "button-group"],
    dashboard: ["stat-cards", "notice-list", "data-table"], main: ["hero-banner", "search-bar", "quick-links", "notice-list"], login: ["login-form"], popup: ["modal", "confirm-dialog", "alert-dialog"]
  };
  var COMMON_NEEDS = ["breadcrumb", "button", "status-badge", "empty-state", "toast", "confirm-dialog", "alert-dialog"];
  /** 이 시스템 화면에서 쓰는(또는 템플릿상 필요한) 요소 목록 */
  function pageElements(p, d) {
    var code = d.systemCode, sbs = p.model.storyboard.screens.filter(function (s) { return s.systemCode === code; }), use = {}, tpls = {}, missing = {};
    sbs.forEach(function (s) {
      if (s.template) tpls[s.template] = (tpls[s.template] || 0) + 1;
      s.components.forEach(function (c) {
        if (c.ui && !c.ui.tree && c.ui.component !== "frame") { var u = use[c.ui.component] = use[c.ui.component] || { screens: [], props: null }; if (u.screens.indexOf(s.screenId) < 0) u.screens.push(s.screenId); if (!u.props && c.ui.props && Object.keys(c.ui.props).length) u.props = c.ui.props; }
        else if (!c.ui) { var k = c.kind || "text"; var mm = missing[k] = missing[k] || { screens: [], labels: [] }; if (mm.screens.indexOf(s.screenId) < 0) mm.screens.push(s.screenId); if (mm.labels.length < 3) mm.labels.push(c.label); }
      });
    });
    var need = {};
    Object.keys(tpls).forEach(function (t) { (TPL_NEEDS[t] || []).forEach(function (id) { need[id] = (need[id] || []).concat([t]); }); });
    COMMON_NEEDS.forEach(function (id) { need[id] = need[id] || ["공통"]; });
    var rows = d.components.filter(function (x) { return x.id !== "gnb" && x.id !== "footer" && (use[x.id] || need[x.id] || x.origin === "ADDED"); }).map(function (x) {
      var u = use[x.id];
      return { id: x.id, name: x.name, comp: x, screens: u ? u.screens : [], props: u && u.props, why: u ? "화면 " + u.screens.length + "개에서 사용" : need[x.id] ? (need[x.id][0] === "공통" ? "공통 요소" : need[x.id].map(function (t) { return (TEMPLATES.find(function (y) { return y[0] === t; }) || [t, t])[1]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join("·") + " 화면에 필요") : "추가한 컴포넌트" };
    });
    rows.sort(function (a, b) { return b.screens.length - a.screens.length; });
    Object.keys(missing).forEach(function (k) {
      if (d.components.some(function (x) { return x.id === k; })) return;
      var id = /^[a-z][a-z0-9-]*$/.test(k) ? k : "c-" + k.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "c-new";
      rows.push({ id: id, name: missing[k].labels[0] || k, comp: null, screens: missing[k].screens, why: "와이어프레임 없는 항목(" + missing[k].labels.join(", ") + ")", isNew: true });
    });
    return rows;
  }
  function draftState(x) {
    if (!x.comp) return '<span class="pill NOT_STARTED">새 컴포넌트 필요</span>';
    if (x.comp.draft) return '<span class="pill IN_DESIGN">초안 · ' + (x.comp.draft === "ai" ? "AI" : "지금 모양") + "</span>";
    if (x.comp.tree) return '<span class="pill DESIGNED">프레임 완성</span>';
    return '<span class="pill NOT_STARTED">기본 렌더러</span>';
  }
  state.dsPick = state.dsPick || {};
  function draftGen(p, d) {
    var code = d.systemCode, ed = SRV && canEdit(), rows = pageElements(p, d), pick = state.dsPick[code] || {};
    var trs = rows.map(function (x) {
      var on = pick[x.id] != null ? pick[x.id] : !(x.comp && x.comp.tree);
      return "<tr><td>" + (ed ? '<input type="checkbox" data-dspick="' + esc(code + "|" + x.id) + '"' + (on ? " checked" : "") + ' aria-label="' + esc(x.name) + ' 선택">' : "") + '</td><td><b>' + esc(x.name) + '</b> <span class="mono hint">' + esc(x.id) + '</span></td><td class="hint">' + esc(x.why) + (x.screens.length ? ' <span class="mono">' + esc(x.screens.slice(0, 3).join(", ")) + (x.screens.length > 3 ? " 외" : "") + "</span>" : "") + "</td><td>" + draftState(x) + '</td><td class="act">' +
        (ed && x.comp ? '<button class="btn-sm" data-dsdraft="' + esc(code + "|" + x.id) + '" title="지금 톤·CSS로 그려지는 모양을 프레임으로 옮겨 초안으로">지금 모양으로</button><button class="btn-sm" data-frameedit="' + esc(code + "|" + x.id) + '">✎ 편집</button>' : "") + "</td></tr>";
    }).join("");
    return '<section class="section"><h2>컴포넌트 초안 생성기 <small>이 시스템 화면 요소 ' + rows.length + "개 · 톤앤매너·UI/UX 컨셉에 맞춘 제작 초안</small></h2>" +
      '<div class="box pad dgen"><p class="hint">정보구조도·화면설계서에서 쓰는 요소와 화면 유형(목록·상세·등록·대시보드…)에 필요한 요소를 모았습니다. 고른 요소를 <b>지금 모양으로</b>(현재 토큰·추가 CSS로 그려지는 모양을 프레임으로 옮김) 또는 <b>✦ AI 초안</b>(단계별 컨셉을 읽고 새로 디자인)으로 만들면 ‘초안’ 표시가 붙고, 프레임 편집기에서 다듬어 저장하면 완성으로 바뀝니다.</p>' +
      (ed ? '<div class="row-actions"><button class="btn-sm" data-dspickall="' + esc(code) + '|1">모두 고르기</button><button class="btn-sm" data-dspickall="' + esc(code) + '|0">모두 풀기</button><span class="sp"></span><button class="btn-sm" data-dsdraft="' + esc(code) + '|*">고른 요소 → 지금 모양으로 초안</button>' + actBtn("ds-stai", "✦ 고른 요소 AI 초안", code + "|comp", "btn-sm btn-primary") + "</div>" : "") +
      '<div class="twrap"><table class="dgen-t"><thead><tr><th></th><th>요소</th><th>쓰는 곳</th><th>상태</th><th></th></tr></thead><tbody>' + (trs || '<tr><td colspan="5" class="empty">화면설계서가 아직 없어 모을 요소가 없습니다.</td></tr>') + "</tbody></table></div></div></section>";
  }
  function pickedElements(p, d) {
    var pick = state.dsPick[d.systemCode] || {};
    return pageElements(p, d).filter(function (x) { return pick[x.id] != null ? pick[x.id] : !(x.comp && x.comp.tree); });
  }
  /** 지금 모양(토큰·CSS 반영) → 프레임 초안으로 저장 */
  function draftFromRender(code, ids) {
    var p = P(), d = selectedDesign(p, code);
    if (!d) return;
    var items = [], skip = [];
    ids.forEach(function (id) {
      var c = d.components.find(function (x) { return x.id === id; });
      if (!c) { skip.push(id); return; }
      var dr = compDraft(d, c);
      if (dr) items.push({ id: c.id, name: c.name, category: c.category, description: c.description, tree: dr.tree, frameW: dr.w }); else skip.push(id);
    });
    if (!items.length) return toast("초안을 만들 요소가 없습니다" + (skip.length ? " (새 컴포넌트는 AI 초안으로: " + skip.join(", ") + ")" : ""), "err");
    cmd({ op: "design.frame.import", systemCode: code, items: items, draft: "render" }).then(function () { if (skip.length) toast("새 컴포넌트 " + skip.length + "개는 AI 초안으로 만드세요: " + skip.join(", ")); }).catch(function (e) { toast(e.message, "err"); });
  }

  // ── 단계별 컨셉 쓰기 · AI로 만들기 ──
  ACTIONS_LATE["ds-brief"] = function (arg) {
    var a = arg.split("|"), d = selectedDesign(P(), a[0]), stage = a[1];
    if (!d) return;
    var b = briefOf(d, stage);
    var ph = { style: ["예: 차분한 신뢰감 — 남색 주조, 넓은 여백", "공공기관다운 신뢰감과 읽기 쉬움. 강조는 절제하고 정보 위계는 굵기와 크기로", "예: 표 머리글은 연한 배경 + 굵은 글자\n강조색은 한 화면에 한 번만"], ux: ["예: 찾기 쉬운 업무 화면", "처음 쓰는 민원인도 3번 안에 원하는 메뉴에 도달. 목록은 표, 조건 검색은 목록 위 패널", "예: 등록·수정은 확인 창을 거쳐 저장\n목록 기본 정렬은 최신순, 10개씩"], comp: ["예: 단단한 표·카드 중심", "재사용 단위를 작게 — 버튼·뱃지·입력칸을 조합해 큰 요소를 만든다", "예: 카드는 모서리 md, 그림자 없이 테두리\n상태 뱃지는 알약형, 색은 상태 토큰"] }[stage];
    openForm({
      eyebrow: a[0] + " 디자인 시스템", title: STAGE_NAME[stage] + " 컨셉 쓰기", submit: "저장",
      intro: "이 단계의 컨셉만 따로 적습니다. AI 생성(화면설계서·컴포넌트 초안·조정)이 이 글을 읽고 따릅니다.",
      fields: [
        { name: "name", label: "컨셉 이름", value: b.name, placeholder: ph[0] },
        { name: "summary", label: "설명", type: "textarea", rows: 3, value: b.summary, placeholder: ph[1] },
        { name: "keywords", label: "키워드 (쉼표로 구분)", value: b.keywords.join(", "), placeholder: "예: 신뢰, 차분, 정돈" },
        { name: "rules", label: "원칙·규칙 (한 줄에 하나)", type: "textarea", rows: 5, value: b.rules.join("\n"), placeholder: ph[2] }
      ],
      onSubmit: function (f) { return cmd({ op: "design.stage", systemCode: a[0], stage: stage, brief: { name: f.name, summary: f.summary, keywords: f.keywords, rules: f.rules.split("\n") } }); }
    });
  };
  ACTIONS_LATE["ds-mix"] = function (arg) {
    var a = arg.split("|");
    confirmAct(a[1] === "style" ? "톤 가져오기" : "구성 가져오기", "컨셉 " + a[2] + "의 " + (a[1] === "style" ? "톤(색·글꼴·모서리·간격)" : "UI·UX 구성(메뉴·검색·목록·버튼·밀도)") + "만 가져옵니다. " + (a[1] === "style" ? "컴포넌트별 스타일 조정값은 초기화되고, 추가 CSS는 그대로 둡니다." : "톤과 추가 CSS는 그대로 둡니다.") + " 이 디자인 시스템을 쓰는 화면이 함께 바뀝니다.", "가져오기", function () {
      return cmd({ op: "design.mix", systemCode: a[0], stage: a[1], conceptId: a[2] });
    });
  };
  function stagePrompt(code, stage, ins) {
    var p = P(), d = selectedDesign(p, code), s = sysOf(p, code);
    var b = function (k) { var x = briefOf(d, k); return x.name || x.summary || x.rules.length ? "- " + STAGE_NAME[k] + ": " + [x.name, x.summary].filter(Boolean).join(" — ") + (x.keywords.length ? " (키워드 " + x.keywords.join(", ") + ")" : "") + (x.rules.length ? "\n  · " + x.rules.join("\n  · ") : "") : "- " + STAGE_NAME[k] + ": (아직 없음)"; };
    var sysLine = "- 프로젝트: " + p.model.project.name + "\n- 시스템: " + code + " " + (s ? s.name : "") + (s && s.users && s.users.length ? " (주 사용자: " + s.users.join(", ") + ")" : "") + (s && s.description ? "\n- 시스템 설명: " + s.description : "");
    var screens = p.model.ia.nodes.filter(function (n) { return n.systemCode === code && n.kind !== "MENU"; }).slice(0, 30).map(function (n) { return n.name; }).join(", ");
    var concept = [b("style"), b("ux"), b("comp")].join("\n");
    if (stage === "comp") {
      var picked = pickedElements(p, d).slice(0, 12);
      if (!picked.length) return { err: "초안을 만들 요소를 고르세요 (컴포넌트 초안 생성기 표의 체크)" };
      return { picked: picked, text: Frames.aiPrompt(d, d.components.filter(function (c) { return !picked.some(function (x) { return x.id === c.id; }); }), {
        system: code + " " + (s ? s.name : ""), instruction: (ins || "컨셉에 맞게 새로 디자인한 제작 초안") + "\n\n[대상]\n" + sysLine + "\n- 화면: " + screens, concept: concept + (d.css ? "\n- 추가 CSS(참고):\n" + d.css.slice(0, 1500) : ""),
        multi: picked.map(function (x) { return { id: x.id, name: x.name, usage: x.why, props: x.props || SAMPLE_PROPS[x.id] }; })
      }) + '\n\n덧붙여 이번 컴포넌트 제작 규칙을 "brief": {"name","summary","keywords":[],"rules":[]} 로 함께 주면 컴포넌트 단계 컨셉으로 저장합니다(선택).' };
    }
    var t = d.tokens, L = d.layout;
    var cur = stage === "style" ? "```json\n" + JSON.stringify({ tokens: t }) + "\n```\n- 추가 CSS:\n```css\n" + (d.css || "/* 없음 */") + "\n```" : "```json\n" + JSON.stringify({ layout: L }) + "\n```";
    var allowed = stage === "style" ? "tokens(색 15종 #RRGGBB, font.family·scale·weightBold, radius sm·md·lg, control.height·rowHeight, spacing, grid, shadow: none|soft|strong)와 css(추가 CSS 문자열)" : "layout: " + Object.keys(LAYOUT_LABEL).map(function (k) { return k + "(" + Object.keys(LAYOUT_LABEL[k][1]).join("|") + ")"; }).join(", ");
    var text = [
      "# " + code + " 디자인 시스템 — " + STAGE_NAME[stage] + " 단계 컨셉 만들기",
      stage === "style" ? "이 시스템 화면의 톤앤매너(깔)를 잡아 주세요: 컨셉 글과 디자인 토큰, 토큰으로 못 정하는 세부 표현을 위한 추가 CSS." : "이 시스템 화면의 UI·UX 구성을 잡아 주세요: 컨셉 글(사용 원칙)과 레이아웃 규칙.",
      "", "## 요청", ins || "(지시 없음 — 시스템 성격에 맞게)", "", "## 대상", sysLine, "- 화면: " + screens, "", "## 지금 단계별 컨셉", concept, "", "## 지금 값", cur, "",
      "## 규칙",
      "- 바꿀 수 있는 값: " + allowed,
      stage === "style" ? "- 글자 대비 4.5:1 이상(본문 글자/배경, 주 색 위 글자/주 색). 공공 서비스면 KRDS 원칙을 따른다\n- css는 와이어프레임 클래스에만 쓴다: " + CSS_HINT + "\n- css에 @import·외부 url()·스크립트는 쓰지 않는다. 색은 가능하면 var(--w-*) 토큰 변수\n- css는 지금 추가 CSS를 고친 ‘전체’ 내용으로 준다(유지할 규칙도 포함). CSS를 바꾸지 않으려면 css를 빼라" : "- 원칙(rules)은 화면 설계자가 따라야 할 구체적인 규칙으로 (예: ‘목록 위에 조건 검색 패널, 기본 10개씩’)",
      "- brief.rules는 한 줄짜리 원칙 3~8개, keywords는 3~6개",
      "", "## 출력 형식 (JSON만)",
      stage === "style" ? '{"brief":{"name":"…","summary":"…","keywords":["…"],"rules":["…"]},"tokens":{"color":{"primary":"#…"},"font":{"scale":{"h1":30}},"radius":{"md":8}},"css":".wf-btn.primary{…}"}\n바꾸지 않는 토큰은 빼도 됩니다.' : '{"brief":{"name":"…","summary":"…","keywords":["…"],"rules":["…"]},"layout":{"list":"table","density":"comfortable"}}\n바꾸지 않는 규칙은 빼도 됩니다.'
    ].join("\n");
    return { text: text };
  }
  function stageApply(code, stage, out, picked) {
    if (!out || typeof out !== "object") return Promise.reject(new Error("AI 결과가 JSON이 아닙니다"));
    if (stage === "comp") {
      var list = Array.isArray(out) ? out : Array.isArray(out.components) ? out.components : out.tree ? [out] : [];
      var items = [];
      list.forEach(function (o, i) {
        var tree = o && Frames.sanitize(o.tree || (o.type ? o : null), selectedDesign(P(), code).components);
        if (!tree) return;
        tree.id = "root";
        var id = String(o.id || (picked && picked[i] && picked[i].id) || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^[^a-z]+/, "");
        var vt = (Array.isArray(o.variants) ? o.variants : []).map(function (v) { var t = v && Frames.sanitize(v.tree, selectedDesign(P(), code).components); if (!t) return null; t.id = "root"; return { name: String(v.name || "변형").slice(0, 40), tree: t }; }).filter(Boolean).slice(0, 8);
        items.push({ id: id || undefined, name: String(o.name || (picked && picked[i] && picked[i].name) || id || "새 컴포넌트").slice(0, 60), category: o.category, description: o.description ? String(o.description).slice(0, 300) : undefined, tree: tree, variantTrees: vt.length ? vt : undefined });
      });
      if (!items.length) return Promise.reject(new Error("AI 결과에 components[].tree(프레임 노드)가 없습니다"));
      var chain = out.brief ? cmd({ op: "design.stage", systemCode: code, stage: "comp", brief: out.brief }).catch(function () {}) : Promise.resolve();
      return chain.then(function () { return cmd({ op: "design.frame.import", systemCode: code, items: items, draft: "ai" }); });
    }
    var c = { op: "design.stage", systemCode: code, stage: stage, note: "AI 단계 컨셉" };
    if (out.brief) c.brief = out.brief;
    if (stage === "style") { if (out.tokens) c.tokens = out.tokens; if (typeof out.css === "string") c.css = out.css; }
    else if (out.layout) c.layout = out.layout;
    if (!c.brief && !c.tokens && !c.layout && c.css == null) return Promise.reject(new Error("AI 결과에 brief·" + (stage === "style" ? "tokens·css" : "layout") + "가 없습니다"));
    return cmd(c);
  }
  ACTIONS_LATE["ds-stai"] = function (arg) {
    var a = arg.split("|"), code = a[0], stage = a[1], p = P();
    var ai = !!(AI.sample && p.ai);
    var pre = stage === "comp" ? pickedElements(p, selectedDesign(p, code)).slice(0, 12) : null;
    openForm({
      eyebrow: code + " 디자인 시스템 · " + STAGE_NAME[stage], title: "✦ AI로 " + (stage === "comp" ? "컴포넌트 초안 만들기" : STAGE_NAME[stage] + " 단계 만들기"), submit: ai ? "AI로 만들어 적용" : "붙여 넣은 결과 적용",
      intro: esc(stage === "comp" ? "고른 요소 " + (pre.length ? pre.length + "개(" + pre.map(function (x) { return x.name; }).join(", ") + ")" : "없음 — 표에서 먼저 고르세요") + "를 단계별 컨셉에 맞춰 새로 그립니다. 결과는 ‘AI 초안’으로 들어가고 프레임 편집기에서 다듬습니다." : (stage === "style" ? "컨셉 글 · 디자인 토큰 · 추가 CSS를 한 번에 만듭니다. UI·UX 구성은 바꾸지 않습니다." : "컨셉 글(사용 원칙) · 구성 규칙을 만듭니다. 톤(색·글꼴)과 CSS는 바꾸지 않습니다.")),
      fields: [
        { name: "ins", label: "요청 (비우면 시스템 성격에 맞게)", type: "textarea", rows: 3, value: "", placeholder: { style: "예: 따뜻하고 친근한 톤, 버튼은 알약형, 표 머리글을 강조", ux: "예: 정보 밀도는 촘촘하게, 목록은 카드형, 등록은 단계 표시", comp: "예: 카드형 위주로, 아이콘을 왼쪽에, 상태는 알약 뱃지" }[stage] },
        { type: "html", html: '<details class="gen-claude"' + (ai ? "" : " open") + '><summary><span class="cl-logo">✳</span> Claude 구독(claude.ai)으로 만들기</summary><ol class="cl-steps"><li><button type="button" class="btn-sm" data-stai-copy="' + esc(code + "|" + stage) + '">① 프롬프트 복사 · claude.ai 열기</button></li><li>② Claude 답을 아래에 붙여 넣고 ‘' + (ai ? "AI로 만들어 적용" : "붙여 넣은 결과 적용") + "’ (붙여 넣은 답이 있으면 그것을 씁니다)</li></ol></details>" },
        { name: "paste", label: "Claude 답 붙여 넣기 (선택)", type: "textarea", rows: 3, value: "", placeholder: "Claude가 준 JSON(코드 블록 포함) 그대로" }
      ],
      onSubmit: function (f) {
        var r = stagePrompt(code, stage, f.ins);
        if (r.err) return Promise.reject(new Error(r.err));
        if (f.paste && f.paste.trim()) { var out; try { out = looseJson(f.paste); } catch (e) { return Promise.reject(new Error("붙여 넣은 답에서 JSON을 찾지 못했습니다: " + e.message)); } return stageApply(code, stage, out, r.picked); }
        if (!ai) return Promise.reject(new Error("AI 연결이 없습니다 — ‘Claude 구독으로 만들기’로 프롬프트를 복사해 claude.ai 답을 붙여 넣거나, AI 설정에서 연결을 등록하세요"));
        var ctl = new AbortController(); layer.ctl = ctl;
        return AI.sample.json(r.text, { signal: ctl.signal, cache: false }).then(function (out) { return stageApply(code, stage, out, r.picked); });
      }
    });
  };

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
      return "<tr" + (r.status === "EXCLUDED" ? ' class="muted"' : "") + '><td class="req-cell"><span class="id">' + esc(r.requirementId) + "</span><br>" + esc(r.title) + "<br>" + specBtn(p, r.requirementId) + "</td>" + cells + "<td>" + pill(r.status) + "</td></tr>";
    }).join("");
    return "<table><thead>" + head + "</thead><tbody>" + rows + "</tbody></table>";
  }
  function rtmReq() {
    var p = P();
    var head = "<tr><th>요구사항</th><th>Task</th><th>시스템</th><th>처리 내용</th><th>기획안·기능</th><th>화면 ID</th><th>플로우</th><th>스토리보드</th><th>프로토타입</th><th>상태</th><th>확인</th></tr>";
    function list(xs) { return xs.length ? '<div class="ids">' + xs.map(esc).join("<br>") + "</div>" : '<span class="dash">—</span>'; }
    var rows = p.rtm.rows.map(function (r) {
      var tasks = r.tasks.filter(function (t) { return sysOn(t.systemCode); });
      var reqCell = '<td class="req-cell" rowspan="' + Math.max(tasks.length, 1) + '"><span class="id">' + esc(r.requirementId) + "</span><br>" + esc(r.title) + "<br>" + pill(r.status) + "<br>" + specBtn(p, r.requirementId) + "</td>";
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
        (n.loginRequired ? '<span class="kind">로그인</span>' : "") + '<span class="chg ' + n.change + '">' + (CHG[n.change] || n.change) + "</span>" + (n.kind !== "MENU" && !mark ? workPill(P(), "sb:" + n.id, "설계서 ") : "") + (mark && mark.added[n.id] ? '<span class="pill IN_DESIGN">AI 추가</span>' : "") + "</div>" + tk +
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
        '<div class="col-tools"><button class="btn-sm fe-open" data-iaedit="' + esc(s.code) + '">▣ ' + (SRV && canEdit() ? "캔버스로 편집 · 전체보기" : "캔버스 · 전체보기") + "</button>" + genBtn("ia:" + s.code, ov ? "AI 적용본 v" + ov.applied + " · 조정" : "AI 생성·조정") + protoLink(p, s.code) + "</div>" + workCtl(p, "ia:" + s.code, "정보구조도") + iaTree(nodes, st) + "</div>";
    }).join("");
    var aiBar = '<div class="ai-bar"><span class="hint">AI 요청(프롬프트 복사)</span>' + aiBtn("ia:ALL", "전체") + m.systems.filter(function (s) { return s.hasScreens; }).map(function (s) { return aiBtn("ia:" + s.code, s.code + " " + s.name); }).join("") + "</div>";
    done = screens.filter(function (n) { return workOf(p, "sb:" + n.id).status === "DONE"; }).length;
    var seg = '<div class="seg" role="group" aria-label="보기"><button data-iaview="tree" aria-pressed="' + (state.iaView !== "sheet") + '">트리</button><button data-iaview="sheet" aria-pressed="' + (state.iaView === "sheet") + '">표(엑셀)</button></div>';
    if (state.iaView === "sheet") return '<section class="section"><div class="toolbar">' + seg + sysFilters() + "</div>" + renderIaSheet(p) + "</section>";
    return '<section class="section">' + aiBar + '<div class="toolbar">' + seg + '<p class="hint" style="margin:0">화면 ' + screens.length + "개 중 화면설계서 완료 " + done + "개. 화면 옆 상태는 그 화면 화면설계서의 작업 상태(미진행·진행중·완료·재검토 필요)입니다. Task ID를 누르면 Task 상세로 갑니다.</p>" + sysFilters() + "</div>" +
      (m.project.stages.S2 === "SKIPPED" ? '<p class="hint">기존 메뉴 수정(MODIFY) 프로젝트라 정보구조도 단계는 패스했습니다. 영향받는 기존 화면만 표시합니다.</p>' : "") +
      '<div class="ia-cols">' + cols + "</div></section>";
  }

  // ── 정보구조도 표(엑셀) · 채널 · 테스트 ─────────────
  var TRACK = { NOT_STARTED: "미진행", IN_PROGRESS: "진행중", DONE: "완료", NA: "해당없음" };
  var QA_ST = { PASS: "통과", FAIL: "실패", BLOCKED: "보류", NA: "해당없음" };
  var QA_TYPES = ["기능", "UI", "예외", "권한", "연계"];
  var BOARD_TYPES = ["목록형", "갤러리형", "웹진형", "FAQ형", "Q&A형", "달력형"];
  var DEV_NEEDED = ["신규", "기능개선", "유지", "해당없음"];
  function channels(p) { return (p.model.ia.channels && p.model.ia.channels.length) ? p.model.ia.channels : [{ id: "WEB", label: "웹(PC)" }, { id: "MOBILE", label: "모바일" }, { id: "TABLET", label: "태블릿" }]; }
  /** 정보구조도 순서(깊이 우선)로 한 시스템의 노드와 깊이·경로 */
  function iaRows(p, code) {
    var nodes = p.model.ia.nodes.filter(function (n) { return n.systemCode === code; }), ids = {}, out = [];
    nodes.forEach(function (n) { ids[n.id] = true; });
    (function walk(pid, d, path) {
      nodes.filter(function (n) { return (n.parentId && ids[n.parentId] ? n.parentId : null) === pid; }).forEach(function (n) {
        var pp = path.concat([n.name]);
        out.push({ n: n, d: d, path: pp });
        walk(n.id, d + 1, pp);
      });
    })(null, 0, []);
    return out;
  }
  function testsOf(p, sid) { return (p.model.ia.tests || []).filter(function (t) { return t.screenId === sid; }); }
  /** 시스템에서 테스트할 채널 (설정 없으면 전부, 빈 배열이면 기기 구분 없음) */
  function sysChans(p, code) {
    var set = (p.model.ia.systemChannels || {})[code];
    return channels(p).filter(function (c) { return !set || set.indexOf(c.id) >= 0; });
  }
  /** 테스트 결과 칸 — 기기 구분이 없으면 ‘결과’ 한 칸(ALL) */
  function testChs(p, code) { var l = sysChans(p, code); return l.length ? l : [{ id: "ALL", label: "결과", all: true }]; }
  function caseDevs(p, t) {
    var n = p.model.ia.nodes.find(function (x) { return x.id === t.screenId; });
    var allowed = sysChans(p, n ? n.systemCode : "").map(function (c) { return c.id; });
    if (!allowed.length) return ["ALL"];
    var pick = t.devices && t.devices.length ? t.devices : n && n.devices && n.devices.length ? n.devices : allowed;
    var out = pick.filter(function (d) { return allowed.indexOf(d) >= 0; });
    return out.length ? out : allowed;
  }
  /** 채널 하나의 테스트 집계 (cases: 케이스 목록) */
  function qaStat(p, cases, dev) {
    var s = { total: 0, pass: 0, fail: 0, blocked: 0, na: 0 };
    cases.forEach(function (t) {
      if (caseDevs(p, t).indexOf(dev) < 0) return;
      s.total++;
      var r = t.results && t.results[dev];
      if (r) s[r.status === "PASS" ? "pass" : r.status === "FAIL" ? "fail" : r.status === "BLOCKED" ? "blocked" : "na"]++;
    });
    s.done = s.pass + s.fail + s.blocked + s.na;
    return s;
  }
  function qaMini(s) {
    if (!s.total) return '<span class="qa-mini none">—</span>';
    var cls = s.fail ? "fail" : s.done === s.total ? "ok" : s.done ? "run" : "todo";
    return '<span class="qa-mini ' + cls + '" title="통과 ' + s.pass + " · 실패 " + s.fail + " · 보류 " + s.blocked + " · 해당없음 " + s.na + " · 미실행 " + (s.total - s.done) + '">' + s.pass + "/" + s.total + (s.fail ? " ✕" + s.fail : "") + "</span>";
  }
  function maxDepth(rows) { return rows.reduce(function (m, r) { return Math.max(m, r.d + 1); }, 3); }

  /** 채널·테스트 칸을 표 오른쪽에 고정 — 칸마다 오른쪽 끝에서의 거리 */
  var CH_W = 62, CHT_W = 78;
  function chPin(ch, i, test) {
    var right = 0;
    for (var j = i; j < ch.length; j++) right += (j > i || !test ? CHT_W : 0) + (j > i ? CH_W : 0);
    if (!test) right += 0;
    return ' style="right:' + right + "px;min-width:" + (test ? CHT_W : CH_W) + "px;max-width:" + (test ? CHT_W : CH_W) + 'px"';
  }
  function renderIaSheet(p) {
    var ed = SRV && canEdit(), ch = channels(p);
    var systems = p.model.systems.filter(function (s) { return s.hasScreens && sysOn(s.code); });
    var tools = '<div class="ia-sheet-tools">' + (ed ? '<button class="btn-sm" data-act="ia-channels">채널 관리 · ' + esc(ch.map(function (c) { return c.label; }).join(" · ")) + "</button>" : "") +
      (ed ? actBtn("qa-sysdev", "시스템별 테스트 기기") : "") + '<button class="btn-sm" data-iaxlsx="1">⬇ 엑셀(.xlsx) 내려받기</button><span class="hint">칸을 바로 고치면 저장됩니다. 기획은 화면설계서 작업 상태로 채워지고, 오른쪽 채널 칸에서 지원 여부와 채널별 테스트 결과(통과/전체)를 봅니다.</span></div>';
    var body = systems.map(function (s) {
      var rows = iaRows(p, s.code), D = maxDepth(rows), ch = testChs(p, s.code);
      var head1 = '<tr><th colspan="' + (D + 6) + '" class="g">메뉴 구성</th><th colspan="5" class="g">진행 현황</th><th colspan="2" class="g">비고</th><th colspan="' + (ch.length * 2) + '" class="g ch pin" style="right:0;min-width:' + ch.length * (CH_W + CHT_W) + 'px">채널 · 테스트 (지원 여부 · 통과/전체)</th></tr>';
      var head2 = "<tr>" + Array.apply(null, Array(D)).map(function (_, i) { return "<th>" + (i + 1) + "Depth</th>"; }).join("") +
        "<th>화면기능</th><th>구분</th><th>메뉴/화면 ID</th><th>게시판 유형</th><th>로그인</th><th>페이지<br>본수</th><th>기획</th><th>디자인</th><th>퍼블리싱</th><th>개발</th><th>개발 필요</th><th>비고</th><th>의사결정 사항</th>" +
        ch.map(function (c, i) { return '<th class="ch pin"' + chPin(ch, i, false) + ">" + esc(c.label) + '</th><th class="ch t pin"' + chPin(ch, i, true) + ">테스트</th>"; }).join("") + "</tr>";
      var trs = rows.map(function (r) {
        var n = r.n, menu = n.kind === "MENU", key = function (f) { return ' data-cell="' + esc(n.id + "|" + f) + '"'; };
        var inp = function (f, v, ph, list) { return ed ? '<input class="cell"' + key(f) + ' value="' + esc(v == null ? "" : v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + (list ? ' list="' + list + '"' : "") + ">" : esc(v == null ? "" : v); };
        var sel = function (f, v, opts) { return ed ? '<select class="cell"' + key(f) + ">" + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v || "") ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" : esc((opts.find(function (o) { return String(o[0]) === String(v || ""); }) || ["", ""])[1]); };
        var tr = function (k) { var v = n.track && n.track[k]; return menu ? "" : sel("track." + k, v || "NOT_STARTED", [["NOT_STARTED", "미진행"], ["IN_PROGRESS", "진행중"], ["DONE", "완료"], ["NA", "해당없음"]]); };
        var depth = Array.apply(null, Array(D)).map(function (_, i) {
          if (i < r.d) return '<td class="anc">' + esc(r.path[i]) + "</td>";
          if (i > r.d) return "<td></td>";
          return '<td class="nm' + (menu ? " menu" : "") + '">' + inp("name", n.name) + "</td>";
        }).join("");
        var plan = menu ? "" : (function () { var w = workOf(p, "sb:" + n.id).status; return '<span class="pill ' + (WORK_CLS[w] || "") + '">' + esc(WORK_LABEL[w] || w) + "</span>"; })();
        var cases = menu ? [] : testsOf(p, n.id);
        var chCells = ch.map(function (c, ci) {
          if (menu) return '<td class="ch pin"' + chPin(ch, ci, false) + '></td><td class="ch t pin"' + chPin(ch, ci, true) + "></td>";
          var on = (n.devices || []).indexOf(c.id) >= 0;
          if (c.all) return '<td class="ch pin"' + chPin(ch, ci, false) + ' title="기기 구분 없이 테스트하는 시스템">—</td><td class="ch t pin"' + chPin(ch, ci, true) + '><button class="lnk" data-qago="' + esc(n.id) + '">' + qaMini(qaStat(p, cases, c.id)) + "</button></td>";
          return '<td class="ch pin"' + chPin(ch, ci, false) + ">" + (ed ? '<input type="checkbox"' + key("dev:" + c.id) + (on ? " checked" : "") + ' aria-label="' + esc(n.name + " " + c.label + " 지원") + '">' : on ? "✓" : "") + '</td><td class="ch t pin"' + chPin(ch, ci, true) + '><button class="lnk" data-qago="' + esc(n.id) + '">' + qaMini(qaStat(p, cases, c.id)) + "</button></td>";
        }).join("");
        return '<tr class="' + (menu ? "menu" : "scr") + '">' + depth +
          "<td>" + (menu ? "" : inp("func", n.func)) + '</td><td class="k">' + esc(KIND[n.kind] || n.kind) + '</td><td class="mono">' + (menu ? "-" : esc(n.id)) + "</td>" +
          "<td>" + (menu ? "" : inp("boardType", n.boardType, "", "dl-board")) + '</td><td class="c">' + (menu ? "" : ed ? '<input type="checkbox"' + key("loginRequired") + (n.loginRequired ? " checked" : "") + ">" : n.loginRequired ? "Y" : "") + '</td><td class="c">' + (menu ? "" : ed ? '<input class="cell num" type="number" min="0"' + key("pages") + ' value="' + esc(n.pages == null ? "" : n.pages) + '">' : esc(n.pages == null ? "" : n.pages)) + "</td>" +
          '<td class="c">' + plan + '</td><td class="c">' + tr("design") + '</td><td class="c">' + tr("publish") + '</td><td class="c">' + tr("dev") + "</td><td>" + (menu ? "" : inp("devNeeded", n.devNeeded, "", "dl-devneed")) + "</td>" +
          "<td>" + inp("note", n.note) + "</td><td>" + inp("decision", n.decision) + "</td>" + chCells + "</tr>";
      }).join("") || '<tr><td colspan="' + (D + 13 + ch.length * 2) + '" class="empty">등록된 메뉴·화면이 없습니다.</td></tr>';
      var scr = rows.filter(function (r) { return r.n.kind !== "MENU"; });
      var sum = ch[0].all ? "테스트 기기 구분 없음" : "채널 지원 " + ch.map(function (c) { var k = scr.filter(function (r) { return (r.n.devices || []).indexOf(c.id) >= 0; }).length; return esc(c.label) + " " + k; }).join(" · ");
      return '<section class="section"><h2><i class="sq" style="background:' + s.color + '"></i>' + esc(s.code + " " + s.name) + " <small>화면 " + scr.length + " · " + sum + '</small></h2><div class="ia-sheet-wrap" data-sheetsys="' + esc(s.code) + '"><table class="ia-sheet">' + "<thead>" + head1 + head2 + "</thead><tbody>" + trs + "</tbody></table></div></section>";
    }).join("");
    return tools + '<datalist id="dl-board">' + BOARD_TYPES.map(function (x) { return '<option value="' + x + '">'; }).join("") + '</datalist><datalist id="dl-devneed">' + DEV_NEEDED.map(function (x) { return '<option value="' + x + '">'; }).join("") + "</datalist>" + (body || '<div class="box empty">화면이 있는 시스템이 없습니다.</div>');
  }

  // 표 칸 저장 — 순서대로 보내고, 다시 그린 뒤 스크롤·포커스를 되돌린다
  var cellQ = Promise.resolve();
  function quietCmd(c) {
    var code = P().model.project.code;
    cellQ = cellQ.then(function () {
      return api("POST", "/api/projects/" + enc(code) + "/commands", { cmd: c }).then(function (r) {
        var keep = {}, wy = window.scrollY;
        document.querySelectorAll("[data-sheetsys],[data-qawrap]").forEach(function (w) { keep[w.getAttribute("data-sheetsys") || w.getAttribute("data-qawrap")] = [w.scrollLeft, w.scrollTop]; });
        setProject(r.project);
        rebuild();
        render();
        document.querySelectorAll("[data-sheetsys],[data-qawrap]").forEach(function (w) { var k = keep[w.getAttribute("data-sheetsys") || w.getAttribute("data-qawrap")]; if (k) { w.scrollLeft = k[0]; w.scrollTop = k[1]; } });
        window.scrollTo(window.scrollX, wy);
        if (state.cellFocus) { var el = document.querySelector('[data-cell="' + (window.CSS && CSS.escape ? CSS.escape(state.cellFocus) : state.cellFocus) + '"]'); if (el && document.activeElement === document.body) el.focus(); }
        return r;
      }, function (e) { toast(e.message, "err"); render(); });
    });
    return cellQ;
  }
  function cellSave(el) {
    var k = el.getAttribute("data-cell"), i = k.indexOf("|"), id = k.slice(0, i), f = k.slice(i + 1);
    if (f.indexOf("dev:") === 0) {
      var devs = Array.prototype.filter.call(document.querySelectorAll("[data-cell]"), function (x) { var a = x.getAttribute("data-cell"); return a.indexOf(id + "|dev:") === 0 && x.checked; }).map(function (x) { return x.getAttribute("data-cell").slice(id.length + 5); });
      return quietCmd({ op: "ia.cell", id: id, field: "devices", value: devs });
    }
    var v = el.type === "checkbox" ? el.checked : el.value;
    return quietCmd({ op: "ia.cell", id: id, field: f, value: v });
  }
  ACTIONS_LATE["ia-channels"] = function () {
    var p = P();
    openForm({
      eyebrow: "정보구조도", title: "채널 관리", submit: "저장",
      intro: "한 줄에 채널 하나씩 <code>ID | 이름</code>으로 적습니다. ID는 영문 대문자로 시작(예: WEB, MOBILE, TABLET, APP_IOS). 지운 채널은 화면·테스트 케이스의 채널 지정에서도 빠집니다(테스트 결과 기록은 남습니다).",
      fields: [{ name: "lines", label: "채널", type: "textarea", rows: 6, value: channels(p).map(function (c) { return c.id + " | " + c.label; }).join("\n"), required: true }],
      onSubmit: function (v) {
        var list = v.lines.split("\n").map(function (l) { return l.trim(); }).filter(Boolean).map(function (l, i) {
          var a = l.split("|"), id = a.length > 1 ? a[0].trim().toUpperCase() : "", label = (a.length > 1 ? a.slice(1).join("|") : a[0]).trim();
          if (!id) id = { "웹": "WEB", "모바일": "MOBILE", "태블릿": "TABLET", "앱": "APP" }[label] || "CH" + (i + 1);
          return { id: id.replace(/[^A-Z0-9_]/g, "_"), label: label || id };
        });
        return cmd({ op: "ia.channels", channels: list });
      }
    });
  };

  // ── 테스트 (정보구조도 화면 기준) ──────────────────
  function renderQa() {
    var p = P(), ed = SRV && canEdit();
    var systems = p.model.systems.filter(function (s) { return s.hasScreens; });
    if (!systems.length) return '<div class="box empty">화면이 있는 시스템이 없습니다.</div>';
    var code = protoSys(p), ch = testChs(p, code), rows = iaRows(p, code), screens = rows.filter(function (r) { return r.n.kind !== "MENU"; });
    var all = (p.model.ia.tests || []).filter(function (t) { return screens.some(function (r) { return r.n.id === t.screenId; }); });
    var chips = '<div class="filters">' + systems.map(function (s) {
      var ids = {}; systemScreens(p, s.code).forEach(function (n) { ids[n.id] = true; });
      var k = (p.model.ia.tests || []).filter(function (t) { return ids[t.screenId]; }).length;
      return '<button class="fchip" data-dsys="' + esc(s.code) + '" aria-pressed="' + (s.code === code) + '"><i style="background:' + s.color + '"></i>' + esc(s.code + " " + s.name) + "<em>" + k + "</em></button>";
    }).join("") + "</div>";
    var sel = state.qaSel && state.qaSel[code];
    if (!screens.some(function (r) { return r.n.id === sel; })) sel = screens.length ? screens[0].n.id : null;
    var board = '<div class="qa-board">' + ch.map(function (c) {
      var s = qaStat(p, all, c.id), pct = s.total ? Math.round(s.pass / s.total * 100) : 0;
      return '<div class="box qa-card"><b>' + esc(c.label) + '</b><div class="qa-bar"><i class="p" style="width:' + (s.total ? s.pass / s.total * 100 : 0) + '%"></i><i class="f" style="width:' + (s.total ? s.fail / s.total * 100 : 0) + '%"></i><i class="b" style="width:' + (s.total ? (s.blocked + s.na) / s.total * 100 : 0) + '%"></i></div><span class="hint">통과 ' + s.pass + " · 실패 " + s.fail + " · 보류 " + s.blocked + " · 미실행 " + (s.total - s.done) + " / " + s.total + "건 (" + pct + "%)</span></div>";
    }).join("") + "</div>";
    var list = rows.map(function (r) {
      var n = r.n;
      if (n.kind === "MENU") return '<div class="qa-menu" style="padding-left:' + (8 + r.d * 14) + 'px">▸ ' + esc(n.name) + "</div>";
      var cs = testsOf(p, n.id);
      return '<button class="sb-row qa-row' + (n.id === sel ? " on" : "") + '" data-qasel="' + esc(n.id) + '" style="padding-left:' + (10 + r.d * 14) + 'px"><span class="mono">' + esc(n.id) + "</span><b>" + esc(n.name) + '</b><span class="qa-devs">' + ch.map(function (c) {
        var sup = c.all || (n.devices || []).indexOf(c.id) >= 0;
        return '<span class="qa-dev' + (sup ? "" : " off") + '" title="' + esc(c.label) + (sup ? " 지원" : " 미지정") + '">' + esc(c.label.replace(/\(.*?\)/g, "").slice(0, 3)) + " " + qaMini(qaStat(p, cs, c.id)) + "</span>";
      }).join("") + "</span></button>";
    }).join("");
    var tools = '<div class="toolbar">' + chips + '<span class="sp"></span><button class="btn-sm" data-qaxlsx="' + esc(code) + '">⬇ 테스트 시트(.xlsx)</button>' + (ed ? actBtn("qa-sysdev", "테스트 기기 설정 · " + (ch[0].all ? "구분 없음" : esc(ch.map(function (c) { return c.label; }).join("·")))) + '<button class="btn-sm" data-page="ia" data-iaview="sheet">화면별 채널 지정 (정보구조도 표)</button>' : "") + "</div>";
    return '<section class="section">' + tools + board +
      '<div class="sb-page qa-page"><nav class="sb-list" aria-label="' + esc(code) + ' 정보구조도">' + (list || '<div class="empty">정보구조도에 화면이 없습니다.</div>') + "</nav>" +
      '<div class="sb-main">' + (sel ? qaSheet(p, sel) : '<div class="box empty">화면을 고르세요.</div>') + "</div></div></section>";
  }
  function qaSheet(p, sid) {
    var ed = SRV && canEdit(), n = p.model.ia.nodes.find(function (x) { return x.id === sid; }) || {}, ch = testChs(p, n.systemCode);
    var cs = testsOf(p, sid), sb = p.model.storyboard.screens.find(function (s) { return s.screenId === sid; }), g = p.gens["qa:" + sid];
    var devs = (n.devices || []).map(function (d) { var c = ch.find(function (x) { return x.id === d; }); return c ? c.label : d; });
    var head = '<div class="sheet-bar"><b>' + esc(n.name || sid) + '</b><span class="hint mono">' + esc(sid) + '</span><span class="hint">' + (ch[0].all ? "기기 구분 없이 테스트" : "지원 채널: " + (devs.length ? esc(devs.join(" · ")) : "미지정 (시스템 테스트 기기 전부)")) + '</span><span class="sp"></span>' +
      (ed ? actBtn("qa-add", "+ 케이스 추가", sid) + '<button class="btn-sm" data-qadraft="' + esc(sid) + '" title="화면설계서의 필수 입력·길이·형식·메시지·선택지·이동과 연결 Task로 케이스를 만듭니다">화면설계서로 초안</button>' + (g ? '<button class="btn-sm ai" data-qaai="' + esc(sid) + '">✦ AI로 케이스 만들기</button>' : "") : "") + "</div>";
    if (!cs.length) return '<article class="box sheet">' + head + '<div class="empty">아직 테스트 케이스가 없습니다.' + (ed ? (sb ? " ‘화면설계서로 초안’을 누르면 화면설계서 설명 번호와 Task로 케이스를 만듭니다." : " 화면설계서가 아직 없어 초안은 화면 진입·Task 위주로 만들어집니다.") : "") + "</div></article>";
    var rows = cs.map(function (t, i) {
      var ds = caseDevs(p, t);
      var res = ch.map(function (c, ci) {
        var pin = ' style="right:' + (ch.length - 1 - ci) * 104 + 'px"';
        if (ds.indexOf(c.id) < 0) return '<td class="qa-r na"' + pin + ' title="이 케이스의 테스트 채널이 아닙니다">·</td>';
        var r = t.results && t.results[c.id], v = r ? r.status : "";
        var cell = ed ? '<select class="qa-sel ' + (v || "none") + '" data-qares="' + esc(t.id + "|" + c.id) + '" aria-label="' + esc(t.title + " " + c.label + " 결과") + '"><option value="">미실행</option>' + Object.keys(QA_ST).map(function (k) { return '<option value="' + k + '"' + (k === v ? " selected" : "") + ">" + QA_ST[k] + "</option>"; }).join("") + "</select>" : '<span class="qa-st ' + (v || "none") + '">' + (v ? QA_ST[v] : "미실행") + "</span>";
        return '<td class="qa-r"' + pin + ">" + cell + (r ? '<span class="hint" title="' + esc((r.note || "") + " " + fmtDate(r.at)) + '">' + esc(r.by || "") + "</span>" : "") + "</td>";
      }).join("");
      return "<tr><td class=\"mono\">" + esc(t.id.replace("TC-" + sid + "-", "")) + '</td><td class="ty"><span class="tag">' + esc(t.type) + "</span>" + (t.source !== "MANUAL" ? '<br><span class="hint">' + (t.source === "AI" ? "AI" : "초안") + "</span>" : "") + "</td><td><b>" + esc(t.title) + "</b>" + (t.componentNo ? ' <span class="no sm">' + t.componentNo + "</span>" : "") + (t.taskIds.length ? '<br><span class="hint mono">' + esc(t.taskIds.join(", ")) + "</span>" : "") +
        (ed ? '<div class="row-tools">' + actBtn("qa-edit", "편집", t.id) + actBtn("qa-rm", "삭제", t.id) + "</div>" : "") + "</td><td class=\"pre pc\">" + esc(t.pre) + '</td><td class="pre st">' + esc(t.steps) + '</td><td class="pre ex">' + esc(t.expected) + "</td>" + res + "</tr>";
    }).join("");
    return '<article class="box sheet">' + head + '<div class="qa-wrap" data-qawrap="' + esc(sid) + '"><table class="qa-table"><thead><tr><th>No</th><th>유형</th><th>테스트 항목</th><th>사전 조건</th><th>절차</th><th>기대 결과</th>' + ch.map(function (c, ci) { return '<th class="qa-r" style="right:' + (ch.length - 1 - ci) * 104 + 'px">' + esc(c.label) + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody></table></div></article>";
  }
  function qaForm(sid, t) {
    var p = P(), n = p.model.ia.nodes.find(function (x) { return x.id === sid; }) || {}, ch = sysChans(p, n.systemCode);
    var sb = p.model.storyboard.screens.find(function (s) { return s.screenId === sid; });
    openForm({
      eyebrow: sid + " · " + (n.name || ""), title: t ? "테스트 케이스 편집" : "테스트 케이스 추가", submit: "저장",
      fields: [
        { name: "title", label: "테스트 항목", required: true, value: t ? t.title : "", placeholder: "예: 필수 항목 미입력 시 안내" },
        { name: "type", label: "유형", type: "select", options: QA_TYPES.map(function (x) { return [x, x]; }), value: t ? t.type : "기능" },
        { name: "pre", label: "사전 조건", value: t ? t.pre : "", placeholder: n.loginRequired ? "로그인한 상태" : "" },
        { name: "steps", label: "절차", type: "textarea", rows: 4, value: t ? t.steps : "", placeholder: "1. …\n2. …" },
        { name: "expected", label: "기대 결과", type: "textarea", rows: 3, value: t ? t.expected : "" },
        { name: "componentNo", label: "화면설계서 설명 번호", type: "select", options: [["", "(없음)"]].concat((sb ? sb.components : []).map(function (c) { return [String(c.no), c.no + ". " + c.label]; })), value: t && t.componentNo ? String(t.componentNo) : "" },
        { name: "taskIds", label: "Task (쉼표로 구분)", value: t ? t.taskIds.join(", ") : (n.taskIds || []).join(", ") },
        ch.length ? { type: "html", html: '<div class="fm-row"><label>테스트 채널 <span class="hint">아무것도 고르지 않으면 화면의 지원 채널 전부</span></label><div class="chk-row">' + ch.map(function (c) { return '<label class="fm-check"><input type="checkbox" data-qadev="' + esc(c.id) + '"' + (t && t.devices.indexOf(c.id) >= 0 ? " checked" : "") + "> " + esc(c.label) + "</label>"; }).join("") + "</div></div>" } : { type: "html", html: '<p class="hint">이 시스템은 기기 구분 없이 테스트합니다 (결과 한 칸).</p>' }
      ],
      onSubmit: function (v) {
        return cmd({ op: "qa.case", case: { id: t ? t.id : undefined, screenId: sid, title: v.title, type: v.type, pre: v.pre, steps: v.steps, expected: v.expected, componentNo: v.componentNo ? Number(v.componentNo) : undefined, taskIds: v.taskIds.split(",").map(function (x) { return x.trim(); }).filter(Boolean), devices: picked("qadev") } });
      }
    });
  }
  ACTIONS_LATE["qa-add"] = function (sid) { qaForm(sid, null); };
  // 시스템별 테스트 기기 — 대국민은 웹·모바일·태블릿, 관리자는 웹만, 또는 기기 구분 없이
  ACTIONS_LATE["qa-sysdev"] = function () {
    var p = P(), ch = channels(p), sm = p.model.ia.systemChannels || {};
    var systems = p.model.systems.filter(function (s) { return s.hasScreens; });
    var html = '<div class="sysdev">' + systems.map(function (s) {
      var set = sm[s.code], none = !!set && !set.length;
      return '<div class="sysdev-row" data-sysdev="' + esc(s.code) + '"><b>' + sysChip(s.code) + " " + esc(s.name) + '</b><div class="chk-row">' + ch.map(function (c) {
        return '<label class="fm-check"><input type="checkbox" data-sdch="' + esc(c.id) + '"' + (!set || set.indexOf(c.id) >= 0 ? " checked" : "") + (none ? " disabled" : "") + "> " + esc(c.label) + "</label>";
      }).join("") + '<label class="fm-check sd-none"><input type="checkbox" data-sdnone' + (none ? " checked" : "") + "> 기기 구분 없이 테스트</label></div></div>";
    }).join("") + "</div>";
    openForm({
      eyebrow: "테스트", title: "시스템별 테스트 기기", submit: "저장",
      intro: "시스템마다 테스트할 기기(채널)를 고릅니다. 고른 기기마다 결과 칸이 생기고, ‘기기 구분 없이’를 고르면 결과를 한 칸으로 기록합니다. 채널 목록 자체는 정보구조도 표의 ‘채널 관리’에서 바꿉니다.",
      fields: [{ type: "html", html: html }],
      onSubmit: function () {
        var jobs = [];
        document.querySelectorAll("[data-sysdev]").forEach(function (row) {
          var code = row.getAttribute("data-sysdev"), none = row.querySelector("[data-sdnone]").checked;
          var list = Array.prototype.filter.call(row.querySelectorAll("[data-sdch]"), function (x) { return x.checked; }).map(function (x) { return x.getAttribute("data-sdch"); });
          var want = none || !list.length ? [] : list.length === ch.length ? null : list;
          var cur = sm[code] === undefined ? null : sm[code];
          if (JSON.stringify(cur) !== JSON.stringify(want)) jobs.push({ op: "ia.sysChannels", systemCode: code, channels: want });
        });
        return jobs.reduce(function (pr, c) { return pr.then(function () { return cmd(c); }); }, Promise.resolve());
      }
    });
    document.querySelectorAll("[data-sdnone]").forEach(function (x) { x.addEventListener("change", function () { x.closest("[data-sysdev]").querySelectorAll("[data-sdch]").forEach(function (y) { y.disabled = x.checked; }); }); });
  };
  ACTIONS_LATE["qa-edit"] = function (id) { var t = (P().model.ia.tests || []).find(function (x) { return x.id === id; }); if (t) qaForm(t.screenId, t); };
  ACTIONS_LATE["qa-rm"] = function (id) { if (window.confirm(id + " 테스트 케이스를 지울까요? 결과 기록도 함께 지워집니다.")) cmd({ op: "qa.rm", id: id }).catch(function (e) { toast(e.message, "err"); }); };
  function qaAi(sid, btn) {
    var p = P(), g = p.gens["qa:" + sid];
    if (!g) return;
    if (!AI.sample || !p.ai) { toast("AI 설정이 없습니다. AI 설정에서 연결을 등록하세요", "err"); return; }
    if (btn) { btn.disabled = true; btn.textContent = "AI가 만드는 중…"; }
    AI.sample.json(g.prompt, { cache: false }).then(function (out) {
      return cmd({ op: "qa.ai", screenId: sid, output: out });
    }).catch(function (e) { toast("AI 케이스를 만들지 못했습니다: " + (e && e.message || e), "err"); render(); });
  }

  // ── 엑셀(.xlsx) — 셀 서식(머리글·테두리·줄바꿈)과 열 너비를 넣은 최소 구성 ──
  function xmlEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); }
  function colName(i) { var s = ""; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  /** sheets: [{name, title, head:[[…]], rows:[[…]], widths:[…], merges:["A1:C1"]}] */
  function xlsx(sheets) {
    var files = [], wbSheets = "", rels = "", ct = "";
    sheets.forEach(function (sh, si) {
      var r = 1, xml = "", all = [];
      if (sh.title) all.push({ cells: [sh.title], s: 3 });
      (sh.head || []).forEach(function (h) { all.push({ cells: h, s: 1 }); });
      sh.rows.forEach(function (row) { all.push({ cells: row, s: 2 }); });
      all.forEach(function (row) {
        xml += '<row r="' + r + '">' + row.cells.map(function (v, ci) {
          var ref = colName(ci) + r, st = row.s === 2 && row.cells._menu ? 4 : row.s;
          if (v == null || v === "") return '<c r="' + ref + '" s="' + st + '"/>';
          if (typeof v === "number") return '<c r="' + ref + '" s="' + st + '"><v>' + v + "</v></c>";
          return '<c r="' + ref + '" s="' + st + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(v) + "</t></is></c>";
        }).join("") + "</row>";
        r++;
      });
      var hr = (sh.title ? 1 : 0) + (sh.head || []).length;
      var cols = (sh.widths || []).map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("");
      var merges = sh.merges && sh.merges.length ? '<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join("") + "</mergeCells>" : "";
      var last = colName(Math.max(1, (sh.widths || [1]).length) - 1);
      files.push({ name: "xl/worksheets/sheet" + (si + 1) + ".xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="' + hr + '" topLeftCell="A' + (hr + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' + (cols ? "<cols>" + cols + "</cols>" : "") + "<sheetData>" + xml + "</sheetData>" + (sh.head && sh.head.length && r > hr + 1 ? '<autoFilter ref="A' + hr + ":" + last + (r - 1) + '"/>' : "") + merges + "</worksheet>" });
      var nm = String(sh.name).replace(/[\[\]:*?\/\\]/g, "_").slice(0, 31) || "Sheet" + (si + 1);
      wbSheets += '<sheet name="' + xmlEsc(nm) + '" sheetId="' + (si + 1) + '" r:id="rId' + (si + 1) + '"/>';
      rels += '<Relationship Id="rId' + (si + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (si + 1) + '.xml"/>';
      ct += '<Override PartName="/xl/worksheets/sheet' + (si + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    });
    var n = sheets.length;
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="3"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="14"/><name val="맑은 고딕"/></font></fonts>' +
      '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    files.unshift(
      { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + ct + "</Types>" },
      { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + wbSheets + "</sheets></workbook>" },
      { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: "xl/styles.xml", data: styles }
    );
    return FlowExport.zip(files);
  }
  function saveXlsx(bytes, name) { FlowExport.download(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name.replace(/[\\/:*?"<>|\s]+/g, "_") + ".xlsx"); }
  function iaXlsxBytes() {
    var p = P(), pr = p.model.project;
    var sheets = p.model.systems.filter(function (s) { return s.hasScreens; }).map(function (s) {
      var rows = iaRows(p, s.code), D = maxDepth(rows), ch = testChs(p, s.code);
      var h2 = [].concat(Array.apply(null, Array(D)).map(function (_, i) { return (i + 1) + "Depth"; }), ["화면기능", "구분", "메뉴/화면 ID", "게시판 유형", "로그인 시 이용", "페이지 본수", "기획 완료 여부", "디자인 완료 여부", "퍼블 완료 여부", "개발 완료 여부", "기능개선/신규 필요여부", "연결 Task", "비고", "의사결정 사항"], ch.map(function (c) { return c.label; }), ch.map(function (c) { return c.label + " 테스트"; }));
      var fixed = D + 14;
      var h1 = h2.map(function (_, i) { return i < D + 6 ? "메뉴 구성" : i < D + 11 ? "진행 현황" : i < fixed ? "비고" : i < fixed + ch.length ? "지원 채널" : "테스트 (통과/전체)"; });
      var body = rows.map(function (r) {
        var n = r.n, menu = n.kind === "MENU", cs = menu ? [] : testsOf(p, n.id);
        var tk = function (k) { return menu ? "" : TRACK[(n.track && n.track[k]) || "NOT_STARTED"]; };
        var row = [].concat(Array.apply(null, Array(D)).map(function (_, i) { return i === r.d ? n.name : ""; }),
          [n.func || "", KIND[n.kind] || n.kind, menu ? "-" : n.id, n.boardType || "", menu ? "" : n.loginRequired ? "Y" : "N", n.pages == null ? "" : n.pages, menu ? "" : WORK_LABEL[workOf(p, "sb:" + n.id).status], tk("design"), tk("publish"), tk("dev"), n.devNeeded || "", (n.taskIds || []).join(", "), n.note || "", n.decision || ""],
          ch.map(function (c) { return menu || c.all ? "" : (n.devices || []).indexOf(c.id) >= 0 ? "O" : ""; }),
          ch.map(function (c) { if (menu) return ""; var st = qaStat(p, cs, c.id); return st.total ? st.pass + "/" + st.total + (st.fail ? " (실패 " + st.fail + ")" : "") : ""; }));
        row._menu = menu;
        return row;
      });
      var merges = [], i0 = 0;
      h1.forEach(function (v, i) { if (i === h1.length - 1 || h1[i + 1] !== v) { if (i > i0) merges.push(colName(i0) + "2:" + colName(i) + "2"); i0 = i + 1; } });
      merges.push("A1:" + colName(Math.min(h2.length - 1, 9)) + "1");
      return { name: s.name + "(" + s.code + ")", title: pr.name + " - 메뉴구성도 / " + s.name, head: [h1, h2], rows: body, merges: merges,
        widths: [].concat(Array.apply(null, Array(D)).map(function () { return 16; }), [30, 8, 22, 12, 9, 8, 10, 10, 10, 10, 12, 20, 24, 24], ch.map(function () { return 8; }), ch.map(function () { return 12; })) };
    });
    return { bytes: xlsx(sheets), name: pr.code + "_정보구조도_" + new Date().toISOString().slice(0, 10) };
  }
  function iaXlsx() { var r = iaXlsxBytes(); saveXlsx(r.bytes, r.name); }
  function qaXlsx(code) { var r = qaXlsxBytes(code); saveXlsx(r.bytes, r.name); }
  function qaXlsxBytes(code) {
    var p = P(), pr = p.model.project;
    var systems = p.model.systems.filter(function (s) { return s.hasScreens && (!code || s.code === code); });
    var sheets = systems.map(function (s) {
      var rows = [], ch = testChs(p, s.code);
      iaRows(p, s.code).forEach(function (r) {
        if (r.n.kind === "MENU") return;
        testsOf(p, r.n.id).forEach(function (t) {
          var ds = caseDevs(p, t);
          rows.push([r.n.id, r.n.name, r.path.slice(0, -1).join(" > "), t.id, t.type, t.title, t.pre, t.steps, t.expected, t.taskIds.join(", "), t.componentNo || ""].concat(ch.map(function (c) {
            if (ds.indexOf(c.id) < 0) return "-";
            var x = t.results && t.results[c.id];
            return x ? QA_ST[x.status] + (x.by ? " (" + x.by + " " + String(x.at).slice(0, 10) + ")" : "") + (x.note ? "\n" + x.note : "") : "미실행";
          })));
        });
      });
      return { name: s.name + " 테스트", title: pr.name + " - 테스트 케이스 / " + s.name, head: [["화면 ID", "화면명", "메뉴 위치", "케이스 ID", "유형", "테스트 항목", "사전 조건", "절차", "기대 결과", "Task", "설명 번호"].concat(ch.map(function (c) { return c.label + " 결과"; }))], rows: rows,
        widths: [20, 18, 22, 22, 8, 28, 18, 36, 30, 16, 8].concat(ch.map(function () { return 16; })), merges: ["A1:F1"] };
    });
    return { bytes: xlsx(sheets), name: pr.code + "_테스트_" + (code || "전체") + "_" + new Date().toISOString().slice(0, 10) };
  }

  // ── 통합: 시스템별 프로세스 플로우 ─────────────
  function renderFlows() {
    var p = P(), flows = p.model.flows;
    if (!flows.length) return '<div class="box empty">아직 작성된 플로우가 없습니다. 요구사항마다 캔버스에서 직접 그리거나 AI로 그리면 여기로 통합됩니다.' + (canEdit() || !SRV ? '<div class="row-actions center">' + p.rtm.rows.filter(function (r) { return r.status !== "EXCLUDED"; }).map(function (r) { return flowEditBtn(p, r.requirementId, r.requirementId + " 그리기"); }).join("") + "</div>" : "") + "</div>";
    var withLanes = p.model.systems.filter(function (s) { return flows.some(function (f) { return f.lanes.some(function (l) { return l.systemCode === s.code; }); }); });
    var cur = state.flowSys;
    var chips = '<div class="filters"><button class="fchip" data-fsys="ALL" aria-pressed="' + (cur === "ALL") + '">전체 통합</button>' + withLanes.map(function (s) {
      return '<button class="fchip" data-fsys="' + esc(s.code) + '" aria-pressed="' + (cur === s.code) + '"><i style="background:' + s.color + '"></i>' + esc(s.code + " " + s.name) + "</button>";
    }).join("") + "</div>";
    var body = flows.map(function (f) {
      var g = cur === "ALL" ? f : Flow.forSystem(f, cur);
      if (!g) return "";
      var rq = reqOfFlow(p, f);
      return '<section class="section"><h2>' + esc(f.title) + " <small>" + esc(f.id) + (cur === "ALL" ? " · 전체 시스템" : " · " + esc(cur) + " 영역만") + '</small></h2><div class="flow-tools">' + flowEditBtn(p, rq, canEdit() ? "캔버스로 편집 · 전체보기" : "전체보기 · 내보내기") + (rq ? "" : '<span class="hint">요구사항과 연결되지 않은 플로우라 보기만 할 수 있습니다</span>') + '</div><div class="box flow-box fit"' + flowOpenAttr(rq) + ">" + Flow.svg(g, { color: sysColor }) + "</div></section>";
    }).join("") || '<div class="box empty">이 시스템이 들어간 플로우가 없습니다.</div>';
    var genBar = '<div class="ai-bar"><span class="hint">AI 생성·조정</span>' + p.rtm.rows.filter(function (r) { return p.gens["flow:" + r.requirementId]; }).map(function (r) { return genBtn("flow:" + r.requirementId, r.requirementId + " " + r.title); }).join("") + "</div>";
    var fwork = '<div class="box wlist">' + p.rtm.rows.filter(function (r) { return r.status !== "EXCLUDED"; }).map(function (r) { return '<div class="wrow"><span class="mono">' + esc(r.requirementId) + "</span><span>" + esc(r.title) + "</span>" + workCtl(p, "flow:" + r.requirementId, "플로우") + (!flowOfReq(p, r.requirementId) && (canEdit() || !SRV) ? flowEditBtn(p, r.requirementId, "캔버스에서 그리기") : "") + "</div>"; }).join("") + "</div>";
    return '<section class="section">' + genBar + fwork + chips + '<p class="hint">시스템을 고르면 그 시스템 레인만 남기고, 다른 시스템으로 넘어가는 지점은 “→ 다른 시스템” 연결 노드로 보여 줍니다. 점선 화살표는 되돌아가는 흐름입니다.</p></section>' + body;
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
  // ── 작업 상태: 미진행 · 진행중 · 완료 · 재검토 필요 ──
  var WORK_LABEL = DATA.workLabel || { NOT_STARTED: "미진행", IN_PROGRESS: "진행중", DONE: "완료", NEEDS_REVIEW: "재검토 필요" };
  var WORK_CLS = { NOT_STARTED: "NOT_STARTED", IN_PROGRESS: "IN_DESIGN", DONE: "DESIGNED", NEEDS_REVIEW: "NEEDS_REVIEW" };
  var WORK_ORDER = ["NOT_STARTED", "IN_PROGRESS", "NEEDS_REVIEW", "DONE"];
  function workOf(p, key) { return (p.work && p.work.items && p.work.items[key]) || { key: key, status: "NOT_STARTED" }; }
  function workPill(p, key, prefix) {
    var w = workOf(p, key);
    return '<span class="pill ' + WORK_CLS[w.status] + '" title="' + esc((w.reason || "") + (w.by ? " · " + w.by : "") + (w.at ? " " + fmtDate(w.at) : "")) + '">' + esc((prefix || "") + WORK_LABEL[w.status]) + "</span>";
  }
  /** 상태 표시 + 바꾸기 버튼. AI가 만든 결과는 진행중 — 검토 후 완료로 표시한다 */
  function workCtl(p, key, what) {
    var w = workOf(p, key), btns = "";
    if (SRV && canEdit() && w.status !== "NOT_STARTED") {
      var b = function (st, label, cls) { return '<button class="' + (cls || "btn-sm") + '" data-work="' + esc(key) + '" data-wst="' + st + '">' + label + "</button>"; };
      if (w.status === "IN_PROGRESS") btns = b("DONE", "검토 끝 · 완료 처리", "btn-sm ok");
      else if (w.status === "NEEDS_REVIEW") btns = b("DONE", "다시 검토함 · 완료", "btn-sm ok") + b("IN_PROGRESS", "진행중으로");
      else btns = b("NEEDS_REVIEW", "재검토 필요로") + b("IN_PROGRESS", "진행중으로");
    }
    var sub = w.status === "NOT_STARTED" ? (what ? esc(what) + " 없음 — 만들면 진행중이 됩니다" : "") : w.reason ? esc(w.reason) : w.note ? esc(w.note) : w.by ? esc(w.by) + (w.at ? " · " + esc(fmtDate(w.at)) : "") : "";
    return '<div class="wctl ' + w.status + '"><span class="wl">' + esc(what || "작업 상태") + "</span>" + workPill(p, key) + (sub ? '<span class="hint">' + sub + "</span>" : "") + (btns ? '<span class="wbtns">' + btns + "</span>" : "") + "</div>";
  }
  function workCounts(list) {
    var c = { NOT_STARTED: 0, IN_PROGRESS: 0, DONE: 0, NEEDS_REVIEW: 0 };
    list.forEach(function (w) { c[w.status]++; });
    return c;
  }
  function workStack(c, total) {
    total = total || 1;
    return '<div class="wstack" role="img" aria-label="' + WORK_ORDER.map(function (k) { return WORK_LABEL[k] + " " + c[k]; }).join(", ") + '">' + WORK_ORDER.map(function (k) { return c[k] ? '<span class="ws-' + k + '" style="width:' + (c[k] / total * 100) + '%"></span>' : ""; }).join("") + "</div>" +
      '<div class="wlegend">' + WORK_ORDER.map(function (k) { return '<span><i class="ws-' + k + '"></i>' + WORK_LABEL[k] + " " + c[k] + "</span>"; }).join("") + "</div>";
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
  /** 디자인 패치에서 적용할 수 없는 값을 빼낸다 → { patch, dropped[] } */
  var LAYOUT_ALLOWED = { nav: ["top", "top-mega", "side"], logo: ["left", "center"], search: ["header", "hero", "panel"], list: ["table", "card"], pagination: ["numbered", "numbered-size", "more"], button: ["square", "rounded", "pill"], density: ["comfortable", "compact"], footer: ["full", "simple", "none"] };
  function sanitizeDsPatch(out, d, scope) {
    var hex = /^#[0-9A-Fa-f]{6}$/, dropped = [], o = JSON.parse(JSON.stringify(out || {}));
    var sc = scope ? scopeInfo(scope) : null, inScope = function (pth) { return !sc || sc.allowed.some(function (a) { return pth === a || pth.indexOf(a + ".") === 0; }); };
    // 범위 밖
    patchPaths(o).forEach(function (pth) {
      if (inScope(pth)) return;
      dropped.push("범위(" + sc.label + ") 밖: " + pth);
      var parts = pth.split("."), cur = o;
      for (var i = 0; i < parts.length - 1 && cur; i++) cur = cur[parts[i]];
      if (cur) delete cur[parts[parts.length - 1]];
    });
    // 색 토큰
    if (o.tokens && o.tokens.color) Object.keys(o.tokens.color).forEach(function (k) { if (!d.tokens.color.hasOwnProperty(k) || !hex.test(String(o.tokens.color[k]))) { dropped.push("색상 " + k + ": " + o.tokens.color[k]); delete o.tokens.color[k]; } });
    // 숫자 토큰
    (function walk(base, obj, path) {
      if (!obj || typeof obj !== "object") return;
      Object.keys(obj).forEach(function (k) {
        if (path === "" && k === "color") return;
        var b = base ? base[k] : undefined, v = obj[k];
        if (v && typeof v === "object" && !Array.isArray(v)) return walk(b, v, path + k + ".");
        if (b === undefined) { dropped.push("없는 토큰: tokens." + path + k); delete obj[k]; }
        else if (path === "" && k === "shadow" && ["none", "soft", "strong"].indexOf(v) < 0) { dropped.push("tokens.shadow 값: " + v); delete obj[k]; }
        else if (typeof b === "number" && typeof v !== "number") { dropped.push("tokens." + path + k + " 값 형식: " + v); delete obj[k]; }
      });
    })(d.tokens, o.tokens, "");
    // 레이아웃
    Object.keys(o.layout || {}).forEach(function (k) { if (!LAYOUT_ALLOWED[k] || LAYOUT_ALLOWED[k].indexOf(o.layout[k]) < 0) { dropped.push("레이아웃 " + k + ": " + o.layout[k]); delete o.layout[k]; } });
    // 컴포넌트 스타일
    var known = {};
    d.components.forEach(function (x) { known[x.id] = true; });
    ((o.components && o.components.add) || []).forEach(function (x) { known[x.id] = true; });
    Object.keys(o.componentStyles || {}).forEach(function (cid) {
      if (!known[cid]) { dropped.push("없는 컴포넌트: " + cid); delete o.componentStyles[cid]; return; }
      var vars = styleVarsOf(cid);
      Object.keys(o.componentStyles[cid] || {}).forEach(function (vn) {
        var sv = vars.find(function (x) { return x.name === vn; }), val = String(o.componentStyles[cid][vn]);
        var bad = !sv ? cid + "에 없는 변수: " + vn : (sv.type === "color" ? !hex.test(val) : sv.type === "px" ? !/^\d{1,4}(\.\d+)?px$/.test(val) : !/^\d{1,4}$/.test(val)) ? cid + " " + vn + " 값 형식: " + val : "";
        if (bad) { dropped.push(bad); delete o.componentStyles[cid][vn]; }
      });
      if (!Object.keys(o.componentStyles[cid]).length) delete o.componentStyles[cid];
    });
    return { patch: o, dropped: dropped };
  }
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
      if (!Array.isArray(out.components) && findComps(out, 0)) out.components = findComps(out, 0);
      if (!Array.isArray(out.components) || !out.components.length) errs.push("components 배열이 없습니다");
      else {
        var node = p.model.ia.nodes.find(function (n) { return n.id === target; }) || {};
        var ds = wireDesign(p, node.systemCode);
        if (isProvisional(p, node.systemCode)) warns.push(node.systemCode + " 디자인 시스템이 아직 없어 기본 컨셉으로 미리 보여 줍니다. 적용하면 이 컨셉으로 디자인 시스템이 정해집니다(나중에 바꿀 수 있음)");
        out.components.forEach(function (c, i) {
          if (!c.label && !c.name && !c.title) warns.push((i + 1) + "번 항목에 label이 없어 번호로 표시합니다");
          if (!c.ui && c.component) c.ui = { component: c.component, props: c.props || {} };
          if (typeof c.ui === "string") c.ui = { component: c.ui, props: {} };
          if (c.ui && !c.ui.component && (c.ui.type || c.ui.id)) c.ui.component = c.ui.type || c.ui.id;
          var uic = c.ui && c.ui.component;
          if (uic && ds && !ds.components.some(function (x) { return x.id === uic; })) {
            var hit = fitComp(ds, uic, c.kind);
            if (hit) { c.ui.component = hit; warns.push((c.no || i + 1) + ". " + uic + " 는 디자인 시스템에 없어 " + hit + " 로 바꿨습니다"); }
            else { delete c.ui; warns.push((c.no || i + 1) + ". " + uic + " 는 디자인 시스템에 없어 이 항목은 글로만 표시합니다"); }
          } else if (!c.ui && ds && c.kind && ds.components.some(function (x) { return x.id === c.kind; })) c.ui = { component: c.kind, props: {} };
          if (c.options && typeof c.options === "object" && !Array.isArray(c.options) && !Array.isArray(c.options.values)) warns.push((c.no || i + 1) + ". 선택지 목록(options.values)이 없어 " + (c.options.default ? "기본값만 선택지로 넣습니다" : "선택지 없이 반영합니다"));
          if (c.ui && c.ui.link && !p.model.ia.nodes.some(function (n) { return n.id === c.ui.link; })) warns.push(c.no + ". 이동 화면 " + c.ui.link + " 가 정보구조도에 없습니다");
          if (/API|DB|쿼리|서버|백엔드/.test((c.planner || "") + (c.customer || ""))) warns.push(c.no + ". 개발자 관점 표현이 들어 있습니다");
        });
        if (!ds) warns.push("디자인 시스템이 없어 와이어프레임은 글로만 보입니다");
      }
    } else if (kind === "flow") {
      if (!Array.isArray(out.nodes) || !Array.isArray(out.edges) || !Array.isArray(out.lanes)) errs.push("lanes·nodes·edges 배열이 필요합니다");
      else {
        var nid = {};
        out.nodes.forEach(function (n) { nid[n.id] = true; if (!Array.isArray(n.taskIds)) n.taskIds = []; });
        out.edges.forEach(function (e) { if (!nid[e.from] || !nid[e.to]) errs.push("없는 노드를 잇는 연결 " + e.from + "→" + e.to); });
        if (!out.id) errs.push("flow id가 없습니다");
      }
    } else if (kind === "dsc") {
      var cl = Array.isArray(out.concepts) ? out.concepts : Array.isArray(out.proposals) ? out.proposals : null;
      if (!cl || !cl.length) errs.push("concepts 목록이 없습니다");
      else cl.forEach(function (c, i) {
        if (!c || typeof c !== "object") { errs.push((i + 1) + "번째 컨셉이 객체가 아닙니다"); return; }
        if (!c.name) warns.push((i + 1) + "번째 컨셉에 이름이 없어 기본 이름을 씁니다");
        if (!c.tokens || !c.tokens.color) warns.push((i + 1) + "번째 컨셉에 색상이 없어 기본 색을 씁니다");
        if (!c.layout) warns.push((i + 1) + "번째 컨셉에 레이아웃이 없어 기본 규칙을 씁니다");
      });
      if (cl && cl.length > 3) warns.push("컨셉은 앞의 3개만 반영합니다");
    } else if (kind === "ds") {
      var d0 = selectedDesign(p, target);
      var clean = sanitizeDsPatch(normDsPatch(out, d0), d0, scope);
      clean.dropped.forEach(function (x) { warns.push("적용하지 않고 뺀 값 — " + x); });
      var nd = designWithPatch(d0, clean.patch);
      if (!designChanges(d0, nd).length) errs.push(clean.dropped.length ? "적용할 수 있는 값이 없습니다 (모두 형식·범위 오류). 다시 생성하거나 요청을 구체적으로 적어 주세요" : "바뀐 내용이 없습니다 — 현재 디자인과 같습니다");
      var cres = Array.isArray(out.comments) ? out.comments : [];
      cres.forEach(function (c) { if (c && c.done === false) warns.push("댓글 " + (c.id || "") + " 반영 못함 — " + (c.reason || "이유 없음")); });
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
  var COMMENT_RULES = [
    "### 댓글 반영 규칙",
    "- 댓글이 특정 컴포넌트를 가리키면 그 컴포넌트의 componentStyles(바로 위에 적은 변수)로 먼저 고친다. 화면 전체 색·글꼴(tokens)은 댓글이 전체를 말할 때만 바꾼다",
    "- 변수 이름은 위에 적은 것만 그대로 쓴다. 없는 변수를 만들지 않는다",
    "- 디자인 시스템으로 바꿀 수 없는 요청(문구·항목 추가/삭제·배치 순서·데이터 등 화면 내용)은 고치지 말고 done:false 로 이유를 적는다",
    "- 출력 JSON에 댓글별 결과를 반드시 넣는다: \"comments\":[{\"id\":\"C1\",\"done\":true,\"change\":\"data-table 머리글 배경 #E8EEF7 → #1F2A3C\"},{\"id\":\"C2\",\"done\":false,\"reason\":\"문구 변경은 화면설계서에서 고칠 내용\"}]"
  ].join("\n");
  function fillDs(template, p, code, scope, commentIds) {
    var d = selectedDesign(p, code), sc = scopeInfo(scope), slots = DATA.design.slots;
    var cmts = scope === "comments" ? commentItems(p, code, commentIds).map(function (x) { return x.cmp; }).filter(Boolean) : [];
    var ids = scope.indexOf("cmp:") === 0 ? [scope.slice(4)] : cmts.length ? cmts.filter(function (x, i) { return cmts.indexOf(x) === i; }) : d.components.map(function (x) { return x.id; });
    var vars = ids.map(function (id) {
      return "- " + id + ": " + styleVarsOf(id).map(function (v) { var cur = d.componentStyles && d.componentStyles[id] && d.componentStyles[id][v.name]; return v.name + "(" + v.label + ", " + v.type + ", 기본 " + v.base + (cur ? ", 현재 " + cur : "") + ")"; }).join(" · ");
    }).join("\n");
    return template
      .replace(slots.scope, "- " + sc.label + ": " + sc.hint + "\n- 바꿀 수 있는 경로: " + sc.allowed.join(", "))
      .replace(slots.design, JSON.stringify({ tokens: d.tokens, layout: d.layout, componentStyles: d.componentStyles || {} }))
      .replace(slots.vars, vars)
      .replace(slots.comments, commentText(p, code, commentIds) ? commentText(p, code, commentIds) + "\n\n" + COMMENT_RULES : "- (없음)");
  }
  /** 댓글 목록 → 프롬프트. 댓글마다 C1, C2 … 번호와, 가리키는 컴포넌트에서 바꿀 수 있는 변수(현재 값)를 바로 붙인다 */
  function commentItems(p, code, ids) {
    var all = reviewsOf(p, code).items || [];
    return (ids || []).map(function (id) { return all.find(function (x) { return x.id === id; }); }).filter(Boolean);
  }
  function commentText(p, code, ids) {
    var items = commentItems(p, code, ids);
    if (!items.length) return "";
    var d = selectedDesign(p, code);
    return items.map(function (x, i) {
      var comp = x.cmp && d ? d.components.find(function (c) { return c.id === x.cmp; }) : null;
      var vars = x.cmp ? styleVarsOf(x.cmp).map(function (v) { var cur = d && d.componentStyles && d.componentStyles[x.cmp] && d.componentStyles[x.cmp][v.name]; return v.name + "(" + v.label + ", " + v.type + (cur ? ", 현재 " + cur : ", 기본 " + v.base) + ")"; }).join(" · ") : "";
      return "- [C" + (i + 1) + "] 화면 “" + x.target.label + "”의 " + x.n + "번 핀 · 컴포넌트 " + (x.cmp ? x.cmp + (comp ? " (" + comp.name + ")" : "") : "(특정 컴포넌트 아님 — 화면 전체)") +
        " · 위치 x=" + Math.round(x.x) + ", y=" + Math.round(x.y) + " (1920×1080 기준)" + (x.snippet ? " · 핀 아래 글자 “" + x.snippet + "”" : "") +
        "\n  댓글: " + x.comment + (vars ? "\n  이 컴포넌트에서 바꿀 수 있는 변수: " + vars : "");
    }).join("\n");
  }
  /** 생성·적용 중 오른쪽 영역 — 진행 막대와 결과 모양 스켈레톤, 경과 시간 */
  function genSkeleton(g) {
    var applying = !layer.ctl, ai = P().ai;
    var line = function (w) { return '<span class="sk-line" style="width:' + w + '%"></span>'; };
    var body = g.kind === "ds" || g.kind === "sb" ?
      '<div class="sk-card">' + line(38) + line(92) + line(76) + "</div>" + '<div class="sk-grid"><span class="sk-thumb"></span><span class="sk-thumb"></span><span class="sk-thumb"></span><span class="sk-thumb"></span></div>' :
      g.kind === "flow" ? '<div class="sk-flow"><span></span><i></i><span></span><i></i><span></span><i></i><span></span></div>' + '<div class="sk-card">' + line(60) + line(45) + "</div>" :
      '<div class="sk-card">' + line(30) + '<div class="sk-tree">' + [70, 55, 62, 48, 66, 52].map(function (w, i) { return '<span class="sk-line" style="width:' + w + "%;margin-left:" + (i % 3) * 24 + 'px"></span>'; }).join("") + "</div></div>";
    return '<div class="gen-skel" role="status" aria-live="polite"><div class="sk-bar" aria-hidden="true"><span></span></div>' +
      '<div class="sk-head"><b>' + (applying ? "저장소에 적용하는 중…" : "AI가 만드는 중…") + '</b><span class="hint"><span id="gen-elapsed">' + Math.round((Date.now() - (layer.t0 || Date.now())) / 1000) + "</span>초 · " + (applying ? "잠시만 기다려 주세요" : esc(ai ? effLabel(ai) : "AI") + " · 보통 10~60초, 요청이 몰리면 자동으로 다시 시도합니다") + "</span></div>" +
      '<div class="sk-body" aria-hidden="true">' + body + "</div></div>";
  }
  var elapsedTimer = null;
  function startElapsed() {
    layer.t0 = Date.now();
    clearInterval(elapsedTimer);
    elapsedTimer = setInterval(function () {
      var el = document.getElementById("gen-elapsed");
      if (!layer || !layer.busy) { clearInterval(elapsedTimer); return; }
      if (el) el.textContent = Math.round((Date.now() - layer.t0) / 1000);
    }, 1000);
  }
  // ── 기능 명세: 요구사항추적표의 요구사항별 명세를 생성 프롬프트에 함께 싣는다 ──
  var SPEC_SLOT = DATA.specSlot || "{{SPECS}}";
  function specBase(s) { return s.saved != null ? s.saved : s.draft || ""; }
  function specVal(s) { var e = layer && layer.specs; return e && e[s.id] != null ? e[s.id] : specBase(s); }
  function specEdited(s) { var e = layer && layer.specs; return !!(e && e[s.id] != null && e[s.id].trim() !== specBase(s).trim()); }
  function captureSpecs() {
    document.querySelectorAll("[data-spec]").forEach(function (el) { layer.specs = layer.specs || {}; layer.specs[el.getAttribute("data-spec")] = el.value; });
  }
  /** 뷰어·CLI 공통 규칙 (src/ai/spec.ts specText) */
  function fillSpecs(tpl, g) {
    if (tpl.indexOf(SPEC_SLOT) < 0) return tpl;
    var items = (g.specs || []).map(function (s) { return { s: s, t: specVal(s) }; }).filter(function (x) { return x.t.trim(); });
    var text = items.length ? items.map(function (x) { return "### " + x.s.id + (x.s.originalId && x.s.originalId !== x.s.id ? " (" + x.s.originalId + ")" : "") + " " + x.s.title + "\n" + x.t.trim(); }).join("\n\n") : "- (없음 — 요구사항 원문과 참조자료 근거로 작성)";
    return tpl.replace(SPEC_SLOT, function () { return text; });
  }
  /** 생성 전에 고친 명세를 요구사항에 저장한다 (손대지 않은 참조자료 초안은 저장하지 않음 — 참조자료가 바뀌면 새로 불러오도록) */
  function saveSpecs(g, only) {
    if (!SRV || !canEdit()) return Promise.resolve();
    var todo = (g.specs || []).filter(function (s) {
      if (only && s.id !== only) return false;
      var v = specVal(s).trim();
      if (only) return v !== (s.saved || "").trim();
      return specEdited(s) && v !== (s.saved || "").trim();
    });
    return todo.reduce(function (pr, s) {
      return pr.then(function () {
        var v = specVal(s);
        return cmd({ op: "req.spec", id: s.id, spec: v }).then(function () { if (layer && layer.specs) delete layer.specs[s.id]; });
      });
    }, Promise.resolve());
  }
  function specPill(s) {
    if (specEdited(s)) return '<span class="pill IN_DESIGN">편집함' + (SRV && canEdit() ? " · 생성할 때 저장" : "") + "</span>";
    if (s.saved != null) return '<span class="pill DESIGNED">저장된 명세</span>';
    if (s.draft) return '<span class="pill NOT_STARTED">참조자료 초안</span>';
    return '<span class="pill NOT_STARTED">비어 있음</span>';
  }
  function specEditor(g) {
    var specs = g.specs || [];
    var head = '<div class="spec-ed"><div class="spec-top"><div><b>기능 명세</b> <span class="hint">요구사항추적표에서 이 ' + (g.kind === "flow" ? "플로우" : "화면") + "에 연결된 요구사항의 명세입니다. 여기 적힌 내용이 생성 프롬프트에 그대로 실립니다" +
      (SRV && canEdit() ? ". 고친 명세는 생성할 때 요구사항에 저장되어 다른 화면·플로우 생성에도 쓰입니다." : SRV ? "." : ". 이 화면에서만 쓰이며, 저장하려면 planning req spec 명령을 쓰세요.") + "</span></div>" +
      (layer.specEdit ? '<button class="btn-sm" data-specclose>미리보기로 돌아가기</button>' : "") + "</div>";
    if (!specs.length) return head + '<p class="hint">이 ' + (g.kind === "flow" ? "요구사항" : "화면") + "에 연결된 요구사항이 없습니다. 정보구조도에서 화면에 Task를 연결하면 해당 요구사항의 명세를 불러옵니다.</p></div>";
    return head + specs.map(function (s, i) {
      var from = s.from && s.from.length ? "불러온 곳: " + s.from.join(" · ") : s.draft ? "요구사항 설명에서 불러옴" : "참조자료에서 찾지 못했습니다. 기능명세서·요구사항정의서를 참조자료에 올리면 요구사항 ID(" + (s.originalId || s.id) + ")로 해당 항목을 자동으로 불러옵니다.";
      return '<div class="spec-item"><div class="spec-h"><span class="tag mono">' + esc(s.id) + "</span>" + (s.originalId && s.originalId !== s.id ? '<span class="tag mono">' + esc(s.originalId) + "</span>" : "") + "<b>" + esc(s.title) + "</b>" + specPill(s) + "</div>" +
        '<label class="sr" for="spec-' + i + '">' + esc(s.id) + " 기능 명세</label>" +
        '<textarea id="spec-' + i + '" data-spec="' + esc(s.id) + '" rows="9" placeholder="예: 입력 항목과 필수 여부, 검증 규칙, 처리 조건·상태 변화, 예외, 안내 메시지">' + esc(specVal(s)) + "</textarea>" +
        '<div class="spec-a"><span class="hint">' + esc(from) + '</span><span class="sp"></span>' +
        (s.draft && specVal(s).trim() !== s.draft.trim() ? '<button class="btn-sm" data-specload="' + esc(s.id) + '">참조자료에서 다시 불러오기</button>' : "") +
        (SRV && canEdit() && specVal(s).trim() !== (s.saved || "").trim() ? '<button class="btn-sm" data-specsave="' + esc(s.id) + '">지금 저장</button>' : "") + "</div></div>";
    }).join("") + "</div>";
  }
  function specSummary(g) {
    var specs = g.specs || [];
    var filled = specs.filter(function (s) { return specVal(s).trim(); }).length, edited = specs.filter(specEdited).length;
    var onRight = !layer.busy && (layer.specEdit || layer.sel == null || layer.fresh);
    return '<div class="spec-sum"><div><b>기능 명세</b> <span class="hint">' + (specs.length ? "요구사항 " + specs.length + "건 중 " + filled + "건 프롬프트에 포함" + (edited ? " · 편집 " + edited + "건" : "") : "연결된 요구사항 없음") + (onRight ? " · 오른쪽에서 편집" : "") + "</span></div>" +
      (!onRight && !layer.busy ? '<button class="btn-sm" data-specedit>명세 보기·편집</button>' : "") + "</div>";
  }
  /** 디자인 패치가 현재 디자인에서 실제로 바꾸는 값의 수 (현재와 같은 값·범위 밖·형식 오류는 세지 않는다) */
  function dsEffect(out, d, scope) {
    var sp = sanitizeDsPatch(normDsPatch(out, d), d, scope), patch = sp.patch, n = 0;
    var get = function (o, path) { return path.reduce(function (a, k) { return a == null ? undefined : a[k]; }, o); };
    ["tokens", "layout"].forEach(function (top) {
      if (!patch[top]) return;
      Object.keys(flat(patch[top])).forEach(function (pth) { if (JSON.stringify(get(d[top], pth.split("."))) !== JSON.stringify(get(patch[top], pth.split(".")))) n++; });
    });
    Object.keys(patch.componentStyles || {}).forEach(function (cid) {
      Object.keys(patch.componentStyles[cid] || {}).forEach(function (vn) { if (String((d.componentStyles && d.componentStyles[cid] || {})[vn]) !== String(patch.componentStyles[cid][vn])) n++; });
    });
    ((patch.components && patch.components.add) || []).forEach(function (c) { if (!d.components.some(function (x) { return x.id === c.id; })) n++; });
    return { effective: n, dropped: sp.dropped };
  }
  /** 섹션·전역 디자인 조정 호출 — 반영될 것이 없으면(값이 같음·키 이름 틀림·범위 밖·형식 오류) 이유를 알려 주고 한 번 더 받는다 */
  function dsAsk(input, p, g, scope, ctl, onText) {
    var d = selectedDesign(p, g.target);
    return AI.sample.json(input, { signal: ctl.signal, cache: false, onText: onText }).then(function (out) {
      var chk = dsEffect(out, d, scope);
      if (chk.effective > 0 || ctl.signal.aborted || (out && Array.isArray(out.comments) && out.comments.length)) return { out: out, retried: false };
      var sc = scopeInfo(scope || "global");
      var why = chk.dropped.length ? chk.dropped.slice(0, 8) : ["넣은 값이 모두 현재 값과 같아 바뀌는 것이 없습니다"];
      var msgs = typeof input === "string" ? [{ role: "user", content: input }] : input.slice();
      msgs = msgs.concat([{ role: "assistant", content: JSON.stringify(out) }, { role: "user", content: "방금 답으로는 화면에 바뀌는 것이 없습니다. 원인:\n- " + why.join("\n- ") + "\n\n조정 범위는 ‘" + sc.label + "’(" + sc.allowed.join(", ") + ")입니다. 프롬프트의 ‘값 형식’에 적힌 키 이름과 형식(색 #RRGGBB, 크기 숫자, 열거값)만 쓰고, 요청이 눈에 보이게 현재 값과 다른 값을 넣어 같은 JSON 형식으로 다시 답하세요. 이 범위에서 정말 할 수 없는 요청이면 summary에 이유를 쓰세요." }]);
      return AI.sample.json(msgs, { signal: ctl.signal, cache: false, onText: onText }).then(function (out2) { return { out: out2, retried: true, reason: why }; });
    });
  }
  /**
   * 화면설계서 AI 결과 모양 맞추기 — 모델마다 다르게 주는 모양을 components 배열로 모은다.
   *  배열만 · {screen:{components}} 처럼 한 겹 싸인 것 · 항목 하나만 · 바뀐 항목만(미세조정) → 이전 버전에 번호로 합친다
   */
  function looksComp(c) { return c && typeof c === "object" && !Array.isArray(c) && (c.no != null || c.label != null || c.ui != null || c.planner != null); }
  function findComps(o, depth) {
    if (Array.isArray(o)) return o.length && o.some(looksComp) ? o.filter(function (x) { return x && typeof x === "object"; }) : null;
    if (!o || typeof o !== "object" || depth > 4) return null;
    var keys = ["components", "items", "updated", "changes", "changed", "patch", "modified", "storyboard", "screen", "sheet", "result", "data", "output"];
    for (var i = 0; i < keys.length; i++) { var r = o[keys[i]] != null ? findComps(o[keys[i]], depth + 1) : null; if (r) return r; }
    for (var k in o) if (keys.indexOf(k) < 0 && o[k] && typeof o[k] === "object") { var r2 = findComps(o[k], depth + 1); if (r2) return r2; }
    return null;
  }
  var COMP_ALIAS = { table: "data-table", list: "data-table", grid: "data-table", "board-list": "notice-list", board: "notice-list", input: "text-input", "text-field": "text-input", textfield: "text-input", password: "text-input", email: "text-input", number: "text-input", "text-area": "textarea", dropdown: "select", combobox: "select", radio: "radio-group", checkbox: "checkbox-group", date: "date-range", datepicker: "date-range", "date-picker": "date-range", period: "date-range", upload: "file-upload", file: "file-upload", btn: "button", buttons: "button-group", actions: "button-group", "action-bar": "button-group", header: "gnb", nav: "gnb", navigation: "gnb", menu: "gnb", sidebar: "lnb", "side-menu": "lnb", location: "breadcrumb", tab: "tabs", steps: "step-indicator", stepper: "step-indicator", search: "search-bar", filter: "search-panel", "filter-panel": "search-panel", cards: "card-list", card: "card-list", paging: "pagination", detail: "detail-table", "detail-view": "detail-table", badge: "status-badge", status: "status-badge", attachments: "file-list", stats: "stat-cards", dashboard: "stat-cards", empty: "empty-state", banner: "hero-banner", hero: "hero-banner", login: "login-form", dialog: "modal", popup: "modal", confirm: "confirm-dialog", alert: "alert-dialog", notice: "notice-list", links: "quick-links", "quick-menu": "quick-links" };
  /** 디자인 시스템에 없는 컴포넌트 이름 → 가까운 컴포넌트 ID (서버 fitUi와 같은 규칙) */
  function fitComp(ds, name, kind) {
    var ids = {};
    ds.components.forEach(function (x) { ids[x.id] = true; });
    function key(v) { return String(v || "").toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9가-힣-]/g, ""); }
    var raw = key(name), k = key(kind);
    var cands = [raw, raw.replace(/^(krds|ds|ui|w|wf|c)-/, ""), COMP_ALIAS[raw], COMP_ALIAS[raw.replace(/s$/, "")], k, COMP_ALIAS[k]];
    for (var i = 0; i < cands.length; i++) if (cands[i] && ids[cands[i]]) return cands[i];
    var m = ds.components.find(function (x) { var n = key(x.name); return n.indexOf(raw) >= 0 || (raw.length > 1 && n.split(/[()-]/).indexOf(raw) >= 0); });
    return m ? m.id : null;
  }
  function normSbOut(out, prev) {
    var comps = findComps(out, 0);
    if (!comps && looksComp(out) && out.no != null) comps = [out];
    if (!comps) return { out: out, note: "" };
    var tpl = out && (out.template || (out.screen && out.screen.template) || (out.storyboard && out.storyboard.template)) || (prev && prev.template);
    var pcs = prev && Array.isArray(prev.components) ? prev.components : null, note = "";
    // 바뀐 항목만 온 경우: 번호가 모두 이전 버전에 있고 개수가 적으면 이전 버전에 합친다
    if (pcs && comps.length < pcs.length && comps.every(function (c) { return c.no != null && pcs.some(function (x) { return String(x.no) === String(c.no); }); })) {
      var by = {};
      comps.forEach(function (c) { by[String(c.no)] = c; });
      comps = pcs.map(function (x) { var c = by[String(x.no)]; return c ? Object.assign({}, x, c) : x; });
      note = "AI가 바뀐 항목(" + Object.keys(by).join(", ") + "번)만 보내 와 나머지 항목은 이전 버전 그대로 합쳤습니다";
    }
    var o2 = { components: comps };
    if (tpl) o2.template = tpl;
    return { out: o2, note: note };
  }
  function sbAsk(input, prev, ctl, onText) {
    return AI.sample.json(input, { signal: ctl.signal, cache: false, onText: onText }).then(function (out) {
      var r = normSbOut(out, prev);
      if (Array.isArray(r.out.components) && r.out.components.length) return { out: r.out, note: r.note };
      var msgs = typeof input === "string" ? [{ role: "user", content: input }] : input.slice();
      msgs = msgs.concat([{ role: "assistant", content: JSON.stringify(out).slice(0, 4000) }, { role: "user", content: "방금 답에는 components 배열이 없어 화면설계서를 그릴 수 없습니다. 바뀌지 않은 항목까지 모두 넣어 {\"template\":\"…\",\"components\":[{\"no\":1,\"label\":\"…\",\"kind\":\"…\",\"planner\":\"…\",\"customer\":\"…\",\"ui\":{\"component\":\"…\",\"props\":{}}}]} 형식의 JSON 전체만 다시 답하세요." }]);
      return AI.sample.json(msgs, { signal: ctl.signal, cache: false, onText: onText }).then(function (out2) {
        var r2 = normSbOut(out2, prev);
        if (!Array.isArray(r2.out.components) || !r2.out.components.length) { var e = new Error("AI가 두 번 모두 components 배열 없이 답했습니다. 다른 모델로 바꾸거나 요청을 더 구체적으로 적어 다시 시도하세요"); e.code = "server"; throw e; }
        return { out: r2.out, note: r2.note, retried: true };
      });
    });
  }
  /** 생성·고치기 요청 만들기 — AI 연결로 부를 때와 claude.ai에 붙여 넣을 때가 같은 내용을 쓴다 */
  function genInput(instruction) {
    var p = P(), key = layer.key, g = p.gens[key], doc = overlayOf(key) || { project: p.model.project.code, kind: g.kind, target: g.target, versions: [], applied: null };
    var base = layer.sel != null && !layer.fresh ? doc.versions[layer.sel] : null;
    var scope = base ? base.scope || "global" : layer.scope || "global";
    var cids = base ? base.commentIds || [] : layer.commentIds || [];
    if (g.requiresInstruction && !base && !instruction && !cids.length) return { err: "조정 요청을 적어 주세요." };
    if (base && !instruction) return { err: "고칠 내용을 적어 주세요." };
    captureSpecs();
    var tpl = g.kind === "ds" ? fillDs(g.prompt, p, g.target, scope, cids) : fillSpecs(g.prompt, g);
    var rootText = base ? base.root || "" : instruction || (cids.length ? "위 댓글을 모두 반영해 주세요." : "");
    var first = tpl + (g.requiresInstruction ? rootText : (!base && instruction ? "\n## 추가 지시\n" + instruction + "\n" : ""));
    var input = base ? [{ role: "user", content: first }, { role: "assistant", content: JSON.stringify(base.output) }, { role: "user", content: DATA.refine + instruction }] : first;
    // 한 번에 붙여 넣을 글 (claude.ai용): 이전 결과와 고칠 내용을 이어 붙인다
    var text = base ? first + "\n\n## 이전 결과 (v" + base.n + ")\n```json\n" + JSON.stringify(base.output, null, 1) + "\n```\n\n## 고칠 내용\n" + DATA.refine + instruction : first;
    return { p: p, key: key, g: g, doc: doc, base: base, scope: scope, cids: cids, rootText: rootText, input: input, text: text, instruction: instruction };
  }
  /** 결과를 새 버전으로 저장 */
  function genSave(c, out, via) {
    var g = c.g, doc = c.doc;
    if (g.kind === "ds") out = normDsPatch(out, selectedDesign(c.p, g.target));
    var n = doc.versions.reduce(function (a, v) { return Math.max(a, v.n); }, 0) + 1;
    var v = { n: n, scope: c.scope, scopeLabel: scopeInfo(c.scope).label, commentIds: c.cids, instruction: (c.instruction || (c.cids.length ? "댓글 " + c.cids.length + "개 반영" : "(1차 생성)")) + (via ? " · " + via : ""), from: c.base ? c.base.n : null, root: g.requiresInstruction ? c.rootText : null, output: out, at: new Date().toISOString() };
    if (g.kind !== "ds") { delete v.scope; delete v.scopeLabel; delete v.commentIds; }
    doc = Object.assign({}, doc, { versions: doc.versions.concat([v]).slice(-10), updatedAt: v.at });
    layer.sel = doc.versions.length - 1;
    layer.fresh = false;
    layer.draft = "";
    return saveOverlay(c.key, doc).then(function (saved) { layer.saved = saved; });
  }
  /** 붙여 넣은 글에서 JSON 꺼내기 (코드 블록·앞뒤 설명이 섞여도) */
  function looseJson(text) {
    var t = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "");
    var fence = /```(?:json)?\s*([\s\S]*?)```/gi, m, cands = [];
    while ((m = fence.exec(t))) cands.push(m[1]);
    cands.push(t);
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i], st = c.search(/[\[{]/);
      if (st < 0) continue;
      var open = c[st], close = open === "{" ? "}" : "]", depth = 0, inStr = false, esc2 = false;
      for (var j = st; j < c.length; j++) {
        var ch = c[j];
        if (inStr) { if (esc2) esc2 = false; else if (ch === "\\") esc2 = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === open) depth++;
        else if (ch === close && --depth === 0) { try { return JSON.parse(c.slice(st, j + 1).replace(/,\s*([}\]])/g, "$1")); } catch (e) { break; } }
      }
    }
    throw new Error("붙여 넣은 글에서 JSON을 찾지 못했습니다. Claude 답의 JSON 전체(코드 블록 포함)를 그대로 복사해 붙여 넣으세요.");
  }
  function genPaste(text) {
    var c = genInput((document.getElementById("gen-in") || {}).value ? document.getElementById("gen-in").value.trim() : "");
    if (c.err) { layer.err = c.err; renderLayer(); return; }
    var out;
    try { out = looseJson(text); } catch (e) { layer.err = e.message; renderLayer(); return; }
    if (c.g.kind === "sb") {
      var r = normSbOut(out, c.base && !/삭제|제거|빼|없애|지워/.test(c.instruction || "") ? c.base.output : null);
      if (!Array.isArray(r.out.components) || !r.out.components.length) { layer.err = "붙여 넣은 JSON에 components 배열이 없습니다. Claude에 ‘JSON 전체를 다시 출력해 줘’라고 요청한 뒤 다시 붙여 넣으세요."; renderLayer(); return; }
      out = r.out;
      if (r.note) toast(r.note);
    }
    layer.err = "";
    layer.pasteOpen = false;
    genSave(c, out, "claude.ai").then(function () { toast("Claude 결과를 v" + (c.doc.versions.length + 1) + "로 넣었습니다. 미리보기를 확인하고 적용하세요"); render(); renderLayer(); }, function (e) { layer.err = "저장하지 못했습니다: " + (e && e.message || e); renderLayer(); });
  }
  function genRun(instruction) {
    var c = genInput(instruction);
    if (c.err) { layer.err = c.err; renderLayer(); return; }
    var p = c.p, g = c.g, base = c.base, scope = c.scope, input = c.input;
    layer.ctl = new AbortController();
    layer.busy = true; layer.err = ""; layer.stream = 0; layer.specEdit = false;
    startElapsed();
    renderLayer();
    var ctl = layer.ctl;
    saveSpecs(g).then(function () {
      if (ctl.signal.aborted) { var ab = new Error("cancelled"); ab.code = "cancelled"; throw ab; }
      var onText = function (u) { var b = document.getElementById("gen-busy"); if (b) b.textContent = "작성 중… " + u.text.length.toLocaleString() + "자"; };
      if (g.kind === "sb") {
        // 바뀐 항목만 합치기는 미세조정(이전 버전이 있을 때)에만
        return sbAsk(input, base && !/삭제|제거|빼|없애|지워/.test(instruction || "") ? base.output : null, ctl, onText);
      }
      return g.kind === "ds" && selectedDesign(p, g.target) ? dsAsk(input, p, g, scope, ctl, onText) : AI.sample.json(input, { signal: ctl.signal, cache: false, onText: onText }).then(function (o) { return { out: o }; });
    }, function (e) { if (!e.code) e.code = "server"; throw e; })
      .then(function (res) {
        if (res.retried) toast(g.kind === "sb" ? "처음 답에 components 배열이 없어 다시 받았습니다" : "처음 답은 반영될 것이 없어 이유를 알려 주고 다시 받았습니다");
        if (res.note) toast(res.note);
        return genSave(c, res.out);
      }, function (e) {
        layer.err = e && e.code === "cancelled" ? "" : e && e.code === "server" ? e.message : (SAMPLE_ERR[e && e.code] || "생성하지 못했습니다(" + (e && e.code) + "). 다시 눌러 주세요.");
      })
      .then(function () { if (!layer) return; layer.busy = false; layer.ctl = null; render(); renderLayer(); });
  }
  /** 서비스 모드: 생성 결과를 서버 모델에 바로 반영한다. 디자인은 적용 전 디자인을 기록해 되돌릴 수 있다 */
  function genApplySrv(apply) {
    var p = P(), key = layer.key, doc = JSON.parse(JSON.stringify(overlayOf(key))), v = doc.versions[layer.sel];
    var out = doc.kind === "ds" ? sanitizeDsPatch(normDsPatch(v.output, selectedDesign(p, doc.target)), selectedDesign(p, doc.target), v.scope).patch : v.output;
    if (doc.kind === "ds") delete out.comments;
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
    layer.busy = true; layer.ctl = null; startElapsed(); renderLayer();
    run.then(function () {
      if (doc.kind === "ds") {
        var after = selectedDesign(P(), doc.target);
        if (apply) {
          doc.history = (doc.history || []).concat([{ rev: after.revision, n: v.n, scope: v.scope, scopeLabel: v.scopeLabel, instruction: v.root || v.instruction, summary: v.output.summary || "", changes: designChanges(before, after), beforeDesign: before, at: new Date().toISOString() }]).slice(-10);
          doc.appliedRev = after.revision;
          doc.applied = v.n;
          layer.err = "";
          if (v.commentIds && v.commentIds.length) resolveComments(p, doc.target, v.commentIds, after.revision, v.output && v.output.comments);
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
  /** results: AI가 돌려준 댓글별 결과 [{id:"C1", done, change, reason}] — 반영 못한 댓글은 이유를 남기고 열어 둔다 */
  function resolveComments(p, sys, ids, rev, results) {
    var doc = JSON.parse(JSON.stringify(reviewsOf(p, sys)));
    var byC = {};
    (Array.isArray(results) ? results : []).forEach(function (r) { if (r && r.id) byC[String(r.id).toUpperCase()] = r; });
    doc.items = (doc.items || []).map(function (x) {
      var i = ids.indexOf(x.id);
      if (i < 0) return x;
      var r = byC["C" + (i + 1)];
      if (r && r.done === false) return Object.assign(x, { aiNote: r.reason || "AI가 반영하지 못했습니다", aiRev: rev });
      return Object.assign(x, { status: "resolved", rev: rev, aiNote: r && r.change ? r.change : null });
    });
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
    try { return genPreviewRaw(p, g, out); } catch (e) { return '<div class="empty">결과 형식이 올바르지 않아 미리보기를 그릴 수 없습니다. 왼쪽 검사 결과를 확인하고 다시 생성하거나 ‘이 버전 고치기’로 고치세요.</div>'; }
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
    if (g.kind === "flow") return (SRV && canEdit() ? '<div class="flow-tools"><button class="btn-sm fe-open" data-flowedit-gen="1">▣ 이 결과를 캔버스에서 다듬기 · 전체보기</button><span class="hint">캔버스에서 고친 뒤 저장하면 바로 반영됩니다</span></div>' : "") + '<div class="flow-box">' + Flow.svg(out, { color: sysColor, suffix: "-gen" }) + "</div>";
    if (g.kind === "dsc") {
      var cl = (Array.isArray(out.concepts) ? out.concepts : Array.isArray(out.proposals) ? out.proposals : []).slice(0, 3);
      return '<p class="hint">AI가 제안한 컨셉 ' + cl.length + '개입니다. 적용하면 디자인 시스템 페이지의 컨셉 카드가 되고, 그 자리에서 로그인·목록·상세 화면 미리보기로 비교해 고를 수 있습니다. 빠진 값은 기준 컨셉으로 채우고, 글자 대비가 4.5:1에 못 미치면 자동으로 보정합니다.</p><div class="concepts">' + cl.map(function (c, i) {
        c = c || {};
        var col = (c.tokens && c.tokens.color) || {}, f = (c.tokens && c.tokens.font) || {}, L = {};
        Object.keys(c.layout || {}).forEach(function (k) { if (LAYOUT_ALLOWED[k] && LAYOUT_ALLOWED[k].indexOf(c.layout[k]) >= 0) L[k] = c.layout[k]; });
        var sw = [["주 색", col.primary], ["강조", col.accent], ["메뉴", col.nav], ["배경", col.bg], ["글자", col.text]].filter(function (x) { return /^#[0-9A-Fa-f]{6}$/.test(String(x[1])); }).map(function (x) { return '<span class="sw" title="' + x[0] + " " + esc(x[1]) + '"><i style="background:' + esc(x[1]) + '"></i>' + x[0] + "</span>"; }).join("");
        return '<article class="box concept"><div class="concept-h"><span class="cid">' + "ABC".charAt(i) + "</span><div><b>" + esc(c.name || "(이름 없음)") + "</b><p>" + esc(c.summary || "") + '</p></div></div><p class="fit"><b>어울리는 경우</b> ' + esc(c.fit || "") + '</p><div class="swatches">' + (sw || '<span class="hint">색상 없음</span>') + "</div>" +
          '<p class="hint">글꼴 ' + esc(f.family ? fontName(f.family) : "기본") + "</p>" + (c.layout ? layoutChips(Object.assign({ nav: "top", logo: "left", search: "header", list: "table", pagination: "numbered", button: "square", density: "comfortable", footer: "full" }, L)) : "") + "</article>";
      }).join("") + "</div>";
    }
    if (g.kind === "sb") {
      var node = p.model.ia.nodes.find(function (n) { return n.id === g.target; }) || {};
      var sb = { screenId: g.target, systemCode: node.systemCode, title: node.name, template: out.template, components: out.components || [] };
      var gk = "gen:" + g.target, hasWire = !!wireDesign(p, node.systemCode);
      var desc = '<table class="desc dpanel"><thead><tr><th>No</th><th>항목</th><th>Description</th></tr></thead><tbody>' + sb.components.map(function (c) {
        return '<tr data-dno="' + esc(gk + "|" + c.no) + '"><td><span class="no">' + esc(c.no) + '</span></td><td class="d-item"><b>' + esc(c.label) + '</b><span class="hint mono">' + esc(c.ui ? c.ui.component : c.kind) + "</span>" + (c.ui && c.ui.link ? '<span class="hint">→ ' + esc(c.ui.link) + "</span>" : "") + '</td><td class="d-text">' + descCell(c) + (ruleCell(c).indexOf("dash") < 0 ? '<div class="d-rules">' + ruleCell(c) + "</div>" : "") + "</td></tr>";
      }).join("") + "</tbody></table>";
      return (hasWire ? sbCanvas(p, sb, { key: gk, preview: true }) : '<p class="hint">디자인 시스템이 없어 와이어프레임 없이 설명만 보입니다.</p>') + '<div class="desc-wrap">' + desc + "</div>";
    }
    if (g.kind === "ds") {
      var d0 = selectedDesign(p, g.target), nd = designWithPatch(d0, sanitizeDsPatch(normDsPatch(out, d0), d0, null).patch, d0.revision + 1), ch = designChanges(d0, nd), ctx = wireCtx(p, g.target, null);
      var screens = p.model.storyboard.screens.filter(function (x) { return x.systemCode === g.target; });
      var shots = screens.slice(0, 4).map(function (sb) {
        var node = p.model.ia.nodes.find(function (n) { return n.id === sb.screenId; }) || {};
        var c2 = wireCtx(p, sb.systemCode, sb.screenId);
        if (node.kind === "POPUP") { c2.popup = true; c2.parent = p.model.storyboard.screens.find(function (s) { return s.screenId === node.parentId; }); }
        return '<figure class="thumb"><div class="thumb-in">' + stage(Wire.screen(nd, sb, c2), { w: VW, h: VH, cap: false }) + "</div><figcaption>" + esc(sb.screenId) + "</figcaption></figure>";
      }).join("");
      var cres = Array.isArray(out.comments) ? out.comments : [];
      var cres2 = cres.filter(function (c) { return c && typeof c === "object"; });
      var cbox = cres2.length ? '<div class="cmt-results"><b>댓글별 반영 결과</b><ul>' + cres2.map(function (c) {
        var no = c.done === false;
        return '<li class="' + (no ? "cr-no" : "cr-ok") + '"><span class="cr-id">' + esc(c.id || "") + '</span><span class="cr-mark" aria-hidden="true">' + (no ? "✕" : "✓") + '</span><span class="cr-text"><b>' + (no ? "반영 못함" : "반영") + "</b>" + esc(no ? c.reason || "이유 없음" : c.change || "") + "</span></li>";
      }).join("") + "</ul></div>" : "";
      return (out.summary ? "<p><b>" + esc(out.summary) + "</b></p>" : "") + cbox + '<ul class="changes">' + ch.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
        '<h4 class="gen-sub">바뀐 디자인으로 다시 그린 화면 <small>이 디자인 시스템을 쓰는 화면 ' + screens.length + "개 중 " + Math.min(4, screens.length) + "개</small></h4>" + '<div class="thumbs">' + shots + "</div>" +
        '<h4 class="gen-sub">템플릿</h4><div class="thumbs">' + ["list", "form", "confirm", "modal"].map(function (t) { return '<figure class="thumb"><div class="thumb-in">' + stage(Wire.template(nd, t, ctx), { w: VW, h: VH, cap: false }) + "</div><figcaption>" + t + "</figcaption></figure>"; }).join("") + "</div>";
    }
    return "";
  }

  /** 화면설계서 전체 화면 편집: 크게 보는 캔버스 + 설명 표, 같은 시스템 화면 사이 이동 */
  function renderSbFull() {
    var p = P(), sid = layer.sid, node = p.model.ia.nodes.find(function (n) { return n.id === sid; }) || {};
    var list = systemScreens(p, node.systemCode), i = list.findIndex(function (n) { return n.id === sid; });
    var nav = '<span class="hint">' + (i + 1) + " / " + list.length + '</span><button class="btn-sm" data-sbnav="-1"' + (i > 0 ? "" : " disabled") + '>← 이전 화면</button><button class="btn-sm" data-sbnav="1"' + (i < list.length - 1 ? "" : " disabled") + ">다음 화면 →</button>";
    return '<header class="layer-h"><div><span class="eyebrow">화면설계서 · 전체 화면 · ' + esc(node.systemCode || "") + '</span><h2 id="layer-t"><span class="mono">' + esc(sid) + "</span> " + esc(node.name || "") + '</h2></div><span class="sp"></span>' + nav + '<button class="x" data-close-layer aria-label="닫기">✕</button></header>' +
      '<div class="sbfull-body">' + sheetHtml(p, sid, node.systemCode, { full: true }) + "</div>";
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
    var label = !sel ? (g.requiresInstruction ? "조정 요청" : "추가 지시 (선택)") : "고칠 내용 · v" + sel.n + " 기준으로 고칩니다";
    var ph = !sel ? (g.requiresInstruction ? "예: 주 색을 더 진하게, 버튼을 둥글게" : "예: 목록은 50건까지 보이게, 반려 사유 보기 버튼 추가") : "예: 검색 조건에 '신청인' 추가, 버튼 문구를 '공개 신청하기'로";
    var appliedHist = sel && g.kind === "ds" ? (doc.history || []).find(function (h) { return h.n === sel.n; }) : null;
    var isApplied = sel && (appliedHist || (g.kind !== "ds" && sel.n === doc.applied));
    var chk = sel && !isApplied ? validateOutput(g.kind, g.target, SRV && g.kind === "ds" ? normDsPatch(sel.output, selectedDesign(p, g.target)) : sel.output, p, sel.scope) : null;
    var scopeNow = sel ? sel.scope : layer.scope;
    var scopeNote = g.kind === "ds" ? '<p class="scope-note"><b>조정 범위</b> ' + esc(scopeInfo(scopeNow || "global").label) + ' <span class="hint">' + esc(scopeInfo(scopeNow || "global").hint) + "</span>" + ((sel ? sel.commentIds : layer.commentIds) && (sel ? sel.commentIds : layer.commentIds).length ? '<br><span class="hint">댓글 ' + (sel ? sel.commentIds : layer.commentIds).length + "개 반영 요청</span>" : "") + "</p>" : "";
    var left = '<div class="gen-left">' + scopeNote + '<div class="gen-status">' + (g.kind === "ds" ? (doc.appliedRev ? '<span class="pill DESIGNED">누적 적용 r' + doc.appliedRev + "</span>" : '<span class="pill NOT_STARTED">저장소 기본값</span>') : doc.applied ? '<span class="pill DESIGNED">적용: v' + doc.applied + "</span>" : '<span class="pill NOT_STARTED">저장소 기본값</span>') +
      (SRV ? '<span class="hint">결과는 프로젝트 멤버와 공유되고, 적용하면 저장소 모델이 바로 바뀝니다</span><span class="gen-ai"><label for="gen-ai-switch">AI</label>' + (aiCache.code === P().model.project.code ? aiSwitch("gen-ai-switch") : '<span class="hint">' + esc(effLabel(P().ai)) + "</span>") + "</span>" : AI.db ? (AI.dbWrite ? '<span class="hint">결과와 적용 상태는 이 페이지를 보는 모두에게 공유됩니다</span>' : '<span class="hint warn-t">저장 권한이 없어 이 화면에서만 보입니다</span>') : '<span class="hint">저장 공간이 없어 새로고침하면 사라집니다</span>') + "</div>" +
      (vlist ? '<div class="ver-list">' + vlist + "</div>" : "") +
      (g.specs ? specSummary(g) : "") +
      (canGen || (SRV && canEdit()) ? '<label class="gen-label" for="gen-in">' + label + '</label><textarea id="gen-in" rows="4" placeholder="' + esc(ph) + '">' + esc(layer.draft || "") + "</textarea>" +
        (canGen ? '<div class="gen-actions">' + (layer.busy ? '<span id="gen-busy" class="hint">생각 중… (5~60초)</span><button class="btn-sm" data-gstop>멈춤</button>' : '<button class="btn-primary" data-grun>' + (!sel ? (g.requiresInstruction ? "조정안 만들기" : "1차 생성") : "✦ 이 버전 고치기") + "</button>" + (sel ? '<button class="btn-sm" data-gnew>처음부터 다시 생성</button>' : "")) + "</div>"
          : '<div class="note warn"><b>AI 연결이 없습니다</b><p class="hint">아래 ‘Claude 구독으로 만들기’로 claude.ai에서 만들어 붙여 넣거나, AI 설정에서 Claude API 키 등 연결을 등록하세요.</p></div>') +
        (SRV && canEdit() && !layer.busy ? claudeBox(sel) : "")
        : SRV ? '<div class="note warn"><b>AI 설정이 없습니다</b><p class="hint">운영자가 프로젝트 AI 설정을 등록하거나 내 계정에서 개인 설정을 등록하세요.</p></div>' : '<div class="note warn"><b>여기서는 생성할 수 없습니다</b><p class="hint">claude.ai에서 이 페이지를 열면 Claude로 바로 생성합니다. 지금은 아래 프롬프트를 복사해 Claude에 붙여 넣고, 받은 JSON을 <code>planning gen apply</code>로 반영하세요.</p><button class="btn-sm" data-gcopy>생성 프롬프트 복사</button></div>') +
      (isApplied ? '<div class="applied-note" role="status"><b>✓ 적용됨' + (appliedHist ? " (r" + appliedHist.rev + ")" : "") + "</b><span>" + (g.kind === "ds" ? "이 결과는 디자인 시스템에 반영돼 있습니다. 이 버전을 바탕으로 더 고치려면 위에 고칠 내용을 적고 ‘이 버전 고치기’를 누르세요." : "이 결과가 저장소에 반영돼 있습니다.") + "</span>" + (appliedHist && appliedHist.changes && appliedHist.changes.length ? '<ul class="changes">' + appliedHist.changes.slice(0, 8).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "</div>" : "") +
      (layer.err ? '<p class="gen-err" role="alert">' + esc(layer.err) + (SRV && canEdit() ? ' <button class="lnk" data-gotologs>호출 기록 보기</button>' : "") + "</p>" : "") +
      (chk && (chk.errs.length || chk.warns.length) ? '<ul class="chk">' + chk.errs.map(function (x) { return '<li class="e">' + esc(x) + "</li>"; }).join("") + chk.warns.map(function (x) { return '<li class="w">' + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
    var showSpec = !!g.specs && !layer.busy && (layer.specEdit || !sel);
    var right = '<div class="gen-right">' + (layer.busy ? genSkeleton(g) : showSpec ? specEditor(g) : sel ? genPreview(p, g, sel.output) : '<div class="empty">' + (g.kind === "ds" ? "바꾸고 싶은 점을 적고 ‘조정안 만들기’를 누르세요. 결과를 확인한 뒤 적용하면 이 디자인 시스템을 쓰는 모든 화면이 한꺼번에 바뀝니다." : "‘1차 생성’을 누르면 저장소의 요구사항·Task·참조자료·디자인 시스템을 근거로 AI가 만듭니다. 결과를 본 뒤 ‘이 버전 고치기’로 이어서 고칠 수 있습니다.") + "</div>") + "</div>";
    var foot = '<footer class="layer-f"><span class="hint">' + (sel ? "v" + sel.n + (isApplied ? " 적용됨" : " 미리보기") : "") + '</span><span class="sp"></span>' +
      (sel ? '<button class="btn-sm" data-gjson>JSON 복사</button>' : "") + (g.kind === "ds" ? (doc.history && doc.history.length ? '<button class="btn-sm" data-gunapply>마지막 적용 되돌리기</button>' : "") : doc.applied && !SRV ? '<button class="btn-sm" data-gunapply>적용 해제</button>' : "") +
      (sel && (g.kind === "ds" ? !(doc.history || []).some(function (h) { return h.n === sel.n; }) : sel.n !== doc.applied) ? '<button class="btn-primary" data-gapply' + (chk && chk.errs.length ? " disabled" : "") + ">v" + sel.n + " 적용</button>" : "") + "</footer>";
    return '<header class="layer-h"><div><span class="eyebrow">AI 생성 · 고치기</span><h2 id="layer-t">' + esc(g.title) + '</h2></div><button class="x" data-close-layer aria-label="닫기">✕</button></header>' +
      '<div class="gen-body">' + left + right + "</div>" + foot;
  }
  /** Claude 구독(claude.ai)으로 만들기: 같은 프롬프트를 복사해 claude.ai에서 만들고, 답을 붙여 넣어 새 버전으로 */
  function claudeBox(sel) {
    return '<details class="gen-claude"' + (layer.pasteOpen ? " open" : "") + '><summary><span class="cl-logo" aria-hidden="true">✳</span> Claude 구독(claude.ai)으로 만들기</summary>' +
      '<ol class="cl-steps"><li><button class="btn-sm" data-gclaude>① 프롬프트 복사 · claude.ai 열기</button><span class="hint">' + (sel ? "v" + sel.n + " 결과와 위 ‘고칠 내용’까지 함께 복사합니다" : "위 ‘추가 지시’와 기능 명세까지 함께 복사합니다") + "</span></li>" +
      '<li><span class="hint">claude.ai 새 대화에 붙여 넣고 보냅니다. Opus 등 원하는 모델을 고를 수 있습니다.</span></li>' +
      '<li><label class="gen-label" for="gen-paste">② Claude 답을 그대로 붙여 넣기</label><textarea id="gen-paste" rows="4" placeholder="Claude가 준 답 전체(```json … ``` 포함)를 붙여 넣으세요"></textarea><button class="btn-primary" data-gpaste>붙여 넣은 결과를 새 버전으로</button></li></ol>' +
      '<p class="hint">Claude Pro·Max 구독 로그인을 다른 서비스에 연결하는 것은 Anthropic 정책상 허용되지 않아, 구독은 이렇게 복사·붙여넣기로 씁니다. 버튼 한 번으로 만들려면 AI 설정에 Claude API 키(console.anthropic.com)를 등록하세요.</p></details>';
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
      return '<div class="rv-item ' + x.status + '"><span class="rv-n">' + x.n + '</span><div><span class="tag mono">' + esc(x.cmp || "빈 곳") + "</span> " + (x.status === "resolved" ? '<span class="pill DESIGNED">반영됨 r' + esc(x.rev) + "</span>" : '<span class="pill IN_DESIGN">열림</span>') + "<p>" + esc(x.comment) + "</p>" + (x.aiNote ? '<p class="ai-note ' + (x.status === "resolved" ? "ai-ok" : "ai-no") + '">' + (x.status === "resolved" ? "AI: " : "AI 반영 못함: ") + esc(x.aiNote) + "</p>" : "") + "</div>" + (x.status === "open" ? '<button class="btn-sm" data-rvdel="' + esc(x.id) + '" aria-label="' + x.n + '번 댓글 삭제">삭제</button>' : "") + "</div>";
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
  /** 모달이 열려 있는 동안 뒤 페이지를 고정한다 (스크롤·끌기·터치 스크롤이 뒤로 새지 않게) */
  var scrollLock = null;
  function lockScroll(on) {
    var html = document.documentElement, body = document.body;
    if (on && !scrollLock) {
      scrollLock = { y: window.scrollY || html.scrollTop || 0 };
      body.style.top = -scrollLock.y + "px";
      html.classList.add("layer-open");
    } else if (!on && scrollLock) {
      var y = scrollLock.y;
      scrollLock = null;
      html.classList.remove("layer-open");
      body.style.top = "";
      window.scrollTo(0, y);
    }
  }
  // 모달 바깥(어두운 배경)을 끌어도 아무것도 움직이지 않게
  document.addEventListener("touchmove", function (ev) {
    if (layer && !(ev.target.closest && ev.target.closest(".layer-box"))) ev.preventDefault();
  }, { passive: false });
  document.addEventListener("wheel", function (ev) {
    if (layer && !(ev.target.closest && ev.target.closest(".layer-box"))) ev.preventDefault();
  }, { passive: false });
  function openLayer(l) {
    if (layer && layer.kind === "sbfull" && l.kind !== "sbfull") l.back = layer;
    else lastFocus = document.activeElement;
    layer = l;
    lockScroll(true);
    renderLayer();
  }
  function closeLayer() {
    if (layer && layer.back) { layer = layer.back; renderLayer(); return; }
    layer = null;
    document.getElementById("layer").innerHTML = "";
    lockScroll(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function renderLayer() {
    var root = document.getElementById("layer");
    if (!layer) { root.innerHTML = ""; lockScroll(false); return; }
    lockScroll(true);
    var body;
    var draftEl = document.getElementById("gen-in");
    if (draftEl && layer.kind === "gen") layer.draft = draftEl.value;
    if (layer.kind === "gen") captureSpecs();
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
    } else if (layer.kind === "sbfull") {
      body = renderSbFull();
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
    root.innerHTML = '<div class="layer" data-backdrop><div class="layer-box' + (layer.kind === "ai" ? "" : layer.kind === "form" ? " form" : layer.kind === "aiconn" ? " conn" : layer.kind === "sbfull" ? " full" : " wide") + '" role="dialog" aria-modal="true" aria-labelledby="layer-t">' + body + "</div></div>";
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
    var pv = ev.target.closest && ev.target.closest("[data-preview][role=button], [data-review][role=button], [data-flowedit][role=button]");
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
        if ((r.page === "design" || r.page === "proto" || r.page === "sb" || r.page === "qa") && state.dsSys[code]) want += "?sys=" + enc(state.dsSys[code]);
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
    "task-edit": function (tid) {
      var p = P(), req = p.model.requirements.find(function (r) { return r.tasks.some(function (x) { return x.id === tid; }); });
      if (!req) return;
      var t = req.tasks.find(function (x) { return x.id === tid; });
      openForm({
        eyebrow: req.id + " " + req.title, title: tid + " Task 수정", submit: "저장",
        intro: "AI·자동 생성된 Task의 내용이 요구사항 제목과 맞지 않으면 여기서 바로잡습니다. Task ID와 화면·플로우 연결은 그대로 유지됩니다." + (req.description ? '<br><span class="hint">요구사항 설명: ' + esc(req.description.slice(0, 200)) + (req.description.length > 200 ? "…" : "") + "</span>" : ""),
        fields: [
          { name: "systemCode", label: "시스템", type: "select", options: systemOptions(p), value: t.systemCode, required: true },
          { name: "actor", label: "행위자", value: t.actor, placeholder: "예: 심사자" },
          { name: "action", label: "처리 내용", required: true, value: t.action, placeholder: "예: 검토 후 승인·반려" },
          { name: "after", label: "선행 Task", type: "select", options: [["", "없음"]].concat(req.tasks.filter(function (x) { return x.id !== tid; }).map(function (x) { return [x.id, shortTask(x.id, req.id) + " [" + x.systemCode + "] " + x.action]; })), value: (t.after || [])[0] || "" },
          { name: "to", label: "처리 후 자료 상태", value: t.transition ? t.transition.to : "", placeholder: "예: 공개 (비우면 없음)" },
          { name: "noScreenReason", label: "화면이 없다면 사유", value: t.noScreenReason || "", placeholder: "비우면 화면이 있는 Task" }
        ],
        onSubmit: function (v) {
          return cmd({ op: "task.edit", taskId: tid, input: { systemCode: v.systemCode, actor: v.actor, action: v.action, after: v.after ? [v.after].concat((t.after || []).slice(1)) : [], to: v.to, noScreenReason: v.noScreenReason } });
        }
      });
    },
    "req-edit": function (rid) {
      var p = P(), req = p.model.requirements.find(function (r) { return r.id === rid; });
      if (!req) return;
      openForm({
        eyebrow: rid, title: "요구사항 수정", submit: "저장",
        intro: "제목과 설명이 Task 내용과 어긋나면 고칩니다. 설명을 고친 뒤 ‘Task 자동 생성’을 다시 누르면 새 설명으로 Task를 제안합니다(기존 Task는 그대로).",
        fields: [
          { name: "title", label: "요구사항", required: true, value: req.title },
          { name: "description", label: "설명", type: "textarea", rows: 5, value: req.description || "" },
          { name: "type", label: "유형", type: "select", options: [["FUNCTIONAL", "기능"], ["NON_FUNCTIONAL", "비기능"], ["POLICY", "정책"], ["CONTENT", "콘텐츠"], ["CONSTRAINT", "제약"]], value: req.type },
          { name: "priority", label: "우선순위", type: "select", options: [["MUST", "필수 (MUST)"], ["SHOULD", "권장 (SHOULD)"], ["COULD", "선택 (COULD)"]], value: req.priority }
        ],
        onSubmit: function (v) { return cmd({ op: "req.edit", id: rid, input: { title: v.title, description: v.description, type: v.type, priority: v.priority } }); }
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
      var cur = designOf(P(), a[0]), swap = cur && cur.status === "SELECTED";
      confirmAct("컨셉 " + a[1] + (swap ? " 로 교체" : " 선택"), swap ? a[0] + " 디자인 시스템을 컨셉 " + cur.selectedId + " 에서 " + a[1] + " 로 바꿉니다. 조정해 둔 컴포넌트 스타일은 초기화되고, 디자인 개정이 올라가 완료된 화면설계서가 ‘재검토 필요’가 됩니다. (되돌리려면 이전 컨셉으로 다시 교체)" : a[0] + " 디자인 시스템을 컨셉 " + a[1] + "(으)로 만듭니다. 이 시스템의 화면설계서와 프로토타입이 이 디자인으로 그려집니다.", swap ? "교체" : "이 컨셉으로 정하기", function () { return cmd({ op: "design.select", systemCode: a[0], conceptId: a[1] }); });
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
    "sample-del": function () {
      var list = DATA.projects.filter(function (p) { return p.sample && p.role === "OWNER"; }).map(function (p) { return p.model.project.code; });
      confirmAct("샘플 프로젝트 삭제", list.join(", ") + " 프로젝트와 각 프로젝트의 멤버·초대·AI 호출 기록이 모두 지워집니다. 서버 보관함에만 남고 화면에서는 사라집니다. 삭제할까요?", "샘플 " + list.length + "개 삭제", function () {
        return list.reduce(function (pr, code) { return pr.then(function () { return api("DELETE", "/api/projects/" + enc(code), { confirm: code }); }); }, Promise.resolve()).then(function () { toast("샘플 프로젝트를 삭제했습니다"); return goHome(); });
      });
    },
    "proj-delete-card": function (code) {
      var pr = DATA.projects.find(function (p) { return p.model.project.code === code; }), name = pr ? pr.model.project.name : code;
      openForm({
        title: "프로젝트 삭제", submit: "삭제", danger: true, intro: esc(name) + " 프로젝트와 멤버·초대·AI 설정이 모두 지워집니다. 서버 보관함에만 남습니다." + (pr && pr.sample ? " (샘플 프로젝트라 코드 입력 없이 삭제할 수 있습니다.)" : " 확인하려면 프로젝트 코드 <b>" + esc(code) + "</b>를 입력하세요."),
        fields: pr && pr.sample ? [] : [{ name: "confirm", label: "프로젝트 코드", required: true }],
        onSubmit: function (v) { return api("DELETE", "/api/projects/" + enc(code), { confirm: pr && pr.sample ? code : v.confirm }).then(function () { toast("프로젝트를 삭제했습니다"); return goHome(); }); }
      });
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
    gemini: { label: "Gemini", provider: "openai-compatible", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", key: "AIza… (필수)", hint: "Google AI Studio(aistudio.google.com/apikey)에서 API 키를 발급받아 넣으세요. 무료 사용량이 있는 키도 발급됩니다. 구글 계정 로그인(OAuth)이나 Gemini 구독으로는 API를 호출할 수 없어 키 방식만 지원합니다." },
    "gemini-oauth": { label: "Gemini · Google OAuth", provider: "openai-compatible", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", oauth: true, key: "", hint: "내 Google Cloud 프로젝트의 OAuth 클라이언트로 Google 계정에 로그인해 Gemini API를 호출합니다. 사용량과 요금은 그 Google Cloud 프로젝트 기준입니다(Gemini 구독 아님). 아래 준비 단계를 따라 하세요." },
    anthropic: { label: "Claude (API 키)", provider: "anthropic", baseUrl: "", key: "sk-ant-… (필수)", hint: "Claude API로 바로 생성합니다(추론·스트리밍 사용, 기본 모델 claude-opus-5). 주소는 비워 두면 기본 주소를 씁니다. console.anthropic.com 에서 API 키를 발급받아 넣으세요. Claude Pro·Max 구독 로그인은 Anthropic 정책상 다른 서비스에 연결할 수 없습니다 — 구독으로 만들려면 AI 생성 창의 ‘Claude 구독(claude.ai)으로 만들기’로 복사·붙여넣기 하세요." },
    custom: { label: "직접 입력", provider: "openai-compatible", baseUrl: "", key: "필요하면 입력", hint: "OpenAI 호환 /v1 주소 (vLLM, OpenRouter, Together, 사내 게이트웨이 등)" }
  };
  var PRESET_ORDER = ["anthropic", "nvidia", "gemini", "gemini-oauth", "lmstudio", "ollama", "custom"];
  var GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
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
        (c.baseUrl ? '<span class="hint mono">' + esc(c.baseUrl) + "</span>" : "") + '<span class="sp"></span><span class="hint">' + (c.oauth ? (c.oauth.connected ? "Google 연결됨" + (c.oauth.email ? " · " + esc(c.oauth.email) : "") : '<b class="warn-t">Google 연결 필요</b>') : "키 " + (c.hasKey ? "저장됨" : "없음")) + (c.maxTokens ? " · 최대 " + c.maxTokens + "토큰" : "") + "</span></div>" +
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
      models: conn ? conn.models.slice() : ps.oauth ? [GEMINI_DEFAULT_MODEL] : [], fetched: [], filter: "", busy: false, err: "",
      oauth: conn && conn.oauth ? conn.oauth : null, cid: conn && conn.oauth && conn.oauth.clientId || "", csec: "", pid: conn && conn.oauth && conn.oauth.projectId || ""
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
    if (v("ac-cid") != null) ac.cid = v("ac-cid").trim();
    if (v("ac-csec") != null) ac.csec = v("ac-csec").trim();
    if (v("ac-pid") != null) ac.pid = v("ac-pid").trim();
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
      (ps.oauth ? "" : '<div class="fm-row"><label for="ac-url">API 주소' + (anth ? " (선택)" : "") + '</label><input id="ac-url" type="url" value="' + esc(ac.baseUrl) + '" placeholder="' + esc(ps.baseUrl || "https://…/v1") + '"></div>' +
      '<div class="fm-row"><label for="ac-key">API 키 ' + (anth ? '<em class="fm-req">필수</em>' : '<span class="hint">(선택)</span>') + '</label><input id="ac-key" type="password" autocomplete="new-password" value="' + esc(ac.apiKey) + '" placeholder="' + esc(ac.hasKey ? "저장됨 — 바꿀 때만 입력" : ps.key) + '">' + (ac.hasKey ? '<label class="fm-check"><input type="checkbox" id="ac-clear"' + (ac.clearKey ? " checked" : "") + "> 저장한 키 지우기</label>" : "") + "</div>") +
      '<div class="fm-row"><label for="ac-max">최대 출력 토큰 <span class="hint">(선택, 기본 8192)</span></label><input id="ac-max" type="text" inputmode="numeric" value="' + esc(ac.maxTokens) + '" placeholder="8192"></div></div>' +
      (ps.oauth ? oauthBlock(ac) : "") +
      '<div class="ac-models"><div class="ac-mh"><b>모델</b><span class="hint">여러 개 골라 저장해 두면 드롭다운으로 바로 바꿀 수 있습니다</span><span class="sp"></span><button class="btn-sm" data-acfetch' + (ac.busy ? " disabled" : "") + ">" + (ac.busy ? "불러오는 중…" : "모델 불러오기") + "</button></div>" +
      acProbeBox() + '<div class="ac-chips" id="ac-chips">' + chips + "</div>" +
      (ac.fetched.length ? '<input id="ac-filter" type="search" placeholder="모델 검색 (예: llama, qwen, 70b)" value="' + esc(ac.filter) + '" autocomplete="off">' : "") + '<div id="ac-list" class="ac-list">' + acList() + "</div>" +
      '<div class="ac-manual"><input id="ac-manual" type="text" placeholder="목록에 없으면 모델 이름을 직접 입력" autocomplete="off"><button class="btn-sm" data-acadd>추가</button></div></div>' +
      '<p class="gen-err" role="alert"' + (ac.err ? "" : " hidden") + ">" + esc(ac.err) + "</p>" +
      '<p class="hint">키는 서버에 암호화해 저장하고 화면에 다시 보여 주지 않습니다.' + (ac.scope === "project" ? " 멤버에게는 연결 이름과 모델 이름만 보입니다." : "") + "</p></div>" +
      '<footer class="layer-f"><span class="hint" id="ac-count">고른 모델 ' + ac.models.length + '개</span><span class="sp"></span><button class="btn-sm" data-close-layer>취소</button><button class="btn-primary" data-acsave' + (ac.busy ? " disabled" : "") + ">저장</button></footer>";
  }
  /** Google Cloud OAuth: 준비 단계 안내, 클라이언트 정보 입력, 연결 상태 */
  function oauthBlock(ac) {
    var redirect = location.origin + "/api/oauth/google/callback", o = ac.oauth;
    var steps = "<ol class=\"ac-steps\"><li><a href=\"https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com\" target=\"_blank\" rel=\"noopener\">Google Cloud 콘솔</a>에서 프로젝트를 고르고 <b>Generative Language API</b>를 사용 설정합니다(결제 계정 연결 필요할 수 있음).</li>" +
      "<li><b>API 및 서비스 → OAuth 동의 화면</b>을 만들고, 게시 상태가 ‘테스트’면 내 Google 계정을 <b>테스트 사용자</b>로 추가합니다(테스트 상태의 연결은 7일 뒤 만료 → 게시하면 유지).</li>" +
      "<li><b>사용자 인증 정보 → OAuth 클라이언트 ID 만들기 → 웹 애플리케이션</b>. <b>승인된 리디렉션 URI</b>에 아래 주소를 그대로 추가합니다.</li>" +
      "<li>발급된 <b>클라이언트 ID·시크릿</b>과 <b>프로젝트 ID</b>를 아래에 넣고 저장 → <b>Google 계정 연결</b>.</li></ol>";
    var status = !ac.id ? '<span class="hint">먼저 저장하면 Google 계정 연결 버튼이 나타납니다.</span>' :
      o && o.connected ? '<span class="pill DESIGNED">✓ 연결됨</span> <span>' + esc(o.email || "Google 계정") + '</span> <span class="hint">' + (o.connectedAt ? esc(fmtDate(o.connectedAt)) : "") + '</span><button class="btn-sm" data-acgconnect>다시 연결</button><button class="btn-sm danger" data-acgdisc>연결 해제</button>' :
      '<span class="pill IN_DESIGN">연결 필요</span> <button class="btn-primary" data-acgconnect>Google 계정 연결</button>';
    return '<div class="ac-oauth"><b>Google Cloud 준비</b>' + steps +
      '<div class="fm-row"><label>승인된 리디렉션 URI <span class="hint">(콘솔에 그대로 추가)</span></label><div class="ac-uri"><code class="mono">' + esc(redirect) + '</code><button class="btn-sm" data-accopy="' + esc(redirect) + '">복사</button></div></div>' +
      '<div class="ac-grid"><div class="fm-row"><label for="ac-cid">OAuth 클라이언트 ID</label><input id="ac-cid" type="text" value="' + esc(ac.cid) + '" placeholder="123456789-xxxx.apps.googleusercontent.com" autocomplete="off"></div>' +
      '<div class="fm-row"><label for="ac-csec">클라이언트 시크릿</label><input id="ac-csec" type="password" autocomplete="new-password" value="' + esc(ac.csec) + '" placeholder="' + esc(o && o.hasSecret ? "저장됨 — 바꿀 때만 입력" : "GOCSPX-…") + '"></div>' +
      '<div class="fm-row"><label for="ac-pid">Google Cloud 프로젝트 ID</label><input id="ac-pid" type="text" value="' + esc(ac.pid) + '" placeholder="my-gemini-project-123" autocomplete="off"><span class="hint">이름이 아니라 ID (콘솔 상단 프로젝트 선택창에서 확인)</span></div></div>' +
      '<div class="ac-status" role="status">' + status + "</div></div>";
  }
  /** 입력 저장 → 성공하면 (새 연결이면) 방금 만든 연결의 ID를 알려 준다 */
  function acSave(ac) {
    var ps = AI_PRESETS[ac.preset], before = aiSetOf(ac.scope).conns.map(function (c) { return c.id; });
    var body = { id: ac.id, label: ac.label, provider: ps.provider, preset: ac.preset, baseUrl: ps.oauth ? "" : ac.baseUrl, apiKey: ac.apiKey, clearKey: ac.clearKey, models: ac.models, maxTokens: ac.maxTokens || null };
    if (ps.oauth) body.oauth = { clientId: ac.cid, clientSecret: ac.csec, projectId: ac.pid };
    return api("PUT", aiBase(ac.scope) + "/conns", body).then(function (r) {
      var set = ac.scope === "project" ? r.project : r.ai;
      var conn = ac.id ? set.conns.find(function (c) { return c.id === ac.id; }) : set.conns.find(function (c) { return before.indexOf(c.id) < 0; }) || set.conns[set.conns.length - 1];
      return { set: set, conn: conn };
    });
  }
  function connClick(b) {
    var ac = layer.ac;
    if (b.dataset.accopy) { copyText(b.dataset.accopy, b); return true; }
    if (b.hasAttribute("data-acgconnect")) {
      acSync();
      ac.busy = true; ac.err = ""; renderLayer();
      acSave(ac).then(function (r) {
        ac.id = r.conn.id;
        return api("POST", "/api/oauth/google/start", { scope: ac.scope, project: ac.scope === "project" ? P().model.project.code : undefined, conn: ac.id });
      }).then(function (r) { location.href = r.url; }, function (e) { ac.busy = false; ac.err = e.message; if (layer && layer.ac === ac) renderLayer(); });
      return true;
    }
    if (b.hasAttribute("data-acgdisc")) {
      api("POST", aiBase(ac.scope) + "/conns/" + enc(ac.id) + "/oauth/disconnect").then(function (r) {
        var set = ac.scope === "project" ? r.project : r.ai, c = set.conns.find(function (x) { return x.id === ac.id; });
        ac.oauth = c && c.oauth; toast("Google 연결을 해제했습니다"); renderLayer(); return afterAiChange(ac.scope);
      }, function (e) { ac.err = e.message; renderLayer(); });
      return true;
    }
    if (b.dataset.acpreset) {
      acSync();
      var old = AI_PRESETS[ac.preset], ps = AI_PRESETS[b.dataset.acpreset];
      if (!ac.label || ac.label === old.label) ac.label = ps.label;
      if (!ac.baseUrl || ac.baseUrl === old.baseUrl) ac.baseUrl = ps.baseUrl;
      if (old.provider !== ps.provider) { ac.hasKey = false; ac.fetched = []; }
      ac.preset = b.dataset.acpreset; ac.err = "";
      if (ps.oauth && !ac.models.length) ac.models = [GEMINI_DEFAULT_MODEL];
      renderLayer(); return true;
    }
    if (b.hasAttribute("data-acfetch")) {
      acSync();
      var ps2 = AI_PRESETS[ac.preset];
      if (ps2.oauth && !(ac.oauth && ac.oauth.connected)) { ac.probe = { ok: false, error: "Google 계정을 아직 연결하지 않았습니다", hint: "위에서 저장 → ‘Google 계정 연결’을 마친 뒤 모델을 불러올 수 있습니다. 그 전에는 모델 이름을 직접 입력해도 됩니다.", url: "" }; renderLayer(); return true; }
      ac.busy = true; ac.err = ""; ac.probe = null; renderLayer();
      api("POST", aiBase(ac.scope) + "/models", { connId: ac.id, provider: ps2.provider, baseUrl: ps2.oauth ? AI_PRESETS["gemini-oauth"].baseUrl : ac.baseUrl, apiKey: ac.apiKey }).then(function (r) {
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
      acSave(ac).then(function (r) {
        toast("연결을 저장했습니다: " + ac.label + " · 모델 " + ac.models.length + "개");
        var scope = ac.scope;
        // Google OAuth 연결은 저장 뒤에 계정 연결이 남아 있으므로 창을 닫지 않고 연결 버튼을 보여 준다
        if (ps3.oauth && !(r.conn.oauth && r.conn.oauth.connected)) { ac.id = r.conn.id; ac.oauth = r.conn.oauth; ac.csec = ""; ac.busy = false; renderLayer(); return afterAiChange(scope); }
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
      '<section class="section"><h2>내 연결 <small>나만 씀 · <button class="lnk" data-act="account">내 계정</button>에서도 관리</small></h2>' + connCards("personal", a.personal, true, canEdit()) + "</section>" +
      (canEdit() ? renderAiLogs(code) : "");
  }
  /** 최근 AI 호출 기록 — 실패하면 모델이 보낸 원문을 펼쳐 볼 수 있다 */
  var aiLogs = null;
  function renderAiLogs(code) {
    if (!aiLogs || aiLogs.code !== code) {
      aiLogs = { code: code, logs: null };
      api("GET", "/api/projects/" + enc(code) + "/ai/logs").then(function (r) { aiLogs = { code: code, logs: r.logs }; if (state.route.page === "aiset") render(); }, function () { aiLogs = { code: code, logs: [] }; });
    }
    var logs = aiLogs.logs;
    var rows = !logs ? '<div class="empty">불러오는 중…</div>' : !logs.length ? '<div class="empty">아직 기록이 없습니다. AI 생성을 하면 여기에 남습니다.</div>' : logs.map(function (x, i) {
      return '<details class="ailog ' + (x.ok ? "ok" : "fail") + '"><summary><span class="al-mark">' + (x.ok ? "✓" : "✕") + '</span><span class="mono">' + esc(fmtDate(x.at)) + "</span><span>" + esc(x.user || "") + '</span><span class="mono">' + esc(x.task || "") + '</span><span class="al-model">' + esc((x.label ? x.label + " · " : "") + x.model) + '</span><span class="hint">' + (x.ms / 1000).toFixed(1) + "초" + (x.repaired ? " · 다시 요청해 성공" : "") + "</span></summary>" +
        (x.ok ? '<p class="hint">성공 · 답 ' + (x.chars || 0).toLocaleString() + "자</p>" : '<p class="al-err">' + esc(x.error || "") + "</p>" + (x.raw ? '<div class="al-raw-h"><b>모델이 보낸 원문</b> <span class="hint">' + (x.chars || 0).toLocaleString() + '자</span><button class="btn-sm" data-ailogcopy="' + i + '">원문 복사</button></div><pre class="al-raw">' + esc(x.raw) + "</pre>" : "")) + "</details>";
    }).join("");
    return '<section class="section"><h2>최근 AI 호출 기록 <small>최근 30건 · 실패하면 원문을 펼쳐 볼 수 있습니다</small><button class="btn-sm" data-act="ailog-reload">새로고침</button></h2><div class="box ailogs">' + rows + "</div></section>";
  }
  ACTIONS["ailog-reload"] = function () { aiLogs = null; render(); };
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
    if (layer.kind === "gen") { var g = document.getElementById("gen-in"), gg = P().gens[layer.key]; captureSpecs(); return !!(layer.busy || (g && g.value.trim()) || (gg && (gg.specs || []).some(specEdited))); }
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
  /** Google 로그인에서 돌아온 결과(?oauth=ok|error&msg=…)를 한 번 알려 준다 */
  function oauthReturn() {
    var q = new URLSearchParams(location.search), r = q.get("oauth");
    return r ? { ok: r === "ok", msg: q.get("msg") || "" } : null;
  }
  function enterApp() {
    var ret = oauthReturn();
    return enterApp0().then(function (x) {
      if (ret) { toast(ret.ok ? "Google 계정을 연결했습니다. 연결 편집에서 모델 불러오기를 하세요" : "Google 연결 실패: " + ret.msg, ret.ok ? "" : "err"); history.replaceState(null, "", location.pathname); }
      return x;
    });
  }
  function enterApp0() {
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
        var task = layer && layer.key ? layer.key : "";
        return api("POST", "/api/projects/" + enc(P().model.project.code) + "/generate", { input: input, task: task }, opts && opts.signal).then(function (r) { if (r.repaired) toast("AI 답을 한 번에 읽지 못해 다시 요청해 받았습니다"); aiLogs = null; return r.output; }, function (e) {
          aiLogs = null;
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
      if (lb && layer.kind === "form" && lb.hasAttribute("data-stai-copy")) {
        var sca = lb.getAttribute("data-stai-copy").split("|"), sin = document.getElementById("f-ins"), spr = stagePrompt(sca[0], sca[1], sin ? sin.value.trim() : "");
        if (spr.err) { toast(spr.err, "err"); return; }
        copyText(spr.text, lb, "복사했습니다 · claude.ai에 붙여 넣으세요");
        window.open("https://claude.ai/new", "_blank", "noopener");
        return;
      }
      if (lb && layer.kind === "form" && lb.hasAttribute("data-specdraft")) { var sta = document.getElementById("f-spec"); if (sta) { sta.value = layer.specDraft || ""; sta.focus(); } return; }
      if (lb && layer.kind === "form" && lb.hasAttribute("data-specclear")) { layer.clear = true; submitForm(document.getElementById("fm")); return; }
      if (lb && lb.hasAttribute("data-gotologs")) { closeLayer(); aiLogs = null; go({ view: "project", p: state.route.p, page: "aiset" }); return; }
      if (lb && layer.kind === "aiconn" && connClick(lb)) return;
      if (lb && lb.dataset.cmtgen != null) { commentGen(lb.dataset.cmtgen); return; }
      if (lb && layer.kind === "gen") {
        var gin = document.getElementById("gen-in");
        if (lb.dataset.gsel != null) { layer.sel = Number(lb.dataset.gsel); layer.fresh = false; layer.specEdit = false; layer.err = ""; renderLayer(); return; }
        if (lb.hasAttribute("data-grun")) { genRun(gin ? gin.value.trim() : ""); return; }
        if (lb.hasAttribute("data-gclaude")) {
          var gc = genInput(gin ? gin.value.trim() : "");
          if (gc.err) { layer.err = gc.err; renderLayer(); return; }
          layer.draft = gin ? gin.value : ""; layer.pasteOpen = true;
          saveSpecs(gc.g).catch(function () {});
          copyText(gc.text, lb, "복사했습니다 · claude.ai에 붙여 넣으세요");
          window.open("https://claude.ai/new", "_blank", "noopener");
          return;
        }
        if (lb.hasAttribute("data-gpaste")) { var gpt = document.getElementById("gen-paste"); if (gpt && gpt.value.trim()) genPaste(gpt.value); else { layer.err = "Claude 답을 붙여 넣어 주세요."; renderLayer(); } return; }
        if (lb.hasAttribute("data-gnew")) { var cur0 = (overlayOf(layer.key) || { versions: [] }).versions[layer.sel]; if (cur0 && cur0.scope) { layer.scope = cur0.scope; layer.commentIds = cur0.commentIds; } layer.sel = null; layer.fresh = true; layer.err = ""; renderLayer(); return; }
        if (lb.hasAttribute("data-gstop")) { if (layer.ctl) layer.ctl.abort(); return; }
        if (lb.hasAttribute("data-gapply")) { genApply(true); return; }
        if (lb.hasAttribute("data-gunapply")) { genApply(false); return; }
        if (lb.hasAttribute("data-gjson")) { var dj = overlayOf(layer.key); copyText(JSON.stringify(dj.versions[layer.sel].output, null, 2), lb); return; }
        if (lb.hasAttribute("data-flowedit-gen")) {
          var gdoc = overlayOf(layer.key), gver = gdoc && gdoc.versions[layer.sel], gg = P().gens[layer.key];
          if (gver) openFlowEditor(gg.target, gver.output, function () { closeLayer(); });
          return;
        }
        if (lb.hasAttribute("data-gcopy")) { captureSpecs(); copyText(fillSpecs(P().gens[layer.key].prompt, P().gens[layer.key]), lb); return; }
        if (lb.hasAttribute("data-specedit")) { layer.specEdit = true; renderLayer(); return; }
        if (lb.hasAttribute("data-specclose")) { layer.specEdit = false; renderLayer(); return; }
        if (lb.dataset.specload) { captureSpecs(); var gs = P().gens[layer.key], sl = (gs.specs || []).find(function (x) { return x.id === lb.dataset.specload; }); if (sl) { layer.specs[sl.id] = sl.draft; renderLayer(); } return; }
        if (lb.dataset.specsave) {
          captureSpecs();
          lb.disabled = true;
          saveSpecs(P().gens[layer.key], lb.dataset.specsave).then(function () { if (layer) renderLayer(); }, function (e) { if (layer) { layer.err = "명세를 저장하지 못했습니다: " + (e && e.message || e); renderLayer(); } });
          return;
        }
      }
      if (lb && layer.kind === "sbfull" && lb.dataset.sbnav) {
        var sp = P(), snode = sp.model.ia.nodes.find(function (n) { return n.id === layer.sid; }), slist = systemScreens(sp, snode.systemCode), si = slist.findIndex(function (n) { return n.id === layer.sid; }) + Number(lb.dataset.sbnav);
        if (slist[si]) { layer.sid = slist[si].id; renderLayer(); }
        return;
      }
      if (target.closest(".layer") && layer.kind !== "sbfull" && !target.closest(".sb-canvas")) return;
    }
    var amb = target.closest && target.closest("[data-authmode]");
    if (amb) { authState.err = ""; showAuth(amb.dataset.authmode); return; }
    var alc = target.closest && target.closest("[data-ailogcopy]");
    if (alc && aiLogs && aiLogs.logs) { copyText(aiLogs.logs[Number(alc.dataset.ailogcopy)].raw || "", alc, "복사함"); return; }
    var mkb = target.closest && target.closest(".sbc-mk");
    if (mkb) { if (!mkb.classList.contains("drag") || ev.detail === 0) mkHighlight(mkb.closest(".sb-canvas").getAttribute("data-sbc"), Number(mkb.getAttribute("data-mk"))); return; }
    var zb = target.closest && target.closest("[data-sbzoom]");
    if (zb) {
      var zc = zb.closest(".sb-canvas").getAttribute("data-sbc"), zs = Number(zb.getAttribute("data-sbzoom")), zv = state.sbZoom[zc] || 1;
      state.sbZoom[zc] = zs === 0 ? 1 : Math.max(1, Math.min(4, Math.round((zv + zs * 0.5) * 10) / 10));
      layoutCanvases(zb.closest(".sb-canvas").parentNode);
      return;
    }
    var rsb = target.closest && target.closest("[data-sbreset]");
    if (rsb) {
      var rsid = rsb.getAttribute("data-sbreset"), rsbx = P().model.storyboard.screens.find(function (x) { return x.screenId === rsid; });
      var todo = rsbx.components.filter(function (c) { return c.marker; });
      rsb.disabled = true;
      todo.reduce(function (pr, c) { return pr.then(function () { return api("POST", "/api/projects/" + enc(P().model.project.code) + "/commands", { cmd: { op: "sb.marker", screenId: rsid, no: c.no, pos: null } }); }); }, Promise.resolve())
        .then(function () { return api("GET", "/api/projects/" + enc(P().model.project.code)); })
        .then(function (r) { setProject(r.project); rebuild(); render(); toast("번호 위치를 기본으로 되돌렸습니다"); }, function (e) { toast(e.message, "err"); render(); });
      return;
    }
    var sfb = target.closest && target.closest("[data-sbfull]");
    if (sfb) { openLayer({ kind: "sbfull", sid: sfb.getAttribute("data-sbfull") }); return; }
    var ieb = target.closest && target.closest("[data-iaedit]");
    if (ieb) { openIaEditor(ieb.getAttribute("data-iaedit"), ieb.getAttribute("data-iasel") || undefined); return; }
    var pxb = target.closest && target.closest("[data-protox]");
    if (pxb) { protoExport(pxb.getAttribute("data-protox"), pxb); return; }
    var pkb = target.closest && target.closest("[data-pkg]");
    if (pkb) { packageExport(pkb.getAttribute("data-pkg") || null, pkb); return; }
    var sbx = target.closest && target.closest("[data-sbx]");
    if (sbx) { var sxa = sbx.getAttribute("data-sbx").split("|"); sbExport(sxa[0], sxa[1], sxa[2] || null, sbx); return; }
    var dst = target.closest && target.closest("[data-dstab]");
    if (dst) { var dsa = dst.getAttribute("data-dstab").split("|"); state.dsTab[dsa[0]] = dsa[1]; render(); return; }
    var dpk = target.closest && target.closest("[data-dspick]");
    if (dpk) { var dpa = dpk.getAttribute("data-dspick").split("|"); (state.dsPick[dpa[0]] = state.dsPick[dpa[0]] || {})[dpa[1]] = dpk.checked; return; }
    var dpa2 = target.closest && target.closest("[data-dspickall]");
    if (dpa2) { var dpx = dpa2.getAttribute("data-dspickall").split("|"), dsd = selectedDesign(P(), dpx[0]), mp = state.dsPick[dpx[0]] = {}; if (dsd) pageElements(P(), dsd).forEach(function (x) { mp[x.id] = dpx[1] === "1"; }); render(); return; }
    var ddr = target.closest && target.closest("[data-dsdraft]");
    if (ddr) {
      var dda = ddr.getAttribute("data-dsdraft").split("|"), ddd = selectedDesign(P(), dda[0]);
      if (ddd) draftFromRender(dda[0], dda[1] === "*" ? pickedElements(P(), ddd).map(function (x) { return x.id; }) : [dda[1]]);
      return;
    }
    var dcs = target.closest && target.closest("[data-dscss]");
    if (dcs) {
      var dca = dcs.getAttribute("data-dscss").split("|"), cta = document.getElementById("ds-css"), cdd = selectedDesign(P(), dca[0]);
      if (!cta || !cdd) return;
      if (dca[1] === "save") { cmd({ op: "design.stage", systemCode: dca[0], stage: "style", css: cta.value, note: "추가 CSS" }).catch(function (e) { toast(e.message, "err"); }); return; }
      // 저장 전 미리보기: 다른 범위 클래스로 임시 적용
      var pv = Object.assign({}, cdd, { css: cta.value, systemCode: cdd.systemCode + "-pv" }), box = document.getElementById("ds-css-prev");
      if (box) { box.innerHTML = cssPreview(pv, wireCtx(P(), dca[0], null)); fitStages(box); toast("저장 전 미리보기입니다 — ‘CSS 저장’을 눌러야 화면설계서에 반영됩니다"); }
      return;
    }
    var frb = target.closest && target.closest("[data-frameedit]");
    if (frb) { var fa = frb.getAttribute("data-frameedit").split("|"); openFrameEditor(fa[0], fa[1] || null); return; }
    var fgx = target.closest && target.closest("[data-figx]");
    if (fgx) { var fg = fgx.getAttribute("data-figx").split("|"); figmaExport(fg[0], fg[1], fgx); return; }
    var feb = target.closest && target.closest("[data-flowedit]");
    if (feb) { openFlowEditor(feb.getAttribute("data-flowedit")); return; }
    var wkb = target.closest && target.closest("[data-work]");
    if (wkb) {
      wkb.disabled = true;
      cmd({ op: "work.set", key: wkb.getAttribute("data-work"), status: wkb.getAttribute("data-wst") }).catch(function (e) { toast(e.message, "err"); render(); });
      return;
    }
    var acb = target.closest && target.closest("[data-act]");
    if (acb && (ACTIONS[acb.dataset.act] || ACTIONS_LATE[acb.dataset.act])) { (ACTIONS[acb.dataset.act] || ACTIONS_LATE[acb.dataset.act])(acb.dataset.arg, acb); return; }
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
    var qb = target.closest && target.closest("[data-iaxlsx],[data-qaxlsx],[data-qago],[data-qadraft],[data-qaai],[data-iaview]");
    if (qb) {
      var qd = qb.dataset;
      if (qd.iaxlsx) iaXlsx();
      else if (qd.qaxlsx) qaXlsx(qd.qaxlsx);
      else if (qd.qago) { var qn = P().model.ia.nodes.find(function (x) { return x.id === qd.qago; }); if (qn) { state.dsSys[P().model.project.code] = qn.systemCode; state.qaSel = state.qaSel || {}; state.qaSel[qn.systemCode] = qn.id; } go({ view: "project", p: state.route.p, page: "qa" }); }
      else if (qd.qadraft) { qb.disabled = true; cmd({ op: "qa.draft", screenId: qd.qadraft }).catch(function (e) { toast(e.message, "err"); render(); }); }
      else if (qd.qaai) qaAi(qd.qaai, qb);
      else if (qd.iaview) { state.iaView = qd.iaview; try { localStorage.setItem("planning-ia-view", qd.iaview); } catch (e) { /* 무시 */ } if (qd.page) go({ view: "project", p: state.route.p, page: qd.page }); else render(); }
      return;
    }
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
    else if (d.qasel) { state.qaSel = state.qaSel || {}; state.qaSel[protoSys(P())] = d.qasel; render(); }
    else if (d.sbsel) { state.sbSel = state.sbSel || {}; state.sbSel[protoSys(P())] = d.sbsel; render(); }
    else if (d.pscreen) { state.proto[protoCtx().key] = d.pscreen; renderProto(); }
    else if (d.pstep) { var pcx = protoCtx(), ix = pcx.list.indexOf(state.proto[pcx.key]) + Number(d.pstep); if (pcx.list[ix]) { state.proto[pcx.key] = pcx.list[ix]; renderProto(); } }
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
    if (ev.target.getAttribute("id") === "fm" && layer && layer.kind === "form") { ev.preventDefault(); submitForm(ev.target); }
    else if (ev.target.id === "auth-form") { ev.preventDefault(); submitAuth(ev.target); }
  });
  document.addEventListener("toggle", function (ev) { if (layer && ev.target.classList && ev.target.classList.contains("gen-claude")) layer.pasteOpen = ev.target.open; }, true);
  document.addEventListener("focusin", function (ev) { var k = ev.target && ev.target.getAttribute && ev.target.getAttribute("data-cell"); if (k) state.cellFocus = k; });
  document.addEventListener("keydown", function (ev) { var t = ev.target; if (ev.key === "Enter" && t && t.classList && t.classList.contains("cell") && t.tagName === "INPUT") { ev.preventDefault(); t.blur(); } });
  document.addEventListener("change", function (ev) {
    var tg = ev.target;
    if (tg.hasAttribute && tg.hasAttribute("data-cell")) { cellSave(tg); return; }
    if (tg.hasAttribute && tg.hasAttribute("data-qares")) {
      var qa = tg.getAttribute("data-qares").split("|");
      tg.className = "qa-sel " + (tg.value || "none");
      quietCmd({ op: "qa.result", id: qa[0], device: qa[1], status: tg.value || null });
      return;
    }
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
