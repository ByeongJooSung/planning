/**
 * 시스템별 디자인 컨셉 제안 (PRD v1.1 F3)
 * 시스템 성격(대국민 포털 / 신청 서비스 / 업무·관리자)에 맞는 추천 조합(프레임 × 톤)을 A·B·C… 로 낸다.
 * 사용자는 추천 조합을 바로 고르거나, 프레임 → 톤앤매너 → 세부 스타일을 직접 골라 조합한다 (library.ts).
 */
import type { DesignConcept, System } from "../model/schema.js";
import { recommendedConcepts, type SystemProfile } from "./library.js";

export type { SystemProfile };

export function profileOf(system: System): SystemProfile {
  const users = system.users.join(" ");
  if (system.channels.includes("ADMIN_WEB") || /관리자|심사자|운영|담당자/.test(users) || system.code === "ADM") return "admin";
  if (/국민|비회원|누구나|방문자/.test(users)) return "portal";
  if (/민원|회원|신청|고객/.test(users)) return "service";
  return "portal";
}

export function proposeConcepts(system: System): DesignConcept[] {
  return recommendedConcepts(profileOf(system));
}

/** AI가 일부 값만 돌려줘도 채울 수 있는 기준 컨셉 (같은 성격의 첫 추천 조합) */
export function baseConcept(system: System): DesignConcept {
  return recommendedConcepts(profileOf(system))[0]!;
}
