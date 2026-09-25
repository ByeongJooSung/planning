/** 추출한 문단을 검색 조각으로 나눈다 (파일 시스템 없음 — 브라우저·서버 공용) */
import type { Segment } from "./extract-text.js";
import type { Chunk } from "./search.js";

const CHUNK_TARGET = 600;

/** 문단을 이어 붙여 CHUNK_TARGET 글자 안팎으로 자른다. 위치가 바뀌면 새 조각을 시작한다. */
export function toChunks(sourceId: string, segments: Segment[]): Chunk[] {
  const out: Chunk[] = [];
  let cur: { locator: string; parts: string[]; len: number } | null = null;
  const push = () => {
    if (cur?.parts.length) out.push({ id: `${sourceId}#${out.length + 1}`, sourceId, locator: cur.locator, text: cur.parts.join("\n\n") });
    cur = null;
  };
  for (const seg of segments) {
    for (const piece of splitLong(seg.text)) {
      if (cur && (cur.locator !== seg.locator || cur.len + piece.length > CHUNK_TARGET)) push();
      cur ??= { locator: seg.locator, parts: [], len: 0 };
      cur.parts.push(piece);
      cur.len += piece.length;
    }
  }
  push();
  return out;
}

function splitLong(text: string): string[] {
  if (text.length <= CHUNK_TARGET * 1.5) return [text];
  const sentences = text.split(/(?<=[.!?。]|다\.)\s+/);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && buf.length + s.length > CHUNK_TARGET) {
      out.push(buf);
      buf = "";
    }
    buf = buf ? `${buf} ${s}` : s;
  }
  if (buf) out.push(buf);
  return out;
}

