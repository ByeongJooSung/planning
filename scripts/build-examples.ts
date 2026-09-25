/**
 * 샘플 프로젝트 2건 생성 (작업 0-6). 테스트 픽스처로도 쓴다.
 *   PUBINFO — 신규 구축, 공공 민원형 3개 시스템 + 외부 연계, RFP 원본 ID(SFR) 사용, 대국민 정보공개 요구사항
 *   SHOPMY  — 기존 서비스 · 기존 메뉴 수정(MODIFY), 일반 서비스형, 스냅샷 후 변경 요청 1건 반영
 *
 * 사용: npx tsx scripts/build-examples.ts [출력 루트=examples/projects]
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import type { Model } from "../src/model/schema.js";
import { addRequirement, addSystem, addTask, excludeRequirement, recordReview } from "../src/project/ops.js";
import { createProject, loadModel, saveModel } from "../src/project/store.js";
import { takeSnapshot } from "../src/version/snapshot.js";

export const FIXED_NOW = new Date("2026-09-25T09:00:00.000Z");
const c = { now: FIXED_NOW };

export async function buildPubInfo(root: string): Promise<string> {
  const dir = await createProject(
    root,
    {
      code: "PUBINFO",
      name: "정보공개 통합 서비스 구축",
      serviceType: "NEW",
      preset: "public-civil",
      submissionTemplate: "PUBLIC",
      requirementIdMode: "ORIGINAL",
    },
    FIXED_NOW,
  );
  const m = await loadModel(dir);
  addSystem(m, { code: "EXT", name: "외부 연계", users: ["국가 정보공개 포털"], hasScreens: false, color: "#7C3AED" });
  m.project.stages = { S0: "CONFIRMED", S1: "DRAFTED", S2: "DRAFTED", S3: "DRAFTED", S4: "DRAFTED", S5: "NOT_STARTED" };
  m.sources.push({ id: "SRC-001", kind: "FILE", title: "제안요청서(RFP)", location: "sources/rfp.pdf", addedAt: FIXED_NOW.toISOString() });
  m.policies.stateSets.push({
    id: "ST-INFO",
    name: "정보공개 자료 상태",
    values: ["임시저장", "공개신청", "심사중", "승인", "반려", "공개", "공개중지"],
  });

  // SFR-001 회원 — 민원포털 단일 시스템
  addRequirement(m, { originalId: "SFR-001", title: "민원인 회원가입 및 로그인", sources: [{ sourceId: "SRC-001", locator: "p.12" }] }, c);
  addTask(m, "SFR-001", { systemCode: "CVL", actor: "민원인", action: "회원가입(본인인증)" }, c);
  addTask(m, "SFR-001", { systemCode: "CVL", actor: "민원인", action: "로그인" }, c);

  // SFR-002 대국민 정보공개 — 민원포털 → 심사자 → 대국민 (+ 외부 연계)
  addRequirement(
    m,
    {
      originalId: "SFR-002",
      title: "대국민 정보공개",
      description: "민원인이 등록한 자료를 심사자가 검토·승인하면 대국민 포털에 공개한다.",
      sources: [{ sourceId: "SRC-001", locator: "p.14" }],
    },
    c,
  );
  const tr = (from: string | undefined, to: string) => ({ stateSetId: "ST-INFO", from, to });
  addTask(m, "SFR-002", { systemCode: "CVL", actor: "민원인", action: "자료 등록 및 공개 신청", transition: tr("임시저장", "공개신청") }, c);
  addTask(m, "SFR-002", { systemCode: "ADM", actor: "심사자", action: "신청 목록 조회 및 내용 검토", after: ["T01"], transition: tr("공개신청", "심사중") }, c);
  addTask(m, "SFR-002", { systemCode: "ADM", actor: "심사자", action: "승인 또는 반려(사유 입력)", after: ["T02"], transition: tr("심사중", "승인") }, c);
  addTask(m, "SFR-002", { systemCode: "CVL", actor: "민원인", action: "처리 결과 확인, 반려 시 보완 후 재신청", after: ["T03"], transition: tr("반려", "공개신청") }, c);
  addTask(m, "SFR-002", { systemCode: "PUB", actor: "국민", action: "공개 목록·상세 조회", after: ["T03"], transition: tr("승인", "공개") }, c);
  addTask(m, "SFR-002", { systemCode: "EXT", actor: "시스템", action: "국가 정보공개 포털로 공개 자료 전송", after: ["T05"] }, c);

  // SFR-003 심사 이력 — 아직 설계 전
  addRequirement(m, { originalId: "SFR-003", title: "심사 이력 관리", sources: [{ sourceId: "SRC-001", locator: "p.15" }] }, c);
  addTask(m, "SFR-003", { systemCode: "ADM", actor: "심사자", action: "자료별 심사 이력 조회" }, c);

  // SFR-004 모바일 알림 — Task 미분해
  addRequirement(m, { originalId: "SFR-004", title: "처리 결과 모바일 알림", priority: "SHOULD" }, c);

  // SFR-005 제외
  addRequirement(m, { originalId: "SFR-005", title: "타 기관 자료 일괄 수집", priority: "COULD" }, c);
  excludeRequirement(m, "SFR-005", "2차 사업 범위로 이관(착수보고 회의 결정)", c);

  m.plan.sections.push(
    { id: "PS-01", title: "개요", body: "", requirementIds: ["SFR-001", "SFR-002", "SFR-003"], taskIds: [] },
    { id: "PS-05", title: "주요 기능 정의", body: "", requirementIds: [], taskIds: ["SFR-002-T01", "SFR-002-T03"] },
  );
  m.plan.features.push(
    { id: "FN-CVL-001", name: "회원가입·로그인", systemCode: "CVL", description: "", taskIds: ["SFR-001-T01", "SFR-001-T02"], change: "NEW" },
    { id: "FN-CVL-021", name: "정보공개 자료 등록", systemCode: "CVL", description: "", taskIds: ["SFR-002-T01"], change: "NEW" },
    { id: "FN-CVL-022", name: "처리 결과 확인·보완", systemCode: "CVL", description: "", taskIds: ["SFR-002-T04"], change: "NEW" },
    { id: "FN-ADM-033", name: "정보공개 심사", systemCode: "ADM", description: "", taskIds: ["SFR-002-T02", "SFR-002-T03"], change: "NEW" },
    { id: "FN-PUB-010", name: "정보공개 조회", systemCode: "PUB", description: "", taskIds: ["SFR-002-T05"], change: "NEW" },
    { id: "FN-PUB-900", name: "통합 검색", systemCode: "PUB", description: "요구사항 근거 확인 필요", taskIds: [], change: "NEW" },
  );

  const node = (id: string, systemCode: string, parentId: string | null, name: string, kind: "MENU" | "PAGE" | "POPUP", taskIds: string[] = [], loginRequired = false) =>
    ({ id, systemCode, parentId, name, kind, loginRequired, roles: [], taskIds, change: "NEW" as const });
  m.ia.nodes.push(
    node("M-PUB-INF", "PUB", null, "정보공개", "MENU"),
    node("PUB_INF_LST_010", "PUB", "M-PUB-INF", "정보공개 목록", "PAGE", ["SFR-002-T05"]),
    node("PUB_INF_DTL_010", "PUB", "M-PUB-INF", "정보공개 상세", "PAGE", ["SFR-002-T05"]),
    node("PUB_MAIN_HOME_010", "PUB", null, "메인", "PAGE"),
    node("M-CVL-MEM", "CVL", null, "회원", "MENU"),
    node("CVL_MEM_JOIN_010", "CVL", "M-CVL-MEM", "회원가입", "PAGE", ["SFR-001-T01"]),
    node("CVL_MEM_LOGIN_010", "CVL", "M-CVL-MEM", "로그인", "PAGE", ["SFR-001-T02"]),
    node("M-CVL-INF", "CVL", null, "정보공개", "MENU"),
    node("CVL_INF_REG_010", "CVL", "M-CVL-INF", "정보공개 자료 등록", "PAGE", ["SFR-002-T01"], true),
    node("CVL_INF_STS_010", "CVL", "M-CVL-INF", "처리 현황", "PAGE", ["SFR-002-T04"], true),
    node("M-ADM-INF", "ADM", null, "정보공개 심사", "MENU"),
    node("ADM_INF_REV_010", "ADM", "M-ADM-INF", "심사 목록·상세", "PAGE", ["SFR-002-T02"], true),
    node("ADM_INF_REV_010_P01", "ADM", "ADM_INF_REV_010", "승인·반려 처리", "POPUP", ["SFR-002-T03"], true),
  );

  m.flows.push({
    id: "PF-01",
    kind: "PROCESS",
    title: "정보공개 처리 프로세스",
    lanes: [
      { id: "L-CVL", label: "민원포털 · 민원인", systemCode: "CVL" },
      { id: "L-ADM", label: "심사자 시스템 · 심사자", systemCode: "ADM" },
      { id: "L-PUB", label: "대국민 포털", systemCode: "PUB" },
      { id: "L-EXT", label: "외부 연계", systemCode: "EXT" },
    ],
    nodes: [
      { id: "n1", shape: "TERMINATOR", label: "시작", lane: "L-CVL", taskIds: [], change: "NEW" },
      { id: "n2", shape: "PROCESS", label: "자료 등록·공개 신청", lane: "L-CVL", screenId: "CVL_INF_REG_010", taskIds: ["SFR-002-T01"], change: "NEW" },
      { id: "n3", shape: "PROCESS", label: "내용 검토", lane: "L-ADM", screenId: "ADM_INF_REV_010", taskIds: ["SFR-002-T02"], change: "NEW" },
      { id: "n4", shape: "DECISION", label: "승인?", lane: "L-ADM", taskIds: ["SFR-002-T03"], change: "NEW" },
      { id: "n5", shape: "PROCESS", label: "보완 후 재신청", lane: "L-CVL", screenId: "CVL_INF_STS_010", taskIds: ["SFR-002-T04"], change: "NEW" },
      { id: "n6", shape: "PROCESS", label: "대국민 공개", lane: "L-PUB", screenId: "PUB_INF_LST_010", taskIds: ["SFR-002-T05"], change: "NEW" },
      { id: "n7", shape: "IO", label: "정보공개 포털 전송", lane: "L-EXT", taskIds: ["SFR-002-T06"], change: "NEW" },
      { id: "n8", shape: "TERMINATOR", label: "종료", lane: "L-PUB", taskIds: [], change: "NEW" },
    ],
    edges: [
      { from: "n1", to: "n2", label: "" },
      { from: "n2", to: "n3", label: "" },
      { from: "n3", to: "n4", label: "" },
      { from: "n4", to: "n6", label: "승인" },
      { from: "n4", to: "n5", label: "반려" },
      { from: "n5", to: "n3", label: "재신청" },
      { from: "n6", to: "n7", label: "" },
      { from: "n7", to: "n8", label: "" },
    ],
  });

  const sb = (screenId: string, systemCode: string, title: string) => ({ screenId, systemCode, title, taskIds: [], components: [], status: "DRAFT" as const });
  m.storyboard.screens.push(
    {
      ...sb("CVL_INF_REG_010", "CVL", "정보공개 자료 등록"),
      components: [
        {
          no: 1,
          label: "제목",
          kind: "text-input",
          planner: "공개 목록에 그대로 노출되는 제목. 저장 시 앞뒤 공백 제거",
          customer: "등록할 자료의 제목을 입력한다",
          validation: {
            required: true,
            minLength: 2,
            maxLength: 100,
            timing: ["ON_BLUR", "ON_SUBMIT"],
            messages: [
              { condition: "미입력", text: "제목을 입력해 주세요." },
              { condition: "100자 초과", text: "제목은 100자 이내로 입력해 주세요." },
            ],
          },
        },
        {
          no: 2,
          label: "공개 구분",
          kind: "radio",
          planner: "부분공개 선택 시 비공개 사유 입력란 노출",
          customer: "자료를 어느 범위까지 공개할지 선택한다",
          options: { values: ["전체공개", "부분공개"], default: "전체공개" },
          validation: { required: true, timing: ["ON_SUBMIT"], messages: [], },
        },
      ],
    },
    sb("CVL_INF_STS_010", "CVL", "처리 현황"),
    sb("ADM_INF_REV_010", "ADM", "심사 목록·상세"),
    sb("PUB_INF_LST_010", "PUB", "정보공개 목록"),
    sb("PUB_INF_DTL_010", "PUB", "정보공개 상세"),
  );

  recordReview(m, "SFR-002-T01", "기획 리드", "착수 검토 회의 확인", c);
  await saveModel(dir, m, { now: FIXED_NOW });
  return dir;
}

export async function buildShopMy(root: string): Promise<string> {
  const dir = await createProject(
    root,
    { code: "SHOPMY", name: "쇼핑몰 주문 내역 개선", serviceType: "EXISTING", changeScope: "MODIFY", preset: "general" },
    FIXED_NOW,
  );
  const m = await loadModel(dir);
  m.project.stages = { S0: "CONFIRMED", S0A: "CONFIRMED", S1: "CONFIRMED", S2: "SKIPPED", S3: "NOT_STARTED", S4: "DRAFTED", S5: "NOT_STARTED" };

  addRequirement(m, { title: "주문 내역 기간 조회 필터 추가" }, c);
  addTask(m, "REQ-001", { systemCode: "USR", actor: "회원", action: "기간(1개월/3개월/6개월/직접입력)으로 주문 내역 조회" }, c);
  addRequirement(m, { title: "관리자 주문 검색 기간 조건 추가" }, c);
  addTask(m, "REQ-002", { systemCode: "ADM", actor: "운영 관리자", action: "주문 검색에 기간 조건 적용" }, c);

  m.plan.sections.push({ id: "PS-01", title: "개선 개요", body: "", requirementIds: ["REQ-001", "REQ-002"], taskIds: [] });
  // MODIFY: IA는 패스하고 영향받는 기존 화면 ID만 등록
  m.ia.nodes.push(
    { id: "USR_MY_ORD_010", systemCode: "USR", parentId: null, name: "주문 내역", kind: "PAGE", loginRequired: true, roles: [], taskIds: ["REQ-001-T01"], change: "CHANGED", changeReason: "기간 필터 추가" },
    { id: "USR_MY_ORD_020", systemCode: "USR", parentId: null, name: "주문 상세", kind: "PAGE", loginRequired: true, roles: [], taskIds: [], change: "KEPT" },
    { id: "ADM_ORD_SRCH_010", systemCode: "ADM", parentId: null, name: "주문 검색", kind: "PAGE", loginRequired: true, roles: [], taskIds: ["REQ-002-T01"], change: "CHANGED", changeReason: "기간 조건 추가" },
  );
  m.storyboard.screens.push({
    screenId: "USR_MY_ORD_010",
    systemCode: "USR",
    title: "주문 내역",
    taskIds: [],
    status: "DRAFT",
    components: [
      {
        no: 1,
        label: "조회 기간",
        kind: "segmented",
        planner: "기본 1개월. 직접입력은 최대 12개월",
        customer: "원하는 기간을 눌러 주문 내역을 좁혀 본다",
        options: { values: ["1개월", "3개월", "6개월", "직접입력"], default: "1개월" },
      },
    ],
  });
  await saveModel(dir, m, { now: FIXED_NOW });
  await takeSnapshot(dir, m, { note: "착수 기준선", now: FIXED_NOW });

  // 스냅샷 이후 변경 요청 CR-001 반영 (메일 요청)
  m.sources.push({ id: "SRC-001", kind: "EMAIL", title: "추가 요청 메일(2026-09-24)", location: "sources/cr-001.eml", addedAt: FIXED_NOW.toISOString() });
  m.changes.push({
    id: "CR-001",
    title: "주문 내역 엑셀 다운로드 추가",
    receivedAt: FIXED_NOW.toISOString(),
    sourceIds: ["SRC-001"],
    requirementIds: ["REQ-003"],
    status: "APPLYING",
    summary: "",
  });
  const cr = { ...c, crId: "CR-001" };
  addRequirement(m, { title: "주문 내역 엑셀 다운로드", sources: [{ sourceId: "SRC-001", locator: "본문 1문단" }] }, cr);
  addTask(m, "REQ-003", { systemCode: "USR", actor: "회원", action: "조회 결과를 엑셀로 다운로드" }, cr);
  m.ia.nodes[0]!.taskIds.push("REQ-003-T01");
  await saveModel(dir, m, { now: FIXED_NOW });
  return dir;
}

export async function buildExamples(root: string): Promise<Model[]> {
  await rm(path.join(root, "PUBINFO"), { recursive: true, force: true });
  await rm(path.join(root, "SHOPMY"), { recursive: true, force: true });
  const dirs = [await buildPubInfo(root), await buildShopMy(root)];
  return Promise.all(dirs.map(loadModel));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? "examples/projects";
  await buildExamples(root);
  console.log(`샘플 프로젝트를 만들었습니다: ${root}/PUBINFO, ${root}/SHOPMY`);
}
