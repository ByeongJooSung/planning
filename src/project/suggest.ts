/**
 * 요구사항 → 시스템별 Task 자동 제안 (PRD F-SYS-02)
 *
 * 현재는 규칙 기반이다. 요구사항 제목·설명의 업무 동사(신청, 심사, 공개, 알림, 연계 …)를
 * 시스템 성격(신청 서비스 / 심사·관리 / 대국민 공개 / 외부 연계)에 대응시켜 처리 순서대로 Task를 만든다.
 * P1에서 참조자료 검색 결과를 근거로 LLM이 제안하도록 바꾸고, 이 규칙은 누락 점검(F-SYS-04)에 계속 쓴다.
 */
import { profileOf } from "../design/concepts.js";
import type { Model, Requirement, System } from "../model/schema.js";
import type { AddTaskInput } from "./ops.js";

export interface SuggestedTask extends AddTaskInput {
  key: string;
  reason: string;
}

interface Roles {
  applicant?: System;
  reviewer?: System;
  publicPortal?: System;
  external?: System;
}

function rolesOf(systems: System[]): Roles {
  const withScreens = systems.filter((s) => s.hasScreens);
  const byProfile = (p: string) => withScreens.find((s) => profileOf(s) === p);
  return {
    applicant: byProfile("service") ?? byProfile("portal"),
    reviewer: byProfile("admin"),
    publicPortal: byProfile("portal") ?? byProfile("service"),
    external: systems.find((s) => !s.hasScreens),
  };
}

const actorOf = (s: System, fallback: string) => (s.users[0] ?? fallback).replace(/\(.*\)/, "").trim();

const RULES = {
  apply: /(등록|신청|제출|접수|작성|업로드)/,
  review: /(심사|검토|승인|반려|결재|확인 후)/,
  decide: /(승인|반려|결재|허가|거부)/,
  publish: /(공개|게시|대국민|노출|열람)/,
  notify: /(알림|문자|메일|카카오|푸시|통지)/,
  external: /(연계|전송|연동|API|외부 기관|타 기관)/,
  view: /(조회|검색|확인|열람)/,
  manage: /(관리|수정|삭제|설정)/,
};

export function suggestTasks(m: Model, req: Requirement): SuggestedTask[] {
  const text = `${req.title} ${req.description}`;
  const r = rolesOf(m.systems);
  const has = (k: keyof typeof RULES) => RULES[k].exec(text)?.[1];
  const out: SuggestedTask[] = [];
  const add = (key: string, sys: System | undefined, actor: string, action: string, reason: string, after: string[] = [], extra: Partial<SuggestedTask> = {}) => {
    if (!sys) return;
    out.push({ key, systemCode: sys.code, actor, action, reason, after, ...extra });
  };

  const apply = has("apply");
  const review = has("review");
  const decide = has("decide");
  if (apply) add("apply", r.applicant, r.applicant ? actorOf(r.applicant, "사용자") : "", "자료 작성·등록 및 신청", `‘${apply}’ → ${r.applicant?.name}`);
  if (review && r.reviewer) {
    add("review", r.reviewer, actorOf(r.reviewer, "담당자"), "신청 목록 조회 및 내용 검토", `‘${review}’ → ${r.reviewer.name}`, apply ? ["apply"] : []);
    if (decide) add("decide", r.reviewer, actorOf(r.reviewer, "담당자"), "승인 또는 반려(사유 입력)", `‘${decide}’ → ${r.reviewer.name}`, ["review"]);
    const last = decide ? "decide" : "review";
    if (apply && r.applicant)
      add("result", r.applicant, actorOf(r.applicant, "사용자"), "처리 결과 확인, 반려 시 보완 후 재신청", "심사 후 신청인 결과 확인·보완 단계 (누락 점검 규칙)", [last]);
  }
  const publish = has("publish");
  const lastDecision = out.some((t) => t.key === "decide") ? "decide" : out.some((t) => t.key === "review") ? "review" : undefined;
  if (publish && r.publicPortal)
    add("publish", r.publicPortal, actorOf(r.publicPortal, "국민"), "공개 목록·상세 조회", `‘${publish}’ → ${r.publicPortal.name}`, lastDecision ? [lastDecision] : apply ? ["apply"] : []);
  const notify = has("notify");
  if (notify && (r.applicant ?? r.publicPortal)) {
    const s = (r.applicant ?? r.publicPortal)!;
    add("notify", s, "시스템", "처리 결과 알림 발송", `‘${notify}’ → 자동 발송`, lastDecision ? [lastDecision] : [], { noScreenReason: "자동 발송" });
  }
  const ext = has("external");
  if (ext && r.external)
    add("external", r.external, "시스템", `${r.external.name} 전송`, `‘${ext}’ → ${r.external.name}`, out.some((t) => t.key === "publish") ? ["publish"] : lastDecision ? [lastDecision] : []);

  if (!out.length) {
    const view = has("view");
    const manage = has("manage");
    if (manage && r.reviewer) add("manage", r.reviewer, actorOf(r.reviewer, "담당자"), `${req.title}`, `‘${manage}’ → ${r.reviewer.name}`);
    if (view) add("view", r.publicPortal ?? r.applicant, "사용자", `${req.title}`, `‘${view}’ → ${(r.publicPortal ?? r.applicant)?.name}`);
  }
  if (!out.length) {
    const first = m.systems.find((s) => s.hasScreens) ?? m.systems[0];
    add("todo", first, "", req.title, "맞는 규칙이 없어 첫 번째 시스템에 1건 제안 — 시스템과 처리 내용을 직접 확인하세요");
  }
  return out;
}

/** 제안 key("apply")로 된 선행 관계를 실제 Task 참조("T01")로 바꾼다 */
export function resolveSuggestionOrder(suggestions: SuggestedTask[], existingCount: number): AddTaskInput[] {
  const idx = new Map(suggestions.map((s, i) => [s.key, `T${String(existingCount + i + 1).padStart(2, "0")}`]));
  return suggestions.map((s) => ({
    systemCode: s.systemCode,
    actor: s.actor,
    action: s.action,
    after: (s.after ?? []).map((a) => idx.get(a)).filter((x): x is string => Boolean(x)),
    noScreenReason: s.noScreenReason,
  }));
}
