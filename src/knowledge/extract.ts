/**
 * 참조자료 텍스트 추출. 결과는 위치(페이지·절·문단)가 붙은 조각 목록이다.
 * 지원: txt, md, csv, tsv, json, html, eml, docx, pdf
 * 미지원(추후): hwp, pptx, xlsx, 이미지(OCR) — 파일은 보관하고 UNSUPPORTED로 표시한다.
 */
import path from "node:path";

export interface Segment {
  /** 문서 내 위치 (예: "p.3", "2. 사업 범위", "문단 4") */
  locator: string;
  text: string;
}

export const SUPPORTED_EXT = [".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".html", ".htm", ".eml", ".docx", ".pdf"];

export class UnsupportedFormatError extends Error {}

export async function extractSegments(fileName: string, data: Buffer): Promise<Segment[]> {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".md":
    case ".markdown":
      return markdownSegments(data.toString("utf8"));
    case ".txt":
    case ".csv":
    case ".tsv":
    case ".json":
      return paragraphSegments(decodeText(data));
    case ".html":
    case ".htm":
      return paragraphSegments(htmlToText(data.toString("utf8")));
    case ".eml":
      return emlSegments(data.toString("utf8"));
    case ".docx": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: data });
      return paragraphSegments(value);
    }
    case ".pdf": {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { text } = await extractText(pdf, { mergePages: false });
      return (text as string[])
        .map((t, i) => ({ locator: `p.${i + 1}`, text: normalize(t) }))
        .filter((s) => s.text);
    }
    default:
      throw new UnsupportedFormatError(`아직 지원하지 않는 형식입니다: ${ext || "(확장자 없음)"}`);
  }
}

/** UTF-8이 아니면(한글 CP949 등) 깨진 문자가 생긴다. BOM만 제거하고 UTF-8로 읽는다. */
function decodeText(data: Buffer): string {
  return data.toString("utf8").replace(/^﻿/, "");
}

function normalize(s: string): string {
  return s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function paragraphSegments(text: string): Segment[] {
  return normalize(text)
    .split(/\n\s*\n/)
    .map((p, i) => ({ locator: `문단 ${i + 1}`, text: p.trim() }))
    .filter((s) => s.text);
}

/** 제목(#) 기준으로 절을 나눈다. 위치는 가장 가까운 제목 */
function markdownSegments(md: string): Segment[] {
  const out: Segment[] = [];
  let heading = "본문";
  let buf: string[] = [];
  const flush = () => {
    const t = normalize(buf.join("\n"));
    if (t) out.push({ locator: heading, text: t });
    buf = [];
  };
  for (const line of md.replace(/^﻿/, "").split(/\r?\n/)) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      heading = h[2]!.trim();
      buf.push(h[2]!.trim());
    } else buf.push(line);
  }
  flush();
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** 메일: 제목·보낸 사람·날짜를 첫 조각으로, 본문(text/plain 우선)을 문단으로 */
function emlSegments(raw: string): Segment[] {
  const [head = "", ...rest] = raw.replace(/\r\n/g, "\n").split(/\n\n/);
  const header = (name: string) => new RegExp(`^${name}:\\s*(.*)$`, "mi").exec(head)?.[1]?.trim() ?? "";
  let body = rest.join("\n\n");
  const boundary = /boundary="?([^";\n]+)"?/i.exec(head)?.[1];
  if (boundary) {
    const parts = body.split(`--${boundary}`);
    const plain = parts.find((p) => /content-type:\s*text\/plain/i.test(p)) ?? parts.find((p) => /content-type:\s*text\/html/i.test(p));
    if (plain) {
      const [, ...b] = plain.replace(/^\n/, "").split(/\n\n/);
      body = b.join("\n\n");
      if (/content-type:\s*text\/html/i.test(plain)) body = htmlToText(body);
    }
  }
  const meta = [`제목: ${header("Subject")}`, `보낸 사람: ${header("From")}`, `날짜: ${header("Date")}`].join("\n");
  return [{ locator: "메일 정보", text: meta }, ...paragraphSegments(body).map((s) => ({ ...s, locator: `본문 ${s.locator}` }))];
}
