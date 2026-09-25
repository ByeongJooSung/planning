import type { Model } from "./schema.js";

export interface Issue {
  level: "error" | "warning";
  code: string;
  message: string;
  ref?: string;
}

/** 모델 내부 참조 무결성 검사. 저장 전과 CLI `check`에서 사용한다. */
export function validateModel(m: Model): Issue[] {
  const issues: Issue[] = [];
  const err = (code: string, message: string, ref?: string) => issues.push({ level: "error", code, message, ref });
  const warn = (code: string, message: string, ref?: string) => issues.push({ level: "warning", code, message, ref });

  const systemCodes = new Set<string>();
  for (const s of m.systems) {
    if (systemCodes.has(s.code)) err("DUP_SYSTEM", `시스템 코드 중복: ${s.code}`, s.code);
    systemCodes.add(s.code);
  }

  const reqIds = new Set<string>();
  const taskIds = new Set<string>();
  for (const r of m.requirements) {
    if (reqIds.has(r.id)) err("DUP_REQ", `요구사항 ID 중복: ${r.id}`, r.id);
    reqIds.add(r.id);
    if (r.status === "EXCLUDED" && !r.excludeReason) err("EXCLUDE_REASON", `${r.id} 제외 사유가 없습니다`, r.id);
    for (const t of r.tasks) {
      if (taskIds.has(t.id)) err("DUP_TASK", `Task ID 중복: ${t.id}`, t.id);
      taskIds.add(t.id);
      if (!t.id.startsWith(`${r.id}-T`)) err("TASK_ID_FORMAT", `${t.id}는 ${r.id}-Tnn 형식이어야 합니다`, t.id);
      if (!systemCodes.has(t.systemCode)) err("UNKNOWN_SYSTEM", `${t.id}의 시스템 ${t.systemCode}가 등록되지 않았습니다`, t.id);
    }
  }

  const stateSets = new Map(m.policies.stateSets.map((s) => [s.id, new Set(s.values)]));
  for (const r of m.requirements) {
    for (const t of r.tasks) {
      for (const a of t.after) {
        if (!taskIds.has(a)) err("UNKNOWN_TASK", `${t.id}의 선행 Task ${a}가 없습니다`, t.id);
        if (a === t.id) err("SELF_AFTER", `${t.id}가 자기 자신을 선행으로 지정했습니다`, t.id);
      }
      const tr = t.transition;
      if (tr?.stateSetId) {
        const values = stateSets.get(tr.stateSetId);
        if (!values) err("UNKNOWN_STATESET", `${t.id}의 상태값 세트 ${tr.stateSetId}가 없습니다`, t.id);
        else
          for (const v of [tr.from, tr.to])
            if (v && !values.has(v)) err("UNKNOWN_STATE", `${t.id}의 상태값 "${v}"가 ${tr.stateSetId}에 없습니다`, t.id);
      }
    }
  }
  const cycle = findTaskCycle(m);
  if (cycle) err("TASK_CYCLE", `Task 선후행이 순환합니다: ${cycle.join(" → ")}`, cycle[0]);

  const checkTaskRefs = (owner: string, ids: string[]) => {
    for (const id of ids) if (!taskIds.has(id)) err("UNKNOWN_TASK", `${owner}가 없는 Task ${id}를 참조합니다`, owner);
  };
  const checkSystem = (owner: string, code: string | undefined) => {
    if (code && !systemCodes.has(code)) err("UNKNOWN_SYSTEM", `${owner}의 시스템 ${code}가 등록되지 않았습니다`, owner);
  };

  for (const s of m.plan.sections) {
    checkTaskRefs(`기획안 ${s.id}`, s.taskIds);
    for (const id of s.requirementIds) if (!reqIds.has(id)) err("UNKNOWN_REQ", `기획안 ${s.id}가 없는 요구사항 ${id}를 참조합니다`, s.id);
  }
  for (const f of m.plan.features) {
    checkTaskRefs(`기능 ${f.id}`, f.taskIds);
    checkSystem(`기능 ${f.id}`, f.systemCode);
  }

  const iaIds = new Set<string>();
  for (const n of m.ia.nodes) {
    if (iaIds.has(n.id)) err("DUP_SCREEN", `IA 노드 ID 중복: ${n.id}`, n.id);
    iaIds.add(n.id);
    if (m.ia.retiredIds.includes(n.id)) err("RETIRED_ID", `폐기된 화면 ID를 다시 사용했습니다: ${n.id}`, n.id);
  }
  for (const n of m.ia.nodes) {
    checkTaskRefs(`IA ${n.id}`, n.taskIds);
    checkSystem(`IA ${n.id}`, n.systemCode);
    if (n.parentId && !iaIds.has(n.parentId)) err("UNKNOWN_PARENT", `IA ${n.id}의 상위 노드 ${n.parentId}가 없습니다`, n.id);
    const sys = m.systems.find((s) => s.code === n.systemCode);
    if (sys && !sys.hasScreens && n.kind !== "MENU") warn("SCREENLESS_SYSTEM", `화면이 없는 시스템 ${sys.code}에 화면 ${n.id}가 있습니다`, n.id);
  }

  for (const f of m.flows) {
    checkSystem(`플로우 ${f.id}`, f.systemCode);
    const nodeIds = new Set(f.nodes.map((n) => n.id));
    const laneIds = new Set(f.lanes.map((l) => l.id));
    for (const n of f.nodes) {
      checkTaskRefs(`플로우 ${f.id}/${n.id}`, n.taskIds);
      if (n.screenId && !iaIds.has(n.screenId)) err("UNKNOWN_SCREEN", `플로우 ${f.id}/${n.id}의 화면 ${n.screenId}가 IA에 없습니다`, f.id);
      if (n.lane && !laneIds.has(n.lane)) err("UNKNOWN_LANE", `플로우 ${f.id}/${n.id}의 레인 ${n.lane}가 없습니다`, f.id);
    }
    for (const e of f.edges)
      if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) err("DANGLING_EDGE", `플로우 ${f.id}의 연결 ${e.from}→${e.to}가 없는 노드를 가리킵니다`, f.id);
  }

  for (const s of m.storyboard.screens) {
    checkTaskRefs(`스토리보드 ${s.screenId}`, s.taskIds);
    if (!iaIds.has(s.screenId)) err("UNKNOWN_SCREEN", `스토리보드 화면 ${s.screenId}가 IA에 없습니다`, s.screenId);
  }
  for (const p of m.prototype.screens)
    if (!iaIds.has(p.screenId)) err("UNKNOWN_SCREEN", `프로토타입 화면 ${p.screenId}가 IA에 없습니다`, p.screenId);

  return issues;
}

function findTaskCycle(m: Model): string[] | null {
  const after = new Map<string, string[]>();
  for (const r of m.requirements) for (const t of r.tasks) after.set(t.id, t.after);
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    const s = state.get(id);
    if (s === 2) return null;
    if (s === 1) return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 1);
    stack.push(id);
    for (const a of after.get(id) ?? []) {
      if (!after.has(a)) continue;
      const c = visit(a);
      if (c) return c;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const id of after.keys()) {
    const c = visit(id);
    if (c) return c;
  }
  return null;
}
