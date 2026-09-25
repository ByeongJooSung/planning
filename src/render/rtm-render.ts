/** RTM 출력: Markdown(검토용), CSV(엑셀 열기용, UTF-8 BOM). XLSX 양식 출력은 P1(1-2B)에서 추가한다. */
import { STATUS_LABEL, type Rtm } from "../trace/rtm.js";

export type RtmView = "req" | "matrix" | "reverse";

const join = (xs: string[]) => xs.join(", ");
const cellMd = (s: string) => (s || "—").replace(/\|/g, "\\|").replace(/\n/g, " ");

function mdTable(head: string[], rows: string[][]): string {
  return [
    `| ${head.join(" | ")} |`,
    `|${head.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.map(cellMd).join(" | ")} |`),
  ].join("\n");
}

const REQ_HEAD = [
  "요구사항 ID",
  "원본 ID",
  "요구사항명",
  "우선순위",
  "출처",
  "Task ID",
  "시스템",
  "행위자",
  "처리 내용",
  "기획안",
  "기능 ID",
  "화면 ID",
  "플로우",
  "스토리보드",
  "프로토타입",
  "상태",
  "확인",
  "CR",
  "비고",
];

function reqRows(rtm: Rtm): string[][] {
  const out: string[][] = [];
  for (const r of rtm.rows) {
    const base = [r.requirementId, r.originalId ?? "", r.title, r.priority, join(r.sources)];
    const tail = (status: string) => [status, "", join(r.crIds), r.excludeReason ?? r.note ?? ""];
    if (!r.tasks.length) {
      out.push([...base, "", "", "", "(Task 미분해)", "", "", "", "", "", "", ...tail(STATUS_LABEL[r.status])]);
      continue;
    }
    for (const t of r.tasks)
      out.push([
        ...base,
        t.taskId,
        t.systemCode,
        t.actor,
        t.action,
        join(t.planSections),
        join(t.features),
        t.screenless && !t.screens.length ? "(화면 없음)" : join(t.screens),
        join(t.flowNodes),
        join(t.storyboard),
        join(t.prototype),
        STATUS_LABEL[t.status],
        t.reviewer ?? "",
        join(r.crIds),
        r.excludeReason ?? r.note ?? "",
      ]);
  }
  return out;
}

function matrixRows(rtm: Rtm): { head: string[]; rows: string[][] } {
  const head = ["요구사항", ...rtm.systems.map((s) => `${s.code} ${s.name}`), "충족"];
  const rows = rtm.rows.map((r) => [
    `${r.requirementId} ${r.title}`,
    ...rtm.systems.map((s) => {
      const c = rtm.matrix[r.requirementId]?.[s.code];
      if (!c || !c.taskIds.length) return "";
      const short = c.taskIds.map((id) => id.slice(r.requirementId.length + 1));
      const screens = join(c.screens) || (c.screenless ? "화면 없음" : "화면 미연결");
      return `${join(short)} · ${screens} · ${STATUS_LABEL[c.status!]}`;
    }),
    STATUS_LABEL[r.status],
  ]);
  return { head, rows };
}

function reverseRows(rtm: Rtm): string[][] {
  return Object.entries(rtm.reverse).map(([id, e]) => [id, e.systemCode, e.name, join(e.requirementIds), join(e.taskIds)]);
}
const REVERSE_HEAD = ["화면 ID", "시스템", "화면명", "요구사항", "Task"];

export function renderRtmMarkdown(rtm: Rtm, views: RtmView[] = ["req", "matrix", "reverse"]): string {
  const c = rtm.coverage;
  const parts: string[] = [
    `# 요구사항 추적표 — ${rtm.project.name} (v${rtm.project.version})`,
    "",
    `생성: ${rtm.generatedAt.slice(0, 16).replace("T", " ")} · 요구사항 ${c.requirements.total}건 · Task ${c.tasks.total}건 · 설계완료율 ${c.designedRate}%`,
    "",
    mdTable(
      ["시스템", "Task", "설계완료", "비율"],
      Object.entries(c.bySystem).map(([code, v]) => [code, String(v.total), String(v.designed), `${v.rate}%`]),
    ),
  ];
  if (views.includes("req")) parts.push("", "## 요구사항별", "", mdTable(REQ_HEAD, reqRows(rtm)));
  if (views.includes("matrix")) {
    const { head, rows } = matrixRows(rtm);
    parts.push("", "## 요구사항 × 시스템", "", mdTable(head, rows));
  }
  if (views.includes("reverse")) parts.push("", "## 화면 → 요구사항 역추적", "", mdTable(REVERSE_HEAD, reverseRows(rtm)));
  if (rtm.gaps.length) parts.push("", "## 누락", "", ...rtm.gaps.map((g) => `- [${g.stage}] ${g.message}`));
  if (rtm.orphans.length) parts.push("", "## 근거 없는 산출물", "", ...rtm.orphans.map((o) => `- ${o.message}`));
  return parts.join("\n") + "\n";
}

function csv(head: string[], rows: string[][]): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return "﻿" + [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}

export function renderRtmCsv(rtm: Rtm, view: RtmView = "req"): string {
  if (view === "matrix") {
    const { head, rows } = matrixRows(rtm);
    return csv(head, rows);
  }
  if (view === "reverse") return csv(REVERSE_HEAD, reverseRows(rtm));
  return csv(REQ_HEAD, reqRows(rtm));
}
