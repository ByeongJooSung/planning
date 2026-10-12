/**
 * 디자인 라이브러리 — 디자인 시스템은 세 가지를 차례로 골라 만든다.
 *   ① 프레임(화면 골격): 메뉴 위치·헤더 구성·제목 영역·검색 영역·콘텐츠 폭·푸터
 *   ② 톤앤매너: 색 팔레트·글꼴·모서리·그림자, 그리고 그 톤에 어울리는 기본 세부 스타일
 *   ③ 세부 스타일: 밀도·버튼 모양·표 머리·통계 카드·탭·목록·페이지네이션 (톤 기본값을 바꿀 때만)
 * compose(프레임, 톤, 세부 스타일) → DesignConcept(토큰 + 레이아웃 규칙)
 *
 * 참고 화면: 민원처리시스템(심사자) Type A·B 대시보드, 화학물질정보 공동활용 플랫폼(민원인 포털) 공통 가이드
 */
import type { DesignConcept, DesignTokens, LayoutRules } from "../model/schema.js";

export type SystemProfile = "portal" | "service" | "admin";
type Hex = string;

// ── ① 프레임 ───────────────────────────────────────────────────────────

export interface FrameDef {
  id: string;
  name: string;
  summary: string;
  /** 어울리는 경우 */
  fit: string;
  /** 추천 시스템 성격 */
  profiles: SystemProfile[];
  /** 참고한 실제 화면 */
  ref?: string;
  layout: Pick<LayoutRules, "nav" | "logo" | "search" | "list" | "pagination" | "footer"> & Partial<Pick<LayoutRules, "searchStyle" | "tabs" | "headerFill">>;
  /** 콘텐츠 최대 폭 */
  maxWidth: number;
  /** 기본 밀도 (세부 스타일에서 바꿀 수 있다) */
  density: LayoutRules["density"];
}

export const FRAMES: FrameDef[] = [
  {
    id: "F01", name: "공공 포털 · 상단 메가메뉴", profiles: ["portal"],
    summary: "공식 누리집 알림 띠, 왼쪽 로고와 상단 메가메뉴, 헤더 검색, 제목 아래 굵은 선과 위치 표시, 기관 정보 푸터",
    fit: "대국민 공공 포털 · 처음 온 국민도 익숙한 배치 · KRDS 구성 원칙",
    layout: { nav: "top-mega", logo: "left", search: "header", list: "table", pagination: "numbered", footer: "full", searchStyle: "card", tabs: "line" },
    maxWidth: 1280, density: "comfortable",
  },
  {
    id: "F02", name: "공공 포털 · 가운데 로고 두 줄 헤더", profiles: ["portal"],
    summary: "가운데 로고 + 아래 줄 메뉴, 목록 위 조건 표, 목록 개수 선택이 있는 촘촘한 표",
    fit: "자료·통계가 많은 정보공개형 포털, 전문 이용자 비율이 높은 서비스",
    layout: { nav: "top", logo: "center", search: "panel", list: "table", pagination: "numbered-size", footer: "full", searchStyle: "table", tabs: "box" },
    maxWidth: 1280, density: "comfortable",
  },
  {
    id: "F03", name: "검색 중심 포털", profiles: ["portal", "service"],
    summary: "첫 화면 큰 검색창과 바로가기, 카드 목록과 더보기. 원하는 정보로 바로 가는 구성",
    fit: "정보 조회가 주 목적인 포털, 모바일 이용 비율이 높은 서비스",
    layout: { nav: "top", logo: "left", search: "hero", list: "card", pagination: "more", footer: "simple", searchStyle: "inline", tabs: "line" },
    maxWidth: 1200, density: "comfortable",
  },
  {
    id: "F04", name: "민원 포털 · 헤더 + 좌측 메뉴", profiles: ["service", "admin"],
    ref: "화학물질정보 공동활용 플랫폼 민원시스템(민원인)",
    summary: "전체 폭 흰 헤더(로고 · 이전 접속 · 남은 시간 · 로그인 연장 · 마이페이지 · 사용자), 그 아래 아이콘 좌측 메뉴, 제목 오른쪽 위치 표시, 조건 표 검색과 가운데 [초기화][검색], 목록 도구 줄",
    fit: "로그인 후 신청·등록·진행현황을 오래 보는 민원 처리형 서비스",
    layout: { nav: "header-side", logo: "left", search: "panel", list: "table", pagination: "numbered", footer: "simple", searchStyle: "table", tabs: "fill" },
    maxWidth: 1660, density: "comfortable",
  },
  {
    id: "F05", name: "단계 안내 신청형", profiles: ["service"],
    summary: "가운데 좁은 본문, 신청 단계 표시와 넓은 입력 폼, 상단 메뉴. 한 단계씩 막힘 없이 안내",
    fit: "처음 신청하는 민원인이 많은 서비스, 입력 항목이 많은 신청",
    layout: { nav: "top", logo: "left", search: "header", list: "table", pagination: "numbered", footer: "simple", searchStyle: "card", tabs: "line" },
    maxWidth: 1080, density: "comfortable",
  },
  {
    id: "F06", name: "업무형 · 좌측 메뉴(사용자 정보 포함)", profiles: ["admin"],
    ref: "민원처리시스템(심사자) Type A",
    summary: "260px 좌측 메뉴에 로고·접기 버튼·아이콘 메뉴, 아래쪽에 사용자 정보와 남은 시간·로그인 연장. 본문 위 환영 문구와 알림 한 줄",
    fit: "심사·관리 담당자가 하루 종일 쓰는 대시보드 중심 업무 시스템",
    layout: { nav: "side", logo: "left", search: "panel", list: "table", pagination: "numbered-size", footer: "none", searchStyle: "table", tabs: "line" },
    maxWidth: 1660, density: "compact",
  },
  {
    id: "F07", name: "업무형 · 좌측 메뉴 + 상단 바", profiles: ["admin"],
    ref: "민원처리시스템(심사자) Type B",
    summary: "어두운 260px 좌측 메뉴와 흰 상단 바(환영 문구 · 남은 시간 · 로그인 연장 · 사용자 사진). 업무 알림 한 줄 아래 카드형 위젯",
    fit: "메뉴가 많고 세션·사용자 정보를 늘 보여 줘야 하는 업무 시스템",
    layout: { nav: "side-header", logo: "left", search: "panel", list: "table", pagination: "numbered-size", footer: "none", searchStyle: "table", tabs: "line" },
    maxWidth: 1660, density: "compact",
  },
  {
    id: "F08", name: "업무형 · 아이콘 레일 + 상단 바", profiles: ["admin"],
    ref: "민원처리시스템(심사자) 메뉴 닫힘",
    summary: "64px 아이콘 레일로 화면 폭을 최대로 쓰고, 상단 바에 메뉴 이름과 사용자 정보",
    fit: "열이 많은 표·대용량 목록을 다루는 화면, 모니터가 작은 환경",
    layout: { nav: "rail", logo: "left", search: "panel", list: "table", pagination: "numbered-size", footer: "none", searchStyle: "table", tabs: "line" },
    maxWidth: 1800, density: "compact",
  },
  {
    id: "F09", name: "업무형 · 상단 메뉴 + 탭", profiles: ["admin"],
    summary: "상단 메뉴와 화면 탭, 넓은 표 영역. 메뉴가 적고 화면 폭을 넓게 쓰는 구성",
    fit: "메뉴 수가 적은 관리자, 표 열이 많은 심사 화면",
    layout: { nav: "top", logo: "left", search: "panel", list: "table", pagination: "numbered-size", footer: "none", searchStyle: "inline", tabs: "box", headerFill: "nav" },
    maxWidth: 1600, density: "compact",
  },
  {
    id: "F10", name: "모바일 우선 간결형", profiles: ["service", "portal"],
    summary: "가운데 로고, 한 화면에 한 가지 일, 큰 버튼과 카드 목록, 더보기 방식",
    fit: "모바일 신청 비율이 높은 생활 밀착형 서비스",
    layout: { nav: "top", logo: "center", search: "hero", list: "card", pagination: "more", footer: "simple", searchStyle: "inline", tabs: "fill" },
    maxWidth: 960, density: "comfortable",
  },
];

// ── ② 톤앤매너 ─────────────────────────────────────────────────────────

export interface ToneDef {
  id: string;
  name: string;
  summary: string;
  keywords: string[];
  profiles: SystemProfile[];
  ref?: string;
  color: {
    primary: Hex; accent: Hex; bg: Hex; surface?: Hex; surfaceAlt: Hex; border: Hex; text: Hex; textMuted?: Hex;
    nav: Hex; onNav: Hex; navActive?: Hex; onNavActive?: Hex; header?: Hex; onHeader?: Hex; tableHead?: Hex; onTableHead?: Hex;
    success?: Hex; warning?: Hex; danger?: Hex; info?: Hex; onPrimary?: Hex;
  };
  series: Hex[];
  font: string;
  base: number;
  radius: number;
  shadow: DesignTokens["shadow"];
  /** 이 톤의 기본 세부 스타일 */
  style: Required<Pick<LayoutRules, "button" | "tableHead" | "stat" | "navMark">>;
}

const F = {
  pretendard: '"Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  gov: '"Pretendard GOV", "Pretendard Variable", "Pretendard", "Malgun Gothic", sans-serif',
  noto: '"Noto Sans KR", "Pretendard Variable", "Malgun Gothic", sans-serif',
  plex: '"IBM Plex Sans KR", "Pretendard Variable", "Malgun Gothic", sans-serif',
  gothic: '"Gothic A1", "Pretendard Variable", "Malgun Gothic", sans-serif',
  nanum: '"NanumSquare", "Nanum Square", "Pretendard Variable", "Malgun Gothic", sans-serif',
};
export const FONT_OPTIONS: [string, string][] = [
  ["pretendard", "Pretendard"], ["gov", "Pretendard GOV"], ["noto", "Noto Sans KR"], ["plex", "IBM Plex Sans KR"], ["gothic", "Gothic A1"], ["nanum", "나눔스퀘어"],
];
export const FONTS = F;

export const TONES: ToneDef[] = [
  {
    id: "T01", name: "정부 블루", profiles: ["portal", "service"], ref: "민원시스템(민원인) 공통 가이드",
    summary: "정부 블루 주 색과 남색 메뉴, 흰 바탕에 회청색 표 머리·조건 칸. 공식 서비스다운 단정함",
    keywords: ["공식", "신뢰", "KRDS"],
    color: { primary: "#0056D0", accent: "#003675", bg: "#FFFFFF", surfaceAlt: "#F1F4F8", border: "#DEE2E6", text: "#1D1D1D", textMuted: "#555555", nav: "#0D3570", onNav: "#FFFFFF", navActive: "#0D3570", onNavActive: "#7FD3FF", header: "#FFFFFF", onHeader: "#1D1D1D", tableHead: "#EEF2F7", onTableHead: "#1D1D1D" },
    series: ["#0056D0", "#003675", "#2E8BC0", "#16A085", "#E67E22"], font: F.gov, base: 15, radius: 4, shadow: "none",
    style: { button: "square", tableHead: "tint", stat: "plain", navMark: "bar" },
  },
  {
    id: "T02", name: "네이비 업무", profiles: ["admin"], ref: "민원처리시스템(심사자) Type B",
    summary: "짙은 남색 메뉴에 파란 선택 막대, 회색 바탕 위 흰 카드와 진한 표 머리. 오래 봐도 피로가 적은 업무 톤",
    keywords: ["업무", "집중", "남색"],
    color: { primary: "#3461E0", accent: "#E5484D", bg: "#F3F5F9", surfaceAlt: "#F1F4F8", border: "#DDE2EA", text: "#1F2430", textMuted: "#6B7280", nav: "#1D2433", onNav: "#E3E8F1", navActive: "#3461E0", onNavActive: "#FFFFFF", header: "#FFFFFF", onHeader: "#1F2430", tableHead: "#4C566B", onTableHead: "#FFFFFF" },
    series: ["#E5484D", "#4F6BED", "#F2994A", "#3B82F6", "#A855F7", "#14B8A6", "#22C55E", "#EC4899"], font: F.pretendard, base: 15, radius: 8, shadow: "soft",
    style: { button: "rounded", tableHead: "dark", stat: "topline", navMark: "fill" },
  },
  {
    id: "T03", name: "클린 화이트 블루", profiles: ["admin", "service"], ref: "민원처리시스템(심사자) Type A-1",
    summary: "흰 메뉴에 연한 파랑 선택과 왼쪽 막대, 생동감 있는 그라데이션 통계 카드. 밝고 친근한 업무 화면",
    keywords: ["밝음", "친근", "대시보드"],
    color: { primary: "#2F5BEA", accent: "#1FB6F5", bg: "#F3F5F9", surfaceAlt: "#F4F6FA", border: "#E2E6EE", text: "#222631", textMuted: "#6B7280", nav: "#FFFFFF", onNav: "#33363D", navActive: "#EAF0FF", onNavActive: "#2F5BEA", header: "#FFFFFF", onHeader: "#222631", tableHead: "#F1F4F8", onTableHead: "#222631" },
    series: ["#3D63E6", "#2FB5F5", "#18C6DB", "#16C79A", "#A66EF0", "#F5B82E"], font: F.pretendard, base: 15, radius: 8, shadow: "soft",
    style: { button: "rounded", tableHead: "tint", stat: "gradient", navMark: "bar" },
  },
  {
    id: "T04", name: "로열 블루 메뉴", profiles: ["admin"], ref: "민원처리시스템(심사자) Type A-2",
    summary: "선명한 파란 좌측 메뉴와 흰 본문, 노랑까지 쓰는 다채로운 통계 카드. 활기 있고 또렷한 대비",
    keywords: ["선명", "활기", "파랑"],
    color: { primary: "#2F5BEA", accent: "#F5B82E", bg: "#F3F5F9", surfaceAlt: "#F4F6FA", border: "#E2E6EE", text: "#222631", textMuted: "#6B7280", nav: "#2550C4", onNav: "#FFFFFF", navActive: "#4A76EC", onNavActive: "#FFFFFF", header: "#FFFFFF", onHeader: "#222631", tableHead: "#F1F4F8", onTableHead: "#222631" },
    series: ["#3D63E6", "#2FB5F5", "#18C6DB", "#16C79A", "#F5B82E", "#A66EF0"], font: F.pretendard, base: 15, radius: 8, shadow: "soft",
    style: { button: "rounded", tableHead: "tint", stat: "gradient", navMark: "fill" },
  },
  {
    id: "T05", name: "딥 틸 행정", profiles: ["admin", "portal"],
    summary: "깊은 청록 메뉴와 차분한 회녹색 바탕. 환경·수자원·행정 업무에 어울리는 안정감",
    keywords: ["차분", "환경", "청록"],
    color: { primary: "#0F766E", accent: "#F59E0B", bg: "#F4F7F7", surfaceAlt: "#EEF3F2", border: "#D7E1DF", text: "#152422", textMuted: "#5B6B68", nav: "#0B3B3A", onNav: "#D8ECE9", navActive: "#14A094", onNavActive: "#FFFFFF", header: "#FFFFFF", onHeader: "#152422", tableHead: "#E3EEEC", onTableHead: "#152422" },
    series: ["#0F766E", "#14B8A6", "#0EA5E9", "#F59E0B", "#84CC16"], font: F.pretendard, base: 15, radius: 6, shadow: "none",
    style: { button: "rounded", tableHead: "tint", stat: "topline", navMark: "fill" },
  },
  {
    id: "T06", name: "포레스트 그린", profiles: ["service", "portal"],
    summary: "숲 녹색 주 색과 아이보리 바탕. 농림·산림·복지 서비스의 따뜻한 신뢰감",
    keywords: ["자연", "따뜻함", "녹색"],
    color: { primary: "#1E6B52", accent: "#C2410C", bg: "#F6F7F2", surfaceAlt: "#EDF1E8", border: "#D6DDCF", text: "#1B241F", textMuted: "#5C6860", nav: "#FFFFFF", onNav: "#1B241F", navActive: "#E3EFE8", onNavActive: "#1E6B52", header: "#FFFFFF", onHeader: "#1B241F", tableHead: "#E7EEE6", onTableHead: "#1B241F" },
    series: ["#1E6B52", "#4D9B6F", "#9BBF5A", "#D9A441", "#C2410C"], font: F.noto, base: 16, radius: 8, shadow: "soft",
    style: { button: "rounded", tableHead: "tint", stat: "icon", navMark: "bar" },
  },
  {
    id: "T07", name: "슬레이트 모노", profiles: ["admin"],
    summary: "검정에 가까운 슬레이트와 회색 단계만으로 만든 절제된 톤. 데이터가 주인공인 분석·관리 화면",
    keywords: ["절제", "데이터", "회색"],
    color: { primary: "#1F2937", accent: "#2563EB", bg: "#F5F6F7", surfaceAlt: "#F0F1F3", border: "#DADDE2", text: "#111827", textMuted: "#6B7280", nav: "#0F172A", onNav: "#CBD5E1", navActive: "#1E293B", onNavActive: "#FFFFFF", header: "#FFFFFF", onHeader: "#111827", tableHead: "#E5E7EB", onTableHead: "#111827" },
    series: ["#1F2937", "#475569", "#2563EB", "#94A3B8", "#0EA5E9"], font: F.plex, base: 14, radius: 4, shadow: "none",
    style: { button: "square", tableHead: "tint", stat: "plain", navMark: "bar" },
  },
  {
    id: "T08", name: "인디고 퍼플", profiles: ["service", "admin"],
    summary: "인디고 주 색과 보랏빛 회색 면. 디지털 플랫폼·연구 지원 서비스의 세련된 인상",
    keywords: ["세련", "디지털", "보라"],
    color: { primary: "#4F46E5", accent: "#DB2777", bg: "#F6F6FB", surfaceAlt: "#EEEEF8", border: "#DCDBEC", text: "#1C1B2E", textMuted: "#64618A", nav: "#1E1B4B", onNav: "#DCD9FF", navActive: "#4F46E5", onNavActive: "#FFFFFF", header: "#FFFFFF", onHeader: "#1C1B2E", tableHead: "#ECEBFA", onTableHead: "#1C1B2E" },
    series: ["#4F46E5", "#7C3AED", "#DB2777", "#0EA5E9", "#14B8A6"], font: F.pretendard, base: 15, radius: 10, shadow: "soft",
    style: { button: "rounded", tableHead: "tint", stat: "gradient", navMark: "fill" },
  },
  {
    id: "T09", name: "미드나잇 다크", profiles: ["admin"],
    summary: "어두운 바탕에 밝은 글자와 청록 강조. 관제·모니터링처럼 장시간 켜 두는 화면",
    keywords: ["다크", "관제", "모니터링"],
    color: { primary: "#38BDF8", onPrimary: "#04121D", accent: "#F472B6", bg: "#0E1420", surface: "#161E2D", surfaceAlt: "#1C2638", border: "#2A3650", text: "#E6EBF4", textMuted: "#93A0B8", nav: "#0A0F18", onNav: "#B8C4DA", navActive: "#1E2A40", onNavActive: "#38BDF8", header: "#121A28", onHeader: "#E6EBF4", tableHead: "#1F2B40", onTableHead: "#E6EBF4", success: "#34D399", warning: "#FBBF24", danger: "#F87171", info: "#60A5FA" },
    series: ["#38BDF8", "#A78BFA", "#34D399", "#FBBF24", "#F472B6"], font: F.pretendard, base: 14, radius: 8, shadow: "none",
    style: { button: "rounded", tableHead: "dark", stat: "topline", navMark: "fill" },
  },
  {
    id: "T10", name: "웜 오렌지", profiles: ["service", "portal"],
    summary: "주황 주 색과 따뜻한 미색 바탕. 생활·복지·지역 서비스의 친근함",
    keywords: ["친근", "생활", "주황"],
    color: { primary: "#D9480F", accent: "#1F6FEB", bg: "#FBF8F4", surfaceAlt: "#F5EDE4", border: "#E7DACB", text: "#2A1E15", textMuted: "#7A6656", nav: "#FFFFFF", onNav: "#2A1E15", navActive: "#FCE9DF", onNavActive: "#D9480F", header: "#FFFFFF", onHeader: "#2A1E15", tableHead: "#F5EDE4", onTableHead: "#2A1E15" },
    series: ["#D9480F", "#F59F00", "#1F6FEB", "#2F9E44", "#AE3EC9"], font: F.gothic, base: 16, radius: 12, shadow: "soft",
    style: { button: "pill", tableHead: "tint", stat: "icon", navMark: "fill" },
  },
  {
    id: "T11", name: "코랄 핑크", profiles: ["service", "portal"],
    summary: "산호색 주 색과 부드러운 분홍 면. 청소년·문화·참여 서비스의 경쾌함",
    keywords: ["경쾌", "문화", "참여"],
    color: { primary: "#E0475A", accent: "#3B5BDB", bg: "#FDF7F8", surfaceAlt: "#FBEDEF", border: "#F0D7DB", text: "#2B1A1D", textMuted: "#80636A", nav: "#FFFFFF", onNav: "#2B1A1D", navActive: "#FDE4E8", onNavActive: "#E0475A", header: "#FFFFFF", onHeader: "#2B1A1D", tableHead: "#FBEDEF", onTableHead: "#2B1A1D" },
    series: ["#E0475A", "#F783AC", "#3B5BDB", "#FAB005", "#12B886"], font: F.pretendard, base: 16, radius: 14, shadow: "soft",
    style: { button: "pill", tableHead: "line", stat: "gradient", navMark: "fill" },
  },
  {
    id: "T12", name: "시안 메디컬", profiles: ["service", "admin", "portal"],
    summary: "맑은 청록 주 색과 아주 옅은 하늘 바탕. 보건·의료·안전 서비스의 청결함",
    keywords: ["청결", "보건", "하늘"],
    color: { primary: "#0891B2", accent: "#7C3AED", bg: "#F4FAFC", surfaceAlt: "#E9F5F9", border: "#D2E6EE", text: "#0F2830", textMuted: "#557884", nav: "#FFFFFF", onNav: "#0F2830", navActive: "#E0F4FA", onNavActive: "#0891B2", header: "#FFFFFF", onHeader: "#0F2830", tableHead: "#E4F2F7", onTableHead: "#0F2830" },
    series: ["#0891B2", "#06B6D4", "#7C3AED", "#10B981", "#F97316"], font: F.pretendard, base: 15, radius: 8, shadow: "soft",
    style: { button: "rounded", tableHead: "tint", stat: "icon", navMark: "bar" },
  },
  {
    id: "T13", name: "어스 브라운", profiles: ["portal", "service"],
    summary: "흙색 주 색과 한지 같은 미색. 문화유산·관광·지역 기록 서비스의 품격",
    keywords: ["품격", "문화유산", "한지"],
    color: { primary: "#8B5E34", accent: "#2F6F8F", bg: "#FAF7F1", surfaceAlt: "#F1EADF", border: "#E0D5C4", text: "#2A2119", textMuted: "#776654", nav: "#3B2A1C", onNav: "#F1E6D6", navActive: "#8B5E34", onNavActive: "#FFFFFF", header: "#FFFFFF", onHeader: "#2A2119", tableHead: "#F1EADF", onTableHead: "#2A2119" },
    series: ["#8B5E34", "#C08A4B", "#2F6F8F", "#6B8E4E", "#B5523B"], font: F.nanum, base: 16, radius: 2, shadow: "none",
    style: { button: "square", tableHead: "line", stat: "plain", navMark: "bar" },
  },
  {
    id: "T14", name: "버건디", profiles: ["portal", "admin"],
    summary: "짙은 와인색과 따뜻한 회색. 법무·의회·감사 기관의 무게감",
    keywords: ["무게감", "법무", "와인"],
    color: { primary: "#8C1D40", accent: "#B08D57", bg: "#F8F6F6", surfaceAlt: "#F1ECEC", border: "#DED6D7", text: "#24181B", textMuted: "#6E5D61", nav: "#4A0F22", onNav: "#F3DDE4", navActive: "#8C1D40", onNavActive: "#FFFFFF", header: "#FFFFFF", onHeader: "#24181B", tableHead: "#5A2233", onTableHead: "#FFFFFF" },
    series: ["#8C1D40", "#B08D57", "#4A6FA5", "#6B8E4E", "#C2571A"], font: F.noto, base: 15, radius: 3, shadow: "none",
    style: { button: "square", tableHead: "dark", stat: "topline", navMark: "fill" },
  },
  {
    id: "T15", name: "올리브 필드", profiles: ["service", "portal"],
    summary: "올리브 녹색과 베이지 면. 농업·식품·지역 상생 서비스의 소박한 단단함",
    keywords: ["농업", "식품", "올리브"],
    color: { primary: "#5B7F2A", accent: "#D97706", bg: "#F8F8F1", surfaceAlt: "#EFF0E2", border: "#DADBC6", text: "#20240F", textMuted: "#6A6D52", nav: "#FFFFFF", onNav: "#20240F", navActive: "#EAF0DC", onNavActive: "#5B7F2A", header: "#FFFFFF", onHeader: "#20240F", tableHead: "#EFF0E2", onTableHead: "#20240F" },
    series: ["#5B7F2A", "#8DB255", "#D97706", "#0E7490", "#A16207"], font: F.noto, base: 16, radius: 6, shadow: "none",
    style: { button: "rounded", tableHead: "tint", stat: "icon", navMark: "bar" },
  },
  {
    id: "T16", name: "고대비 접근성", profiles: ["portal", "service"],
    summary: "검정 글자·진한 파랑·두꺼운 선, 큰 본문(17px). 고령자·저시력 이용자를 고려한 최상위 대비",
    keywords: ["접근성", "고대비", "고령자"],
    color: { primary: "#003EAA", accent: "#B30000", bg: "#FFFFFF", surfaceAlt: "#F0F0F0", border: "#6B6B6B", text: "#000000", textMuted: "#333333", nav: "#FFFFFF", onNav: "#000000", navActive: "#003EAA", onNavActive: "#FFFFFF", header: "#FFFFFF", onHeader: "#000000", tableHead: "#E6E6E6", onTableHead: "#000000", success: "#006B2E", warning: "#8A4B00", danger: "#B30000", info: "#003EAA" },
    series: ["#003EAA", "#000000", "#006B2E", "#8A4B00", "#B30000"], font: F.gov, base: 17, radius: 4, shadow: "none",
    style: { button: "square", tableHead: "tint", stat: "plain", navMark: "fill" },
  },
  {
    id: "T17", name: "소프트 파스텔", profiles: ["service", "portal"],
    summary: "부드러운 파랑과 라벤더 면, 둥근 모서리. 교육·돌봄·학습 서비스의 다정함",
    keywords: ["교육", "다정함", "파스텔"],
    color: { primary: "#5B7CF0", accent: "#F28C8C", bg: "#F7F8FE", surfaceAlt: "#EEF1FD", border: "#DDE2F7", text: "#1E2340", textMuted: "#6A7099", nav: "#FFFFFF", onNav: "#1E2340", navActive: "#EEF1FD", onNavActive: "#5B7CF0", header: "#FFFFFF", onHeader: "#1E2340", tableHead: "#EEF1FD", onTableHead: "#1E2340" },
    series: ["#5B7CF0", "#9B8AFB", "#F28C8C", "#5CC8B4", "#FFC36B"], font: F.gothic, base: 16, radius: 14, shadow: "soft",
    style: { button: "pill", tableHead: "line", stat: "gradient", navMark: "fill" },
  },
  {
    id: "T18", name: "골드 네이비", profiles: ["portal", "admin"],
    summary: "깊은 남색에 금색 포인트. 금융·국가 기간 시스템의 권위와 신뢰",
    keywords: ["권위", "금융", "금색"],
    color: { primary: "#12264A", accent: "#C9A227", bg: "#F6F7F9", surfaceAlt: "#EEF0F4", border: "#D8DCE4", text: "#121826", textMuted: "#5E6678", nav: "#0B1830", onNav: "#D9DFEA", navActive: "#C9A227", onNavActive: "#0B1830", header: "#FFFFFF", onHeader: "#121826", tableHead: "#12264A", onTableHead: "#FFFFFF" },
    series: ["#12264A", "#C9A227", "#3E6BB3", "#7A8BA8", "#B4542C"], font: F.plex, base: 15, radius: 2, shadow: "none",
    style: { button: "square", tableHead: "dark", stat: "topline", navMark: "bar" },
  },
  {
    id: "T19", name: "스카이 라이트", profiles: ["service", "portal", "admin"],
    summary: "산뜻한 하늘색 주 색, 흰 면과 부드러운 그림자, 넉넉한 모서리. 민간 SaaS·스타트업 서비스의 가벼움",
    keywords: ["산뜻", "SaaS", "가벼움"],
    color: { primary: "#2E90FA", accent: "#7A5AF8", bg: "#F8FAFC", surfaceAlt: "#F1F5F9", border: "#E2E8F0", text: "#101828", textMuted: "#667085", nav: "#FFFFFF", onNav: "#344054", navActive: "#EFF6FF", onNavActive: "#2E90FA", header: "#FFFFFF", onHeader: "#101828", tableHead: "#F8FAFC", onTableHead: "#475467" },
    series: ["#2E90FA", "#7A5AF8", "#12B76A", "#F79009", "#EE46BC"], font: F.pretendard, base: 15, radius: 12, shadow: "soft",
    style: { button: "rounded", tableHead: "line", stat: "icon", navMark: "fill" },
  },
  {
    id: "T20", name: "차콜 미니멀", profiles: ["service", "portal"],
    summary: "흑백과 한 가지 오렌지 포인트, 각진 모서리. 브랜드·에이전시 감성의 강한 인상",
    keywords: ["미니멀", "브랜드", "흑백"],
    color: { primary: "#111111", accent: "#FF5A1F", bg: "#FFFFFF", surfaceAlt: "#F4F4F4", border: "#E2E2E2", text: "#111111", textMuted: "#6B6B6B", nav: "#FFFFFF", onNav: "#111111", navActive: "#111111", onNavActive: "#FFFFFF", header: "#FFFFFF", onHeader: "#111111", tableHead: "#FFFFFF", onTableHead: "#111111" },
    series: ["#111111", "#FF5A1F", "#6B6B6B", "#B5B5B5", "#2563EB"], font: F.pretendard, base: 15, radius: 0, shadow: "none",
    style: { button: "square", tableHead: "line", stat: "plain", navMark: "bar" },
  },
];

// ── ③ 세부 스타일 ──────────────────────────────────────────────────────

export interface StyleChoice {
  density?: LayoutRules["density"];
  button?: LayoutRules["button"];
  tableHead?: NonNullable<LayoutRules["tableHead"]>;
  stat?: NonNullable<LayoutRules["stat"]>;
  tabs?: NonNullable<LayoutRules["tabs"]>;
  list?: LayoutRules["list"];
  pagination?: LayoutRules["pagination"];
  searchStyle?: NonNullable<LayoutRules["searchStyle"]>;
  navMark?: NonNullable<LayoutRules["navMark"]>;
  headerFill?: NonNullable<LayoutRules["headerFill"]>;
  /** FONT_OPTIONS 키 */
  font?: string;
  /** 모서리 반지름(px) */
  radius?: number;
}

/** 세부 스타일 선택지 (화면에서 고르는 항목) */
export const STYLE_OPTIONS: { key: keyof StyleChoice; label: string; options: [string, string][] }[] = [
  { key: "density", label: "밀도", options: [["comfortable", "여유"], ["compact", "촘촘"]] },
  { key: "button", label: "버튼 모양", options: [["square", "각진"], ["rounded", "둥근"], ["pill", "알약형"]] },
  { key: "tableHead", label: "표 머리", options: [["dark", "진한 면"], ["tint", "옅은 면"], ["line", "선만"]] },
  { key: "stat", label: "통계 카드", options: [["gradient", "그라데이션"], ["topline", "위 색띠"], ["plain", "흰 카드"], ["icon", "아이콘"]] },
  { key: "tabs", label: "탭", options: [["line", "밑줄"], ["fill", "채움"], ["box", "상자"]] },
  { key: "searchStyle", label: "검색 조건", options: [["table", "조건 표"], ["card", "카드"], ["inline", "한 줄"]] },
  { key: "navMark", label: "메뉴 선택 표시", options: [["fill", "면 채움"], ["bar", "왼쪽 막대"]] },
  { key: "headerFill", label: "상단 메뉴 바", options: [["light", "흰 바탕"], ["nav", "메뉴 색"]] },
  { key: "list", label: "목록", options: [["table", "표"], ["card", "카드"]] },
  { key: "pagination", label: "페이지 이동", options: [["numbered", "번호"], ["numbered-size", "번호 + 개수 선택"], ["more", "더보기"]] },
  { key: "font", label: "글꼴", options: FONT_OPTIONS },
];

// ── 조합 ──────────────────────────────────────────────────────────────

const scale = (base: number) => ({
  display: Math.round(base * 2.4),
  h1: Math.round(base * 1.75),
  h2: Math.round(base * 1.4),
  h3: Math.round(base * 1.2),
  body: base,
  small: base - 1,
  caption: base - 2,
});

export function frameOf(id: string): FrameDef | undefined {
  return FRAMES.find((f) => f.id === id.toUpperCase());
}
export function toneOf(id: string): ToneDef | undefined {
  return TONES.find((t) => t.id === id.toUpperCase());
}

export function conceptId(frameId: string, toneId: string): string {
  return `${frameId.toUpperCase()}-${toneId.toUpperCase()}`;
}

/** 프레임 × 톤 × 세부 스타일 → 컨셉(토큰 + 레이아웃 규칙) */
export function compose(frameId: string, toneId: string, style: StyleChoice = {}, id?: string): DesignConcept {
  const f = frameOf(frameId);
  if (!f) throw new Error(`프레임 ${frameId}가 없습니다 (F01~F${String(FRAMES.length).padStart(2, "0")})`);
  const t = toneOf(toneId);
  if (!t) throw new Error(`톤 ${toneId}가 없습니다 (T01~T${String(TONES.length).padStart(2, "0")})`);
  const density = style.density ?? f.density;
  const compact = density === "compact";
  const base = compact ? Math.max(13, t.base - 1) : t.base;
  const radius = style.radius ?? t.radius;
  const family = style.font && (F as Record<string, string>)[style.font] ? (F as Record<string, string>)[style.font]! : t.font;
  const c = t.color;
  const tokens: DesignTokens = {
    color: {
      primary: c.primary, onPrimary: c.onPrimary ?? "#FFFFFF", accent: c.accent, bg: c.bg, surface: c.surface ?? "#FFFFFF",
      surfaceAlt: c.surfaceAlt, border: c.border, text: c.text, textMuted: c.textMuted ?? "#6B7280", nav: c.nav, onNav: c.onNav,
      success: c.success ?? "#1E7B4B", warning: c.warning ?? "#B45309", danger: c.danger ?? "#D92D20", info: c.info ?? "#1D6FB8",
      ...(c.navActive ? { navActive: c.navActive } : {}), ...(c.onNavActive ? { onNavActive: c.onNavActive } : {}),
      ...(c.header ? { header: c.header } : {}), ...(c.onHeader ? { onHeader: c.onHeader } : {}),
      ...(c.tableHead ? { tableHead: c.tableHead } : {}), ...(c.onTableHead ? { onTableHead: c.onTableHead } : {}),
    },
    series: [...t.series],
    font: { family, scale: scale(base), weightBold: 700 },
    radius: { sm: Math.max(0, Math.round(radius * 0.6)), md: radius, lg: Math.round(radius * 1.5) },
    control: compact ? { height: 36, rowHeight: 42 } : { height: 44, rowHeight: 52 },
    spacing: compact ? 6 : 8,
    grid: { columns: 12, maxWidth: f.maxWidth, gutter: 24 },
    shadow: t.shadow,
  };
  const layout: LayoutRules = {
    frame: f.id,
    nav: f.layout.nav,
    logo: f.layout.logo,
    search: f.layout.search,
    list: style.list ?? f.layout.list,
    pagination: style.pagination ?? f.layout.pagination,
    button: style.button ?? t.style.button,
    density,
    footer: f.layout.footer,
    tableHead: style.tableHead ?? t.style.tableHead,
    stat: style.stat ?? t.style.stat,
    tabs: style.tabs ?? f.layout.tabs ?? "line",
    searchStyle: style.searchStyle ?? f.layout.searchStyle ?? "card",
    navMark: style.navMark ?? t.style.navMark,
    headerFill: style.headerFill ?? f.layout.headerFill ?? "light",
  };
  return {
    id: id ?? conceptId(f.id, t.id),
    name: `${f.name} · ${t.name}`,
    summary: `${f.summary}. 톤: ${t.summary}`,
    fit: f.fit,
    tokens,
    layout,
    frameId: f.id,
    toneId: t.id,
  };
}

/** 시스템 성격별 추천 조합 (기본 제안). 앞쪽일수록 더 추천 */
export const RECOMMENDED: Record<SystemProfile, [string, string][]> = {
  portal: [["F01", "T01"], ["F03", "T19"], ["F02", "T05"], ["F01", "T16"], ["F03", "T12"], ["F02", "T13"]],
  service: [["F04", "T01"], ["F05", "T06"], ["F10", "T10"], ["F04", "T08"], ["F05", "T17"], ["F03", "T19"]],
  admin: [["F07", "T02"], ["F06", "T03"], ["F06", "T04"], ["F04", "T01"], ["F08", "T07"], ["F09", "T05"]],
};

/** 추천 조합을 컨셉 A·B·C…로 */
export function recommendedConcepts(profile: SystemProfile): DesignConcept[] {
  return RECOMMENDED[profile].map(([fr, to], i) => {
    const c = compose(fr, to, {}, String.fromCharCode(65 + i));
    return c;
  });
}

/** 성격에 맞는 프레임·톤 (추천 우선 정렬) */
export function framesFor(profile: SystemProfile): FrameDef[] {
  return [...FRAMES].sort((a, b) => Number(b.profiles.includes(profile)) - Number(a.profiles.includes(profile)));
}
export function tonesFor(profile: SystemProfile): ToneDef[] {
  return [...TONES].sort((a, b) => Number(b.profiles.includes(profile)) - Number(a.profiles.includes(profile)));
}

/** 화면·CLI에서 받은 세부 스타일 값 중 허용된 것만 남긴다 */
export function cleanStyle(input: unknown): StyleChoice {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== "object") return out;
  const o = input as Record<string, unknown>;
  for (const opt of STYLE_OPTIONS) {
    const v = o[opt.key];
    if (typeof v === "string" && opt.options.some(([k]) => k === v)) out[opt.key] = v;
  }
  if (typeof o.radius === "number" && Number.isFinite(o.radius)) out.radius = Math.max(0, Math.min(24, Math.round(o.radius)));
  return out as StyleChoice;
}

/** 레이아웃 규칙 항목 이름과 값 이름 — 화면·AI 프롬프트·검사가 같은 목록을 쓴다 */
export const LAYOUT_LABELS: Record<string, [string, Record<string, string>]> = {
  nav: ["화면 골격", { top: "상단 메뉴", "top-mega": "상단 메가메뉴", side: "좌측 메뉴(사용자 정보 포함)", "side-header": "좌측 메뉴 + 상단 바", "header-side": "전체 헤더 + 좌측 메뉴", rail: "아이콘 레일 + 상단 바" }],
  logo: ["로고 위치", { left: "왼쪽", center: "가운데" }],
  search: ["검색 영역", { header: "헤더 안", hero: "첫 화면 큰 검색창", panel: "목록 위 조건 영역" }],
  searchStyle: ["검색 조건 모양", { table: "조건 표", card: "카드", inline: "한 줄" }],
  list: ["목록 형태", { table: "표(그리드)", card: "카드" }],
  tableHead: ["표 머리", { dark: "진한 면", tint: "옅은 면", line: "선만" }],
  stat: ["통계 카드", { gradient: "그라데이션", topline: "위 색띠", plain: "흰 카드", icon: "아이콘" }],
  tabs: ["탭", { line: "밑줄", fill: "채움", box: "상자" }],
  navMark: ["메뉴 선택 표시", { fill: "면 채움", bar: "왼쪽 막대" }],
  headerFill: ["상단 메뉴 바", { light: "흰 바탕", nav: "메뉴 색" }],
  pagination: ["페이지네이션", { numbered: "번호", "numbered-size": "번호 + 목록 개수 선택", more: "더보기" }],
  button: ["버튼 모서리", { square: "각진", rounded: "둥근", pill: "알약형" }],
  density: ["밀도", { comfortable: "여유", compact: "촘촘" }],
  footer: ["푸터", { full: "기관 정보 전체", simple: "간단", none: "없음" }],
};
/** 반드시 있는 레이아웃 항목 (나머지는 선택) */
export const LAYOUT_REQUIRED = ["nav", "logo", "search", "list", "pagination", "button", "density", "footer"];
export const LAYOUT_OPTIONS: Record<string, string[]> = Object.fromEntries(Object.entries(LAYOUT_LABELS).map(([k, v]) => [k, Object.keys(v[1])]));
