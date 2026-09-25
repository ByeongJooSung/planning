/* 참조자료 검색 — src/knowledge/search.ts 와 같은 규칙(어절 + 음절 2-gram, BM25) */
(function () {
  "use strict";
  function tokenize(text) {
    var out = [];
    String(text).toLowerCase().split(/[^0-9a-z가-힣]+/).forEach(function (w) {
      if (!w) return;
      if (/[가-힣]/.test(w)) {
        if (w.length === 1) out.push(w);
        for (var i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2));
      } else if (w.length > 1) out.push(w);
    });
    return out;
  }
  function search(chunks, query, limit) {
    var q = Array.from(new Set(tokenize(query)));
    if (!q.length || !chunks.length) return [];
    var docs = chunks.map(function (c) { return tokenize(c.text); });
    var avg = docs.reduce(function (a, d) { return a + d.length; }, 0) / docs.length;
    var df = {};
    docs.forEach(function (d) { Array.from(new Set(d)).forEach(function (t) { df[t] = (df[t] || 0) + 1; }); });
    var hits = [];
    docs.forEach(function (d, i) {
      var tf = {};
      d.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
      var score = 0;
      q.forEach(function (t) {
        var f = tf[t];
        if (!f) return;
        var idf = Math.log(1 + (chunks.length - df[t] + 0.5) / (df[t] + 0.5));
        score += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * d.length) / avg));
      });
      if (score > 0) hits.push({ chunk: chunks[i], score: Math.round(score * 100) / 100 });
    });
    return hits.sort(function (a, b) { return b.score - a.score; }).slice(0, limit || 8);
  }
  window.KB = { tokenize: tokenize, search: search };
})();
