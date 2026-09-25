/**
 * 디자인 시스템 기본 카탈로그 — 컨셉을 선택하면 이 컴포넌트·아이콘·템플릿으로 시스템 디자인이 만들어진다.
 * 컴포넌트 ID는 모든 컨셉에서 같다. 컨셉은 토큰과 레이아웃 규칙만 바꾼다.
 */
import type { DesignComponent } from "../model/schema.js";

type Base = Omit<DesignComponent, "origin" | "addedFor" | "addedAt">;

export const BASE_COMPONENTS: Base[] = [
  // 레이아웃·내비게이션
  { id: "gnb", name: "GNB (주 메뉴)", category: "navigation", description: "로고, 1depth 메뉴, 유틸리티(로그인·마이페이지). 레이아웃 규칙에 따라 상단 또는 좌측", variants: ["top", "top-mega", "side"] },
  { id: "lnb", name: "LNB (하위 메뉴)", category: "navigation", description: "2depth 이하 메뉴. 상단 GNB형에서 하위 페이지 좌측에 표시", variants: [] },
  { id: "breadcrumb", name: "현재 위치(Location)", category: "navigation", description: "홈 > 1depth > 2depth", variants: [] },
  { id: "tabs", name: "탭", category: "navigation", description: "같은 화면 안 내용 전환", variants: ["line", "box"] },
  { id: "step-indicator", name: "단계 표시", category: "navigation", description: "신청 절차의 현재 단계", variants: [] },
  { id: "footer", name: "푸터", category: "layout", description: "기관 정보, 개인정보처리방침, 저작권", variants: ["full", "simple"] },
  // 검색
  { id: "search-bar", name: "검색창", category: "search", description: "키워드 입력 + 검색 버튼", variants: ["header", "hero", "inline"] },
  { id: "search-panel", name: "검색 조건 영역", category: "search", description: "목록 위 조건(기간·구분·상태·키워드)과 조회·초기화 버튼", variants: [] },
  // 데이터
  { id: "data-table", name: "목록 표(그리드)", category: "data", description: "총 건수, 정렬, 행 클릭 이동, 상태 뱃지 열", variants: ["table", "card"] },
  { id: "card-list", name: "카드 목록", category: "data", description: "썸네일·제목·요약·메타 정보 카드", variants: [] },
  { id: "pagination", name: "페이지네이션", category: "data", description: "처음·이전·번호·다음·마지막, 목록 개수 선택", variants: ["numbered", "numbered-size", "more"] },
  { id: "detail-table", name: "상세 정보 표", category: "data", description: "항목명-값 2열 표", variants: [] },
  { id: "status-badge", name: "상태 뱃지", category: "data", description: "처리 상태 표시 (공통 상태값 사용)", variants: ["neutral", "info", "success", "warning", "danger"] },
  { id: "file-list", name: "첨부파일 목록", category: "data", description: "파일명·용량·내려받기", variants: [] },
  { id: "stat-cards", name: "요약 수치 카드", category: "data", description: "대시보드 건수 요약", variants: [] },
  { id: "notice-list", name: "게시물 요약 목록", category: "content", description: "공지·새소식 최근 N건", variants: [] },
  { id: "empty-state", name: "빈 화면 안내", category: "feedback", description: "데이터가 없을 때 안내 문구", variants: [] },
  // 콘텐츠
  { id: "hero-banner", name: "메인 비주얼", category: "content", description: "메인 상단 대표 문구·검색", variants: [] },
  { id: "quick-links", name: "바로가기", category: "content", description: "자주 쓰는 서비스 아이콘 링크", variants: [] },
  { id: "login-form", name: "로그인 폼", category: "form", description: "아이디·비밀번호, 간편인증, 찾기 링크", variants: [] },
  // 폼
  { id: "text-input", name: "입력창", category: "form", description: "라벨, 필수 표시, 안내·오류 문구", variants: ["default", "error", "disabled"] },
  { id: "textarea", name: "여러 줄 입력", category: "form", description: "글자 수 표시", variants: [] },
  { id: "select", name: "선택 목록", category: "form", description: "옵션 목록, 기본값", variants: [] },
  { id: "radio-group", name: "라디오 버튼", category: "form", description: "하나만 선택", variants: [] },
  { id: "checkbox-group", name: "체크박스", category: "form", description: "여러 개 선택, 약관 동의", variants: [] },
  { id: "date-range", name: "기간 선택", category: "form", description: "시작일~종료일, 빠른 기간 버튼", variants: [] },
  { id: "file-upload", name: "파일 첨부", category: "form", description: "허용 형식·용량 안내, 첨부 목록", variants: [] },
  // 동작
  { id: "button", name: "버튼", category: "action", description: "주요·보조·텍스트 버튼", variants: ["primary", "secondary", "tertiary", "danger"] },
  { id: "button-group", name: "버튼 영역", category: "action", description: "화면 하단 주요 동작 버튼 묶음", variants: [] },
  // 피드백
  { id: "confirm-dialog", name: "확인 창(컨펌)", category: "feedback", description: "되돌릴 수 없는 동작 전 확인. 확인·취소", variants: [] },
  { id: "alert-dialog", name: "알림 창(얼럿)", category: "feedback", description: "결과·오류 안내. 확인 버튼 하나", variants: [] },
  { id: "toast", name: "토스트", category: "feedback", description: "잠시 나타났다 사라지는 처리 결과 알림", variants: ["success", "info", "danger"] },
  { id: "modal", name: "모달 팝업", category: "feedback", description: "화면 위 레이어 팝업. 제목·본문·닫기", variants: [] },
];

export const BASE_ICONS = [
  "search", "menu", "user", "bell", "home", "download", "upload", "calendar", "chevron-left", "chevron-right",
  "close", "check", "alert", "info", "file", "logout", "plus", "edit", "trash", "filter",
];

/** 컨셉 비교·디자인 시스템 페이지에서 보여 주는 화면 유형 */
export const TEMPLATE_TYPES = [
  ["login", "로그인"],
  ["dashboard", "대시보드"],
  ["main", "메인"],
  ["list", "목록"],
  ["detail", "상세"],
  ["form", "등록"],
  ["confirm", "확인 창"],
  ["alert", "알림 창"],
  ["toast", "토스트"],
  ["modal", "모달 팝업"],
] as const;

// ── 컴포넌트 스타일 변수 (PRD F-DSR-02) ──────────────────────────────
// 컴포넌트 조정은 이 변수만 바꾼다. 와이어프레임 CSS가 var(--이름, 기본값)으로 읽으므로
// 값이 바뀌면 그 컴포넌트를 쓰는 모든 화면이 한꺼번에 다시 그려진다.

export type StyleVarType = "color" | "px" | "number";
export interface StyleVar {
  name: string;
  label: string;
  type: StyleVarType;
  /** 기본값 설명 (토큰에서 옴) */
  base: string;
}

const v = (name: string, label: string, type: StyleVarType, base: string): StyleVar => ({ name, label, type, base });
const INPUT = [v("--w-in-r", "입력창 모서리", "px", "radius.sm"), v("--w-in-border", "입력창 테두리 색", "color", "color.border"), v("--w-in-bg", "입력창 배경", "color", "color.surface")];
const BUTTON = [v("--w-btn-r", "버튼 모서리", "px", "레이아웃 버튼 모서리"), v("--w-btn-h", "버튼 높이", "px", "control.height"), v("--w-btn-px", "버튼 좌우 여백", "px", "간격×3"), v("--w-btn-weight", "버튼 글자 굵기", "number", "600")];
const DIALOG = [v("--w-dlg-r", "창 모서리", "px", "radius.lg"), v("--w-dlg-w", "창 폭", "px", "400px")];

export const COMPONENT_STYLE_VARS: Record<string, StyleVar[]> = {
  gnb: [v("--w-gnb-h", "GNB 높이", "px", "72px (촘촘 56px)"), v("--w-gnb-active", "현재 메뉴 색", "color", "color.primary"), v("--w-gnb-fs", "메뉴 글자 크기", "px", "본문+1px"), v("--w-gnb-gap", "메뉴 간격", "px", "간격×4")],
  lnb: [v("--w-lnb-on", "선택 메뉴 배경", "color", "color.primary")],
  breadcrumb: [v("--w-bc-color", "위치 표시 글자 색", "color", "color.textMuted")],
  tabs: [v("--w-tab-on", "선택 탭 색", "color", "color.primary")],
  "step-indicator": [v("--w-step-on", "현재 단계 색", "color", "color.primary"), v("--w-step-r", "단계 상자 모서리", "px", "radius.md")],
  footer: [v("--w-foot-bg", "푸터 배경", "color", "color.surfaceAlt"), v("--w-foot-color", "푸터 글자 색", "color", "color.textMuted")],
  "search-bar": [v("--w-search-r", "검색창 모서리", "px", "버튼 모서리")],
  "search-panel": [v("--w-sp-bg", "조건 영역 배경", "color", "color.surfaceAlt"), v("--w-sp-border", "조건 영역 테두리", "color", "color.border"), v("--w-sp-r", "조건 영역 모서리", "px", "radius.md")],
  "data-table": [
    v("--w-th-bg", "머리글 배경", "color", "color.surfaceAlt"),
    v("--w-th-color", "머리글 글자 색", "color", "color.text"),
    v("--w-th-line", "머리글 위 굵은 선 색", "color", "color.text"),
    v("--w-row", "행 높이", "px", "control.rowHeight"),
    v("--w-td-line", "행 구분선 색", "color", "color.border"),
    v("--w-card-r", "카드형 목록 모서리", "px", "radius.lg"),
  ],
  "card-list": [v("--w-card-r", "카드 모서리", "px", "radius.lg"), v("--w-card-bg", "카드 배경", "color", "color.surface")],
  pagination: [v("--w-pg-on", "현재 페이지 색", "color", "color.primary"), v("--w-pg-r", "번호 모서리", "px", "radius.sm"), v("--w-pg-size", "번호 크기", "px", "32px")],
  "detail-table": [v("--w-dt-th-bg", "항목명 배경", "color", "color.surfaceAlt"), v("--w-dt-line", "구분선 색", "color", "color.border")],
  "status-badge": [v("--w-badge-r", "뱃지 모서리", "px", "999px"), v("--w-badge-bg", "뱃지 배경", "color", "투명")],
  "file-list": [v("--w-file-bg", "첨부 목록 배경", "color", "color.surface")],
  "stat-cards": [v("--w-stat-color", "수치 색", "color", "color.primary"), v("--w-stat-bg", "카드 배경", "color", "color.surface")],
  "notice-list": [v("--w-notice-bg", "배경", "color", "color.surface")],
  "empty-state": [v("--w-empty-color", "안내 글자 색", "color", "color.textMuted")],
  "hero-banner": [v("--w-hero-bg", "배경", "color", "주 색 10%"), v("--w-hero-r", "모서리", "px", "radius.lg")],
  "quick-links": [v("--w-ql-color", "아이콘 색", "color", "color.primary"), v("--w-ql-r", "모서리", "px", "radius.md")],
  "login-form": [v("--w-login-w", "폼 폭", "px", "380px"), v("--w-login-r", "모서리", "px", "radius.lg")],
  "text-input": INPUT,
  textarea: INPUT,
  select: INPUT,
  "date-range": INPUT,
  "radio-group": [v("--w-check-on", "선택 색", "color", "color.primary")],
  "checkbox-group": [v("--w-check-on", "선택 색", "color", "color.primary")],
  "file-upload": [v("--w-upload-border", "끌어 놓기 영역 테두리", "color", "color.border"), v("--w-upload-bg", "끌어 놓기 영역 배경", "color", "color.surface")],
  button: BUTTON,
  "button-group": BUTTON,
  "confirm-dialog": DIALOG,
  "alert-dialog": DIALOG,
  modal: [v("--w-modal-r", "팝업 모서리", "px", "radius.lg"), v("--w-modal-w", "팝업 폭", "px", "560px")],
  toast: [v("--w-toast-bg", "토스트 배경", "color", "#1F2937"), v("--w-toast-r", "토스트 모서리", "px", "버튼 모서리")],
};

/** 디자인 시스템에 추가된 컴포넌트(기본 렌더러가 없는 것)가 쓰는 공통 변수 */
export const ADDED_COMPONENT_VARS: StyleVar[] = [v("--w-gen-border", "테두리 색", "color", "color.primary"), v("--w-gen-bg", "배경", "color", "color.surface"), v("--w-gen-r", "모서리", "px", "radius.md")];

export function styleVarsOf(componentId: string): StyleVar[] {
  return COMPONENT_STYLE_VARS[componentId] ?? ADDED_COMPONENT_VARS;
}

export function isValidStyleValue(type: StyleVarType, value: string): boolean {
  if (type === "color") return /^#[0-9A-Fa-f]{6}$/.test(value);
  if (type === "px") return /^\d{1,4}(\.\d+)?px$/.test(value);
  return /^\d{1,4}$/.test(value);
}

// ── 조정 범위 (PRD F-DSR-01) ──────────────────────────────────────
export interface DesignScope {
  id: string;
  label: string;
  /** 패치에서 바꿀 수 있는 경로 앞부분 */
  allowed: string[];
  hint: string;
}

export const DESIGN_SCOPES: DesignScope[] = [
  { id: "global", label: "전역 · 새 컴포넌트", allowed: ["tokens", "layout", "componentStyles", "components.add"], hint: "새 컴포넌트 추가, 여러 섹션에 걸친 변경" },
  { id: "colors", label: "색상", allowed: ["tokens.color"], hint: "색 토큰만" },
  { id: "type", label: "글꼴", allowed: ["tokens.font"], hint: "글꼴·크기 단계·굵기만" },
  { id: "spacing", label: "간격·그리드", allowed: ["tokens.spacing", "tokens.grid"], hint: "기본 간격·단 수·최대 폭·단 간격만" },
  { id: "shape", label: "모서리·그림자", allowed: ["tokens.radius", "tokens.shadow"], hint: "모서리 반경·그림자만" },
  { id: "control", label: "컨트롤", allowed: ["tokens.control"], hint: "입력·버튼 높이, 목록 행 높이만" },
  { id: "layout", label: "레이아웃 규칙", allowed: ["layout"], hint: "GNB·로고·검색·목록·페이지네이션·버튼·밀도·푸터 규칙만" },
  { id: "templates", label: "화면 템플릿", allowed: ["tokens", "layout", "componentStyles"], hint: "토큰·레이아웃·컴포넌트 스타일 (새 컴포넌트는 전역에서)" },
  { id: "comments", label: "댓글 반영", allowed: ["tokens", "layout", "componentStyles"], hint: "댓글이 가리키는 곳만" },
];

export function scopeOf(id: string): DesignScope {
  if (id.startsWith("cmp:")) {
    const cid = id.slice(4);
    return { id, label: `컴포넌트 ${cid}`, allowed: [`componentStyles.${cid}`], hint: `${cid}의 스타일 변수만` };
  }
  const s = DESIGN_SCOPES.find((x) => x.id === id);
  if (!s) throw new Error(`조정 범위가 없습니다: ${id} (가능: ${DESIGN_SCOPES.map((x) => x.id).join(", ")}, cmp:<컴포넌트ID>)`);
  return s;
}
