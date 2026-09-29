/**
 * 정보구조도·화면 연결 편집 (캔버스·수동 연결에서 쓴다)
 *  - 새 화면 ID는 프로젝트 화면 ID 규칙으로 만든다 (상위 메뉴 약어 → d1·d2, 같은 메뉴 아래 순번)
 *  - 화면 ↔ Task 연결은 정보구조도 노드와 화면설계서 양쪽에 같게 맞춘다 (한 Task에 여러 화면, 한 화면에 여러 Task)
 */
import type { IANode, Model } from "../model/schema.js";
import { formatPopupId, formatScreenId } from "../model/screen-id.js";

const SCREEN_KINDS = ["PAGE", "POPUP", "LAYER", "TAB", "EXTERNAL"];

/** 메뉴 노드 ID(M-CVL-INF)의 마지막 토큰을 화면 ID 약어로 쓴다 */
function menuCode(n: IANode): string {
  const last = n.id.split(/[-_]/).pop() ?? "";
  const code = last.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  return code && !/^N\d+$/.test(code) ? code : "GEN";
}

export function nextScreenId(m: Model, nodes: IANode[], systemCode: string, parentId: string | null, kind: string, taken: Set<string>): string {
  const sys = m.systems.find((s) => s.code === systemCode);
  if (!sys) throw new Error(`등록되지 않은 시스템입니다: ${systemCode}`);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const retired = new Set(m.ia.retiredIds);
  const free = (id: string) => !taken.has(id) && !retired.has(id);
  const parent = parentId ? byId.get(parentId) : undefined;
  if ((kind === "POPUP" || kind === "LAYER") && parent && parent.kind !== "MENU") {
    for (let i = 0; i < 99; i++) {
      const id = formatPopupId(m.project, parent.id, i);
      if (free(id)) return id;
    }
  }
  // 위로 올라가며 메뉴 약어를 모은다 (가까운 메뉴가 뒤)
  const codes: string[] = [];
  let cur = parent;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    if (cur.kind === "MENU") codes.unshift(menuCode(cur));
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  const depth = codes.length ? codes.slice(0, 3) : ["GEN"];
  for (let i = 0; i < 500; i++) {
    const id = formatScreenId(m.project, { system: sys, depthCodes: depth, index: i });
    if (free(id)) return id;
  }
  throw new Error("새 화면 ID를 만들지 못했습니다");
}

export function nextMenuId(m: Model, systemCode: string, taken: Set<string>): string {
  const sys = m.systems.find((s) => s.code === systemCode)!;
  const prefix = sys.screenIdPrefix ?? sys.code;
  for (let i = 1; ; i++) {
    const id = `M-${prefix}-N${i}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * 캔버스에서 편집한 한 시스템의 정보구조도 노드를 정리한다.
 * id가 비었거나 "new:"로 시작하면 새 ID를 붙이고, 그 ID를 가리키는 parentId도 바꾼다.
 */
export function assignIaIds(m: Model, systemCode: string, raw: unknown[]): IANode[] {
  const others = m.ia.nodes.filter((n) => n.systemCode !== systemCode);
  const taken = new Set(others.map((n) => n.id));
  const list = raw.map((x) => ({ ...(x as Record<string, unknown>) })) as unknown as (IANode & { id: string })[];
  for (const n of list) if (n.id && !/^new:/.test(n.id)) taken.add(n.id);
  const remap = new Map<string, string>();
  // 부모가 먼저 ID를 받도록 깊이 순서로
  const pending = list.filter((n) => !n.id || /^new:/.test(n.id));
  const depthOf = (n: IANode, seen = new Set<string>()): number => {
    if (!n.parentId || seen.has(n.id)) return 0;
    seen.add(n.id);
    const p = list.find((x) => x.id === n.parentId);
    return p ? depthOf(p, seen) + 1 : 0;
  };
  pending.sort((a, b) => depthOf(a) - depthOf(b));
  for (const n of pending) {
    const tmp = n.id;
    if (n.parentId && remap.has(n.parentId)) n.parentId = remap.get(n.parentId)!;
    const ctx = list.map((x) => ({ ...x, id: remap.get(x.id) ?? x.id, parentId: x.parentId && remap.has(x.parentId) ? remap.get(x.parentId)! : x.parentId })) as IANode[];
    const id = n.kind === "MENU" ? nextMenuId(m, systemCode, taken) : nextScreenId(m, [...others, ...ctx], systemCode, n.parentId ?? null, n.kind, taken);
    taken.add(id);
    if (tmp) remap.set(tmp, id);
    n.id = id;
  }
  for (const n of list) if (n.parentId && remap.has(n.parentId)) n.parentId = remap.get(n.parentId)!;
  return list;
}

/** 화면 하나에 연결할 Task 목록을 정한다 (정보구조도 노드 + 화면설계서) */
export function setScreenTasks(m: Model, screenId: string, taskIds: string[]) {
  const node = m.ia.nodes.find((n) => n.id === screenId);
  if (!node || node.kind === "MENU") throw new Error(`정보구조도에 없는 화면입니다: ${screenId}`);
  const known = new Set(m.requirements.flatMap((r) => r.tasks.map((t) => t.id)));
  const ids = [...new Set(taskIds.map((x) => String(x).trim()).filter(Boolean))];
  const bad = ids.filter((id) => !known.has(id));
  if (bad.length) throw new Error(`없는 Task입니다: ${bad.join(", ")}`);
  node.taskIds = ids;
  const sb = m.storyboard.screens.find((s) => s.screenId === screenId);
  if (sb) sb.taskIds = ids.slice();
}

/** Task 하나에 연결할 화면 목록을 정한다 — 목록에 없는 화면에서는 이 Task를 뗀다 */
export function setTaskScreens(m: Model, taskId: string, screenIds: string[]) {
  const task = m.requirements.flatMap((r) => r.tasks).find((t) => t.id === taskId);
  if (!task) throw new Error(`없는 Task입니다: ${taskId}`);
  const want = new Set(screenIds);
  for (const id of want) {
    const n = m.ia.nodes.find((x) => x.id === id);
    if (!n || n.kind === "MENU") throw new Error(`정보구조도에 없는 화면입니다: ${id}`);
  }
  for (const n of m.ia.nodes) {
    if (n.kind === "MENU") continue;
    const has = n.taskIds.includes(taskId);
    if (want.has(n.id) && !has) n.taskIds = [...n.taskIds, taskId];
    if (!want.has(n.id) && has) n.taskIds = n.taskIds.filter((x) => x !== taskId);
  }
  for (const s of m.storyboard.screens) {
    const has = s.taskIds.includes(taskId);
    if (want.has(s.screenId) && !has) s.taskIds = [...s.taskIds, taskId];
    if (!want.has(s.screenId) && has) s.taskIds = s.taskIds.filter((x) => x !== taskId);
  }
}

export function isScreenKind(k: string) {
  return SCREEN_KINDS.includes(k);
}
