import type { Project, System } from "./schema.js";

export interface ScreenIdInput {
  system: System;
  /** depth별 메뉴 약어 (예: ["INF", "REG"]) */
  depthCodes: string[];
  /** 같은 메뉴 아래 몇 번째 화면인지 (0부터) */
  index: number;
}

/**
 * 프로젝트 화면 ID 규칙으로 화면 ID를 만든다.
 * 기본 규칙 "{system}_{d1}_{d2}_{seq}" → CVL_INF_REG_010
 * 쓰이지 않은 depth 토큰은 앞뒤 구분자와 함께 제거한다.
 */
export function formatScreenId(project: Project, input: ScreenIdInput): string {
  const rule = project.screenIdRule;
  const seq = String(rule.seqStart + input.index * rule.seqStep).padStart(rule.seqDigits, "0");
  const values: Record<string, string> = {
    system: input.system.screenIdPrefix ?? input.system.code,
    seq,
  };
  input.depthCodes.forEach((c, i) => (values[`d${i + 1}`] = c.toUpperCase()));

  let out = rule.pattern.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "\u0000");
  out = out.replace(/[_-]?\u0000/g, "").replace(/^\u0000[_-]?/, "");
  return out;
}

/** 부모 화면 ID에 팝업 접미사를 붙인다. popupSuffix "_P{nn}" → CVL_INF_REG_010_P01 */
export function formatPopupId(project: Project, parentScreenId: string, index: number): string {
  const nn = String(index + 1).padStart(2, "0");
  return parentScreenId + project.screenIdRule.popupSuffix.replace("{nn}", nn);
}

/** 이미 쓰였거나 폐기된 ID와 겹치지 않는지 확인 */
export function isScreenIdAvailable(id: string, used: Iterable<string>, retired: Iterable<string>): boolean {
  for (const u of used) if (u === id) return false;
  for (const r of retired) if (r === id) return false;
  return true;
}
