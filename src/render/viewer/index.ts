/**
 * 기획 산출물 뷰어 — 프로젝트 데이터를 HTML 한 파일로 만든다 (`planning view`).
 * 대시보드, 요구사항·Task, 요구사항 추적표, 정보구조도, 프로세스 플로우, 버전 이력을 보여 준다.
 * 외부 요청 없이 열리도록 CSS·JS·데이터를 모두 파일 안에 넣는다(웹 글꼴만 Google Fonts에서 받는다).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Model } from "../../model/schema.js";
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
}

export interface ViewerData {
  generatedAt: string;
  projects: ViewerProject[];
}

export async function collectViewerProject(dir: string, now = new Date()): Promise<ViewerProject> {
  const model = await loadModel(dir);
  const snapshots = await listSnapshots(dir);
  const last = snapshots.at(-1);
  const diff = last ? { from: last.version, entries: diffModels(await loadSnapshot(dir, last.version), model) } : null;
  return { model, rtm: buildRtm(model, now), snapshots, diff };
}

const ASSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");

const FONTS =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap";

/**
 * @param standalone true면 <!doctype html> 문서 전체, false면 본문 조각(<title>부터).
 *                   조각은 문서 뼈대를 따로 씌우는 호스팅(예: Claude 아티팩트)에 올릴 때 쓴다.
 */
export async function renderViewer(data: ViewerData, opts: { standalone?: boolean; title?: string } = {}): Promise<string> {
  const [css, js] = await Promise.all([
    readFile(path.join(ASSET_DIR, "viewer.css"), "utf8"),
    readFile(path.join(ASSET_DIR, "viewer.js"), "utf8"),
  ]);
  // </script> 로 데이터 블록이 끊기지 않도록 이스케이프
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
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
