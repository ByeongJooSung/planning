#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command, Option } from "commander";
import { validateModel } from "./model/validate.js";
import { applyGenerated, GEN_KINDS, screensNeedingReview, type GenKind } from "./ai/apply.js";
import { buildGenPrompts, fillDsPrompt, REFINE_INSTRUCTION } from "./ai/generate.js";
import { fillSpecPrompt, specDraft } from "./ai/spec.js";
import { scopeOf } from "./design/catalog.js";
import { buildPrompts } from "./ai/prompts.js";
import { addDesignComponent, getSystemDesign, proposeDesign, selectDesign } from "./design/ops.js";
import { search } from "./knowledge/search.js";
import { addKnowledgeFile, loadChunks, removeKnowledgeFile } from "./knowledge/store.js";
import { suggestTasks } from "./project/suggest.js";
import {
  addRequirement,
  addSystem,
  addTask,
  autoCreateTasks,
  excludeRequirement,
  recordReview,
  removeTask,
} from "./project/ops.js";
import { createProject, loadModel, projectDir, saveModel } from "./project/store.js";
import { renderRtmCsv, renderRtmMarkdown, type RtmView } from "./render/rtm-render.js";
import { collectViewerProject, renderViewer } from "./render/viewer/index.js";
import { buildRtm, STATUS_LABEL } from "./trace/rtm.js";
import { diffModels, renderDiffMarkdown } from "./version/diff.js";
import { listSnapshots, loadSnapshot, takeSnapshot } from "./version/snapshot.js";

const STAGE_LABEL: Record<string, string> = {
  S0: "S0 자료 수집",
  S0A: "S0-A 기존 서비스 분석",
  S1: "S1 기획안",
  S2: "S2 정보구조도",
  S3: "S3 다이어그램",
  S4: "S4 스토리보드",
  S5: "S5 프로토타입",
};
const STAGE_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "미시작",
  COLLECTING: "정보수집중",
  GATE_PASSED: "게이트 통과",
  DRAFTED: "초안",
  IN_REVIEW: "검토중",
  CONFIRMED: "확정",
  SKIPPED: "패스",
  NEEDS_UPDATE: "변경 필요",
};

const program = new Command()
  .name("planning")
  .description("서비스 기획 산출물 프로젝트 관리 도구")
  .option("--root <dir>", "프로젝트 루트 폴더", process.env.PLANNING_ROOT ?? "projects")
  .option("-p, --project <code>", "프로젝트 코드 (루트에 프로젝트가 하나면 생략 가능)", process.env.PLANNING_PROJECT);

const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

async function listProjectCodes(root: string): Promise<string[]> {
  const entries = existsSync(root) ? await readdir(root, { withFileTypes: true }) : [];
  return entries
    .filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, "project.json")))
    .map((e) => e.name)
    .sort();
}

async function resolveDir(): Promise<string> {
  const { root, project } = program.opts<{ root: string; project?: string }>();
  if (project) return projectDir(root, project);
  const codes = await listProjectCodes(root);
  if (codes.length === 1) return projectDir(root, codes[0]!);
  throw new Error(codes.length ? `프로젝트를 -p로 지정하세요: ${codes.join(", ")}` : `프로젝트가 없습니다 (${root}). planning init 으로 만드세요`);
}

/** 모델을 불러와 fn을 실행하고 저장한다 */
async function mutate<T>(fn: (m: Awaited<ReturnType<typeof loadModel>>) => T): Promise<T> {
  const dir = await resolveDir();
  const m = await loadModel(dir);
  const r = fn(m);
  await saveModel(dir, m);
  return r;
}

program
  .command("init <code>")
  .description("프로젝트 생성")
  .requiredOption("--name <name>", "프로젝트명")
  .addOption(new Option("--type <type>", "서비스 유형").choices(["NEW", "EXISTING"]).makeOptionMandatory())
  .addOption(new Option("--scope <scope>", "변경 범위 (EXISTING일 때)").choices(["NEW_MENU", "MODIFY", "RENEWAL"]))
  .addOption(new Option("--preset <preset>", "시스템 구분 프리셋").choices(["public-civil", "general", "none"]).default("none"))
  .addOption(new Option("--template <t>", "제출 양식").choices(["GENERAL", "PUBLIC"]).default("GENERAL"))
  .addOption(new Option("--id-mode <m>", "요구사항 ID 체계").choices(["GENERATED", "ORIGINAL"]).default("GENERATED"))
  .action(async (code: string, o) => {
    const dir = await createProject(program.opts().root, {
      code,
      name: o.name,
      serviceType: o.type,
      changeScope: o.scope ?? null,
      preset: o.preset,
      submissionTemplate: o.template,
      requirementIdMode: o.idMode,
    });
    const m = await loadModel(dir);
    console.log(`프로젝트를 만들었습니다: ${dir}`);
    console.log(`시스템 구분: ${m.systems.map((s) => `${s.code}(${s.name})`).join(", ") || "없음 — planning system add 로 등록하세요"}`);
    if (m.project.stages.S2 === "SKIPPED") console.log("기존 메뉴 수정(MODIFY)이므로 S2 정보구조도는 패스합니다. 영향 화면 ID만 등록하세요.");
  });

program
  .command("status")
  .description("프로젝트 현황")
  .action(async () => {
    const m = await loadModel(await resolveDir());
    const p = m.project;
    const rtm = buildRtm(m);
    console.log(`${p.name} [${p.code}] v${p.version}`);
    console.log(`유형: ${p.serviceType}${p.changeScope ? ` / ${p.changeScope}` : ""} · 제출 양식: ${p.submissionTemplate}`);
    console.log(`시스템: ${m.systems.map((s) => `${s.code} ${s.name}`).join(" | ") || "없음"}`);
    console.log("\n단계");
    for (const [s, st] of Object.entries(p.stages)) console.log(`  ${STAGE_LABEL[s]}: ${STAGE_STATUS_LABEL[st]}`);
    const c = rtm.coverage;
    console.log(`\n요구사항 ${c.requirements.total}건 · Task ${c.tasks.total}건 · 설계완료율 ${c.designedRate}%`);
    for (const [code, v] of Object.entries(c.bySystem)) console.log(`  ${code}: ${v.designed}/${v.total} (${v.rate}%)`);
    console.log(`누락 ${rtm.gaps.length}건 · 근거 없는 산출물 ${rtm.orphans.length}건`);
  });

const system = program.command("system").description("시스템 구분 관리");
system.command("list").action(async () => {
  const m = await loadModel(await resolveDir());
  for (const s of m.systems)
    console.log(`${s.code}\t${s.name}\t${s.users.join(", ")}\t${s.hasScreens ? "" : "(화면 없음)"}`);
});
system
  .command("add <code>")
  .requiredOption("--name <name>")
  .option("--users <list>", "주 사용자 (쉼표 구분)", list, [])
  .option("--color <hex>")
  .option("--prefix <prefix>", "화면 ID 접두어")
  .option("--no-screens", "화면이 없는 시스템 (외부 연계 등)")
  .option("--desc <text>", "", "")
  .action(async (code: string, o) => {
    const s = await mutate((m) =>
      addSystem(m, {
        code,
        name: o.name,
        users: o.users,
        color: o.color,
        screenIdPrefix: o.prefix,
        hasScreens: o.screens,
        description: o.desc,
      }),
    );
    console.log(`시스템을 추가했습니다: ${s.code} ${s.name}`);
  });

const req = program.command("req").description("요구사항 관리");
req
  .command("add")
  .requiredOption("--title <title>")
  .option("--desc <text>")
  .option("--original-id <id>", "RFP 원본 ID (예: SFR-001)")
  .addOption(new Option("--type <t>").choices(["FUNCTIONAL", "NON_FUNCTIONAL", "POLICY", "CONTENT", "CONSTRAINT"]))
  .addOption(new Option("--priority <p>").choices(["MUST", "SHOULD", "COULD"]))
  .option("--source <ref...>", "출처 SRC-001[:위치]")
  .option("--auto-tasks", "등록하면서 시스템별 Task 자동 생성")
  .action(async (o) => {
    const r = await mutate((m) => {
      const req = addRequirement(m, {
        title: o.title,
        description: o.desc,
        originalId: o.originalId,
        type: o.type,
        priority: o.priority,
        sources: (o.source ?? []).map((s: string) => {
          const [sourceId, ...rest] = s.split(":");
          return { sourceId: sourceId!, locator: rest.join(":") };
        }),
      });
      if (o.autoTasks) autoCreateTasks(m, req.id);
      return req;
    });
    console.log(`요구사항을 추가했습니다: ${r.id} ${r.title}`);
    if (o.autoTasks) for (const t of r.tasks) console.log(`  자동 생성 ${t.id} [${t.systemCode}] ${t.actor ? `${t.actor}: ` : ""}${t.action}  — ${t.suggestReason}`);
    else console.log(`다음: planning task auto ${r.id}  또는  planning task add ${r.id} --system <코드> --action "<처리 내용>"`);
  });
req.command("list").action(async () => {
  const rtm = buildRtm(await loadModel(await resolveDir()));
  for (const r of rtm.rows) {
    console.log(`${r.requirementId}${r.originalId ? ` (${r.originalId})` : ""}  ${r.title}  [${STATUS_LABEL[r.status]}]`);
    for (const t of r.tasks) console.log(`   ${t.taskId}  [${t.systemCode}] ${t.actor ? `${t.actor}: ` : ""}${t.action}  [${STATUS_LABEL[t.status]}]`);
  }
});
req
  .command("exclude <id>")
  .requiredOption("--reason <text>", "제외 사유")
  .action(async (id: string, o) => {
    await mutate((m) => excludeRequirement(m, id, o.reason));
    console.log(`${id}를 제외 처리했습니다`);
  });

req
  .command("spec <id>")
  .description("기능 명세 보기·저장 — AI 생성(화면설계서·플로우) 프롬프트에 함께 실린다")
  .option("--file <file>", "이 파일 내용으로 저장")
  .option("--draft", "참조자료에서 불러온 초안을 그대로 저장")
  .option("--clear", "저장한 명세를 지워 참조자료 초안으로 돌아가기")
  .action(async (id: string, o) => {
    const dir = await resolveDir();
    const m = await loadModel(dir);
    const r = m.requirements.find((x) => x.id === id || x.originalId === id);
    if (!r) throw new Error(`요구사항이 없습니다: ${id}`);
    const draft = specDraft(m, await loadChunks(dir), r);
    if (!o.file && !o.draft && !o.clear) {
      console.log(r.spec ? `[저장된 명세]\n${r.spec}` : `[참조자료 초안 — 저장 안 됨]${draft.from.length ? `\n근거: ${draft.from.join(" / ")}` : ""}\n${draft.text || "(없음)"}`);
      return;
    }
    const text = o.clear ? "" : o.file ? await readFile(o.file, "utf8") : draft.text;
    await mutate((mm) => {
      const x = mm.requirements.find((q) => q.id === r.id)!;
      if (text.trim()) x.spec = text.replace(/\r\n/g, "\n").trim();
      else delete x.spec;
    });
    console.log(text.trim() ? `${r.id} 기능 명세를 저장했습니다 (${text.trim().length.toLocaleString()}자)` : `${r.id} 기능 명세를 지웠습니다`);
  });

const task = program.command("task").description("시스템별 Task 관리");
task
  .command("add <requirementId>")
  .requiredOption("--system <code>", "시스템 구분 코드")
  .requiredOption("--action <text>", "처리 내용")
  .option("--actor <name>", "행위자")
  .option("--after <list>", "선행 Task (T01,T02 또는 전체 ID)", list)
  .option("--state-set <id>", "상태값 세트 ID")
  .option("--from <state>")
  .option("--to <state>", "처리 후 자료 상태")
  .option("--screenless <reason>", "화면이 없는 Task의 사유 (배치·자동 처리·외부 연계)")
  .action(async (reqId: string, o) => {
    const t = await mutate((m) =>
      addTask(m, reqId, {
        systemCode: o.system,
        action: o.action,
        actor: o.actor,
        after: o.after,
        transition: o.to ? { stateSetId: o.stateSet, from: o.from, to: o.to } : undefined,
        noScreenReason: o.screenless,
      }),
    );
    console.log(`Task를 추가했습니다: ${t.id} [${t.systemCode}] ${t.action}`);
  });
task
  .command("suggest <requirementId>")
  .description("시스템별 Task 자동 제안 미리보기 (저장하지 않음)")
  .action(async (reqId: string) => {
    const m = await loadModel(await resolveDir());
    const req = m.requirements.find((r) => r.id === reqId || r.originalId === reqId);
    if (!req) throw new Error(`요구사항이 없습니다: ${reqId}`);
    for (const t of suggestTasks(m, req))
      console.log(`[${t.systemCode}] ${t.actor ? `${t.actor}: ` : ""}${t.action}${t.after?.length ? `  (선행: ${t.after.join(", ")})` : ""}\n    근거: ${t.reason}`);
    console.log(`\n적용: planning task auto ${req.id}`);
  });
task
  .command("auto <requirementId>")
  .description("시스템별 Task 자동 생성 (제안을 그대로 적용)")
  .action(async (reqId: string) => {
    const tasks = await mutate((m) => autoCreateTasks(m, reqId));
    for (const t of tasks) console.log(`자동 생성 ${t.id} [${t.systemCode}] ${t.actor ? `${t.actor}: ` : ""}${t.action}  — ${t.suggestReason}`);
  });
task.command("rm <taskId>").action(async (id: string) => {
  await mutate((m) => removeTask(m, id));
  console.log(`${id}를 삭제했습니다`);
});

program
  .command("review <taskId>")
  .description("Task 검토 완료 확인")
  .requiredOption("--by <name>", "확인자")
  .option("--note <text>", "", "")
  .action(async (id: string, o) => {
    await mutate((m) => recordReview(m, id, o.by, o.note));
    console.log(`${id} 검토 완료로 기록했습니다`);
  });

program
  .command("rtm")
  .description("요구사항 추적표")
  .addOption(new Option("--view <v>", "보기").choices(["req", "matrix", "reverse", "all"]).default("all"))
  .addOption(new Option("--format <f>", "형식").choices(["md", "csv", "json"]).default("md"))
  .option("--write", "rtm/ 폴더에 rtm.json, rtm.md, rtm-*.csv 저장")
  .action(async (o) => {
    const dir = await resolveDir();
    const rtm = buildRtm(await loadModel(dir));
    if (o.write) {
      const out = path.join(dir, "rtm");
      await writeFile(path.join(out, "rtm.json"), JSON.stringify(rtm, null, 2) + "\n");
      await writeFile(path.join(out, "rtm.md"), renderRtmMarkdown(rtm));
      for (const v of ["req", "matrix", "reverse"] as const) await writeFile(path.join(out, `rtm-${v}.csv`), renderRtmCsv(rtm, v));
      console.log(`저장했습니다: ${out}`);
      return;
    }
    const views: RtmView[] = o.view === "all" ? ["req", "matrix", "reverse"] : [o.view];
    if (o.format === "json") console.log(JSON.stringify(rtm, null, 2));
    else if (o.format === "csv") process.stdout.write(renderRtmCsv(rtm, views[0]));
    else process.stdout.write(renderRtmMarkdown(rtm, views));
  });

program
  .command("check")
  .description("모델 무결성 · 누락 · 근거 없는 산출물 검사")
  .action(async () => {
    const m = await loadModel(await resolveDir());
    const issues = validateModel(m);
    const rtm = buildRtm(m);
    for (const i of issues) console.log(`[${i.level === "error" ? "오류" : "경고"}] ${i.message}`);
    for (const g of rtm.gaps) console.log(`[누락 ${g.stage}] ${g.message}`);
    for (const o of rtm.orphans) console.log(`[근거 없음] ${o.message}`);
    const errors = issues.filter((i) => i.level === "error").length;
    console.log(`\n오류 ${errors} · 경고 ${issues.length - errors} · 누락 ${rtm.gaps.length} · 근거 없음 ${rtm.orphans.length}`);
    if (errors) process.exitCode = 1;
  });

program
  .command("snapshot")
  .description("현재 모델을 버전 스냅샷으로 고정하고 버전을 올림")
  .option("--note <text>", "스냅샷 설명", "")
  .option("--major", "주 버전 올림 (0.3 → 1.0)")
  .action(async (o) => {
    const dir = await resolveDir();
    const m = await loadModel(dir);
    const meta = await takeSnapshot(dir, m, { note: o.note, major: o.major });
    console.log(`v${meta.version} 스냅샷을 저장했습니다. 현재 작업 버전: v${m.project.version}`);
  });

program
  .command("history")
  .description("스냅샷 목록")
  .action(async () => {
    for (const s of await listSnapshots(await resolveDir())) console.log(`v${s.version}\t${s.takenAt.slice(0, 16)}\t${s.note}`);
  });

program
  .command("diff <from> [to]")
  .description("두 버전 비교 (to를 생략하면 현재 작업 중인 모델)")
  .action(async (from: string, to?: string) => {
    const dir = await resolveDir();
    const a = await loadSnapshot(dir, from);
    const b = to ? await loadSnapshot(dir, to) : await loadModel(dir);
    const title = `변경 비교: v${from.replace(/^v/, "")} → ${to ? `v${to.replace(/^v/, "")}` : `현재(v${b.project.version})`}`;
    process.stdout.write(renderDiffMarkdown(diffModels(a, b), title));
  });

const kb = program.command("kb").description("참조자료(프로젝트 지식) 관리");
kb.command("add <files...>")
  .description("파일을 올려 색인 (txt, md, csv, json, html, eml, docx, pdf)")
  .option("--title <title>", "자료 제목 (파일 1개일 때)")
  .action(async (files: string[], o) => {
    const dir = await resolveDir();
    const m = await loadModel(dir);
    for (const f of files) {
      const r = await addKnowledgeFile(dir, m, f, { title: files.length === 1 ? o.title : undefined });
      const s = r.source;
      if (r.duplicateOf) console.log(`이미 올린 파일입니다: ${f} → ${r.duplicateOf}`);
      else if (s.index?.status === "INDEXED") console.log(`${s.id} ${s.title}: 색인 ${s.index.chunks}조각 · ${s.index.chars.toLocaleString()}자`);
      else console.log(`${s.id} ${s.title}: 보관만 함 — ${s.index?.message}`);
    }
    await saveModel(dir, m);
  });
kb.command("list").action(async () => {
  const m = await loadModel(await resolveDir());
  for (const s of m.sources)
    console.log(`${s.id}\t${s.title}\t${s.fileName ?? s.location}\t${s.index ? `${s.index.status} ${s.index.chunks}조각` : "색인 없음"}`);
});
kb.command("search <query...>")
  .option("-n, --limit <n>", "결과 수", "5")
  .action(async (words: string[], o) => {
    const dir = await resolveDir();
    const m = await loadModel(dir);
    const hits = search(await loadChunks(dir), words.join(" "), Number(o.limit));
    if (!hits.length) console.log("찾은 내용이 없습니다");
    for (const h of hits) {
      const src = m.sources.find((s) => s.id === h.chunk.sourceId);
      console.log(`\n[${h.score}] ${h.chunk.sourceId} ${src?.title ?? ""} · ${h.chunk.locator}\n${h.chunk.text.slice(0, 240)}${h.chunk.text.length > 240 ? "…" : ""}`);
    }
  });
kb.command("rm <sourceId>").action(async (id: string) => {
  const dir = await resolveDir();
  const m = await loadModel(dir);
  await removeKnowledgeFile(dir, m, id);
  await saveModel(dir, m);
  console.log(`${id}를 삭제했습니다`);
});

const link = program.command("link").description("참조 URL (운영 서비스·Figma 파일·참고 사이트·공유 뷰어) — AI 요청 프롬프트에 함께 담긴다");
link
  .command("add <url>")
  .requiredOption("--label <label>")
  .addOption(new Option("--kind <k>").choices(["SERVICE", "FIGMA", "REFERENCE", "VIEWER", "OTHER"]).default("REFERENCE"))
  .option("--system <code>", "특정 시스템에만 해당")
  .action(async (url: string, o) => {
    await mutate((m) => {
      if (o.system && !m.systems.some((s) => s.code === o.system)) throw new Error(`등록되지 않은 시스템입니다: ${o.system}`);
      if (m.project.links.some((l) => l.url === url)) throw new Error(`이미 있는 URL입니다: ${url}`);
      m.project.links.push({ label: o.label, url, kind: o.kind, systemCode: o.system });
    });
    console.log(`참조 URL을 추가했습니다: ${o.label} ${url}`);
  });
link.command("list").action(async () => {
  const m = await loadModel(await resolveDir());
  m.project.links.forEach((l, i) => console.log(`${i + 1}\t${l.kind}\t${l.label}${l.systemCode ? ` (${l.systemCode})` : ""}\t${l.url}`));
});
link.command("rm <url>").action(async (url: string) => {
  await mutate((m) => {
    const before = m.project.links.length;
    m.project.links = m.project.links.filter((l) => l.url !== url);
    if (m.project.links.length === before) throw new Error(`등록되지 않은 URL입니다: ${url}`);
  });
  console.log(`${url}를 삭제했습니다`);
});

program
  .command("prompt <kind> [target]")
  .description("AI 요청 프롬프트 출력 — kind: sb <화면ID> | proto <TaskID> | ia [시스템|ALL] | ds <시스템>")
  .addOption(new Option("--for <t>", "대상").choices(["figma", "claude"]).default("claude"))
  .option("--url <viewerUrl>", "공유 뷰어 주소 (프롬프트 참조 URL에 포함)")
  .action(async (kind: string, target: string | undefined, o) => {
    const dir = await resolveDir();
    const prompts = buildPrompts(await loadModel(dir), await loadChunks(dir), { viewerUrl: o.url });
    const key = `${kind}:${target ?? "ALL"}`;
    const p = prompts[key];
    if (!p) throw new Error(`프롬프트가 없습니다: ${key} (가능: ${Object.keys(prompts).join(", ")})`);
    process.stdout.write(o.for === "figma" ? p.figma : p.claude);
  });

const gen = program.command("gen").description("AI 생성 — ia <시스템> | sb <화면ID> | flow <요구사항ID> | ds <시스템>(미세조정)");
gen
  .command("prompt <kind> <target>")
  .description("생성 프롬프트 출력 (Claude에 붙여 넣어 JSON 결과를 받는다)")
  .option("--instruction <text>", "추가 지시 (ds는 필수)")
  .option("--refine <file>", "직전 결과 JSON 파일 — 미세조정 대화로 출력")
  .option("--scope <scope>", "디자인 조정 범위: global | colors | type | spacing | shape | control | layout | templates | comments | cmp:<컴포넌트ID>", "global")
  .option("--comments <text>", "디자인 댓글 (scope comments)")
  .action(async (kind: string, target: string, o) => {
    const dir = await resolveDir();
    const m = await loadModel(dir);
    const g = buildGenPrompts(m, await loadChunks(dir))[`${kind}:${target}`];
    if (!g) throw new Error(`생성 대상이 없습니다: ${kind}:${target}`);
    if (kind === "ds") {
      const d = m.design.systems.find((x) => x.systemCode === target)!;
      g.prompt = fillDsPrompt(g.prompt, { scope: scopeOf(o.scope), design: { tokens: d.tokens, layout: d.layout, componentStyles: d.componentStyles, components: d.components }, comments: o.comments });
    }
    if (g.specs) g.prompt = fillSpecPrompt(g.prompt, g.specs);
    if (g.requiresInstruction && !o.instruction && !o.refine) throw new Error("디자인 미세조정은 --instruction 이 필요합니다");
    if (o.refine) {
      const prev = await readFile(o.refine, "utf8");
      process.stdout.write(`[1] 사용자\n${g.prompt}${g.requiresInstruction ? "(처음 요청)" : ""}\n\n[2] Claude\n${prev.trim()}\n\n[3] 사용자\n${REFINE_INSTRUCTION}${o.instruction ?? ""}\n`);
    } else process.stdout.write(g.prompt + (o.instruction ? `\n${g.requiresInstruction ? "" : "## 추가 지시\n"}${o.instruction}\n` : ""));
  });
gen
  .command("apply <kind> <target> <file>")
  .description("생성 결과 JSON을 모델에 반영")
  .option("--instruction <text>", "이 결과를 만든 지시 (디자인 개정 이력에 남김)")
  .option("--scope <scope>", "디자인 조정 범위 — 범위 밖 값이 있으면 반영하지 않음")
  .action(async (kind: string, target: string, file: string, o) => {
    if (!(GEN_KINDS as readonly string[]).includes(kind)) throw new Error(`kind는 ${GEN_KINDS.join(" | ")}`);
    const output = JSON.parse(await readFile(file, "utf8"));
    const r = await mutate((m) => applyGenerated(m, kind as GenKind, target, output, { instruction: o.instruction, scope: o.scope }));
    console.log(r.summary);
    for (const c of r.changes) console.log(`  - ${c}`);
    if (kind === "ds" && r.affectedScreens.length) console.log(`다시 그려지는 화면: ${r.affectedScreens.join(", ")}`);
  });
gen.command("review").description("디자인 변경 뒤 다시 검토할 화면").action(async () => {
  const list = screensNeedingReview(await loadModel(await resolveDir()));
  if (!list.length) console.log("다시 검토할 화면이 없습니다");
  for (const x of list) console.log(`${x.screenId}\t${x.systemCode}\t디자인 r${x.from ?? 1} → r${x.to}`);
});

const design = program.command("design").description("시스템별 디자인 시스템");
design
  .command("propose <system>")
  .description("컨셉 3종 제안")
  .action(async (code: string) => {
    const d = await mutate((m) => proposeDesign(m, code));
    for (const c of d.proposals) console.log(`${c.id}. ${c.name} — ${c.summary}\n   어울리는 경우: ${c.fit}`);
    console.log(`\n선택: planning design select ${code} <A|B|C>`);
  });
design
  .command("select <system> <concept>")
  .description("컨셉을 선택해 디자인 시스템 생성")
  .action(async (code: string, concept: string) => {
    const d = await mutate((m) => selectDesign(m, code, concept));
    const c = d.proposals.find((p) => p.id === d.selectedId)!;
    console.log(`${code} 디자인 시스템을 만들었습니다: ${c.name} · 컴포넌트 ${d.components.length}개 · 아이콘 ${d.icons.length}개`);
  });
design
  .command("show <system>")
  .action(async (code: string) => {
    const d = getSystemDesign(await loadModel(await resolveDir()), code);
    if (!d) return console.log(`${code} 디자인 시스템이 없습니다. planning design propose ${code}`);
    console.log(`${code} ${d.status === "SELECTED" ? `선택 컨셉 ${d.selectedId}` : "컨셉 선택 대기"}`);
    for (const c of d.components) console.log(`  ${c.id}\t${c.name}${c.origin === "ADDED" ? `\t(추가: ${c.addedFor ?? ""})` : ""}`);
  });
design
  .command("component-add <system> <id>")
  .description("새 컴포넌트를 디자인 시스템에 추가 (스토리보드에서 쓰기 전에)")
  .requiredOption("--name <name>")
  .addOption(new Option("--category <c>").choices(["navigation", "search", "data", "form", "action", "feedback", "content", "layout"]).makeOptionMandatory())
  .option("--desc <text>", "", "")
  .option("--variants <list>", "변형 (쉼표 구분)", list, [])
  .option("--for <ref>", "필요한 화면·Task ID")
  .action(async (code: string, id: string, o) => {
    const c = await mutate((m) =>
      addDesignComponent(m, code, { id, name: o.name, category: o.category, description: o.desc, variants: o.variants, addedFor: o.for }),
    );
    console.log(`${code} 디자인 시스템에 ${c.id}(${c.name})를 추가했습니다`);
  });

program
  .command("view")
  .description("프로젝트 뷰어 HTML 생성 (대시보드·추적표·정보구조도·플로우·버전 이력)")
  .option("--all", "루트의 모든 프로젝트를 한 뷰어에 담기")
  .option("--out <file>", "출력 파일 (기본: 프로젝트 폴더의 outputs/viewer.html, --all이면 루트/viewer.html)")
  .option("--fragment", "문서 뼈대(<html>, <head>) 없이 본문 조각만 출력")
  .option("--url <viewerUrl>", "이 뷰어를 올릴 주소 (AI 요청 프롬프트의 참조 URL로 들어감)")
  .action(async (o) => {
    const { root } = program.opts<{ root: string }>();
    const dirs = o.all ? (await listProjectCodes(root)).map((c) => projectDir(root, c)) : [await resolveDir()];
    if (!dirs.length) throw new Error(`프로젝트가 없습니다 (${root})`);
    const now = new Date();
    const projects = await Promise.all(dirs.map((d) => collectViewerProject(d, now, { viewerUrl: o.url })));
    const html = await renderViewer({ generatedAt: now.toISOString(), viewerUrl: o.url, projects }, { standalone: !o.fragment });
    const out = o.out ?? (o.all ? path.join(root, "viewer.html") : path.join(dirs[0]!, "outputs", "viewer.html"));
    await writeFile(out, html);
    console.log(`뷰어를 만들었습니다: ${out} (프로젝트 ${projects.length}건)`);
  });

program
  .command("serve")
  .description("웹 서비스 실행 — 회원가입·로그인, 프로젝트 멤버 초대, 편집, AI 생성 (환경변수 PORT, HOST, PLANNING_SECRET, ANTHROPIC_API_KEY)")
  .option("--port <n>", "포트", process.env.PORT ?? "8080")
  .option("--host <h>", "주소", process.env.HOST ?? "0.0.0.0")
  .option("--closed-signup", "초대받은 이메일만 가입 (첫 가입자는 예외)")
  .action(async (o) => {
    const { root } = program.opts<{ root: string }>();
    const { createLocalApp } = await import("./server/app.js");
    const key = process.env.ANTHROPIC_API_KEY;
    const app = await createLocalApp({
      root,
      secret: process.env.PLANNING_SECRET,
      openSignup: !(o.closedSignup || process.env.PLANNING_SIGNUP === "closed"),
      admins: (process.env.PLANNING_ADMINS ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      secureCookie: process.env.COOKIE_SECURE === "1" ? true : undefined,
      serverAi: key ? { provider: "anthropic", model: process.env.PLANNING_AI_MODEL ?? "claude-opus-5", apiKey: key } : null,
    });
    app.server.listen(Number(o.port), o.host, () => {
      console.log(`Planning Studio 서비스: http://${o.host === "0.0.0.0" ? "localhost" : o.host}:${o.port}  (데이터: ${path.resolve(root)})`);
      if (!process.env.PLANNING_SECRET) console.log("PLANNING_SECRET 이 없어 .service/secret.key 로 AI 키를 암호화합니다. 운영 환경에서는 환경변수로 지정하세요.");
    });
  });

// 출력이 head 등으로 잘려도(EPIPE) 오류 없이 끝낸다
process.stdout.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

program.parseAsync().catch((e: Error) => {
  console.error(`오류: ${e.message}`);
  process.exitCode = 1;
});
