/**
 * 시스템별 디자인 컨셉 3종 제안 (PRD F-DS-01)
 * 시스템의 성격(대국민 포털 / 신청 서비스 / 업무·관리자)에 맞춰 서로 다른 방향 3개를 만든다.
 * 현재는 규칙 기반이다. LLM 연동(P1) 후에는 참조자료·기존 서비스 분석 결과를 반영해 조정한다.
 */
import type { DesignConcept, DesignTokens, LayoutRules, System } from "../model/schema.js";

export type SystemProfile = "portal" | "service" | "admin";

export function profileOf(system: System): SystemProfile {
  const users = system.users.join(" ");
  if (system.channels.includes("ADMIN_WEB") || /관리자|심사자|운영|담당자/.test(users) || system.code === "ADM") return "admin";
  if (/국민|비회원|누구나|방문자/.test(users)) return "portal";
  if (/민원|회원|신청|고객/.test(users)) return "service";
  return "portal";
}

const scale = (base: number) => ({
  display: Math.round(base * 2.4),
  h1: Math.round(base * 1.85),
  h2: Math.round(base * 1.45),
  h3: Math.round(base * 1.2),
  body: base,
  small: base - 1,
  caption: base - 2,
});

function tokens(t: {
  primary: string;
  accent: string;
  bg: string;
  surfaceAlt: string;
  border: string;
  text: string;
  nav: string;
  onNav: string;
  family: string;
  base: number;
  radius: number;
  height: number;
  row: number;
  shadow: DesignTokens["shadow"];
  maxWidth: number;
}): DesignTokens {
  return {
    color: {
      primary: t.primary,
      onPrimary: "#FFFFFF",
      accent: t.accent,
      bg: t.bg,
      surface: "#FFFFFF",
      surfaceAlt: t.surfaceAlt,
      border: t.border,
      text: t.text,
      textMuted: "#6B7280",
      nav: t.nav,
      onNav: t.onNav,
      success: "#1E7B4B",
      warning: "#B45309",
      danger: "#C0262D",
      info: "#1D6FB8",
    },
    font: { family: t.family, scale: scale(t.base), weightBold: 700 },
    radius: { sm: Math.max(0, t.radius - 2), md: t.radius, lg: t.radius * 2 },
    control: { height: t.height, rowHeight: t.row },
    spacing: t.base >= 16 ? 8 : 6,
    grid: { columns: 12, maxWidth: t.maxWidth, gutter: 24 },
    shadow: t.shadow,
  };
}

const L = (l: LayoutRules) => l;

const FONT = {
  plex: '"IBM Plex Sans KR", "Malgun Gothic", sans-serif',
  noto: '"Noto Sans KR", "Malgun Gothic", sans-serif',
  gothic: '"Gothic A1", "Malgun Gothic", sans-serif',
  nanum: '"Nanum Gothic", "Malgun Gothic", sans-serif',
};

const CONCEPTS: Record<SystemProfile, DesignConcept[]> = {
  portal: [
    {
      id: "A",
      name: "정부 표준형",
      summary: "상단 메가메뉴, 왼쪽 로고, 표 목록과 번호 페이지네이션. 범정부 UI/UX 가이드라인(KRDS)의 구성 원칙을 따른다.",
      fit: "대국민 공공 포털. 처음 방문한 국민도 익숙한 배치, 웹 접근성 심사 대응이 쉬움",
      tokens: tokens({ primary: "#1B5FC1", accent: "#0B7A75", bg: "#F4F6F9", surfaceAlt: "#EEF2F7", border: "#D5DBE3", text: "#1E2124", nav: "#FFFFFF", onNav: "#1E2124", family: FONT.noto, base: 16, radius: 4, height: 44, row: 52, shadow: "none", maxWidth: 1200 }),
      layout: L({ nav: "top-mega", logo: "left", search: "header", list: "table", pagination: "numbered", button: "square", density: "comfortable", footer: "full" }),
    },
    {
      id: "B",
      name: "검색 중심 카드형",
      summary: "첫 화면 큰 검색창, 카드 목록, 둥근 버튼. 원하는 정보를 바로 찾게 하는 구성",
      fit: "정보 조회가 주 목적인 포털, 모바일 이용 비율이 높은 서비스",
      tokens: tokens({ primary: "#0E7C86", accent: "#E0892B", bg: "#F6F8F8", surfaceAlt: "#EAF3F3", border: "#D3DEDF", text: "#172426", nav: "#FFFFFF", onNav: "#172426", family: FONT.gothic, base: 16, radius: 10, height: 46, row: 56, shadow: "soft", maxWidth: 1180 }),
      layout: L({ nav: "top", logo: "left", search: "hero", list: "card", pagination: "more", button: "pill", density: "comfortable", footer: "simple" }),
    },
    {
      id: "C",
      name: "정보 밀도형",
      summary: "가운데 로고와 두 줄 헤더, 조건 검색 패널, 촘촘한 표와 목록 개수 선택",
      fit: "자료·통계가 많은 정보공개형 포털, 전문 이용자 비율이 높은 서비스",
      tokens: tokens({ primary: "#2F3E75", accent: "#B4481E", bg: "#F5F5F2", surfaceAlt: "#ECEBE5", border: "#D6D4CB", text: "#1D1D1B", nav: "#2F3E75", onNav: "#FFFFFF", family: FONT.plex, base: 15, radius: 2, height: 38, row: 42, shadow: "none", maxWidth: 1280 }),
      layout: L({ nav: "top", logo: "center", search: "panel", list: "table", pagination: "numbered-size", button: "square", density: "compact", footer: "full" }),
    },
  ],
  service: [
    {
      id: "A",
      name: "단계 안내 신청형",
      summary: "신청 단계 표시와 넓은 입력 폼, 상단 메뉴. 처음 신청하는 민원인이 막히지 않게 한 단계씩 안내",
      fit: "민원 신청·자료 등록이 핵심인 서비스",
      tokens: tokens({ primary: "#1E6B52", accent: "#1B5FC1", bg: "#F4F7F5", surfaceAlt: "#E9F1EC", border: "#D1DDD5", text: "#1B2420", nav: "#FFFFFF", onNav: "#1B2420", family: FONT.noto, base: 16, radius: 6, height: 46, row: 54, shadow: "soft", maxWidth: 1080 }),
      layout: L({ nav: "top", logo: "left", search: "header", list: "table", pagination: "numbered", button: "rounded", density: "comfortable", footer: "simple" }),
    },
    {
      id: "B",
      name: "마이페이지 대시보드형",
      summary: "로그인 후 내 신청 현황 카드와 처리 상태를 먼저 보여 주는 구성, 좌측 내 메뉴",
      fit: "신청 후 처리 현황 확인·보완 요청 대응이 잦은 서비스",
      tokens: tokens({ primary: "#3A4FB8", accent: "#12906B", bg: "#F5F6FB", surfaceAlt: "#ECEEF8", border: "#D6DAEC", text: "#1A1D2E", nav: "#FFFFFF", onNav: "#1A1D2E", family: FONT.plex, base: 15, radius: 8, height: 42, row: 50, shadow: "soft", maxWidth: 1200 }),
      layout: L({ nav: "side", logo: "left", search: "panel", list: "card", pagination: "numbered", button: "rounded", density: "comfortable", footer: "simple" }),
    },
    {
      id: "C",
      name: "모바일 우선 간결형",
      summary: "한 화면에 한 가지 일, 큰 버튼과 카드 목록, 더보기 방식",
      fit: "모바일 신청 비율이 높은 서비스",
      tokens: tokens({ primary: "#C2410C", accent: "#1F6FEB", bg: "#FBF8F5", surfaceAlt: "#F4ECE4", border: "#E5D9CC", text: "#221A14", nav: "#FFFFFF", onNav: "#221A14", family: FONT.gothic, base: 17, radius: 12, height: 50, row: 60, shadow: "none", maxWidth: 960 }),
      layout: L({ nav: "top", logo: "center", search: "hero", list: "card", pagination: "more", button: "pill", density: "comfortable", footer: "simple" }),
    },
  ],
  admin: [
    {
      id: "A",
      name: "좌측 메뉴 업무형",
      summary: "어두운 좌측 메뉴, 조건 검색 패널, 촘촘한 표와 목록 개수 선택. 오래 쓰는 업무 화면에 맞춘 구성",
      fit: "심사·관리 업무 담당자가 하루 종일 쓰는 시스템",
      tokens: tokens({ primary: "#2257A8", accent: "#0F8A6C", bg: "#F3F5F8", surfaceAlt: "#EBEEF3", border: "#D4DAE3", text: "#1C232D", nav: "#1F2A3C", onNav: "#E6EBF2", family: FONT.plex, base: 14, radius: 4, height: 34, row: 40, shadow: "none", maxWidth: 1600 }),
      layout: L({ nav: "side", logo: "left", search: "panel", list: "table", pagination: "numbered-size", button: "square", density: "compact", footer: "none" }),
    },
    {
      id: "B",
      name: "상단 메뉴 업무형",
      summary: "상단 메뉴와 탭, 넓은 표 영역. 메뉴가 적고 화면 폭을 넓게 쓰는 구성",
      fit: "메뉴 수가 적은 관리자, 표 열이 많은 심사 화면",
      tokens: tokens({ primary: "#6246C9", accent: "#D05A1B", bg: "#F6F5FA", surfaceAlt: "#EEECF6", border: "#DAD7E8", text: "#1E1B2A", nav: "#FFFFFF", onNav: "#1E1B2A", family: FONT.noto, base: 14, radius: 6, height: 36, row: 44, shadow: "soft", maxWidth: 1600 }),
      layout: L({ nav: "top", logo: "left", search: "panel", list: "table", pagination: "numbered", button: "rounded", density: "compact", footer: "none" }),
    },
    {
      id: "C",
      name: "밝은 사이드바 모던형",
      summary: "밝은 좌측 메뉴, 요약 수치 카드, 여유 있는 표. 대시보드 비중이 큰 구성",
      fit: "현황 모니터링과 처리를 함께 하는 관리자",
      tokens: tokens({ primary: "#0F766E", accent: "#2563EB", bg: "#F7F8F8", surfaceAlt: "#EEF1F1", border: "#DCE1E1", text: "#172020", nav: "#FFFFFF", onNav: "#172020", family: FONT.gothic, base: 14, radius: 8, height: 38, row: 48, shadow: "soft", maxWidth: 1600 }),
      layout: L({ nav: "side", logo: "left", search: "panel", list: "table", pagination: "numbered", button: "rounded", density: "comfortable", footer: "none" }),
    },
  ],
};

export function proposeConcepts(system: System): DesignConcept[] {
  return structuredClone(CONCEPTS[profileOf(system)]);
}
