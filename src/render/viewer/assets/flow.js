/* 프로세스 플로우 SVG (스윔레인) + 시스템별 플로우 추출 */
(function () {
  "use strict";
  /**
   * opts.color(systemCode) → 레인 색 · opts.highlight: Task ID 배열 — 해당 노드를 강조하고 나머지는 흐리게
   * 배치·그리기는 FlowLayout(flowlayout.js)이 한다: 글자 수에 맞는 도형 크기, 직각 연결선, 되돌아가는 흐름 표시
   */
  function svg(f, opts) {
    return FlowLayout.svg(f, Object.assign({ mode: "screen" }, opts || {}));
  }

  /**
   * 한 시스템의 레인만 남긴 플로우. 다른 시스템으로 나가고 들어오는 연결은 연결 노드(CONNECTOR)로 바꾼다.
   */
  function forSystem(f, systemCode) {
    var keepLanes = f.lanes.filter(function (l) { return l.systemCode === systemCode; });
    if (!keepLanes.length) return null;
    var keep = {};
    keepLanes.forEach(function (l) { keep[l.id] = true; });
    var laneOf = {};
    f.lanes.forEach(function (l) { laneOf[l.id] = l; });
    var nodes = f.nodes.filter(function (n) { return keep[n.lane]; }).map(function (n) { return n; });
    var ids = {};
    nodes.forEach(function (n) { ids[n.id] = true; });
    var byId = {};
    f.nodes.forEach(function (n) { byId[n.id] = n; });
    var edges = [], extra = [];
    var outLane = { id: "L-OTHER", label: "다른 시스템" };
    f.edges.forEach(function (e, i) {
      var a = ids[e.from], b = ids[e.to];
      if (a && b) edges.push(e);
      else if (a || b) {
        var other = byId[a ? e.to : e.from];
        if (!other) return;
        var lane = laneOf[other.lane];
        var cid = "c" + i;
        extra.push({ id: cid, shape: "CONNECTOR", label: (a ? "→ " : "← ") + (lane ? lane.label.split(" · ")[0] : "") + ": " + other.label, lane: "L-OTHER", taskIds: [], change: "KEPT" });
        edges.push(a ? { from: e.from, to: cid, label: e.label } : { from: cid, to: e.to, label: e.label });
      }
    });
    return { id: f.id + "-" + systemCode, kind: f.kind, title: f.title, lanes: keepLanes.concat(extra.length ? [outLane] : []), nodes: nodes.concat(extra), edges: edges };
  }

  window.Flow = { svg: svg, forSystem: forSystem };
})();
