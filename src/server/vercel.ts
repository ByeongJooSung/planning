/**
 * Vercel 함수 진입점 — api/index.mjs 가 이 모듈을 내보낸다.
 * 저장소: Upstash Redis (Vercel Marketplace → Upstash for Redis 를 프로젝트에 연결하면 KV_REST_API_URL·KV_REST_API_TOKEN 이 들어온다)
 * 필수 환경변수: PLANNING_SECRET (AI 키 암호화)
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, type Handler } from "./app.js";
import { UpstashKv } from "./kv.js";
import { copyProjects, FsRepo, KvRepo } from "./repo.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let app: Promise<Handler> | null = null;

function setupError(res: ServerResponse, lines: string[]) {
  res.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(`<!doctype html><meta charset="utf-8"><title>Planning Studio 설정 필요</title><body style="font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;line-height:1.6"><h1>설정이 더 필요합니다</h1><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul><p>Vercel 프로젝트 → Settings → Environment Variables / Storage 에서 설정한 뒤 다시 배포(Redeploy)하세요.</p></body>`);
}

async function build(): Promise<Handler> {
  const kv = UpstashKv.fromEnv()!;
  const repo = new KvRepo(kv);
  const key = process.env.ANTHROPIC_API_KEY;
  const { handle } = await createApp({
    kv,
    repo,
    secret: process.env.PLANNING_SECRET!,
    openSignup: process.env.PLANNING_SIGNUP !== "closed",
    maxUploadMb: 3, // Vercel 함수 요청 본문 한도 4.5MB (base64 포함)
    serverAi: key ? { provider: "anthropic", model: process.env.PLANNING_AI_MODEL ?? "claude-opus-5", apiKey: key } : null,
    init: async () => {
      // 저장소가 비어 있으면 샘플 프로젝트를 한 번 넣는다 (첫 가입자가 운영자가 된다)
      if (process.env.SEED_EXAMPLES === "0") return;
      if (!(await kv.set("seed:examples", new Date().toISOString(), { nx: true }))) return;
      await copyProjects(new FsRepo(path.join(ROOT, "examples", "projects")), repo);
    },
  });
  return handle;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const missing: string[] = [];
  if (!UpstashKv.fromEnv()) missing.push("저장소가 없습니다: Storage → Upstash for Redis(Marketplace)를 만들어 이 프로젝트에 연결하세요 (KV_REST_API_URL, KV_REST_API_TOKEN)");
  if (!process.env.PLANNING_SECRET || process.env.PLANNING_SECRET.length < 16) missing.push("환경변수 PLANNING_SECRET 이 없습니다: 16자 이상 임의 문자열 (AI 키 암호화용, 한 번 정하면 바꾸지 마세요)");
  if (missing.length) return setupError(res, missing);
  app ??= build().catch((e) => {
    app = null;
    throw e;
  });
  return (await app)(req, res);
}
