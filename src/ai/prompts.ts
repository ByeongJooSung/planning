/**
 * AI 요청 프롬프트 (PRD §4.10)
 *
 * 화면설계서·정보구조도·프로토타입·디자인 시스템마다 두 가지 프롬프트를 만든다.
 *   figma  : Figma MCP가 연결된 Claude에게 “Figma에 그려 달라”고 요청
 *   claude : Claude에게 산출물 작성·검토를 요청 (결과를 모델 형식으로 돌려받음)
 * 프롬프트에는 참조 URL(운영 서비스·Figma 파일·참고 사이트·공유 뷰어)과
 * 참조자료 검색 결과(근거 문단)를 함께 담는다.
 */
import { search, type Chunk } from "../knowledge/search.js";
import type { DesignComponent, Model, StoryboardScreen, SystemDesign } from "../model/schema.js";
import { buildRtm, STATUS_LABEL, type Rtm } from "../trace/rtm.js";

export interface PromptUrl {
  label: string;
  url: string;
}

export interface PromptSet {
  title: string;
  figma: string;
  claude: string;
  urls: PromptUrl[];
  /** 근거로 넣은 참조자료 조각 수 */
  evidence: number;
}

export interface PromptOptions {
  /** 공유 뷰어 주소. 프로젝트 코드를 #앵커로 붙인다 */
  viewerUrl?: string;
}

/** 설계 기준 뷰포트 */
export const VIEWPORT = { width: 1920, height: 1080 };

const LAYOUT: Record<string, [string, Record<string, string>]> = {
  nav: ["GNB 위치", { top: "상단", "top-mega": "상단 메가메뉴", side: "좌측 사이드" }],
  logo: ["로고 위치", { left: "왼쪽", center: "가운데" }],
  search: ["검색 영역", { header: "헤더 안", hero: "첫 화면 큰 검색창", panel: "목록 위 조건 패널" }],
  list: ["목록 형태", { table: "표(그리드)", card: "카드" }],
  pagination: ["페이지네이션", { numbered: "번호", "numbered-size": "번호 + 목록 개수 선택", more: "더보기" }],
  button: ["버튼 모서리", { square: "각진", rounded: "둥근", pill: "알약형" }],
  density: ["밀도", { comfortable: "여유", compact: "촘촘" }],
  footer: ["푸터", { full: "기관 정보 전체", simple: "간단", none: "없음" }],
};
export const KIND: Record<string, string> = { MENU: "메뉴", PAGE: "페이지", POPUP: "팝업", LAYER: "레이어", TAB: "탭", EXTERNAL: "외부" };
export const CHANGE: Record<string, string> = { NEW: "신규", CHANGED: "변경", DELETED: "삭제", KEPT: "유지" };
const TIMING: Record<string, string> = { ON_INPUT: "입력 중", ON_BLUR: "입력칸을 벗어날 때", ON_SUBMIT: "제출 시" };

export function buildPrompts(m: Model, chunks: Chunk[], opts: PromptOptions = {}): Record<string, PromptSet> {
  const rtm = buildRtm(m);
  const ctx = new Ctx(m, chunks, rtm, opts);
  const out: Record<string, PromptSet> = {};
  for (const sb of m.storyboard.screens) out[`sb:${sb.screenId}`] = storyboardPrompt(ctx, sb);
  for (const r of rtm.rows) for (const t of r.tasks) if (!t.screenless && t.storyboard.length) out[`proto:${t.taskId}`] = prototypePrompt(ctx, t.taskId);
  out["ia:ALL"] = iaPrompt(ctx, null);
  for (const s of m.systems.filter((x) => x.hasScreens)) out[`ia:${s.code}`] = iaPrompt(ctx, s.code);
  for (const d of m.design.systems) out[`ds:${d.systemCode}`] = designPrompt(ctx, d.systemCode);
  return out;
}

export class Ctx {
  constructor(
    readonly m: Model,
    readonly chunks: Chunk[],
    readonly rtm: Rtm,
    readonly opts: PromptOptions,
  ) {}

  system(code: string) {
    return this.m.systems.find((s) => s.code === code);
  }
  design(code: string): SystemDesign | undefined {
    return this.m.design.systems.find((d) => d.systemCode === code);
  }
  node(id: string) {
    return this.m.ia.nodes.find((n) => n.id === id);
  }
  path(id: string): string[] {
    const out: string[] = [];
    let n = this.node(id);
    while (n) {
      out.unshift(n.name);
      n = n.parentId ? this.node(n.parentId) : undefined;
    }
    return out;
  }
  tasksOfScreen(screenId: string) {
    return this.rtm.rows.flatMap((r) => r.tasks.filter((t) => t.screens.includes(screenId)).map((t) => ({ r, t })));
  }

  urls(systemCode?: string | null): PromptUrl[] {
    const out: PromptUrl[] = [];
    if (this.opts.viewerUrl) out.push({ label: "공유 뷰어(현재 설계)", url: `${this.opts.viewerUrl}#${this.m.project.code}` });
    for (const l of this.m.project.links)
      if (!systemCode || !l.systemCode || l.systemCode === systemCode) out.push({ label: `${KIND_LABEL[l.kind]} · ${l.label}${l.systemCode ? ` (${l.systemCode})` : ""}`, url: l.url });
    for (const s of this.m.sources) if (s.kind === "URL" && /^https?:/.test(s.location)) out.push({ label: `참조자료 ${s.id} · ${s.title}`, url: s.location });
    return out;
  }
  figmaFile(systemCode?: string | null) {
    return this.m.project.links.find((l) => l.kind === "FIGMA" && (!l.systemCode || l.systemCode === systemCode));
  }

  evidence(query: string, limit = 4): { text: string; count: number } {
    const hits = search(this.chunks, query, limit);
    if (!hits.length) return { text: "", count: 0 };
    const lines = hits.map((h) => {
      const src = this.m.sources.find((s) => s.id === h.chunk.sourceId);
      const t = h.chunk.text.replace(/\s+/g, " ").trim();
      return `- [${h.chunk.sourceId} ${src?.title ?? ""} · ${h.chunk.locator}] ${t.length > 360 ? `${t.slice(0, 360)}…` : t}`;
    });
    return { text: lines.join("\n"), count: hits.length };
  }
}

const KIND_LABEL: Record<string, string> = { SERVICE: "운영 서비스", FIGMA: "Figma 파일", REFERENCE: "참고", VIEWER: "뷰어", OTHER: "링크" };

// ── 공통 블록 ───────────────────────────────────────

export function projectLine(c: Ctx) {
  const p = c.m.project;
  const type = p.serviceType === "NEW" ? "신규 구축" : `기존 서비스 개선(${p.changeScope})`;
  return `- 프로젝트: ${p.name} (${p.code}, 작업 버전 v${p.version}, ${type}, 제출 양식 ${p.submissionTemplate === "PUBLIC" ? "공공기관 제출용" : "일반"})`;
}

export function urlBlock(urls: PromptUrl[]) {
  return urls.length ? urls.map((u) => `- ${u.label}: ${u.url}`).join("\n") : "- (등록된 참조 URL 없음 — `planning link add <URL>`로 추가)";
}

export function tokensBlock(d: SystemDesign | undefined, code: string): string {
  if (!d || d.status !== "SELECTED" || !d.tokens || !d.layout) {
    return `- ${code} 디자인 시스템 컨셉이 아직 선택되지 않았습니다. 컨셉을 선택한 뒤 다시 요청하세요. (planning design select ${code} <A|B|C>)`;
  }
  const concept = d.proposals.find((p) => p.id === d.selectedId);
  const t = d.tokens;
  const c = t.color;
  const s = t.font.scale;
  return [
    `- 컨셉: ${concept?.id}. ${concept?.name} — ${concept?.summary}`,
    `- 색상: 주 색 ${c.primary}, 주 색 위 글자 ${c.onPrimary}, 강조 ${c.accent}, 메뉴 배경 ${c.nav}, 메뉴 글자 ${c.onNav}, 배경 ${c.bg}, 면 ${c.surface}, 보조 면 ${c.surfaceAlt}, 선 ${c.border}, 글자 ${c.text}, 보조 글자 ${c.textMuted}, 성공 ${c.success}, 주의 ${c.warning}, 오류 ${c.danger}, 안내 ${c.info}`,
    `- 글꼴: ${t.font.family.split(",")[0]!.replace(/"/g, "")} · 크기(px) 메인 비주얼 ${s.display} / 화면 제목 ${s.h1} / 구역 제목 ${s.h2} / 소제목 ${s.h3} / 본문 ${s.body} / 보조 ${s.small} / 캡션 ${s.caption} · 굵게 ${t.font.weightBold}`,
    `- 모서리 ${t.radius.sm}/${t.radius.md}/${t.radius.lg}px · 입력·버튼 높이 ${t.control.height}px · 목록 행 높이 ${t.control.rowHeight}px · 기본 간격 ${t.spacing}px · 그림자 ${t.shadow}`,
    `- 그리드: ${t.grid.columns}단, 콘텐츠 최대 폭 ${t.grid.maxWidth}px, 단 간격 ${t.grid.gutter}px`,
    `- 레이아웃 규칙: ${Object.entries(LAYOUT).map(([k, [label, v]]) => `${label} ${v[(d.layout as Record<string, string>)[k]!]}`).join(", ")}`,
  ].join("\n");
}

export function componentLines(sb: StoryboardScreen): string {
  return sb.components
    .map((comp) => {
      const lines = [`${comp.no}. ${comp.label} — ${comp.ui ? `컴포넌트 \`${comp.ui.component}\`` : `(와이어프레임 미작성, 유형 ${comp.kind})`}${comp.ui?.link ? ` → 이동: ${comp.ui.link}` : ""}`];
      if (comp.ui && Object.keys(comp.ui.props).length) lines.push(`   - 속성: ${JSON.stringify(comp.ui.props)}`);
      if (comp.planner) lines.push(`   - 기획자 관점: ${comp.planner}`);
      if (comp.customer) lines.push(`   - 고객 관점: ${comp.customer}`);
      if (comp.options) lines.push(`   - 옵션: ${comp.options.values.join(" / ")}${comp.options.default ? ` (기본값 ${comp.options.default})` : ""}${comp.options.note ? ` · ${comp.options.note}` : ""}`);
      const v = comp.validation;
      if (v) {
        const parts = [v.required ? "필수" : "선택"];
        if (v.minLength != null || v.maxLength != null) parts.push(`${v.minLength ?? 0}~${v.maxLength ?? ""}자`);
        if (v.format) parts.push(`형식 ${v.format}`);
        if (v.allowedChars) parts.push(`허용 문자 ${v.allowedChars}`);
        if (v.timing.length) parts.push(`검증 시점 ${v.timing.map((x) => TIMING[x]).join(", ")}`);
        lines.push(`   - 유효성: ${parts.join(" · ")}`);
        for (const msg of v.messages) lines.push(`   - 오류 문구(${msg.condition}): “${msg.text}”`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

export function componentCatalog(d: SystemDesign | undefined, used?: Set<string>): string {
  if (!d || d.status !== "SELECTED") return "- (디자인 시스템 미선택)";
  const list: DesignComponent[] = used ? d.components.filter((x) => used.has(x.id)) : d.components;
  return list.map((x) => `- \`${x.id}\` ${x.name}${x.variants.length ? ` (변형: ${x.variants.join(", ")})` : ""}${x.origin === "ADDED" ? ` [추가 · ${x.addedFor ?? ""}]` : ""} — ${x.description}`).join("\n");
}

export function section(title: string, body: string) {
  return body ? `## ${title}\n${body}\n` : "";
}

export function finish(lines: string[]) {
  return lines.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ── 화면설계서 ──────────────────────────────────────

function storyboardPrompt(c: Ctx, sb: StoryboardScreen): PromptSet {
  const node = c.node(sb.screenId);
  const sys = c.system(sb.systemCode);
  const d = c.design(sb.systemCode);
  const tasks = c.tasksOfScreen(sb.screenId);
  const parent = node?.kind === "POPUP" && node.parentId ? c.node(node.parentId) : undefined;
  const target = [
    projectLine(c),
    `- 시스템: ${sb.systemCode} ${sys?.name ?? ""} (주 사용자: ${sys?.users.join(", ") || "-"})`,
    `- 화면: ${sb.screenId} ${sb.title} · ${KIND[node?.kind ?? "PAGE"]}${sb.template ? ` · 템플릿 ${sb.template}` : ""} · Location: ${c.path(sb.screenId).join(" > ")}${parent ? ` · 부모 화면 ${parent.id} 위 레이어` : ""}`,
    ...tasks.map(({ r, t }) => `- 요구사항·Task: ${r.requirementId} ${r.title} / ${t.taskId} [${t.systemCode}] ${t.actor ? `${t.actor}: ` : ""}${t.action} (${STATUS_LABEL[t.status]})`),
  ].join("\n");
  const urls = c.urls(sb.systemCode);
  const ev = c.evidence(`${sb.title} ${tasks.map(({ t }) => t.action).join(" ")} ${sb.components.map((x) => x.label).join(" ")}`);
  const used = new Set(sb.components.map((x) => x.ui?.component).filter((x): x is string => Boolean(x)));
  const figmaFile = c.figmaFile(sb.systemCode);

  const figma = finish([
    `# 요청: Figma에 화면설계서 그리기 — ${sb.screenId} ${sb.title}`,
    "Figma MCP 도구(use_figma 등)로 아래 화면을 Figma에 그려 주세요. 설명 없이 바로 작업하고, 끝나면 만든 프레임 링크와 요약을 알려 주세요.\n",
    section("대상", target),
    section("참조 URL", urlBlock(urls) + (figmaFile ? "" : "\n- Figma 파일이 등록되지 않았습니다. 새 파일을 만들고 링크를 알려 주세요.")),
    section(
      "캔버스 규격 (줄바꿈 금지)",
      [
        `- 프레임: ${VIEWPORT.width}×${VIEWPORT.height} 데스크톱 뷰포트 기준. 내용이 길면 높이만 늘린다(폭은 ${VIEWPORT.width} 고정).`,
        `- 프레임 이름: \`${sb.screenId} ${sb.title}\`. 페이지 이름: \`${sb.systemCode} ${sys?.name ?? ""}\``,
        "- 메뉴·버튼·뱃지·표 머리글·라벨 텍스트는 Auto width(한 줄)로 두어 줄바꿈이 생기지 않게 한다. 본문 설명만 고정 폭 줄바꿈 허용.",
        "- 레이아웃은 Auto layout으로 만들고, 헤더·본문·푸터를 각각 그룹으로 나눈다.",
        node?.kind === "POPUP" ? `- 팝업: 부모 화면(${parent?.id ?? ""}) 위에 딤(검정 45%)과 가운데 모달로 그린다.` : "",
      ].filter(Boolean).join("\n"),
    ),
    section(`디자인 시스템 (${sb.systemCode})`, tokensBlock(d, sb.systemCode) + "\n- 위 값은 Figma 변수(색·숫자)와 텍스트 스타일로 먼저 등록하고, 화면에서는 변수만 사용한다."),
    section("사용 컴포넌트 (디자인 시스템에 있는 것만 사용)", componentCatalog(d, used)),
    section("화면 구성 (위에서 아래 순서, 번호 = 설명 번호)", componentLines(sb)),
    section(
      "화면설계서 표기",
      [
        "- 각 요소 왼쪽 위에 번호 마커(빨간 원 #E5484D, 지름 22, 흰 숫자)를 둔다.",
        `- 프레임 오른쪽에 설명 패널(폭 560)을 붙인다: 머리글(화면 ID ${sb.screenId} · 화면명 · 시스템 · Location), 번호별 [기획] [고객] 설명, 옵션, 유효성·오류 문구.`,
        "- 개발자 관점 설명(API, DB, 구현 방법)은 넣지 않는다.",
        c.m.project.submissionTemplate === "PUBLIC" ? "- 공공기관 제출 양식: 한 장(16:9)에 설명이 넘치면 같은 화면 ID로 다음 장을 만들고, 앞 장 아래에 “다음 페이지에 계속 ▶”, 다음 장 위에 “◀ 이전 페이지에서 계속”, 머리글에 (1/2) 표시." : "",
      ].filter(Boolean).join("\n"),
    ),
    section("참조자료 근거", ev.text),
    section(
      "지켜 주세요",
      "- 디자인 시스템에 없는 컴포넌트가 필요하면 새로 그리지 말고 목록으로 알려 주세요(디자인 시스템에 먼저 추가합니다).\n- 문구는 위 내용을 그대로 쓰고, 없는 내용은 지어내지 말고 ‘확인 필요’로 표시해 주세요.",
    ),
  ]);

  const claude = finish([
    `# 요청: 화면설계서 검토·보완 — ${sb.screenId} ${sb.title}`,
    "아래 화면설계서를 요구사항과 참조자료 근거에 비추어 검토하고, 빠진 항목을 채운 완성본을 돌려주세요.\n",
    section("대상", target),
    section("참조 URL", urlBlock(urls)),
    section("요구사항 원문", tasks.map(({ r }) => c.m.requirements.find((x) => x.id === r.requirementId)).filter((x, i, a) => x && a.indexOf(x) === i).map((r) => `- ${r!.id} ${r!.title}: ${r!.description || "(설명 없음)"}`).join("\n")),
    section("참조자료 근거", ev.text),
    section(`디자인 시스템 (${sb.systemCode})`, tokensBlock(d, sb.systemCode)),
    section("쓸 수 있는 컴포넌트", componentCatalog(d)),
    section("현재 화면설계서", componentLines(sb)),
    section(
      "검토 기준",
      [
        "1. 요구사항·Task의 동작이 화면에 모두 있는가 (빠진 요소, 빠진 상태: 빈 목록·오류·권한 없음)",
        "2. 설명은 기획자 관점(정책·노출 조건·규칙·예외)과 고객 관점(보이는 것·할 수 있는 것·안내 문구)으로만 썼는가. 개발자 관점은 빼기",
        "3. 선택 요소(셀렉트·라디오·체크·탭·필터·정렬)에 옵션 전체와 기본값이 있는가",
        "4. 입력 요소마다 필수 여부, 길이·형식, 검증 시점, 오류 문구가 있는가",
        "5. 참조자료(회의록 결정 등)와 어긋나는 내용이 없는가",
      ].join("\n"),
    ),
    section(
      "출력 형식",
      "1) 검토 결과 표: 번호 | 문제 | 근거(요구사항·자료 위치) | 수정안\n2) 완성본 JSON: 아래 형식의 `components` 배열 하나 (planning 도구에 그대로 넣습니다)\n```json\n{ \"screenId\": \"" +
        sb.screenId +
        "\", \"components\": [ { \"no\": 1, \"label\": \"\", \"kind\": \"\", \"planner\": \"\", \"customer\": \"\", \"options\": { \"values\": [], \"default\": \"\" }, \"validation\": { \"required\": true, \"minLength\": 0, \"maxLength\": 0, \"timing\": [\"ON_SUBMIT\"], \"messages\": [{ \"condition\": \"\", \"text\": \"\" }] }, \"ui\": { \"component\": \"디자인 시스템 컴포넌트 ID\", \"props\": {}, \"link\": \"이동 화면 ID\" } } ] }\n```\n- 디자인 시스템에 없는 컴포넌트가 필요하면 JSON에 넣지 말고 ‘추가 필요 컴포넌트’로 따로 적어 주세요.",
    ),
  ]);
  return { title: `화면설계서 ${sb.screenId} ${sb.title}`, figma, claude, urls, evidence: ev.count };
}

// ── 프로토타입 ──────────────────────────────────────

function prototypePrompt(c: Ctx, taskId: string): PromptSet {
  const row = c.rtm.rows.find((r) => r.tasks.some((t) => t.taskId === taskId))!;
  const t = row.tasks.find((x) => x.taskId === taskId)!;
  const screens = new Map<string, StoryboardScreen>();
  const add = (id: string) => {
    const sb = c.m.storyboard.screens.find((s) => s.screenId === id);
    if (sb && !screens.has(id)) screens.set(id, sb);
  };
  t.screens.forEach(add);
  for (const sb of [...screens.values()])
    for (const comp of sb.components) {
      if (comp.ui?.link) add(comp.ui.link);
      for (const b of (comp.ui?.props.buttons as { link?: string }[] | undefined) ?? []) if (b.link) add(b.link);
    }
  const list = [...screens.values()];
  const interactions = list
    .flatMap((sb) =>
      sb.components.flatMap((comp) => {
        const out: string[] = [];
        const buttons = (comp.ui?.props.buttons as { label: string; action?: string; confirm?: string; message?: string; link?: string }[] | undefined) ?? [];
        for (const b of buttons) {
          const to = b.link ?? comp.ui?.link;
          if (b.action === "submit") out.push(`- ${sb.screenId} “${b.label}” 클릭 → 필수 항목 검사(비었으면 오류 문구 + 알림 창) → 확인 창 “${b.confirm ?? "진행할까요?"}” → 확인 시 ${to ?? "현재 화면"} 이동 + 토스트 “${b.message ?? ""}”`);
          else if (b.action === "toast") out.push(`- ${sb.screenId} “${b.label}” 클릭 → 토스트 “${b.message ?? ""}”`);
          else if (to) out.push(`- ${sb.screenId} “${b.label}” 클릭 → ${to}`);
        }
        if (!buttons.length && comp.ui?.link) out.push(`- ${sb.screenId} ${comp.no}. ${comp.label} (행·항목) 클릭 → ${comp.ui.link}${c.m.storyboard.screens.some((s) => s.screenId === comp.ui!.link) ? "" : " (화면설계서 미작성: ‘준비 중’ 표시)"}`);
        return out;
      }),
    )
    .join("\n");
  const systems = [...new Set(list.map((s) => s.systemCode))];
  const urls = c.urls(t.systemCode);
  const ev = c.evidence(`${t.action} ${list.map((s) => s.title).join(" ")}`, 3);
  const screensBlock = list.map((sb) => `### ${sb.screenId} ${sb.title} (${sb.systemCode})\n${componentLines(sb)}`).join("\n\n");
  const target = [projectLine(c), `- 요구사항: ${row.requirementId} ${row.title}`, `- Task: ${t.taskId} [${t.systemCode}] ${t.actor ? `${t.actor}: ` : ""}${t.action}`, `- 화면: ${list.map((s) => s.screenId).join(", ")}`].join("\n");
  const ds = systems.map((code) => `### ${code}\n${tokensBlock(c.design(code), code)}`).join("\n");

  const figma = finish([
    `# 요청: Figma 프로토타입 연결 — ${t.taskId} ${t.action}`,
    "Figma MCP 도구로 아래 화면 프레임을 만들거나(이미 있으면 재사용) 프로토타입 연결(On click → Navigate/Open overlay)을 설정해 주세요.\n",
    section("대상", target),
    section("참조 URL", urlBlock(urls)),
    section("규격", `- 모든 프레임 ${VIEWPORT.width}×${VIEWPORT.height}, 프로토타입 기기: Desktop ${VIEWPORT.width}×${VIEWPORT.height}, 세로 스크롤 허용\n- 확인 창·알림 창·모달은 Overlay(가운데, 배경 딤 45%), 토스트는 Overlay(아래 가운데, 2초 후 닫힘)\n- 텍스트는 줄바꿈 없이 Auto width`),
    section("디자인 시스템", ds),
    section("인터랙션", interactions || "- (연결 정보 없음)"),
    section("화면 내용", screensBlock),
    section("완료 조건", `- 시작 프레임: ${list[0]?.screenId ?? ""}\n- 위 인터랙션이 모두 연결되고, 오류 상태 프레임(필수 항목 비움)도 따로 만든다\n- 끝나면 프로토타입 링크를 알려 주세요`),
  ]);
  const claude = finish([
    `# 요청: 클릭형 HTML 프로토타입 만들기 — ${t.taskId} ${t.action}`,
    "아래 화면설계서로 HTML 파일 하나짜리 프로토타입을 만들어 주세요. 외부 라이브러리 없이 HTML·CSS·JS만 사용합니다.\n",
    section("대상", target),
    section("참조 URL", urlBlock(urls)),
    section(
      "규격 (줄바꿈 금지)",
      `- 설계 기준 ${VIEWPORT.width}×${VIEWPORT.height}. 화면은 폭 ${VIEWPORT.width}px 고정으로 배치하고, 브라우저 창이 작으면 전체를 비율대로 축소(transform: scale)해서 보여 준다. 반응형으로 줄바꿈되면 안 된다.\n- 메뉴·버튼·뱃지·표 머리글·라벨은 white-space: nowrap`,
    ),
    section("디자인 시스템 (CSS 변수로 정의해서 사용)", ds),
    section("인터랙션", interactions || "- (연결 정보 없음)"),
    section("화면 내용", screensBlock),
    section("참조자료 근거", ev.text),
    section("출력", "- 완성된 HTML 파일 하나 (코드 블록)\n- 상단에 화면 목록 바로가기와 화면 ID 표시 토글\n- 설계에 없는 화면·문구는 만들지 말고 ‘준비 중’으로 표시"),
  ]);
  return { title: `프로토타입 ${t.taskId} ${t.action}`, figma, claude, urls, evidence: ev.count };
}

// ── 정보구조도 ──────────────────────────────────────

function iaPrompt(c: Ctx, systemCode: string | null): PromptSet {
  const systems = c.m.systems.filter((s) => s.hasScreens && (!systemCode || s.code === systemCode));
  const status = new Map<string, string>();
  for (const r of c.rtm.rows) for (const t of r.tasks) for (const s of t.screens) status.set(s, STATUS_LABEL[t.status]);
  const tree = systems
    .map((s) => {
      const nodes = c.m.ia.nodes.filter((n) => n.systemCode === s.code);
      const lines: string[] = [`### ${s.code} ${s.name} (주 사용자: ${s.users.join(", ") || "-"})`];
      const walk = (pid: string | null, depth: number) => {
        for (const n of nodes.filter((x) => (x.parentId ?? null) === pid)) {
          const id = n.kind === "MENU" ? "" : `${n.id} `;
          const extra = [KIND[n.kind], CHANGE[n.change], n.loginRequired ? "로그인" : "", n.taskIds.length ? `Task ${n.taskIds.join(", ")}` : n.kind === "MENU" || n.change === "KEPT" ? "" : "요구사항 없음", status.get(n.id) ?? ""]
            .filter(Boolean)
            .join(" · ");
          lines.push(`${"  ".repeat(depth)}- ${id}${n.name} (${extra})${n.changeReason ? ` — ${n.changeReason}` : ""}`);
          walk(n.id, depth + 1);
        }
      };
      walk(null, 0);
      if (lines.length === 1) lines.push("- (등록된 화면 없음)");
      return lines.join("\n");
    })
    .join("\n\n");
  const reqs = c.rtm.rows
    .filter((r) => r.status !== "EXCLUDED")
    .map((r) => {
      const ts = r.tasks.filter((t) => !systemCode || t.systemCode === systemCode);
      if (systemCode && !ts.length) return "";
      return `- ${r.requirementId} ${r.title}: ${ts.map((t) => `${t.taskId.slice(r.requirementId.length + 1)}[${t.systemCode}] ${t.action} → ${t.screenless ? "화면 없음" : t.screens.join(", ") || "화면 미연결"}`).join(" / ") || "Task 미분해"}`;
    })
    .filter(Boolean)
    .join("\n");
  const scope = systemCode ? `${systemCode} ${systems[0]?.name ?? ""}` : "전체 시스템";
  const urls = c.urls(systemCode);
  const ev = c.evidence(`메뉴 화면 구성 ${systems.map((s) => s.name).join(" ")} ${c.rtm.rows.map((r) => r.title).join(" ")}`, 3);
  const rule = c.m.project.screenIdRule;
  const figma = finish([
    `# 요청: Figma(FigJam)에 정보구조도 그리기 — ${scope}`,
    "Figma MCP 도구로 아래 메뉴·화면 구조를 사이트맵 다이어그램으로 그려 주세요. FigJam 파일이면 generate_diagram을, Figma 파일이면 use_figma를 사용해 주세요.\n",
    section("대상", `${projectLine(c)}\n- 범위: ${scope}`),
    section("참조 URL", urlBlock(urls)),
    section(
      "표기 규칙",
      "- 시스템별로 가로 영역을 나누고 영역 머리에 시스템 이름과 색을 둔다\n- 1depth는 위, 하위는 아래로 트리 연결. 노드: 화면 ID(작은 글자) + 화면명\n- 구분 색: 신규 초록, 변경 주황, 삭제 빨강 점선, 유지 회색\n- 팝업은 모서리 둥근 점선 테두리, 로그인 필요 화면은 자물쇠 아이콘\n- 텍스트 줄바꿈 없이 노드 폭을 글자에 맞춤\n- 오른쪽 아래에 범례(구분 색, 팝업, 로그인)",
    ),
    section("정보구조", tree),
    section("완료 조건", "- 모든 화면 ID가 한 번씩만 나온다\n- 끝나면 파일 링크를 알려 주세요"),
  ]);
  const claude = finish([
    `# 요청: 정보구조도 검토 — ${scope}`,
    "아래 정보구조도가 요구사항을 모두 담고 있는지 검토하고 보완안을 주세요.\n",
    section("대상", `${projectLine(c)}\n- 범위: ${scope}\n- 화면 ID 규칙: ${rule.pattern} (순번 ${rule.seqStart}부터 ${rule.seqStep}씩, 팝업 ${rule.popupSuffix})`),
    section("참조 URL", urlBlock(urls)),
    section("현재 정보구조", tree),
    section("요구사항 → Task → 화면", reqs),
    section("참조자료 근거", ev.text),
    section(
      "검토 기준",
      "1. 화면이 연결되지 않은 Task (화면 필요 여부 판단 포함)\n2. 요구사항에 연결되지 않은 화면 (근거 없는 화면)\n3. 메뉴 depth·이름이 사용자 관점에서 찾기 쉬운가, 시스템 간 이름이 일관되는가\n4. 신청 → 심사 → 공개처럼 시스템을 넘나드는 흐름에서 빠진 화면(처리 현황, 결과 확인, 보완 등)",
    ),
    section("출력 형식", "1) 문제 표: 번호 | 유형 | 대상(화면 ID·Task) | 근거 | 제안\n2) 보완한 정보구조 트리 (위와 같은 형식, 새 화면은 화면 ID 규칙으로 번호를 붙이고 [신규 제안] 표시)"),
  ]);
  return { title: `정보구조도 ${scope}`, figma, claude, urls, evidence: ev.count };
}

// ── 디자인 시스템 ───────────────────────────────────

function designPrompt(c: Ctx, systemCode: string): PromptSet {
  const d = c.design(systemCode)!;
  const s = c.system(systemCode);
  const urls = c.urls(systemCode);
  const target = `${projectLine(c)}\n- 시스템: ${systemCode} ${s?.name ?? ""} (주 사용자: ${s?.users.join(", ") || "-"}, 채널: ${s?.channels.join(", ") || "-"})`;
  const proposals = d.proposals.map((p) => `- ${p.id}. ${p.name} — ${p.summary} / 어울리는 경우: ${p.fit}`).join("\n");
  const ev = c.evidence(`디자인 화면 접근성 ${s?.name ?? ""} 메뉴 목록`, 3);
  const selected = d.status === "SELECTED";
  const figma = finish([
    `# 요청: Figma 디자인 시스템 만들기 — ${systemCode} ${s?.name ?? ""}`,
    selected
      ? "Figma MCP 도구로 아래 디자인 시스템을 Figma 라이브러리로 만들어 주세요: 변수 컬렉션(색·숫자), 텍스트 스타일, 컴포넌트(변형 포함), 아이콘, 화면 템플릿.\n"
      : "아직 컨셉이 선택되지 않았습니다. 아래 3개 컨셉을 각각 페이지로 나눠 비교 시안을 그려 주세요(화면 유형 10종).\n",
    section("대상", target),
    section("참조 URL", urlBlock(urls)),
    selected ? section("디자인 토큰·레이아웃 규칙", tokensBlock(d, systemCode)) : section("제안 컨셉", proposals),
    selected ? section("컴포넌트", componentCatalog(d)) : "",
    selected ? section("아이콘 (24px, 선 굵기 1.8, 둥근 끝)", d.icons.map((i) => `\`${i}\``).join(", ")) : "",
    section(
      "화면 템플릿 (각 1920×1080, 줄바꿈 금지)",
      "로그인, 대시보드, 메인, 목록, 상세, 등록, 확인 창, 알림 창, 토스트, 모달 팝업 — 같은 예시 내용으로 그려 비교할 수 있게",
    ),
    section("참조자료 근거", ev.text),
  ]);
  const claude = finish([
    `# 요청: 디자인 시스템 ${selected ? "검토와 토큰 파일" : "컨셉 선택 도움"} — ${systemCode} ${s?.name ?? ""}`,
    selected
      ? "아래 디자인 시스템을 검토하고, CSS 변수 파일과 디자인 토큰 JSON(W3C Design Tokens 형식)을 만들어 주세요.\n"
      : "아래 3개 컨셉을 이 시스템의 사용자·요구사항·참조자료 기준으로 비교하고 하나를 추천해 주세요.\n",
    section("대상", target),
    section("참조 URL", urlBlock(urls)),
    selected ? section("디자인 토큰·레이아웃 규칙", tokensBlock(d, systemCode)) : section("제안 컨셉", proposals),
    selected ? section("컴포넌트", componentCatalog(d)) : "",
    section("참조자료 근거", ev.text),
    section(
      "확인해 주세요",
      selected
        ? "1. 글자·배경 명도 대비(웹 접근성 4.5:1)가 모자라는 조합\n2. 공공 서비스라면 범정부 UI/UX 가이드라인(KRDS) 구성 원칙과 어긋나는 점\n3. 빠진 컴포넌트(화면 템플릿 10종을 그리는 데 필요한 것 기준)"
        : "1. 사용자 특성(연령·기기·이용 빈도)에 맞는가\n2. 회의록·제안요청서의 디자인 방향과 맞는가\n3. 추천 컨셉과 이유, 선택 명령: `planning design select " + systemCode + " <A|B|C>`",
    ),
  ]);
  return { title: `디자인 시스템 ${systemCode} ${s?.name ?? ""}`, figma, claude, urls, evidence: ev.count };
}
