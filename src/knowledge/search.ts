/**
 * 참조자료 검색 (BM25). 한국어는 형태소 분석 없이 어절 + 음절 2-gram으로 색인한다.
 * 뷰어(viewer/assets/search.js)도 같은 규칙으로 검색한다.
 */
export interface Chunk {
  id: string;
  sourceId: string;
  locator: string;
  text: string;
}

export interface Hit {
  chunk: Chunk;
  score: number;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const word of text.toLowerCase().split(/[^0-9a-z가-힣]+/)) {
    if (!word) continue;
    if (/[가-힣]/.test(word)) {
      if (word.length === 1) out.push(word);
      for (let i = 0; i < word.length - 1; i++) out.push(word.slice(i, i + 2));
    } else if (word.length > 1) out.push(word);
  }
  return out;
}

export function search(chunks: Chunk[], query: string, limit = 5): Hit[] {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !chunks.length) return [];
  const docs = chunks.map((c) => tokenize(c.text));
  const avg = docs.reduce((a, d) => a + d.length, 0) / docs.length;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const k1 = 1.2;
  const b = 0.75;
  const hits: Hit[] = [];
  docs.forEach((d, i) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (chunks.length - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg));
    }
    if (score > 0) hits.push({ chunk: chunks[i]!, score: Math.round(score * 100) / 100 });
  });
  return hits.sort((a, z) => z.score - a.score).slice(0, limit);
}
