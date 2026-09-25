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
