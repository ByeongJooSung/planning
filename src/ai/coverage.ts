/**
 * 기능 요구사항 충족 점검 — 화면설계서가 연결된 요구사항의 기능 명세·Task를 빠짐없이 반영했는지.
 *
 * 화면에 연결된 Task → 요구사항 → 기능 명세(저장본, 없으면 참조자료 초안)를 줄 단위로 나눈 ‘요구 줄’이 점검 기준이다.
 * 각 줄은 AI가 답한 coverage(req → by 항목 번호), 작업자가 직접 지정한 매핑, 글자 겹침 추정(자동) 순으로 채운다.
 * 뷰어(JS)와 같은 규칙을 쓰므로 바꿀 때 viewer.js의 covTokens·covMatch도 함께 바꾼다.
 */
import type { Model } from "../model/schema.js";
import type { SpecItem } from "./spec.js";

export interface ReqLine {
  /** 안정적인 식별자: 요구사항ID#글자해시 */
  id: string;
  reqId: string;
  text: string;
  source: "spec" | "task" | "req";
}

const STOP = new Set(["그리고", "또는", "경우", "있다", "없다", "한다", "된다", "하는", "있는", "없는", "대한", "위한", "통해", "에서", "으로", "에게", "합니다", "입니다", "해야", "해야한다", "사용자", "화면", "기능", "the", "and", "for", "with"]);

/** 글자 토큰: 한글·영숫자 2자 이상, 흔한 조사 제거, 불용어 제외 */
export function covTokens(text: string): string[] {
  const out = new Set<string>();
  for (const raw of String(text ?? "").toLowerCase().split(/[^0-9a-z가-힣]+/)) {
    if (raw.length < 2) continue;
    let t = raw.replace(/(으로|에서|에게|까지|부터|이나|이든|처럼|보다|에는|은|는|이|가|을|를|의|에|로|와|과|도|만|나|들|용|별|시|후|전)$/, "");
    if (t.length < 2) t = raw;
    if (STOP.has(t)) continue;
    out.add(t);
    if (t.length >= 4) out.add(t.slice(0, 3));
  }
  return [...out];
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
export function normReq(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/** 명세 글 → 요구 줄 (머리말·출처 표시·너무 짧은 줄 제외) */
export function specLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    let l = raw.replace(/^\s*(?:[-*•·▶►▪■□○●◦]|\d+[.)]|[①-⑳]|[가-힣][.)]|\([0-9가-힣]+\))\s*/, "").trim();
    if (!l || /^\[.+\]$/.test(l) || /^#+\s/.test(raw) || /^(SRC|SFR|REQ)-\d+/.test(l) && l.length < 24) continue;
    l = l.replace(/^\[[^\]]+\]\s*/, "");
    if (l.length < 6) continue;
    out.push(l.length > 240 ? l.slice(0, 240) : l);
    if (out.length >= 40) break;
  }
  return out;
}

/** 화면의 요구 줄: 연결 Task의 요구사항 명세 줄 + Task 문장 (+ 명세가 없으면 요구사항 설명) */
export function screenReqLines(m: Model, specs: Record<string, SpecItem>, screenId: string): ReqLine[] {
  const node = m.ia.nodes.find((n) => n.id === screenId);
  if (!node) return [];
  const sb = m.storyboard.screens.find((s) => s.screenId === screenId);
  const taskIds = new Set([...(node.taskIds ?? []), ...(sb?.taskIds ?? [])]);
  const out: ReqLine[] = [];
  const seen = new Set<string>();
  const push = (reqId: string, text: string, source: ReqLine["source"]) => {
    const t = normReq(text);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) return;
    seen.add(key);
    out.push({ id: `${reqId}#${hash(key)}`, reqId, text: t, source });
  };
  for (const r of m.requirements) {
    if (r.status === "DELETED") continue;
    const mine = r.tasks.filter((t) => taskIds.has(t.id));
    if (!mine.length) continue;
    const sp = specs[r.id];
    const text = r.spec || sp?.saved || sp?.draft || "";
    const lines = specLines(text);
    if (lines.length) lines.forEach((l) => push(r.id, l, "spec"));
    else if (r.description) push(r.id, r.description, "req");
    for (const t of mine) push(r.id, `${t.actor ? `${t.actor}: ` : ""}${t.action}`, "task");
  }
  return out;
}

/** 요구 줄이 항목들에 반영됐는지 글자 겹침으로 추정 — 맞는 항목 번호(점수순, 최대 3개) */
export function covMatch(line: string, comps: { no: number; label: string; planner?: string; customer?: string; options?: { values: string[] } | undefined; validation?: { messages?: { text: string }[] } | undefined; ui?: { component: string } | undefined }[]): number[] {
  const lt = covTokens(line);
  if (!lt.length) return [];
  const need = Math.max(1, Math.ceil(lt.length * 0.3));
  const scored = comps
    .map((c) => {
      const text = [c.label, c.planner, c.customer, c.ui?.component, ...(c.options?.values ?? []), ...(c.validation?.messages ?? []).map((x) => x.text)].filter(Boolean).join(" ");
      const ct = new Set(covTokens(text));
      const hit = lt.filter((t) => ct.has(t)).length;
      return { no: c.no, hit };
    })
    .filter((x) => x.hit >= need)
    .sort((a, b) => b.hit - a.hit);
  return scored.slice(0, 3).map((x) => x.no);
}
