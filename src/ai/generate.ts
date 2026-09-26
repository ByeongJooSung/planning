/**
 * AI 생성 프롬프트 (PRD §4.10B) — Claude에게 산출물을 JSON으로 만들게 한다.
 *
 * 1차 생성: 아래 프롬프트(+ 작업자의 추가 지시)
 * 미세조정: [생성 프롬프트, 직전 결과 JSON, “이렇게 고쳐 달라”] 순서의 대화로 다시 요청 → 같은 형식 전체를 돌려받는다.
 * 결과는 applyGenerated()로 모델에 반영한다.
 */
import type { Chunk } from "../knowledge/search.js";
import { scopeOf, styleVarsOf, type DesignScope } from "../design/catalog.js";
import type { Model, SystemDesign } from "../model/schema.js";
import { buildRtm, STATUS_LABEL } from "../trace/rtm.js";
import type { GenKind } from "./apply.js";
import { SPEC_SLOT, specItems, type SpecItem } from "./spec.js";
import {

  componentCatalog,
  componentLines,
  Ctx,
  finish,
  KIND,
  projectLine,
  section,
  tokensBlock,
  urlBlock,
  VIEWPORT,
  type PromptOptions,
} from "./prompts.js";

export interface GenPrompt {
  kind: GenKind;
  target: string;
  title: string;
  prompt: string;
  /** true면 작업자의 지시가 있어야 생성할 수 있다 (디자인 미세조정) */
  requiresInstruction: boolean;
  /** 관련 요구사항의 기능 명세 — prompt의 SPEC_SLOT을 이것(작업자 편집본)으로 채운다 */
  specs?: SpecItem[];
}

/** 미세조정 요청 문구. 대화의 마지막 user 턴 */
export const REFINE_INSTRUCTION =
  "위 결과를 아래 요청대로 고쳐 주세요. 바뀌지 않은 부분도 빠짐없이 포함해, 처음과 같은 JSON 형식 전체를 다시 주세요. JSON만 답하세요.\n\n요청: ";

const PROPS_GUIDE = `컴포넌트별 props 형식 (ui.props):
- search-panel: {"fields":[{"label":"기간","type":"date-range"},{"label":"상태","type":"select","options":["전체","심사중"]},{"label":"검색어","type":"text","placeholder":"제목"}]}
- data-table: {"total":42,"columns":["번호","제목","상태"],"rows":[["1","…","심사중"]],"badgeColumn":2} + ui.link(행 클릭 이동 화면)
- pagination: {"total":42} · tabs: {"items":["전체 6","반려 1"],"active":0} · step-indicator: {"steps":["입력","확인","완료"],"current":0}
- detail-table: {"rows":[["항목","값"]]} · file-list: {"files":["파일명.pdf (1.2MB)"]} · status-badge: {"label":"승인"}
- text-input / textarea: {"label":"제목","placeholder":"…","required":true} · select / radio-group: {"label":"…","options":["…"],"value":"…","required":true}
- checkbox-group: {"label":"…","options":["…"],"values":["…"]} · date-range: {"label":"기간"} · file-upload: {"label":"첨부파일","hint":"PDF, 20MB"}
- button-group: {"buttons":[{"label":"임시저장","variant":"secondary","action":"toast","message":"임시저장했습니다."},{"label":"신청","variant":"primary","action":"submit","confirm":"신청할까요?","message":"접수했습니다.","link":"이동 화면 ID"}]}
- stat-cards: {"items":[["신규","12"]]} · notice-list: {"title":"공지사항","items":[["제목","09-24"]]} · hero-banner: {"title":"…","text":"…"} · quick-links: {"items":["…"]}
- 그 밖의 컴포넌트(추가 컴포넌트 포함): {"items":[["일시","처리자","상태","내용"]]} 처럼 표시할 데이터만`;

export function buildGenPrompts(m: Model, chunks: Chunk[], opts: PromptOptions = {}): Record<string, GenPrompt> {
  const c = new Ctx(m, chunks, buildRtm(m), opts);
  const out: Record<string, GenPrompt> = {};
  for (const s of m.systems.filter((x) => x.hasScreens)) out[`ia:${s.code}`] = iaGen(c, s.code);
  for (const n of m.ia.nodes.filter((x) => x.kind !== "MENU")) out[`sb:${n.id}`] = sbGen(c, n.id);
  for (const sb of m.storyboard.screens) if (c.node(sb.screenId)) out[`desc:${sb.screenId}`] = descGen(c, sb.screenId);
  for (const r of c.rtm.rows) if (r.status !== "EXCLUDED" && r.tasks.length) out[`flow:${r.requirementId}`] = flowGen(c, r.requirementId);
  for (const d of m.design.systems) if (d.status === "SELECTED") out[`ds:${d.systemCode}`] = dsGen(c, d.systemCode);
  return out;
}

function head(title: string, what: string) {
  return `# 생성 요청: ${title}\n${what}\n반드시 JSON 하나만 답하세요(설명 문장 없이).\n`;
}

function iaGen(c: Ctx, code: string): GenPrompt {
  const s = c.system(code)!;
  const nodes = c.m.ia.nodes.filter((n) => n.systemCode === code);
  const tasks = c.rtm.rows
    .filter((r) => r.status !== "EXCLUDED")
    .flatMap((r) => r.tasks.filter((t) => t.systemCode === code).map((t) => `- ${t.taskId} (${r.requirementId} ${r.title}) ${t.actor ? `${t.actor}: ` : ""}${t.action}${t.screenless ? " — 화면 없음" : ""} · 현재 화면: ${t.screens.join(", ") || "없음"} · ${STATUS_LABEL[t.status]}`))
    .join("\n");
  const rule = c.m.project.screenIdRule;
  const prefix = s.screenIdPrefix ?? s.code;
  const ev = c.evidence(`${s.name} 메뉴 화면 ${c.rtm.rows.map((r) => r.title).join(" ")}`, 4);
  const existing = c.m.project.serviceType === "EXISTING";
  const prompt = finish([
    head(`${code} ${s.name} 정보구조도`, "이 시스템의 메뉴·화면 구조(정보구조도)를 만들어 주세요. 모든 Task가 필요한 화면에 연결되어야 합니다."),
    section("대상", `${projectLine(c)}\n- 시스템: ${code} ${s.name} (주 사용자: ${s.users.join(", ") || "-"}, 채널: ${s.channels.join(", ") || "-"})`),
    section("참조 URL", urlBlock(c.urls(code))),
    section("이 시스템의 Task", tasks || "- (없음)"),
    section("현재 정보구조 (있으면 유지·보완)", nodes.length ? JSON.stringify({ nodes: nodes.map(({ systemCode: _, ...n }) => n) }) : "- (없음, 새로 설계)"),
    section("참조자료 근거", ev.text),
    section(
      "규칙",
      [
        `- 화면 ID 규칙: ${rule.pattern} (system=${prefix}, d1·d2는 영문 약어 대문자 3자, seq는 ${rule.seqStart}부터 ${rule.seqStep}씩 ${rule.seqDigits}자리). 예: ${prefix}_INF_REG_010. 팝업은 부모 화면 ID + ${rule.popupSuffix.replace("{nn}", "01")}`,
        `- 메뉴 노드는 kind "MENU", id는 "M-${prefix}-약어"`,
        "- 이미 있는 화면은 같은 id를 그대로 쓴다. 폐기된 id는 다시 쓰지 않는다: " + (c.m.ia.retiredIds.join(", ") || "없음"),
        "- 화면이 필요한 Task마다 알맞은 화면의 taskIds에 Task ID를 넣는다. 한 Task가 여러 화면(목록·상세·팝업)을 쓸 수 있다",
        `- change: ${existing ? "기존 화면은 KEPT, 바꾸는 화면은 CHANGED(+changeReason), 새 화면은 NEW" : "모두 NEW"}`,
        "- 로그인이 필요한 화면은 loginRequired true",
        "- 메뉴 depth는 3단계 이하, 1depth 메뉴는 7개 이하",
      ].join("\n"),
    ),
    section(
      "출력 형식",
      '{"nodes":[{"id":"M-' + prefix + '-INF","parentId":null,"name":"정보공개","kind":"MENU","loginRequired":false,"roles":[],"taskIds":[],"change":"NEW"},{"id":"' + prefix + '_INF_LST_010","parentId":"M-' + prefix + '-INF","name":"목록","kind":"PAGE","loginRequired":false,"roles":[],"taskIds":["REQ-001-T01"],"change":"NEW"}]}\nkind: MENU | PAGE | POPUP | LAYER | TAB | EXTERNAL',
    ),
  ]);
  return { kind: "ia", target: code, title: `${code} ${s.name} 정보구조도`, prompt, requiresInstruction: false };
}

function sbGen(c: Ctx, screenId: string): GenPrompt {
  const node = c.node(screenId)!;
  const s = c.system(node.systemCode);
  const d = c.design(node.systemCode);
  const sb = c.m.storyboard.screens.find((x) => x.screenId === screenId);
  const tasks = c.tasksOfScreen(screenId);
  const reqs = [...new Set(tasks.map(({ r }) => r.requirementId))].map((id) => c.m.requirements.find((r) => r.id === id)!);
  const parent = node.kind === "POPUP" && node.parentId ? c.node(node.parentId) : undefined;
  const siblings = c.m.ia.nodes.filter((n) => n.systemCode === node.systemCode && n.kind !== "MENU" && n.id !== screenId).map((n) => `${n.id} ${n.name}`).join(", ");
  const states = c.m.policies.stateSets.map((x) => `- ${x.name}(${x.id}): ${x.values.join(" → ")}`).join("\n");
  const ev = c.evidence(`${node.name} ${tasks.map(({ t }) => t.action).join(" ")} ${reqs.map((r) => r.title).join(" ")}`, 5);
  const prompt = finish([
    head(`${screenId} ${node.name} 화면설계서`, "이 화면의 화면설계서(번호별 화면 구성과 설명)를 만들어 주세요."),
    section(
      "대상",
      [
        projectLine(c),
        `- 시스템: ${node.systemCode} ${s?.name ?? ""} (주 사용자: ${s?.users.join(", ") || "-"})`,
        `- 화면: ${screenId} ${node.name} · ${KIND[node.kind]} · Location: ${c.path(screenId).join(" > ")}${node.loginRequired ? " · 로그인 필요" : ""}${parent ? ` · 부모 화면 ${parent.id} ${parent.name} 위 팝업` : ""}`,
        `- 설계 규격: ${VIEWPORT.width}×${VIEWPORT.height} 데스크톱, 줄바꿈 없이 한 줄에 들어가는 라벨·버튼 문구`,
        ...tasks.map(({ r, t }) => `- Task: ${t.taskId} [${t.systemCode}] ${t.actor ? `${t.actor}: ` : ""}${t.action} (${r.requirementId} ${r.title})`),
      ].join("\n"),
    ),
    section("요구사항 원문", reqs.map((r) => `- ${r.id} ${r.title}: ${r.description || "(설명 없음)"}`).join("\n")),
    section("기능 명세 (작업자 확인)", SPEC_SLOT),
    section("공통 상태값", states),
    section("같은 시스템의 다른 화면 (이동 대상)", siblings),
    section("참조 URL", urlBlock(c.urls(node.systemCode))),
    section("참조자료 근거", ev.text),
    section(`디자인 시스템 (${node.systemCode})`, tokensBlock(d, node.systemCode)),
    section("쓸 수 있는 컴포넌트 (ui.component는 이 ID만)", componentCatalog(d)),
    section("현재 화면설계서 (있으면 보완)", sb ? componentLines(sb) : "- (없음, 새로 작성)"),
    section(
      "작성 규칙",
      [
        "- 설명은 기획자 관점(planner: 정책·노출 조건·규칙·예외)과 고객 관점(customer: 보이는 것·할 수 있는 것·안내 문구)으로만 쓴다. 개발자 관점(API, DB, 구현)은 쓰지 않는다",
        "- 선택 요소(셀렉트·라디오·체크·탭·필터)는 options.values 전체와 default를 쓴다. options는 반드시 {\"values\":[\"…\"],\"default\":\"…\"} 모양이고, 선택지가 없는 요소에는 options를 넣지 않는다",
        "- 입력 요소는 validation: required, minLength/maxLength, format, timing(ON_INPUT|ON_BLUR|ON_SUBMIT), messages(condition, text)",
        "- 참조자료(회의록 결정 등)와 어긋나지 않게. 근거 없는 수치·문구는 지어내지 말고 planner에 ‘확인 필요’로 적는다",
        "- 기능 명세의 항목·규칙·조건·메시지를 이 화면에 해당하는 만큼 빠짐없이 반영한다. 명세와 요구사항 원문이 다르면 명세를 따른다",
        "- no는 1부터 위→아래 순서",
      ].join("\n"),
    ),
    section("props 안내", PROPS_GUIDE),
    section(
      "출력 형식",
      '{"template":"list|detail|form|dashboard|main|login|popup","components":[{"no":1,"label":"검색 조건","kind":"search-panel","planner":"…","customer":"…","options":{"values":["전체","심사중"],"default":"전체"},"validation":{"required":true,"maxLength":100,"timing":["ON_SUBMIT"],"messages":[{"condition":"미입력","text":"…"}]},"ui":{"component":"search-panel","props":{},"link":"이동 화면 ID(없으면 생략)"}}]}\noptions·validation·link는 해당할 때만 넣는다.',
    ),
  ]);
  return { kind: "sb", target: screenId, title: `${screenId} ${node.name} 화면설계서`, prompt, requiresInstruction: false, specs: specItems(c.m, c.chunks, reqs.map((r) => r.id)) };
}

/** 설명(디스크립션)만 다시 쓰기 — 항목·와이어프레임은 그대로 두고 planner·customer·options·validation을 채운다. 대상 항목은 요청할 때 채운다 */
export const DESC_SLOT = "{{COMPONENTS}}";
function descGen(c: Ctx, screenId: string): GenPrompt {
  const node = c.node(screenId)!;
  const s = c.system(node.systemCode);
  const tasks = c.tasksOfScreen(screenId);
  const reqs = [...new Set(tasks.map(({ r }) => r.requirementId))].map((id) => c.m.requirements.find((r) => r.id === id)!);
  const states = c.m.policies.stateSets.map((x) => `- ${x.name}(${x.id}): ${x.values.join(" → ")}`).join("\n");
  const ev = c.evidence(`${node.name} ${tasks.map(({ t }) => t.action).join(" ")} ${reqs.map((r) => r.title).join(" ")}`, 5);
  const prompt = finish([
    head(`${screenId} ${node.name} 화면설계서 설명 작성`, "아래 화면 항목들의 설명(디스크립션)을 써 주세요. 항목 구성·번호·라벨·컴포넌트는 바꾸지 않고, 설명·옵션·유효성만 채웁니다."),
    section(
      "대상",
      [
        projectLine(c),
        `- 시스템: ${node.systemCode} ${s?.name ?? ""} (주 사용자: ${s?.users.join(", ") || "-"})`,
        `- 화면: ${screenId} ${node.name} · ${KIND[node.kind]} · Location: ${c.path(screenId).join(" > ")}`,
        ...tasks.map(({ r, t }) => `- Task: ${t.taskId} [${t.systemCode}] ${t.actor ? `${t.actor}: ` : ""}${t.action} (${r.requirementId} ${r.title})`),
      ].join("\n"),
    ),
    section("요구사항 원문", reqs.map((r) => `- ${r.id} ${r.title}: ${r.description || "(설명 없음)"}`).join("\n")),
    section("기능 명세 (작업자 확인)", SPEC_SLOT),
    section("공통 상태값", states),
    section("참조자료 근거", ev.text),
    section("설명을 쓸 항목 (no·label·kind·현재 설명)", DESC_SLOT),
    section(
      "작성 규칙",
      [
        "- planner(기획자 관점): 정책·노출 조건·규칙·예외·상태 변화. customer(고객 관점): 보이는 것·할 수 있는 것·안내 문구. 개발자 관점(API, DB, 구현)은 쓰지 않는다",
        "- 기능 명세와 요구사항 원문에 있는 규칙·조건·메시지를 해당 항목에 빠짐없이 넣는다. 근거 없는 수치·문구는 지어내지 말고 planner에 ‘확인 필요’로 적는다",
        '- 선택 요소는 options {"values":[…],"default":"…"}, 입력 요소는 validation {required, minLength, maxLength, format, timing[ON_INPUT|ON_BLUR|ON_SUBMIT], messages[{condition,text}]}. 해당 없으면 넣지 않는다',
        "- 현재 설명이 있으면 더 정확하고 구체적으로 다듬는다. 각 설명은 1~3문장",
        "- 요청한 항목 번호(no)만, 빠짐없이 답한다",
      ].join("\n"),
    ),
    section("출력 형식", '{"components":[{"no":1,"planner":"…","customer":"…","options":{"values":["전체공개","부분공개"],"default":"전체공개"},"validation":{"required":true,"maxLength":100,"timing":["ON_SUBMIT"],"messages":[{"condition":"미입력","text":"제목을 입력해 주세요."}]}}]}'),
  ]);
  return { kind: "sb", target: screenId, title: `${screenId} ${node.name} 설명 AI 작성`, prompt, requiresInstruction: false, specs: specItems(c.m, c.chunks, reqs.map((r) => r.id)) };
}

function flowGen(c: Ctx, requirementId: string): GenPrompt {
  const row = c.rtm.rows.find((r) => r.requirementId === requirementId)!;
  const req = c.m.requirements.find((r) => r.id === requirementId)!;
  const tasks = row.tasks
    .map((t) => {
      const raw = req.tasks.find((x) => x.id === t.taskId)!;
      return `- ${t.taskId} [${t.systemCode}] ${t.actor ? `${t.actor}: ` : ""}${t.action}${raw.after.length ? ` · 선행 ${raw.after.join(", ")}` : ""}${raw.transition ? ` · 상태 ${raw.transition.from ?? ""}→${raw.transition.to}` : ""} · 화면 ${t.screenless ? "없음" : t.screens.join(", ") || "미연결"}`;
    })
    .join("\n");
  const systems = [...new Set(row.tasks.map((t) => t.systemCode))].map((code) => c.system(code)).filter(Boolean);
  const existing = c.m.flows.find((f) => f.nodes.some((n) => n.taskIds.some((id) => id.startsWith(`${requirementId}-`))));
  const ev = c.evidence(`${req.title} ${req.description} 절차 반려 보완 승인`, 4);
  const flowId = existing?.id ?? `PF-${requirementId}`;
  const prompt = finish([
    head(`${requirementId} ${req.title} 프로세스 플로우`, "이 요구사항의 업무 처리 흐름을 시스템별 레인으로 나눈 프로세스 플로우로 만들어 주세요."),
    section("대상", `${projectLine(c)}\n- 요구사항: ${requirementId} ${req.title}: ${req.description || "(설명 없음)"}`),
    section("기능 명세 (작업자 확인)", SPEC_SLOT),
    section("Task (처리 순서의 근거)", tasks),
    section("레인 (시스템 구분)", systems.map((s) => `- L-${s!.code}: ${s!.name} · ${s!.users[0] ?? ""} (systemCode ${s!.code})`).join("\n")),
    section("현재 플로우 (있으면 보완)", existing ? JSON.stringify(existing) : "- (없음, 새로 작성)"),
    section("참조자료 근거", ev.text),
    section(
      "규칙",
      [
        "- shape: TERMINATOR(시작·종료) PROCESS(처리) DECISION(판단, 분기 edge에 label) DOCUMENT(문서) IO(입출력·연계)",
        "- 각 처리 노드는 해당 Task ID를 taskIds에, 화면이 있으면 screenId에 넣는다",
        "- 반려·보완처럼 되돌아가는 흐름도 edge로 넣는다",
        "- 기능 명세의 처리 조건·분기·예외를 빠짐없이 흐름에 반영한다",
        `- flow id는 "${flowId}", kind "PROCESS", 노드 id는 n1, n2 …`,
      ].join("\n"),
    ),
    section(
      "출력 형식",
      `{"id":"${flowId}","kind":"PROCESS","title":"${req.title} 처리 프로세스","lanes":[{"id":"L-CVL","label":"민원포털 · 민원인","systemCode":"CVL"}],"nodes":[{"id":"n1","shape":"TERMINATOR","label":"시작","lane":"L-CVL","taskIds":[],"change":"NEW"}],"edges":[{"from":"n1","to":"n2","label":""}]}`,
    ),
  ]);
  return { kind: "flow", target: requirementId, title: `${requirementId} ${req.title} 프로세스 플로우`, prompt, requiresInstruction: false, specs: specItems(c.m, c.chunks, [requirementId]) };
}

/** 디자인 미세조정 프롬프트의 자리표시자 — 조정 범위·현재 디자인(적용본 포함)·댓글은 요청할 때 채운다 */
export const DS_SLOTS = { scope: "{{SCOPE}}", design: "{{DESIGN}}", vars: "{{STYLE_VARS}}", comments: "{{COMMENTS}}" } as const;

function dsGen(c: Ctx, code: string): GenPrompt {
  const d = c.design(code)!;
  const s = c.system(code);
  const screens = c.m.storyboard.screens.filter((x) => x.systemCode === code).map((x) => `${x.screenId} ${x.title}`);
  const prompt = finish([
    head(`${code} ${s?.name ?? ""} 디자인 시스템 미세조정`, "아래 디자인 시스템을 작업자의 요청대로 조정하는 패치를 만들어 주세요. 바뀌는 값만 넣습니다."),
    section("대상", `${projectLine(c)}\n- 시스템: ${code} ${s?.name ?? ""} (주 사용자: ${s?.users.join(", ") || "-"})`),
    section("조정 범위 (이 범위 밖의 값은 넣지 않는다)", DS_SLOTS.scope),
    section("현재 디자인 시스템 (적용된 조정 포함, JSON)", DS_SLOTS.design),
    section("컴포넌트", componentCatalog(d)),
    section("조정할 수 있는 컴포넌트 스타일 변수 (componentStyles)", DS_SLOTS.vars),
    section("이 디자인 시스템을 쓰는 화면 (패치 후 한꺼번에 다시 그려짐)", screens.map((x) => `- ${x}`).join("\n") || "- (없음)"),
    section("참조 URL", urlBlock(c.urls(code))),
    section(
      "규칙",
      [
        "- 색은 #RRGGBB. 글자와 배경의 명도 대비 4.5:1 이상(웹 접근성)",
        '- 글꼴(font.family)은 "Noto Sans KR", "Gothic A1", "IBM Plex Sans KR" 중 하나 + 대체 글꼴: 예 "\\"Noto Sans KR\\", \\"Malgun Gothic\\", sans-serif"',
        "- layout 값: nav top|top-mega|side · logo left|center · search header|hero|panel · list table|card · pagination numbered|numbered-size|more · button square|rounded|pill · density comfortable|compact · footer full|simple|none",
        "- componentStyles 값: 색은 #RRGGBB, 크기는 \"12px\" 처럼 px, 굵기는 \"600\" 처럼 숫자. 위 목록에 있는 변수만 쓴다",
        "- 새 컴포넌트는 components.add로만 추가(id는 영문 소문자·하이픈). 기존 컴포넌트 ID는 바꾸지 않는다(화면설계서가 ID로 참조)",
        "- 댓글이 있으면 각 댓글이 가리키는 컴포넌트·위치를 근거로 고치고, summary에 댓글 번호별로 무엇을 바꿨는지 쓴다",
        "- 댓글이 특정 컴포넌트를 가리키면 그 컴포넌트의 componentStyles로 먼저 고친다. 디자인 시스템으로 바꿀 수 없는 요청(문구·항목·배치·데이터)은 고치지 말고 comments에 done:false와 이유를 적는다",
        '- 댓글이 있으면 댓글별 결과를 넣는다: "comments":[{"id":"C1","done":true,"change":"무엇을 바꿨나"},{"id":"C2","done":false,"reason":"왜 못 했나"}]',
        "- 요청과 관계없는 값은 넣지 않는다",
      ].join("\n"),
    ),
    section("댓글", DS_SLOTS.comments),
    section(
      "출력 형식",
      '{"summary":"변경 요약 한 줄","tokens":{"color":{"primary":"#1F5FBF"}},"layout":{"button":"rounded"},"componentStyles":{"data-table":{"--w-th-bg":"#E8EEF7","--w-row":"44px"}},"components":{"add":[{"id":"info-box","name":"안내 상자","category":"content","description":"…","variants":[]}]}}',
    ),
    "## 요청\n",
  ]);
  return { kind: "ds", target: code, title: `${code} ${s?.name ?? ""} 디자인 시스템 미세조정`, prompt, requiresInstruction: true };
}

export interface DesignFill {
  scope: DesignScope;
  design: Pick<SystemDesign, "tokens" | "layout" | "componentStyles" | "components">;
  comments?: string;
}

function styleVarLines(fill: DesignFill): string {
  const ids = fill.scope.id.startsWith("cmp:") ? [fill.scope.id.slice(4)] : fill.design.components.map((x) => x.id);
  return ids
    .map((id) => `- ${id}: ${styleVarsOf(id).map((v) => `${v.name}(${v.label}, ${v.type}, 기본 ${v.base}${fill.design.componentStyles?.[id]?.[v.name] ? `, 현재 ${fill.design.componentStyles[id]![v.name]}` : ""})`).join(" · ")}`)
    .join("\n");
}

/** 디자인 미세조정 프롬프트의 자리표시자를 채운다 (뷰어 viewer.js의 fillDs와 같은 규칙) */
export function fillDsPrompt(template: string, fill: DesignFill): string {
  return template
    .replace(DS_SLOTS.scope, `- ${fill.scope.label}: ${fill.scope.hint}\n- 바꿀 수 있는 경로: ${fill.scope.allowed.join(", ")}`)
    .replace(DS_SLOTS.design, JSON.stringify({ tokens: fill.design.tokens, layout: fill.design.layout, componentStyles: fill.design.componentStyles ?? {} }))
    .replace(DS_SLOTS.vars, styleVarLines(fill))
    .replace(DS_SLOTS.comments, fill.comments || "- (없음)");
}

