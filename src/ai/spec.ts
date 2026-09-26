/**
 * 요구사항별 기능 명세 — AI 생성(화면설계서·프로세스 플로우) 프롬프트에 함께 싣는다.
 *
 * 저장된 명세(Requirement.spec)가 있으면 그것을 쓰고, 없으면 참조자료(지식)에서 초안을 불러온다:
 * 1) 요구사항 ID(원본 ID 포함)가 적힌 조각 — 기능명세서·요구사항정의서의 해당 항목
 * 2) 없으면 제목·설명으로 검색한 상위 조각
 * 작업자는 생성 화면에서 명세를 고친 뒤 생성하고, 고친 내용은 요구사항에 저장된다.
 */
import type { Chunk } from "../knowledge/search.js";
import { search } from "../knowledge/search.js";
import type { Model, Requirement } from "../model/schema.js";

export interface SpecItem {
  /** 요구사항 ID */
  id: string;
  originalId?: string;
  title: string;
  /** 저장된 명세 (작업자가 확인·편집한 것) */
  saved?: string;
  /** 참조자료에서 불러온 초안 */
  draft: string;
  /** 초안 근거 (예: "SRC-001 제안요청서 · SFR-002 대국민 정보공개") */
  from: string[];
}

/** 생성 프롬프트의 자리표시자 — 요청할 때 작업자가 확인한 명세로 채운다 */
export const SPEC_SLOT = "{{SPECS}}";

const MAX_DRAFT = 3000;
const ID_LIKE = /\b[A-Z]{2,6}-\d{2,4}\b/g;

function idPattern(id: string) {
  return new RegExp(`(^|[^0-9A-Za-z])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9A-Za-z])`, "i");
}

export function specDraft(m: Model, chunks: Chunk[], req: Requirement): { text: string; from: string[] } {
  const keys = [req.originalId, req.id].filter((x): x is string => !!x);
  const pats = keys.map(idPattern);
  const picked: Chunk[] = [];
  chunks.forEach((c, i) => {
    if (!pats.some((p) => p.test(c.text) || p.test(c.locator))) return;
    if (!picked.includes(c)) picked.push(c);
    // 명세 표·목록은 다음 조각으로 이어지는 경우가 많다 — 다른 요구사항 ID가 나오기 전까지 한 조각 더
    const next = chunks[i + 1];
    const others = next ? [...next.text.matchAll(ID_LIKE)].map((x) => x[0]).filter((x) => !keys.some((k) => k.toUpperCase() === x.toUpperCase())) : [];
    if (next && next.sourceId === c.sourceId && !others.length && !picked.includes(next)) picked.push(next);
  });
  if (!picked.length) {
    const hits = search(chunks, `${req.title} ${req.description}`, 3);
    const top = hits[0]?.score ?? 0;
    for (const h of hits) if (h.score >= top * 0.6 && h.score >= 2) picked.push(h.chunk);
  }
  const from: string[] = [];
  const parts: string[] = [];
  let len = 0;
  for (const c of picked) {
    const src = m.sources.find((s) => s.id === c.sourceId);
    const label = `${c.sourceId}${src ? ` ${src.title}` : ""}${c.locator ? ` · ${c.locator}` : ""}`;
    const body = c.text.trim();
    if (len + body.length > MAX_DRAFT && parts.length) break;
    parts.push(`[${label}]\n${body.length > MAX_DRAFT ? `${body.slice(0, MAX_DRAFT)}…` : body}`);
    from.push(label);
    len += body.length;
  }
  if (!parts.length) return { text: req.description ? `${req.description}` : "", from: [] };
  const head = req.description && !parts.some((p) => p.includes(req.description.trim())) ? `${req.description.trim()}\n\n` : "";
  return { text: head + parts.join("\n\n"), from };
}

export function specItems(m: Model, chunks: Chunk[], reqIds: string[]): SpecItem[] {
  return [...new Set(reqIds)]
    .map((id) => m.requirements.find((r) => r.id === id))
    .filter((r): r is Requirement => !!r && r.status !== "DELETED")
    .map((r) => {
      const d = specDraft(m, chunks, r);
      return { id: r.id, originalId: r.originalId, title: r.title, saved: r.spec || undefined, draft: d.text, from: d.from };
    });
}

/** 명세 목록 → 프롬프트 본문 */
export function specText(items: { id: string; originalId?: string; title: string; text: string }[]): string {
  const filled = items.filter((x) => x.text.trim());
  if (!filled.length) return "- (없음 — 요구사항 원문과 참조자료 근거로 작성)";
  return filled.map((x) => `### ${x.id}${x.originalId && x.originalId !== x.id ? ` (${x.originalId})` : ""} ${x.title}\n${x.text.trim()}`).join("\n\n");
}

/** 기본값(저장본 → 초안)으로 자리표시자를 채운다 — CLI·프롬프트 복사용 (뷰어 viewer.js의 fillSpecs와 같은 규칙) */
export function fillSpecPrompt(template: string, items: SpecItem[], edited: Record<string, string> = {}): string {
  if (!template.includes(SPEC_SLOT)) return template;
  return template.replace(SPEC_SLOT, specText(items.map((x) => ({ ...x, text: edited[x.id] ?? x.saved ?? x.draft }))));
}
