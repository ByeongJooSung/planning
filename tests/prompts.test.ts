import { beforeAll, describe, expect, it } from "vitest";
import { buildShopMy, buildPubInfo } from "../scripts/build-examples.js";
import { buildPrompts, type PromptSet } from "../src/ai/prompts.js";
import { loadChunks } from "../src/knowledge/store.js";
import { loadModel } from "../src/project/store.js";
import { tempRoot } from "./helpers.js";

let pub: Record<string, PromptSet>;
let shop: Record<string, PromptSet>;
beforeAll(async () => {
  const root = await tempRoot();
  const d1 = await buildPubInfo(root);
  const d2 = await buildShopMy(root);
  pub = buildPrompts(await loadModel(d1), await loadChunks(d1), { viewerUrl: "https://claude.ai/artifact/abc" });
  shop = buildPrompts(await loadModel(d2), await loadChunks(d2));
});

describe("AI 요청 프롬프트", () => {
  it("화면설계서·프로토타입·정보구조도·디자인 시스템마다 만든다", () => {
    expect(Object.keys(pub)).toEqual(
      expect.arrayContaining(["sb:CVL_INF_REG_010", "sb:ADM_INF_HIS_010", "proto:SFR-002-T01", "proto:SFR-002-T05", "ia:ALL", "ia:PUB", "ds:ADM"]),
    );
    expect(pub["proto:SFR-002-T06"]).toBeUndefined(); // 화면 없는 Task
    expect(pub["ia:EXT"]).toBeUndefined();
  });

  it("화면설계서 Figma 요청: 1920×1080 규격, 줄바꿈 금지, 토큰, 번호별 설명, 유효성, 참조 URL, 근거를 담는다", () => {
    const p = pub["sb:CVL_INF_REG_010"]!;
    expect(p.figma).toContain("1920×1080");
    expect(p.figma).toContain("줄바꿈");
    expect(p.figma).toContain("주 색 #1E6B52");
    expect(p.figma).toContain("2. 제목 — 컴포넌트 `text-input`");
    expect(p.figma).toContain("오류 문구(미입력): “제목을 입력해 주세요.”");
    expect(p.figma).toContain("https://claude.ai/artifact/abc#PUBINFO");
    expect(p.figma).toContain("https://www.krds.go.kr");
    expect(p.figma).not.toContain("https://www.open.go.kr"); // EXT 전용 링크는 CVL 화면에 넣지 않는다
    expect(p.figma).toContain("다음 페이지에 계속"); // 공공기관 제출 양식
    expect(p.evidence).toBeGreaterThan(0);
    expect(p.figma).toMatch(/\[SRC-00\d /);
    expect(p.claude).toContain("\"screenId\": \"CVL_INF_REG_010\"");
    expect(p.claude).toContain("개발자 관점은 빼기");
  });

  it("프로토타입 요청에 화면 간 인터랙션을 적는다", () => {
    const p = pub["proto:SFR-002-T01"]!;
    expect(p.figma).toContain("CVL_INF_REG_010 “공개 신청” 클릭 → 필수 항목 검사");
    expect(p.figma).toContain("확인 시 CVL_INF_STS_010 이동");
    expect(p.figma).toContain("CVL_INF_STS_010 2. 신청 목록 (행·항목) 클릭 → CVL_INF_REG_010");
    expect(p.claude).toContain("transform: scale");
  });

  it("정보구조도 요청은 트리와 요구사항 연결을, 디자인 시스템 요청은 선택 상태에 맞는 내용을 담는다", () => {
    expect(pub["ia:ALL"]!.claude).toContain("- ADM_INF_REV_010_P01 승인·반려 처리 (팝업 · 신규 · 로그인 · Task SFR-002-T03");
    expect(pub["ia:ALL"]!.claude).toContain("SFR-006 정보공개 청구 신청");
    expect(pub["ds:ADM"]!.figma).toContain("`review-timeline` 심사 이력 타임라인");
    expect(shop["ds:USR"]!.figma).toContain("아직 컨셉이 선택되지 않았습니다");
    expect(shop["ds:USR"]!.claude).toContain("planning design select USR");
    expect(shop["sb:USR_MY_ORD_010"]!.figma).toContain("컨셉이 아직 선택되지 않았습니다");
    expect(shop["sb:USR_MY_ORD_010"]!.urls.map((u) => u.url)).toEqual(["https://shop.example.com/my/orders"]);
  });
});
