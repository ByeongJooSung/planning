/**
 * 기획 데이터 모델 (Single Source of Truth) — PRD §3.3
 *
 * 모든 산출물(기획안, IA, 다이어그램, 스토리보드, 프로토타입, RTM)은 이 모델에서 만든다.
 * 프로젝트 폴더의 model/*.json 파일 하나가 아래 스키마 하나에 대응한다.
 */
import { z } from "zod";

// ── 공통 ────────────────────────────────────────────────────────────────

export const ServiceType = z.enum(["NEW", "EXISTING"]);
export const ChangeScope = z.enum(["NEW_MENU", "MODIFY", "RENEWAL"]);
export const SubmissionTemplate = z.enum(["GENERAL", "PUBLIC"]);
export const Channel = z.enum(["PC_WEB", "MOBILE_WEB", "APP", "ADMIN_WEB"]);

/** 기존 대비 변경 구분 (IA 노드, 기능, 플로우 노드 등) */
export const ChangeMark = z.enum(["NEW", "CHANGED", "DELETED", "KEPT"]);

export const StageId = z.enum(["S0", "S0A", "S1", "S2", "S3", "S4", "S5"]);
export const StageStatus = z.enum([
  "NOT_STARTED", // 미시작
  "COLLECTING", // 정보수집중
  "GATE_PASSED", // 게이트 통과
  "DRAFTED", // 생성됨(초안)
  "IN_REVIEW", // 검토중
  "CONFIRMED", // 확정
  "SKIPPED", // 패스
  "NEEDS_UPDATE", // 변경 필요 (상위 단계 변경)
]);

const SystemCode = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, "시스템 코드는 영문 대문자로 시작하는 2~10자 (예: PUB, CVL, ADM)");

// ── 프로젝트 ────────────────────────────────────────────────────────────

export const ScreenIdRule = z.object({
  /** 토큰: {system} {d1} {d2} {d3} {seq} — 예: "{system}_{d1}_{d2}_{seq}" → CVL_INF_REG_010 */
  pattern: z.string().default("{system}_{d1}_{d2}_{seq}"),
  seqStart: z.number().int().default(10),
  seqStep: z.number().int().default(10),
  seqDigits: z.number().int().default(3),
  popupSuffix: z.string().default("_P{nn}"),
});

export const RequirementIdMode = z.enum([
  "GENERATED", // 도구가 REQ-001 부여
  "ORIGINAL", // RFP 원본 ID(SFR-001 등)를 그대로 ID로 사용
]);

export const Project = z.object({
  schemaVersion: z.literal(1).default(1),
  code: z.string().regex(/^[A-Za-z0-9_-]{2,40}$/),
  name: z.string().min(1),
  serviceType: ServiceType,
  changeScope: ChangeScope.nullable().default(null),
  channels: z.array(Channel).default(["PC_WEB"]),
  submissionTemplate: SubmissionTemplate.default("GENERAL"),
  screenIdRule: ScreenIdRule.default(ScreenIdRule.parse({})),
  requirementIdMode: RequirementIdMode.default("GENERATED"),
  /** 현재 작업 버전. 스냅샷을 찍으면 이 번호로 고정되고 다음 번호로 올라간다. */
  version: z.string().regex(/^\d+\.\d+$/).default("0.1"),
  stages: z.partialRecord(StageId, StageStatus).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── 시스템 구분 (PRD §3.5) ──────────────────────────────────────────────

export const System = z.object({
  code: SystemCode,
  name: z.string().min(1),
  /** 주 사용자·권한 (예: ["민원인(회원)"]) */
  users: z.array(z.string()).default([]),
  channels: z.array(Channel).default([]),
  /** 화면 ID 접두어. 비우면 code 사용 */
  screenIdPrefix: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#64748B"),
  /** 외부 연계처럼 화면이 없는 시스템은 false → 프로세스 플로우 레인으로만 표시 */
  hasScreens: z.boolean().default(true),
  description: z.string().default(""),
});

// ── 자료 ────────────────────────────────────────────────────────────────

export const Source = z.object({
  id: z.string().regex(/^SRC-\d{3,}$/),
  kind: z.enum(["FILE", "TEXT", "EMAIL", "URL", "REPOSITORY"]),
  title: z.string(),
  /** 프로젝트 폴더 기준 상대 경로(sources/…) 또는 URL */
  location: z.string().default(""),
  addedAt: z.string(),
  /** 참조자료(지식) 색인 정보 — PRD §4.2C */
  fileName: z.string().optional(),
  size: z.number().int().optional(),
  sha256: z.string().optional(),
  index: z
    .object({
      status: z.enum(["INDEXED", "UNSUPPORTED", "FAILED"]),
      chunks: z.number().int().default(0),
      chars: z.number().int().default(0),
      message: z.string().optional(),
    })
    .optional(),
});

export const SourceRef = z.object({
  sourceId: z.string(),
  /** 문서 내 위치 (예: "p.12", "3.2절", "메일 2번째 문단") */
  locator: z.string().default(""),
});

// ── 요구사항 · Task (PRD §3.4, §3.5, §4.2A) ────────────────────────────

export const RequirementType = z.enum(["FUNCTIONAL", "NON_FUNCTIONAL", "POLICY", "CONTENT", "CONSTRAINT"]);
export const Priority = z.enum(["MUST", "SHOULD", "COULD"]);

export const StateTransition = z.object({
  /** 공통 상태값 세트 ID (policies.json) */
  stateSetId: z.string().optional(),
  from: z.string().optional(),
  to: z.string(),
});

export const Task = z.object({
  /** {요구사항ID}-T{nn} (예: REQ-012-T01) */
  id: z.string(),
  systemCode: SystemCode,
  actor: z.string().default(""),
  action: z.string().min(1),
  /** 선행 Task ID */
  after: z.array(z.string()).default([]),
  transition: StateTransition.optional(),
  /** 화면이 없는 Task(배치·자동 처리·외부 연계)의 사유. 있으면 화면 매핑 없이 충족 가능 */
  noScreenReason: z.string().optional(),
  /** AUTO: 요구사항에서 자동 제안된 Task, MANUAL: 작업자가 직접 만든 Task */
  origin: z.enum(["AUTO", "MANUAL"]).default("MANUAL"),
  /** 자동 제안 근거 (예: "‘심사’ → 심사자·관리자 시스템") */
  suggestReason: z.string().optional(),
});

export const Requirement = z.object({
  id: z.string(),
  /** RFP 원본 ID (예: SFR-001) */
  originalId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().default(""),
  type: RequirementType.default("FUNCTIONAL"),
  priority: Priority.default("MUST"),
  sources: z.array(SourceRef).default([]),
  status: z.enum(["ACTIVE", "EXCLUDED", "DELETED"]).default("ACTIVE"),
  /** EXCLUDED일 때 필수 */
  excludeReason: z.string().optional(),
  ambiguous: z.boolean().default(false),
  tasks: z.array(Task).default([]),
});

// ── 정책 (시스템 간 공통 상태값 등) ─────────────────────────────────────

export const StateSet = z.object({
  id: z.string(),
  name: z.string(),
  values: z.array(z.string()).min(1),
});

export const Policies = z.object({
  stateSets: z.array(StateSet).default([]),
});

// ── S1 기획안 ───────────────────────────────────────────────────────────

export const PlanSection = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string().default(""),
  requirementIds: z.array(z.string()).default([]),
  taskIds: z.array(z.string()).default([]),
});

export const Feature = z.object({
  id: z.string(),
  name: z.string(),
  systemCode: SystemCode,
  description: z.string().default(""),
  taskIds: z.array(z.string()).default([]),
  change: ChangeMark.default("NEW"),
});

export const Plan = z.object({
  sections: z.array(PlanSection).default([]),
  features: z.array(Feature).default([]),
});

// ── S2 정보구조도 ───────────────────────────────────────────────────────

export const IANode = z.object({
  /** 메뉴 노드는 M-로 시작하는 내부 ID, 화면 노드는 화면 ID */
  id: z.string(),
  systemCode: SystemCode,
  parentId: z.string().nullable().default(null),
  name: z.string(),
  kind: z.enum(["MENU", "PAGE", "POPUP", "LAYER", "TAB", "EXTERNAL"]),
  loginRequired: z.boolean().default(false),
  roles: z.array(z.string()).default([]),
  taskIds: z.array(z.string()).default([]),
  change: ChangeMark.default("NEW"),
  changeReason: z.string().optional(),
});

export const IA = z.object({
  nodes: z.array(IANode).default([]),
  /** 한 번 부여된 뒤 삭제된 화면 ID. 재사용 금지 */
  retiredIds: z.array(z.string()).default([]),
});

// ── S3 다이어그램 ───────────────────────────────────────────────────────

export const FlowNode = z.object({
  id: z.string(),
  shape: z.enum(["TERMINATOR", "PROCESS", "DECISION", "DOCUMENT", "IO", "SCREEN", "CONNECTOR"]),
  label: z.string(),
  lane: z.string().optional(),
  screenId: z.string().optional(),
  taskIds: z.array(z.string()).default([]),
  change: ChangeMark.default("NEW"),
});

export const FlowEdge = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().default(""),
});

export const Flow = z.object({
  id: z.string(),
  kind: z.enum(["PROCESS", "USER"]),
  title: z.string(),
  /** 사용자 플로우는 대상 시스템, 프로세스 플로우는 비움(여러 시스템 레인) */
  systemCode: SystemCode.optional(),
  lanes: z.array(z.object({ id: z.string(), label: z.string(), systemCode: SystemCode.optional() })).default([]),
  nodes: z.array(FlowNode).default([]),
  edges: z.array(FlowEdge).default([]),
});

export const Flows = z.object({ flows: z.array(Flow).default([]) });

// ── S4 스토리보드 ───────────────────────────────────────────────────────

export const Validation = z.object({
  required: z.boolean().default(false),
  format: z.string().optional(),
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional(),
  allowedChars: z.string().optional(),
  timing: z.array(z.enum(["ON_INPUT", "ON_BLUR", "ON_SUBMIT"])).default([]),
  messages: z.array(z.object({ condition: z.string(), text: z.string() })).default([]),
});

export const ComponentSpec = z.object({
  /** 디스크립션 번호 (①②③ …) */
  no: z.number().int().positive(),
  label: z.string(),
  kind: z.string(),
  /** 기획자 관점: 정책, 노출 조건, 규칙, 예외 */
  planner: z.string().default(""),
  /** 고객 관점: 사용자가 보는 것, 할 수 있는 것, 안내 문구 */
  customer: z.string().default(""),
  options: z
    .object({ values: z.array(z.string()), default: z.string().optional(), note: z.string().optional() })
    .optional(),
  validation: Validation.optional(),
  /** 와이어프레임 표현: 디자인 시스템 컴포넌트와 속성. link는 이동할 화면 ID (프로토타입 연결) */
  ui: z
    .object({
      component: z.string(),
      props: z.record(z.string(), z.unknown()).default({}),
      link: z.string().optional(),
    })
    .optional(),
});

export const StoryboardScreen = z.object({
  screenId: z.string(),
  systemCode: SystemCode,
  title: z.string(),
  /** 화면 유형 — 디자인 시스템 페이지 템플릿 */
  template: z.enum(["login", "dashboard", "main", "list", "detail", "form", "popup"]).optional(),
  taskIds: z.array(z.string()).default([]),
  components: z.array(ComponentSpec).default([]),
  status: z.enum(["DRAFT", "REVIEWED"]).default("DRAFT"),
});

export const Storyboard = z.object({ screens: z.array(StoryboardScreen).default([]) });

// ── S5 프로토타입 ───────────────────────────────────────────────────────

export const Prototype = z.object({
  screens: z.array(z.object({ screenId: z.string(), path: z.string().default("") })).default([]),
});

// ── 변경 요청 ───────────────────────────────────────────────────────────

export const ChangeRequest = z.object({
  id: z.string().regex(/^CR-\d{3,}$/),
  title: z.string(),
  receivedAt: z.string(),
  sourceIds: z.array(z.string()).default([]),
  requirementIds: z.array(z.string()).default([]),
  status: z.enum(["RECEIVED", "ANALYZED", "APPLYING", "APPLIED", "REJECTED"]).default("RECEIVED"),
  summary: z.string().default(""),
});

export const ChangeRequests = z.object({ items: z.array(ChangeRequest).default([]) });

// ── RTM 수동 기록 (자동 계산 결과가 아닌, 사람이 남기는 값) ──────────────

export const RtmRecords = z.object({
  reviews: z
    .array(
      z.object({
        taskId: z.string(),
        reviewer: z.string(),
        reviewedAt: z.string(),
        note: z.string().default(""),
      }),
    )
    .default([]),
  notes: z.record(z.string(), z.string()).default({}),
  history: z
    .array(
      z.object({
        requirementId: z.string(),
        at: z.string(),
        crId: z.string().optional(),
        kind: z.enum(["ADDED", "CHANGED", "DELETED", "EXCLUDED", "TASKS_CHANGED"]),
        detail: z.string().default(""),
      }),
    )
    .default([]),
});

// ── 디자인 시스템 (PRD §4.6A) — 시스템 구분별로 관리 ─────────────────────

const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const DesignTokens = z.object({
  color: z.object({
    primary: Hex,
    onPrimary: Hex,
    accent: Hex,
    bg: Hex,
    surface: Hex,
    surfaceAlt: Hex,
    border: Hex,
    text: Hex,
    textMuted: Hex,
    nav: Hex,
    onNav: Hex,
    success: Hex,
    warning: Hex,
    danger: Hex,
    info: Hex,
  }),
  font: z.object({
    family: z.string(),
    /** 크기(px): display h1 h2 h3 body small caption */
    scale: z.object({
      display: z.number(),
      h1: z.number(),
      h2: z.number(),
      h3: z.number(),
      body: z.number(),
      small: z.number(),
      caption: z.number(),
    }),
    weightBold: z.number().int(),
  }),
  radius: z.object({ sm: z.number(), md: z.number(), lg: z.number() }),
  control: z.object({ height: z.number(), rowHeight: z.number() }),
  spacing: z.number(),
  grid: z.object({ columns: z.number().int(), maxWidth: z.number(), gutter: z.number() }),
  shadow: z.enum(["none", "soft", "strong"]),
});

export const LayoutRules = z.object({
  /** GNB: 상단 / 상단 메가메뉴 / 좌측 사이드 */
  nav: z.enum(["top", "top-mega", "side"]),
  logo: z.enum(["left", "center"]),
  /** 검색 영역: 헤더 안 / 첫 화면 큰 검색 / 목록 위 조건 패널 */
  search: z.enum(["header", "hero", "panel"]),
  list: z.enum(["table", "card"]),
  pagination: z.enum(["numbered", "numbered-size", "more"]),
  button: z.enum(["square", "rounded", "pill"]),
  density: z.enum(["comfortable", "compact"]),
  footer: z.enum(["full", "simple", "none"]),
});

export const DesignConcept = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  /** 어울리는 대상·근거 */
  fit: z.string(),
  tokens: DesignTokens,
  layout: LayoutRules,
});

export const DesignComponent = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, "컴포넌트 ID는 영문 소문자·숫자·하이픈 (예: search-panel)"),
  name: z.string(),
  category: z.enum(["navigation", "search", "data", "form", "action", "feedback", "content", "layout"]),
  description: z.string().default(""),
  variants: z.array(z.string()).default([]),
  /** BASE: 컨셉 선택 시 생성된 기본 컴포넌트, ADDED: 작업 중 추가된 컴포넌트 */
  origin: z.enum(["BASE", "ADDED"]).default("BASE"),
  /** 추가를 요청한 화면·Task */
  addedFor: z.string().optional(),
  addedAt: z.string().optional(),
});

export const SystemDesign = z.object({
  systemCode: SystemCode,
  status: z.enum(["PROPOSED", "SELECTED"]),
  proposals: z.array(DesignConcept).default([]),
  selectedId: z.string().optional(),
  selectedAt: z.string().optional(),
  tokens: DesignTokens.optional(),
  layout: LayoutRules.optional(),
  components: z.array(DesignComponent).default([]),
  icons: z.array(z.string()).default([]),
});

export const Design = z.object({ systems: z.array(SystemDesign).default([]) });

// ── 모델 파일 목록 ──────────────────────────────────────────────────────

/** model/ 아래 파일명 ↔ 스키마. 스냅샷·Diff·JSON Schema 생성이 이 목록을 기준으로 동작한다. */
export const MODEL_FILES = {
  "systems.json": z.object({ systems: z.array(System).default([]) }),
  "sources.json": z.object({ sources: z.array(Source).default([]) }),
  "requirements.json": z.object({ requirements: z.array(Requirement).default([]) }),
  "policies.json": Policies,
  "plan.json": Plan,
  "ia.json": IA,
  "flows.json": Flows,
  "storyboard.json": Storyboard,
  "prototype.json": Prototype,
  "changes.json": ChangeRequests,
  "rtm-records.json": RtmRecords,
  "design.json": Design,
} as const;

export type ModelFileName = keyof typeof MODEL_FILES;

export type StageId = z.infer<typeof StageId>;
export type StageStatus = z.infer<typeof StageStatus>;
export type Project = z.infer<typeof Project>;
export type System = z.infer<typeof System>;
export type Source = z.infer<typeof Source>;
export type Requirement = z.infer<typeof Requirement>;
export type Task = z.infer<typeof Task>;
export type Policies = z.infer<typeof Policies>;
export type Plan = z.infer<typeof Plan>;
export type IANode = z.infer<typeof IANode>;
export type IA = z.infer<typeof IA>;
export type Flow = z.infer<typeof Flow>;
export type StoryboardScreen = z.infer<typeof StoryboardScreen>;
export type Storyboard = z.infer<typeof Storyboard>;
export type Prototype = z.infer<typeof Prototype>;
export type ChangeRequest = z.infer<typeof ChangeRequest>;
export type RtmRecords = z.infer<typeof RtmRecords>;
export type DesignTokens = z.infer<typeof DesignTokens>;
export type LayoutRules = z.infer<typeof LayoutRules>;
export type DesignConcept = z.infer<typeof DesignConcept>;
export type DesignComponent = z.infer<typeof DesignComponent>;
export type SystemDesign = z.infer<typeof SystemDesign>;
export type Design = z.infer<typeof Design>;

/** 메모리상 프로젝트 전체 모델 */
export interface Model {
  project: Project;
  systems: System[];
  sources: Source[];
  requirements: Requirement[];
  policies: Policies;
  plan: Plan;
  ia: IA;
  flows: Flow[];
  storyboard: Storyboard;
  prototype: Prototype;
  changes: ChangeRequest[];
  rtmRecords: RtmRecords;
  design: Design;
}
