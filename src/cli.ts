#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command, Option } from "commander";
import { validateModel } from "./model/validate.js";
import {
  addRequirement,
  addSystem,
  addTask,
  excludeRequirement,
  recordReview,
  removeTask,
} from "./project/ops.js";
import { createProject, loadModel, projectDir, saveModel } from "./project/store.js";
import { renderRtmCsv, renderRtmMarkdown, type RtmView } from "./render/rtm-render.js";
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

async function resolveDir(): Promise<string> {
  const { root, project } = program.opts<{ root: string; project?: string }>();
  if (project) return projectDir(root, project);
  const entries = existsSync(root) ? await readdir(root, { withFileTypes: true }) : [];
  const codes = entries.filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, "project.json"))).map((e) => e.name);
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
  .action(async (o) => {
    const r = await mutate((m) =>
      addRequirement(m, {
        title: o.title,
        description: o.desc,
        originalId: o.originalId,
        type: o.type,
        priority: o.priority,
        sources: (o.source ?? []).map((s: string) => {
          const [sourceId, ...rest] = s.split(":");
          return { sourceId: sourceId!, locator: rest.join(":") };
        }),
      }),
    );
    console.log(`요구사항을 추가했습니다: ${r.id} ${r.title}`);
    console.log(`다음: planning task add ${r.id} --system <코드> --action "<처리 내용>"`);
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

// 출력이 head 등으로 잘려도(EPIPE) 오류 없이 끝낸다
process.stdout.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

program.parseAsync().catch((e: Error) => {
  console.error(`오류: ${e.message}`);
  process.exitCode = 1;
});
