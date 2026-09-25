/**
 * 프로젝트 참조자료(지식) — PRD §4.2C
 * 파일을 sources/ 에 보관하고, 텍스트를 추출·분할해 knowledge/chunks.json 에 색인한다.
 * 이 색인이 프로젝트의 지식이 되어 요구사항 추출·Task 제안·기획안 생성(LLM)에서 근거로 검색된다.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { nextSourceId } from "../model/ids.js";
import type { Model, Source } from "../model/schema.js";
import { readJson, writeJson } from "../project/store.js";
import { extractSegments, UnsupportedFormatError, type Segment } from "./extract.js";
import type { Chunk } from "./search.js";

const CHUNK_TARGET = 600;

export async function loadChunks(dir: string): Promise<Chunk[]> {
  const f = path.join(dir, "knowledge", "chunks.json");
  if (!existsSync(f)) return [];
  return ((await readJson(f)) as { chunks: Chunk[] }).chunks;
}

async function saveChunks(dir: string, chunks: Chunk[]) {
  await mkdir(path.join(dir, "knowledge"), { recursive: true });
  await writeJson(path.join(dir, "knowledge", "chunks.json"), { chunks });
}

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

export interface AddResult {
  source: Source;
  duplicateOf?: string;
}

export async function addKnowledgeFile(
  dir: string,
  m: Model,
  filePath: string,
  opts: { title?: string; kind?: Source["kind"]; now?: Date } = {},
): Promise<AddResult> {
  const data = await readFile(filePath);
  const sha256 = createHash("sha256").update(data).digest("hex");
  const dup = m.sources.find((s) => s.sha256 === sha256);
  if (dup) return { source: dup, duplicateOf: dup.id };

  const id = nextSourceId(m.sources);
  const fileName = path.basename(filePath);
  const stored = path.join("sources", `${id}_${fileName}`);
  await mkdir(path.join(dir, "sources"), { recursive: true });
  await copyFile(filePath, path.join(dir, stored));

  const source: Source = {
    id,
    kind: opts.kind ?? (/\.eml$/i.test(fileName) ? "EMAIL" : "FILE"),
    title: opts.title ?? fileName.replace(/\.[^.]+$/, ""),
    location: stored,
    addedAt: (opts.now ?? new Date()).toISOString(),
    fileName,
    size: data.length,
    sha256,
  };
  let chunks: Chunk[] = [];
  try {
    chunks = toChunks(id, await extractSegments(fileName, data));
    source.index = { status: "INDEXED", chunks: chunks.length, chars: chunks.reduce((a, c) => a + c.text.length, 0) };
  } catch (e) {
    source.index = {
      status: e instanceof UnsupportedFormatError ? "UNSUPPORTED" : "FAILED",
      chunks: 0,
      chars: 0,
      message: (e as Error).message,
    };
  }
  m.sources.push(source);
  await saveChunks(dir, [...(await loadChunks(dir)).filter((c) => c.sourceId !== id), ...chunks]);
  return { source };
}

export async function removeKnowledgeFile(dir: string, m: Model, sourceId: string): Promise<void> {
  const src = m.sources.find((s) => s.id === sourceId);
  if (!src) throw new Error(`참조자료가 없습니다: ${sourceId}`);
  const users = m.requirements.filter((r) => r.sources.some((s) => s.sourceId === sourceId)).map((r) => r.id);
  if (users.length) throw new Error(`${sourceId}를 출처로 쓰는 요구사항이 있습니다: ${users.join(", ")}`);
  m.sources = m.sources.filter((s) => s.id !== sourceId);
  if (src.location.startsWith("sources/")) await rm(path.join(dir, src.location), { force: true });
  await saveChunks(dir, (await loadChunks(dir)).filter((c) => c.sourceId !== sourceId));
}
