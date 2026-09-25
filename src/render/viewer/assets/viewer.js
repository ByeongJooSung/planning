(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("planning-data").textContent);

  var STATUS = { NOT_STARTED: "미착수", IN_DESIGN: "설계중", DESIGNED: "설계완료", REVIEWED: "검토완료", EXCLUDED: "제외" };
  var STATUS_ORDER = ["REVIEWED", "DESIGNED", "IN_DESIGN", "NOT_STARTED", "EXCLUDED"];
  var STAGE = { S0: "자료 수집", S0A: "기존 서비스 분석", S1: "기획안", S2: "정보구조도", S3: "다이어그램", S4: "스토리보드", S5: "프로토타입" };
  var STAGE_ORDER = ["S0", "S0A", "S1", "S2", "S3", "S4", "S5"];
  var STAGE_ST = { NOT_STARTED: "미시작", COLLECTING: "정보수집중", GATE_PASSED: "게이트 통과", DRAFTED: "초안", IN_REVIEW: "검토중", CONFIRMED: "확정", SKIPPED: "패스", NEEDS_UPDATE: "변경 필요" };
  var TYPE = { NEW: "신규 구축", EXISTING: "기존 서비스" };
  var SCOPE = { NEW_MENU: "신규 메뉴 추가", MODIFY: "기존 메뉴 수정", RENEWAL: "전면 개편" };
  var TEMPLATE = { GENERAL: "일반 양식", PUBLIC: "공공기관 제출 양식" };
  var KIND = { MENU: "메뉴", PAGE: "페이지", POPUP: "팝업", LAYER: "레이어", TAB: "탭", EXTERNAL: "외부" };
  var CHG = { NEW: "신규", CHANGED: "변경", DELETED: "삭제", KEPT: "유지" };
  var COLL = {
    project: "프로젝트 설정", systems: "시스템 구분", sources: "자료", requirements: "요구사항", tasks: "Task",
    stateSets: "공통 상태값", planSections: "기획안 섹션", features: "기능", iaNodes: "정보구조도", flows: "플로우",
    flowNodes: "플로우 노드", flowEdges: "플로우 연결", storyboardScreens: "스토리보드 화면",
    prototypeScreens: "프로토타입 화면", changeRequests: "변경 요청"
  };
  var TABS = [
    ["dash", "대시보드"], ["req", "요구사항·Task"], ["rtm", "요구사항 추적표"],
    ["ia", "정보구조도"], ["flow", "프로세스 플로우"], ["ver", "버전 이력"]
  ];

  var state = { p: 0, tab: "dash", rtmView: "matrix", off: {} };
  try {
    var saved = JSON.parse(localStorage.getItem("planning-viewer") || "{}");
    if (saved.tab) state.tab = saved.tab;
    if (saved.rtmView) state.rtmView = saved.rtmView;
    if (typeof saved.p === "number" && saved.p < DATA.projects.length) state.p = saved.p;
  } catch (e) { /* 저장소 없음 */ }
  var hash = (location.hash || "").slice(1);
  DATA.projects.forEach(function (p, i) { if (p.model.project.code === hash) state.p = i; });

  function persist() {
    try { localStorage.setItem("planning-viewer", JSON.stringify({ tab: state.tab, rtmView: state.rtmView, p: state.p })); } catch (e) { /* 무시 */ }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pill(st) { return '<span class="pill ' + st + '">' + (st === "REVIEWED" ? "✓ " : "") + STATUS[st] + "</span>"; }
  function P() { return DATA.projects[state.p]; }
  function sysColor(code) {
    var s = P().model.systems.find(function (x) { return x.code === code; });
    return s ? s.color : "#888888";
  }
  function sysName(code) {
    var s = P().model.systems.find(function (x) { return x.code === code; });
    return s ? s.name : code;
  }
  function sysChip(code) { return '<span class="sys"><i style="background:' + sysColor(code) + '"></i>' + esc(code) + "</span>"; }
  function sysOn(code) { return !state.off[P().model.project.code + ":" + code]; }
  function shortTask(id, reqId) { return id.indexOf(reqId + "-") === 0 ? id.slice(reqId.length + 1) : id; }
  function fmtDate(iso) { return iso ? iso.slice(0, 16).replace("T", " ") : ""; }

  // ── 셸 ─────────────────────────────────────────
  function renderShell() {
    var list = DATA.projects.map(function (p, i) {
      var pr = p.model.project;
      return '<button class="proj-btn" data-p="' + i + '" aria-current="' + (i === state.p) + '">' +
        '<span class="code">' + esc(pr.code) + " · v" + esc(pr.version) + '</span><span class="name">' + esc(pr.name) + "</span></button>";
    }).join("");
    var opts = DATA.projects.map(function (p, i) {
      return '<option value="' + i + '"' + (i === state.p ? " selected" : "") + ">" + esc(p.model.project.name) + "</option>";
    }).join("");
    document.getElementById("side").innerHTML =
      '<div class="brand"><b>Planning Studio</b><span>기획 산출물 뷰어</span></div>' +
      '<label class="side-label" for="proj-select">프로젝트</label>' +
      '<select class="proj-select" id="proj-select" aria-label="프로젝트">' + opts + "</select>" +
      '<div class="proj-list">' + list + "</div>" +
      '<div class="side-foot">생성 ' + esc(fmtDate(DATA.generatedAt)) + "<br><code>planning view</code></div>";
  }

  function renderMain() {
    var p = P(), pr = p.model.project, rtm = p.rtm;
    var counts = {
      req: rtm.rows.length,
      rtm: rtm.gaps.length + rtm.orphans.length,
      ia: p.model.ia.nodes.filter(function (n) { return n.kind !== "MENU"; }).length,
      flow: p.model.flows.length,
      ver: p.snapshots.length
    };
    var tags = [
      TYPE[pr.serviceType] + (pr.changeScope ? " · " + SCOPE[pr.changeScope] : ""),
      TEMPLATE[pr.submissionTemplate],
      pr.requirementIdMode === "ORIGINAL" ? "RFP 원본 ID" : "요구사항 ID 자동 부여"
    ];
    var html =
      '<header class="head"><div><h1>' + esc(pr.name) + '</h1><div class="meta">' +
      '<span class="tag mono">' + esc(pr.code) + "</span>" +
      tags.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") +
      p.model.systems.map(function (s) { return '<span class="tag"><i style="width:8px;height:8px;border-radius:2px;background:' + s.color + '"></i>' + esc(s.code + " " + s.name) + "</span>"; }).join("") +
      '</div></div><div class="ver">작업 버전 v' + esc(pr.version) + "</div></header>" +
      '<nav class="tabs" role="tablist">' + TABS.map(function (t) {
        var n = counts[t[0]];
        return '<button class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (state.tab === t[0]) + '">' + t[1] +
          (n != null ? '<span class="n">' + n + "</span>" : "") + "</button>";
      }).join("") + "</nav>" +
      '<div class="panel" role="tabpanel">' + renderTab() + "</div>";
    document.getElementById("main").innerHTML = html;
  }

  function renderTab() {
    switch (state.tab) {
      case "req": return renderReq();
      case "rtm": return renderRtm();
      case "ia": return renderIa();
      case "flow": return renderFlows();
      case "ver": return renderVer();
      default: return renderDash();
    }
  }

  // ── 대시보드 ───────────────────────────────────
  function renderDash() {
    var p = P(), pr = p.model.project, rtm = p.rtm, c = rtm.coverage;
    var stages = STAGE_ORDER.filter(function (s) { return pr.stages[s]; }).map(function (s) {
      var st = pr.stages[s];
      return '<div class="stage ' + st + '"><span class="sid">' + (s === "S0A" ? "S0-A" : s) + '</span><span class="sname">' + STAGE[s] +
        '</span><span class="sst">' + STAGE_ST[st] + "</span></div>";
    }).join("");

    var kpis =
      kpi(c.designedRate, "%", "설계완료율 (제외 Task 제외)") +
      kpi(c.requirements.total, "건", "요구사항 · 제외 " + c.requirements.EXCLUDED + "건") +
      kpi(c.tasks.total, "건", "시스템별 Task") +
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
    var stack = STATUS_ORDER.map(function (s) {
      return c.tasks[s] ? '<span style="width:' + (c.tasks[s] / total * 100) + "%;background:" + stColors[s] + '" title="' + STATUS[s] + " " + c.tasks[s] + '건"></span>' : "";
    }).join("");
    var legend = STATUS_ORDER.map(function (s) {
      return '<span><i style="background:' + stColors[s] + '"></i>' + STATUS[s] + " " + c.tasks[s] + "</span>";
    }).join("");

    var issues = rtm.gaps.map(function (g) {
      return '<div class="issue"><span class="st">' + (g.stage === "S0A" ? "S0-A" : g.stage) + "</span><span>" + esc(g.message) + "</span></div>";
    }).concat(rtm.orphans.map(function (o) {
      return '<div class="issue orphan"><span class="st">근거</span><span>' + esc(o.message) + "</span></div>";
    })).join("");

    return '<section class="section"><h2>단계 진행</h2><div class="box stages">' + stages + "</div></section>" +
      '<section class="kpis">' + kpis + "</section>" +
      '<div class="dash-grid">' +
      '<section class="section"><h2>시스템별 설계완료 <small>설계완료·검토완료 Task / 전체 Task</small></h2><div class="box bars">' + bars + axis +
      '<div style="display:flex;flex-direction:column;gap:8px;padding-top:6px;border-top:1px solid var(--line)"><span class="hint">Task 상태 분포 (전체 ' + c.tasks.total + "건)</span>" +
      '<div class="stack">' + stack + '</div><div class="legend">' + legend + "</div></div></div></section>" +
      '<section class="section"><h2>확인할 항목 <small>누락 ' + rtm.gaps.length + " · 근거 없음 " + rtm.orphans.length + '</small></h2><div class="box issues">' +
      (issues || '<div class="empty">누락이나 근거 없는 산출물이 없습니다.</div>') + "</div></section></div>";
  }
  function kpi(v, unit, label, alert) {
    return '<div class="box kpi' + (alert ? " alert" : "") + '"><span class="v">' + v + "<small>" + unit + '</small></span><span class="l">' + esc(label) + "</span></div>";
  }

  // ── 요구사항·Task ───────────────────────────────
  function renderReq() {
    var p = P(), m = p.model;
    var taskMap = {};
    m.requirements.forEach(function (r) { r.tasks.forEach(function (t) { taskMap[t.id] = t; }); });
    var rows = p.rtm.rows.map(function (row) {
      var req = m.requirements.find(function (r) { return r.id === row.requirementId; });
      var steps = row.tasks.map(function (t) {
        var raw = taskMap[t.taskId] || {};
        var tr = raw.transition ? "<code>" + esc(raw.transition.from || "") + "</code> → <code>" + esc(raw.transition.to) + "</code>" : "";
        var after = raw.after && raw.after.length ? "선행 " + raw.after.map(function (a) { return shortTask(a, row.requirementId); }).join(", ") : "";
        var sub = [tr, after, t.screenless ? "화면 없음" : (t.screens.length ? t.screens.join(", ") : "")].filter(Boolean).join(" · ");
        return '<div class="step" style="--sys:' + sysColor(t.systemCode) + '"><span class="tid">' + esc(shortTask(t.taskId, row.requirementId)) + "</span>" +
          sysChip(t.systemCode) + '<span class="act"><span class="who">' + esc(t.actor) + "</span><b>" + esc(t.action) + "</b>" +
          (sub ? '<span class="tr">' + sub + "</span>" : "") + "</span>" + pill(t.status) + "</div>";
      }).join("");
      var sub = [];
      if (row.originalId && row.originalId !== row.requirementId) sub.push("원본 " + esc(row.originalId));
      sub.push(esc(req.type) + " · " + esc(req.priority));
      if (row.sources.length) sub.push("출처 " + esc(row.sources.join(", ")));
      if (row.crIds.length) sub.push("변경 요청 " + esc(row.crIds.join(", ")));
      return '<article class="box req"><div class="req-head"><span class="req-id">' + esc(row.requirementId) + '</span><span class="req-title">' + esc(row.title) + "</span>" + pill(row.status) + "</div>" +
        '<div class="req-sub">' + sub.map(function (s) { return "<span>" + s + "</span>"; }).join("") + "</div>" +
        (req.description ? '<p class="req-desc" style="margin:0">' + esc(req.description) + "</p>" : "") +
        (row.status === "EXCLUDED" ? '<div class="hint">제외 사유: ' + esc(row.excludeReason) + "</div>" :
          steps ? '<div class="chain">' + steps + "</div>" : '<div class="notask">시스템별 Task가 아직 없습니다. <code>planning task add ' + esc(row.requirementId) + " --system …</code></div>") +
        "</article>";
    }).join("");
    return '<section class="section"><h2>요구사항과 시스템별 Task <small>Task는 처리 순서대로, 선을 따라 시스템을 넘나듭니다</small></h2>' + rows + "</section>";
  }

  // ── 추적표 ─────────────────────────────────────
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
      '<p class="hint" style="margin:0">CSV·JSON 파일: <code>planning rtm --write</code> → 프로젝트 <code>rtm/</code> 폴더</p></section>';
  }

  function rtmMatrix() {
    var p = P(), systems = p.model.systems.filter(function (s) { return sysOn(s.code); });
    var head = "<tr><th>요구사항</th>" + systems.map(function (s) { return "<th>" + sysChip(s.code) + " " + esc(s.name) + "</th>"; }).join("") + "<th>충족</th></tr>";
    var rows = p.rtm.rows.map(function (r) {
      var cells = systems.map(function (s) {
        var c = p.rtm.matrix[r.requirementId][s.code];
        if (!c || !c.taskIds.length) return '<td><span class="dash">—</span></td>';
        var scr = c.screens.length ? '<span class="s">' + c.screens.map(esc).join("<br>") + "</span>" :
          '<span class="s' + (c.screenless ? "" : " none") + '">' + (c.screenless ? "화면 없음" : "화면 미연결") + "</span>";
        return '<td><div class="cell"><span class="t">' + c.taskIds.map(function (t) { return shortTask(t, r.requirementId); }).join(", ") + "</span>" + scr + "<span>" + pill(c.status) + "</span></div></td>";
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
        return "<tr>" + (i === 0 ? reqCell : "") + '<td class="id">' + esc(shortTask(t.taskId, r.requirementId)) + "</td><td>" + sysChip(t.systemCode) + "</td><td>" +
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
        '<span class="chg ' + (node.change || "NEW") + '">' + CHG[node.change || "NEW"] + "</span></td><td class=\"id\">" +
        (e.requirementIds.length ? e.requirementIds.map(esc).join("<br>") : orphan ? '<span style="color:var(--crit)">요구사항 없음</span>' : '<span class="dash">—</span>') +
        '</td><td class="id">' + (e.taskIds.map(esc).join("<br>") || '<span class="dash">—</span>') + "</td></tr>";
    }).join("");
    return "<table><thead><tr><th>화면 ID</th><th>시스템</th><th>화면명</th><th>구분</th><th>요구사항</th><th>Task</th></tr></thead><tbody>" +
      (rows || '<tr><td colspan="6" class="empty">등록된 화면이 없습니다.</td></tr>') + "</tbody></table>";
  }

  // ── 정보구조도 ─────────────────────────────────
  function renderIa() {
    var p = P(), m = p.model;
    var skipped = m.project.stages.S2 === "SKIPPED";
    var cols = m.systems.filter(function (s) { return sysOn(s.code); }).map(function (s) {
      var nodes = m.ia.nodes.filter(function (n) { return n.systemCode === s.code; });
      if (!s.hasScreens) return '<div class="box ia-col"><h3><i style="background:' + s.color + '"></i>' + esc(s.name) + '<span>' + esc(s.code) + '</span></h3><div class="empty">화면 없는 시스템 (프로세스 플로우 레인으로만 표시)</div></div>';
      var ids = {};
      nodes.forEach(function (n) { ids[n.id] = true; });
      function children(pid) {
        return nodes.filter(function (n) { return (n.parentId && ids[n.parentId] ? n.parentId : null) === pid; });
      }
      function li(n) {
        var kids = children(n.id);
        var tk = n.kind === "MENU" ? "" : n.taskIds.length ? '<span class="tk">' + n.taskIds.map(esc).join(", ") + "</span>" :
          n.change === "KEPT" ? "" : '<span class="tk none">연결된 요구사항 없음</span>';
        return '<li><div class="node ' + n.kind + '"><div class="top">' + (n.kind === "MENU" ? "" : '<span class="sid">' + esc(n.id) + "</span>") +
          '<span class="nm">' + esc(n.name) + "</span>" + (n.kind !== "MENU" && n.kind !== "PAGE" ? '<span class="kind">' + KIND[n.kind] + "</span>" : "") +
          (n.loginRequired ? '<span class="kind">로그인</span>' : "") + '<span class="chg ' + n.change + '">' + CHG[n.change] + "</span></div>" + tk +
          (n.changeReason ? '<span class="tk">' + esc(n.changeReason) + "</span>" : "") + "</div>" +
          (kids.length ? "<ul>" + kids.map(li).join("") + "</ul>" : "") + "</li>";
      }
      var roots = children(null);
      var screens = nodes.filter(function (n) { return n.kind !== "MENU"; }).length;
      return '<div class="box ia-col"><h3><i style="background:' + s.color + '"></i>' + esc(s.name) + "<span>" + esc(s.code) + " · 화면 " + screens + "</span></h3>" +
        (roots.length ? '<ul class="tree">' + roots.map(li).join("") + "</ul>" : '<div class="empty">등록된 화면이 없습니다.</div>') + "</div>";
    }).join("");
    return '<section class="section"><div class="toolbar"><h2 style="font-size:15px">시스템별 메뉴·화면</h2>' + sysFilters() + "</div>" +
      (skipped ? '<p class="hint" style="margin:0">기존 메뉴 수정(MODIFY) 프로젝트라 정보구조도 단계는 패스했습니다. 영향받는 기존 화면만 표시합니다.</p>' : "") +
      '<div class="ia-cols">' + cols + "</div></section>";
  }

  // ── 프로세스 플로우 ─────────────────────────────
  function renderFlows() {
    var flows = P().model.flows;
    if (!flows.length) return '<div class="box empty">아직 작성된 플로우가 없습니다. 다이어그램 단계(S3)에서 만듭니다.</div>';
    return flows.map(function (f) {
      return '<section class="section"><h2>' + esc(f.title) + " <small>" + esc(f.id) + " · " + (f.kind === "PROCESS" ? "프로세스 플로우" : "사용자 플로우") +
        '</small></h2><div class="box flow-box">' + flowSvg(f) + "</div>" +
        '<p class="hint" style="margin:0">점선 화살표는 되돌아가는 흐름(반려·보완)입니다. 노드 아래 파란 글자는 화면 ID, 회색은 연결된 Task입니다.</p></section>';
    }).join("");
  }

  function flowSvg(f) {
    var LW = 118, CW = 146, LH = 112, NW = 120, NH = 58, PAD = 12;
    var lanes = f.lanes.length ? f.lanes : [{ id: "_", label: "" }];
    var laneIdx = {};
    lanes.forEach(function (l, i) { laneIdx[l.id] = i; });
    var out = {}, inc = {};
    f.nodes.forEach(function (n) { out[n.id] = []; inc[n.id] = 0; });
    f.edges.forEach(function (e) { if (out[e.from]) out[e.from].push(e); if (e.to in inc) inc[e.to]++; });
    // DFS로 되돌아가는 연결(back edge)을 찾는다
    var mark = {}, back = {};
    function dfs(id) {
      mark[id] = 1;
      out[id].forEach(function (e) {
        if (mark[e.to] === 1) back[e.from + ">" + e.to] = true;
        else if (!mark[e.to]) dfs(e.to);
      });
      mark[id] = 2;
    }
    f.nodes.forEach(function (n) { if (!inc[n.id] && !mark[n.id]) dfs(n.id); });
    f.nodes.forEach(function (n) { if (!mark[n.id]) dfs(n.id); });
    // 열 = 앞으로 가는 연결 기준 가장 긴 경로
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
    function pos(n) {
      var r = laneIdx[n.lane] || 0;
      return { x: LW + col[n.id] * CW + (CW - NW) / 2, y: r * LH + (LH - NH) / 2, r: r };
    }
    var P0 = {};
    f.nodes.forEach(function (n) { P0[n.id] = pos(n); });

    var s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(f.title) + '">' +
      '<defs><marker id="ah-' + f.id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow" d="M0,0 L10,5 L0,10 z"/></marker>' +
      '<marker id="ahb-' + f.id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow back" d="M0,0 L10,5 L0,10 z"/></marker></defs>';
    lanes.forEach(function (l, i) {
      var color = l.systemCode ? sysColor(l.systemCode) : "#888888";
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
      var a = P0[e.from], b = P0[e.to];
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
      s += '<path class="edge' + (isBack ? " back" : "") + '" d="' + d + '" marker-end="url(#' + (isBack ? "ahb-" : "ah-") + f.id + ')"/>';
      if (e.label) s += '<text class="elabel" x="' + lx + '" y="' + ly + '" text-anchor="' + (a.r === b.r ? "middle" : "start") + '">' + esc(e.label) + "</text>";
    });

    f.nodes.forEach(function (n) {
      var p = P0[n.id], cx = p.x + NW / 2, cy = p.y + NH / 2;
      var shape;
      if (n.shape === "DECISION") shape = '<polygon class="shape DECISION" points="' + cx + "," + (p.y - 4) + " " + (p.x + NW + 4) + "," + cy + " " + cx + "," + (p.y + NH + 4) + " " + (p.x - 4) + "," + cy + '"/>';
      else if (n.shape === "TERMINATOR") shape = '<rect class="shape TERMINATOR" x="' + (p.x + 20) + '" y="' + (p.y + 12) + '" width="' + (NW - 40) + '" height="' + (NH - 24) + '" rx="17"/>';
      else if (n.shape === "IO") shape = '<polygon class="shape IO" points="' + (p.x + 12) + "," + p.y + " " + (p.x + NW) + "," + p.y + " " + (p.x + NW - 12) + "," + (p.y + NH) + " " + p.x + "," + (p.y + NH) + '"/>';
      else if (n.shape === "DOCUMENT") shape = '<path class="shape DOCUMENT" d="M' + p.x + "," + p.y + " H" + (p.x + NW) + " V" + (p.y + NH - 8) + " Q" + (p.x + NW * 0.75) + "," + (p.y + NH - 18) + " " + cx + "," + (p.y + NH - 8) + " T" + p.x + "," + (p.y + NH - 8) + ' Z"/>';
      else shape = '<rect class="shape PROCESS" x="' + p.x + '" y="' + p.y + '" width="' + NW + '" height="' + NH + '" rx="5"/>';
      s += "<g>" + shape;
      var lines = wrap(n.label, n.shape === "DECISION" ? 5 : 9);
      var baseY = cy - (lines.length - 1) * 7 + (n.screenId ? -5 : 4);
      lines.forEach(function (w, j) { s += '<text class="nlabel" x="' + cx + '" y="' + (baseY + j * 14) + '" text-anchor="middle">' + esc(w) + "</text>"; });
      if (n.screenId) s += '<text class="nsid" x="' + cx + '" y="' + (p.y + NH - 8) + '" text-anchor="middle">' + esc(n.screenId) + "</text>";
      if (n.taskIds.length) s += '<text class="ntask" x="' + cx + '" y="' + (p.y - (n.shape === "DECISION" ? 8 : 4)) + '" text-anchor="middle">' + esc(n.taskIds.join(", ")) + "</text>";
      s += "</g>";
    });
    return s + "</svg>";
  }

  function wrap(text, max) {
    var words = String(text || "").split(" "), lines = [], cur = "";
    words.forEach(function (w) {
      if (cur && (cur + " " + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
    });
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }

  // ── 버전 ───────────────────────────────────────
  function renderVer() {
    var p = P(), pr = p.model.project;
    var snaps = p.snapshots.map(function (s) {
      return '<div class="box snap"><span class="v">v' + esc(s.version) + '</span><span class="d">' + esc(fmtDate(s.takenAt)) + "</span><span>" + esc(s.note || "—") + "</span></div>";
    }).join("") + '<div class="box snap current"><span class="v">v' + esc(pr.version) + ' (작업 중)</span><span class="d">마지막 저장 ' + esc(fmtDate(pr.updatedAt)) + "</span><span>현재 모델</span></div>";
    var diff = "";
    if (!p.diff) diff = '<div class="box empty">스냅샷이 없습니다. <code>planning snapshot --note "…"</code>으로 기준 버전을 고정하면 이후 변경 사항을 비교할 수 있습니다.</div>';
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
  function render() { renderShell(); renderMain(); }
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.p) { state.p = Number(t.dataset.p); persist(); render(); window.scrollTo(0, 0); }
    else if (t.dataset.tab) { state.tab = t.dataset.tab; persist(); renderMain(); }
    else if (t.dataset.view) { state.rtmView = t.dataset.view; persist(); renderMain(); }
    else if (t.dataset.sys) {
      var key = P().model.project.code + ":" + t.dataset.sys;
      state.off[key] = !state.off[key];
      renderMain();
    }
  });
  document.addEventListener("change", function (ev) {
    if (ev.target.id === "proj-select") { state.p = Number(ev.target.value); persist(); render(); }
  });
  render();
})();
