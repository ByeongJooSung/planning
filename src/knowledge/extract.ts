/**
 * 참조자료 텍스트 추출. 결과는 위치(페이지·절·문단)가 붙은 조각 목록이다.
 * 지원: txt, md, csv, tsv, json, html, eml, docx, pdf
 * 미지원(추후): hwp, pptx, xlsx, 이미지(OCR) — 파일은 보관하고 UNSUPPORTED로 표시한다.
 */
import path from "node:path";

import { emlSegments, htmlToText, markdownSegments, normalize, paragraphSegments, type Segment } from "./extract-text.js";

export type { Segment } from "./extract-text.js";

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
      return paragraphSegments(data.toString("utf8").replace(/^\uFEFF/, ""));
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

