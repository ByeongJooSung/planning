/**
 * 기획 산출물 뷰어 — 프로젝트 데이터를 HTML 한 파일로 만든다 (`planning view`).
 * 프로젝트 목록 → 프로젝트 상세(대시보드·참조자료·요구사항·Task·디자인 시스템·통합 산출물·버전 이력) → Task 상세(플로우·화면설계서·프로토타입).
 * 외부 요청 없이 열리도록 CSS·JS·데이터를 모두 파일 안에 넣는다(웹 글꼴만 Google Fonts에서 받는다).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Model } from "../../model/schema.js";
import { buildPrompts, VIEWPORT, type PromptSet } from "../../ai/prompts.js";
import { loadChunks } from "../../knowledge/store.js";
import type { Chunk } from "../../knowledge/search.js";
import { loadModel } from "../../project/store.js";
import { buildRtm, type Rtm } from "../../trace/rtm.js";
import { diffModels, type ModelDiff } from "../../version/diff.js";
import { listSnapshots, loadSnapshot, type SnapshotMeta } from "../../version/snapshot.js";

export interface ViewerProject {
  model: Model;
  rtm: Rtm;
  snapshots: SnapshotMeta[];
  /** 가장 최근 스냅샷 → 현재 모델 */
  diff: { from: string; entries: ModelDiff } | null;
  /** 참조자료 검색용 조각 (뷰어 안에서 검색) */
  chunks: Chunk[];
  /** AI 요청 프롬프트 (키: sb:화면ID, proto:TaskID, ia:시스템|ALL, ds:시스템) */
  prompts: Record<string, PromptSet>;
}

export interface ViewerData {
  generatedAt: string;
  viewerUrl?: string;
  projects: ViewerProject[];
}

export async function collectViewerProject(dir: string, now = new Date(), opts: { viewerUrl?: string } = {}): Promise<ViewerProject> {
  const model = await loadModel(dir);
  const snapshots = await listSnapshots(dir);
  const last = snapshots.at(-1);
  const diff = last ? { from: last.version, entries: diffModels(await loadSnapshot(dir, last.version), model) } : null;
  const chunks = await loadChunks(dir);
  return { model, rtm: buildRtm(model, now), snapshots, diff, chunks, prompts: buildPrompts(model, chunks, opts) };
}

const ASSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");

// 뷰어 글꼴 + 디자인 컨셉 글꼴(Noto Sans KR, Gothic A1)
const FONTS =
  "https://fonts.googleapis.com/css2?family=Gothic+A1:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap";

const CSS_FILES = ["viewer.css", "wire.css"];
/** 순서 중요: viewer.js가 앞의 전역(KB, Flow, Wire)을 쓴다 */
const JS_FILES = ["search.js", "flow.js", "wire.js", "viewer.js"];

/**
 * @param standalone true면 <!doctype html> 문서 전체, false면 본문 조각(<title>부터).
 *                   조각은 문서 뼈대를 따로 씌우는 호스팅(예: Claude 아티팩트)에 올릴 때 쓴다.
 */
export async function renderViewer(data: ViewerData, opts: { standalone?: boolean; title?: string } = {}): Promise<string> {
  const read = (f: string) => readFile(path.join(ASSET_DIR, f), "utf8");
  const css = (await Promise.all(CSS_FILES.map(read))).join("\n");
  const js = (await Promise.all(JS_FILES.map(read))).join("\n");
  // </script> 로 데이터 블록이 끊기지 않도록 이스케이프
  const json = JSON.stringify({ viewport: VIEWPORT, ...data }).replace(/</g, "\\u003c");
  const title = opts.title ?? (data.projects.length === 1 ? `${data.projects[0]!.model.project.name}` : "Planning Studio 뷰어");
  const body = `<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}</style>
<div class="shell">
<aside class="side" id="side"></aside>
<main class="main" id="main"></main>
</div>
<div id="layer"></div>
<script type="application/json" id="planning-data">${json}</script>
<script>
${js}</script>
`;
  if (opts.standalone === false) return body;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${body.replace("<div class=\"shell\">", "</head>\n<body>\n<div class=\"shell\">")}</body>
</html>
`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
