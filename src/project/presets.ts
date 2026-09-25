import type { System } from "../model/schema.js";

export type PresetName = "public-civil" | "general" | "none";

/** 시스템 구분 기본 프리셋 (PRD §4.2A F-SYS-01) */
export const SYSTEM_PRESETS: Record<PresetName, System[]> = {
  "public-civil": [
    {
      code: "PUB",
      name: "대국민 포털",
      users: ["일반 국민(비회원 포함)"],
      channels: ["PC_WEB", "MOBILE_WEB"],
      color: "#2563EB",
      hasScreens: true,
      description: "공개 정보 조회, 안내",
    },
    {
      code: "CVL",
      name: "민원포털",
      users: ["민원인(회원)"],
      channels: ["PC_WEB", "MOBILE_WEB"],
      color: "#059669",
      hasScreens: true,
      description: "신청, 자료 등록, 처리 현황 조회",
    },
    {
      code: "ADM",
      name: "심사자·관리자 시스템",
      users: ["심사자", "운영 관리자"],
      channels: ["ADMIN_WEB"],
      color: "#D97706",
      hasScreens: true,
      description: "검토, 승인·반려, 운영 관리",
    },
  ],
  general: [
    {
      code: "USR",
      name: "사용자 서비스",
      users: ["회원", "비회원"],
      channels: ["PC_WEB", "MOBILE_WEB"],
      color: "#2563EB",
      hasScreens: true,
      description: "",
    },
    {
      code: "ADM",
      name: "관리자",
      users: ["운영 관리자"],
      channels: ["ADMIN_WEB"],
      color: "#D97706",
      hasScreens: true,
      description: "",
    },
  ],
  none: [],
};
