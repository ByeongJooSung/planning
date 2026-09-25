import type { Requirement, ChangeRequest, Source } from "./schema.js";

function nextSerial(ids: string[], prefix: string, digits = 3): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const id of ids) {
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(digits, "0")}`;
}

/** 삭제된 요구사항 ID도 목록에 남아 있으므로 재사용되지 않는다. */
export const nextRequirementId = (reqs: Requirement[]) => nextSerial(reqs.map((r) => r.id), "REQ");
export const nextSourceId = (sources: Source[]) => nextSerial(sources.map((s) => s.id), "SRC");
export const nextChangeRequestId = (crs: ChangeRequest[]) => nextSerial(crs.map((c) => c.id), "CR");

export function nextTaskId(req: Requirement): string {
  const re = new RegExp(`^${escapeRe(req.id)}-T(\\d+)$`);
  let max = 0;
  for (const t of req.tasks) {
    const m = re.exec(t.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${req.id}-T${String(max + 1).padStart(2, "0")}`;
}

/** "T01"처럼 짧게 쓴 Task 참조를 요구사항 기준 전체 ID로 바꾼다. */
export function resolveTaskRef(req: Requirement, ref: string): string {
  return /^T\d+$/.test(ref) ? `${req.id}-${ref}` : ref;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
