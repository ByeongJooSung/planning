/**
 * 샘플 프로젝트 2건 생성 (작업 0-6). 테스트 픽스처로도 쓴다.
 *   PUBINFO — 신규 구축, 공공 민원형 3개 시스템 + 외부 연계, RFP 원본 ID(SFR) 사용
 *             참조자료 2건, 정보공개 요구사항(수동 Task) + 정보공개 청구(자동 Task), 시스템별 디자인 시스템, 와이어프레임
 *   SHOPMY  — 기존 서비스 · 기존 메뉴 수정(MODIFY), 스냅샷 후 메일 변경 요청(CR-001) 반영, 디자인 컨셉 선택 대기
 *
 * 사용: npx tsx scripts/build-examples.ts [출력 루트=examples/projects]
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addDesignComponent, proposeDesign, selectDesign } from "../src/design/ops.js";
import { addKnowledgeFile } from "../src/knowledge/store.js";
import type { Model, StoryboardScreen } from "../src/model/schema.js";
import { addRequirement, addSystem, addTask, autoCreateTasks, excludeRequirement, recordReview } from "../src/project/ops.js";
import { createProject, loadModel, saveModel } from "../src/project/store.js";
import { takeSnapshot } from "../src/version/snapshot.js";
import { flowOfRequirement } from "../src/trace/work.js";

export const FIXED_NOW = new Date("2026-09-25T09:00:00.000Z");
const c = { now: FIXED_NOW };
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "examples", "fixtures");

type Comp = StoryboardScreen["components"][number];
const screen = (screenId: string, systemCode: string, title: string, template: StoryboardScreen["template"], components: Comp[]): StoryboardScreen => ({
  screenId,
  systemCode,
  title,
  template,
  taskIds: [],
  components,
  status: "DRAFT",
});

/** 샘플: 작업자가 검토를 마친 상태 (정보구조도·화면설계서·플로우·디자인 시스템 모두 완료) */
function markAllDone(m: Model, by: string) {
  const at = FIXED_NOW.toISOString();
  const keys = [
    ...m.systems.filter((s) => m.ia.nodes.some((n) => n.systemCode === s.code && n.kind !== "MENU")).map((s) => `ia:${s.code}`),
    ...m.design.systems.filter((d) => d.status === "SELECTED").map((d) => `ds:${d.systemCode}`),
    ...m.storyboard.screens.map((s) => `sb:${s.screenId}`),
    ...m.requirements.filter((r) => flowOfRequirement(m, r.id)).map((r) => `flow:${r.id}`),
  ];
  for (const k of keys) m.rtmRecords.work[k] = { status: "DONE", at, by, note: "" };
}

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
  m.project.links.push(
    { label: "범정부 UI/UX 디자인 시스템(KRDS)", url: "https://www.krds.go.kr", kind: "REFERENCE" },
    { label: "정보공개포털(연계 대상)", url: "https://www.open.go.kr", kind: "REFERENCE", systemCode: "EXT" },
  );

  // 참조자료 → 프로젝트 지식 (SRC-001 제안요청서, SRC-002 회의록)
  await addKnowledgeFile(dir, m, path.join(FIXTURES, "PUBINFO", "제안요청서_요약.md"), { title: "제안요청서(요약)", now: FIXED_NOW });
  await addKnowledgeFile(dir, m, path.join(FIXTURES, "PUBINFO", "착수회의_회의록.txt"), { title: "착수보고 회의록", now: FIXED_NOW });

  m.policies.stateSets.push({
    id: "ST-INFO",
    name: "정보공개 자료 상태",
    values: ["임시저장", "공개신청", "심사중", "승인", "반려", "공개", "공개중지"],
  });

  // SFR-001 회원 — 민원포털 단일 시스템 (수동)
  addRequirement(m, { originalId: "SFR-001", title: "민원인 회원가입 및 로그인", sources: [{ sourceId: "SRC-001", locator: "SFR-001 민원인 회원가입 및 로그인" }] }, c);
  addTask(m, "SFR-001", { systemCode: "CVL", actor: "민원인", action: "회원가입(본인인증)" }, c);
  addTask(m, "SFR-001", { systemCode: "CVL", actor: "민원인", action: "로그인" }, c);

  // SFR-002 대국민 정보공개 — 민원포털 → 심사자 → 대국민 (+ 외부 연계), 상태 전이까지 수동으로 정리
  addRequirement(
    m,
    {
      originalId: "SFR-002",
      title: "대국민 정보공개",
      description: "민원인이 등록한 자료를 심사자가 검토·승인하면 대국민 포털에 공개한다.",
      sources: [
        { sourceId: "SRC-001", locator: "SFR-002 대국민 정보공개" },
        { sourceId: "SRC-002", locator: "문단 3" },
      ],
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

  // SFR-003 심사 이력 — 새 디자인 컴포넌트가 필요한 사례
  addRequirement(m, { originalId: "SFR-003", title: "심사 이력 관리", sources: [{ sourceId: "SRC-001", locator: "SFR-003 심사 이력 관리" }] }, c);
  addTask(m, "SFR-003", { systemCode: "ADM", actor: "심사자", action: "자료별 심사 이력 조회" }, c);

  // SFR-004 모바일 알림 — Task 미분해
  addRequirement(m, { originalId: "SFR-004", title: "처리 결과 모바일 알림", priority: "SHOULD", sources: [{ sourceId: "SRC-001", locator: "SFR-004 처리 결과 모바일 알림" }] }, c);

  // SFR-005 제외
  addRequirement(m, { originalId: "SFR-005", title: "타 기관 자료 일괄 수집", priority: "COULD", sources: [{ sourceId: "SRC-001", locator: "SFR-005 타 기관 자료 일괄 수집" }] }, c);
  excludeRequirement(m, "SFR-005", "2차 사업 범위로 이관(착수보고 회의 결정)", c);

  // SFR-006 정보공개 청구 — 요구사항 등록 시 Task 자동 생성
  addRequirement(
    m,
    {
      originalId: "SFR-006",
      title: "정보공개 청구 신청",
      description: "민원인이 정보공개 청구서를 작성해 신청하면 담당 심사자가 검토 후 공개 여부를 승인 또는 반려로 결정하고, 결과를 문자로 알린다. 공개 결정된 자료는 국가 정보공개 포털로 연계 전송한다.",
      sources: [{ sourceId: "SRC-001", locator: "SFR-006 정보공개 청구 신청" }],
    },
    c,
  );
  autoCreateTasks(m, "SFR-006", c);

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
    node("ADM_INF_REV_010", "ADM", "M-ADM-INF", "심사 목록", "PAGE", ["SFR-002-T02"], true),
    node("ADM_INF_REV_010_P01", "ADM", "ADM_INF_REV_010", "승인·반려 처리", "POPUP", ["SFR-002-T03"], true),
    node("ADM_INF_HIS_010", "ADM", "M-ADM-INF", "심사 이력", "PAGE", ["SFR-003-T01"], true),
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
      { id: "n8", shape: "TERMINATOR", label: "종료", lane: "L-EXT", taskIds: [], change: "NEW" },
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

  // 디자인 시스템: 시스템별 컨셉 3종 제안 → 선택 (회의록 4. 디자인 방향)
  for (const code of ["PUB", "CVL", "ADM"]) proposeDesign(m, code);
  selectDesign(m, "PUB", "A", c);
  selectDesign(m, "CVL", "A", c);
  selectDesign(m, "ADM", "A", c);
  // 심사 이력 화면에 필요한 새 컴포넌트는 디자인 시스템에 먼저 추가한 뒤 사용
  addDesignComponent(
    m,
    "ADM",
    { id: "review-timeline", name: "심사 이력 타임라인", category: "data", description: "일시·처리자·처리 결과·사유를 시간 순으로 표시", variants: [], addedFor: "SFR-003-T01" },
    c,
  );

  const statusSel = { label: "상태", type: "select", options: ["전체", "공개신청", "심사중", "승인", "반려"] };
  m.storyboard.screens.push(
    screen("PUB_INF_LST_010", "PUB", "정보공개 목록", "list", [
      {
        no: 1,
        label: "검색 조건",
        kind: "search-panel",
        planner: "기간 기본값은 최근 1년. 초기화 시 기본값으로 되돌림",
        customer: "기간·공개 구분·검색어로 자료를 좁혀 찾는다",
        options: { values: ["전체", "전체공개", "부분공개"], default: "전체", note: "공개 구분" },
        ui: { component: "search-panel", props: { fields: [{ label: "공개일", type: "date-range" }, { label: "공개 구분", type: "select", options: ["전체", "전체공개", "부분공개"] }, { label: "검색어", type: "text", placeholder: "제목·기관명" }] } },
      },
      {
        no: 2,
        label: "공개 자료 목록",
        kind: "data-table",
        planner: "공개일 최신순. 공개중지 자료는 노출하지 않음. 제목 클릭 시 상세로 이동",
        customer: "공개된 자료를 표로 훑어보고 제목을 눌러 상세를 연다",
        ui: {
          component: "data-table",
          link: "PUB_INF_DTL_010",
          props: {
            total: 128,
            columns: ["번호", "제목", "기관", "공개 구분", "공개일"],
            badgeColumn: 3,
            rows: [
              ["128", "2026년 하반기 지역 도로 정비 계획", "도로과", "전체공개", "2026-09-24"],
              ["127", "공공 체육시설 이용 현황(8월)", "체육진흥과", "전체공개", "2026-09-22"],
              ["126", "민원 처리 결과 통계", "민원봉사과", "부분공개", "2026-09-19"],
              ["125", "하천 수질 측정 결과", "환경과", "전체공개", "2026-09-18"],
            ],
          },
        },
      },
      { no: 3, label: "페이지 번호", kind: "pagination", planner: "한 페이지 10건", customer: "다음 페이지로 이동한다", ui: { component: "pagination", props: { total: 128 } } },
    ]),
    screen("PUB_INF_DTL_010", "PUB", "정보공개 상세", "detail", [
      {
        no: 1,
        label: "자료 정보",
        kind: "detail-table",
        planner: "부분공개 자료는 비공개 사유를 함께 표시",
        customer: "자료의 기관·공개일·공개 구분을 확인한다",
        ui: { component: "detail-table", props: { rows: [["제목", "2026년 하반기 지역 도로 정비 계획"], ["기관", "도로과"], ["공개 구분", "전체공개"], ["공개일", "2026-09-24"], ["내용", "하반기 도로 정비 대상 구간과 일정을 공개합니다."]] } },
      },
      { no: 2, label: "첨부파일", kind: "file-list", planner: "PDF·HWP만 첨부", customer: "첨부 문서를 내려받는다", ui: { component: "file-list", props: { files: ["도로정비계획_2026하반기.pdf (2.1MB)"] } } },
      { no: 3, label: "목록 버튼", kind: "button-group", planner: "이전 검색 조건 유지", customer: "목록으로 돌아간다", ui: { component: "button-group", link: "PUB_INF_LST_010", props: { buttons: [{ label: "목록", variant: "secondary" }] } } },
    ]),
    screen("CVL_INF_REG_010", "CVL", "정보공개 자료 등록", "form", [
      { no: 1, label: "신청 단계", kind: "step-indicator", planner: "3단계 중 1단계", customer: "지금 몇 번째 단계인지 본다", ui: { component: "step-indicator", props: { steps: ["자료 입력", "내용 확인", "신청 완료"], current: 0 } } },
      {
        no: 2,
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
        ui: { component: "text-input", props: { label: "제목", placeholder: "자료 제목을 입력하세요", required: true } },
      },
      {
        no: 3,
        label: "공개 구분",
        kind: "radio-group",
        planner: "부분공개는 개인정보가 포함된 경우에만 선택. 선택 시 비공개 사유 입력란 노출",
        customer: "자료를 어느 범위까지 공개할지 선택한다",
        options: { values: ["전체공개", "부분공개"], default: "전체공개" },
        validation: { required: true, timing: ["ON_SUBMIT"], messages: [] },
        ui: { component: "radio-group", props: { label: "공개 구분", options: ["전체공개", "부분공개"], value: "전체공개", required: true } },
      },
      {
        no: 4,
        label: "내용",
        kind: "textarea",
        planner: "최대 2,000자",
        customer: "자료 내용을 요약해 적는다",
        validation: { required: true, maxLength: 2000, timing: ["ON_SUBMIT"], messages: [{ condition: "미입력", text: "내용을 입력해 주세요." }] },
        ui: { component: "textarea", props: { label: "내용", placeholder: "자료 내용을 입력하세요 (2,000자 이내)", required: true } },
      },
      {
        no: 5,
        label: "첨부파일",
        kind: "file-upload",
        planner: "PDF·HWP·HWPX, 파일당 20MB, 최대 5개",
        customer: "공개할 원문 파일을 올린다",
        validation: { required: false, timing: ["ON_INPUT"], messages: [{ condition: "형식 오류", text: "PDF, HWP, HWPX 파일만 올릴 수 있습니다." }] },
        ui: { component: "file-upload", props: { label: "첨부파일", hint: "PDF·HWP·HWPX, 파일당 20MB, 최대 5개" } },
      },
      {
        no: 6,
        label: "하단 버튼",
        kind: "button-group",
        planner: "공개 신청 시 확인 창 → 신청 완료 후 처리 현황으로 이동",
        customer: "임시저장하거나 공개를 신청한다",
        ui: { component: "button-group", link: "CVL_INF_STS_010", props: { buttons: [{ label: "임시저장", variant: "secondary", action: "toast", message: "임시저장했습니다." }, { label: "공개 신청", variant: "primary", action: "submit", confirm: "입력한 내용으로 공개를 신청할까요?", message: "공개 신청을 접수했습니다." }] } },
      },
    ]),
    screen("CVL_INF_STS_010", "CVL", "처리 현황", "list", [
      { no: 1, label: "상태 탭", kind: "tabs", planner: "전체·심사중·반려·공개 건수 표시", customer: "처리 상태별로 신청 건을 본다", ui: { component: "tabs", props: { items: ["전체 6", "심사중 2", "반려 1", "공개 3"], active: 0 } } },
      {
        no: 2,
        label: "신청 목록",
        kind: "data-table",
        planner: "반려 건은 사유 보기·보완 신청 버튼 노출. 재신청 건은 [재신청] 표시",
        customer: "내 신청 건의 처리 상태를 확인하고 반려 건을 보완한다",
        ui: {
          component: "data-table",
          link: "CVL_INF_REG_010",
          props: {
            total: 6,
            columns: ["신청번호", "제목", "신청일", "상태"],
            badgeColumn: 3,
            rows: [
              ["2026-0931", "하천 수질 측정 결과", "2026-09-20", "공개"],
              ["2026-0927", "마을버스 노선 조정안", "2026-09-17", "반려"],
              ["2026-0915", "공공 체육시설 이용 현황(8월)", "2026-09-10", "심사중"],
            ],
          },
        },
      },
      { no: 3, label: "페이지 번호", kind: "pagination", planner: "한 페이지 10건", customer: "다음 페이지로 이동한다", ui: { component: "pagination", props: { total: 6 } } },
    ]),
    screen("ADM_INF_REV_010", "ADM", "심사 목록", "list", [
      { no: 1, label: "검색 조건", kind: "search-panel", planner: "기본값: 상태=공개신청", customer: "심사할 건을 상태·기간으로 찾는다", options: { values: statusSel.options, default: "공개신청", note: "상태 (공통 상태값 ST-INFO)" }, ui: { component: "search-panel", props: { fields: [{ label: "신청일", type: "date-range" }, statusSel, { label: "검색어", type: "text", placeholder: "제목·신청인" }] } } },
      {
        no: 2,
        label: "심사 대상 목록",
        kind: "data-table",
        planner: "한 화면 최대 50건(회의록). 재신청 건은 [재신청] 표시. 행 클릭 시 승인·반려 처리 팝업",
        customer: "심사자가 신청 건을 훑어보고 처리할 건을 연다",
        options: { values: ["10", "30", "50"], default: "30", note: "목록 개수" },
        ui: {
          component: "data-table",
          link: "ADM_INF_REV_010_P01",
          props: {
            total: 42,
            columns: ["신청번호", "제목", "신청인", "신청일", "상태"],
            badgeColumn: 4,
            rows: [
              ["2026-0934", "구청 청사 에너지 사용량", "김○○", "2026-09-24", "공개신청"],
              ["2026-0933", "[재신청] 마을버스 노선 조정안", "이○○", "2026-09-23", "공개신청"],
              ["2026-0930", "도서관 좌석 이용률", "박○○", "2026-09-21", "심사중"],
              ["2026-0928", "하천 수질 측정 결과", "최○○", "2026-09-20", "승인"],
            ],
          },
        },
      },
      { no: 3, label: "페이지 번호", kind: "pagination", planner: "목록 개수 10/30/50", customer: "다음 페이지로 이동한다", ui: { component: "pagination", props: { total: 42 } } },
    ]),
    screen("ADM_INF_HIS_010", "ADM", "심사 이력", "detail", [
      {
        no: 1,
        label: "심사 이력",
        kind: "review-timeline",
        planner: "최신순. 반려 사유 전문 표시. 디자인 시스템에 새로 추가한 컴포넌트",
        customer: "심사자가 자료가 어떤 과정을 거쳤는지 시간 순으로 확인한다",
        ui: { component: "review-timeline", props: { items: [["2026-09-23 10:02", "이○○", "재신청", ""], ["2026-09-20 16:40", "심사자 정○○", "반려", "개인정보(연락처) 포함 — 가림 처리 후 재신청 바랍니다."], ["2026-09-17 09:15", "이○○", "공개신청", ""]] } },
      },
    ]),
  );

  recordReview(m, "SFR-002-T01", "기획 리드", "착수 검토 회의 확인", c);
  markAllDone(m, "기획 리드");
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
  m.project.links.push({ label: "운영 중인 주문 내역 화면(예시 주소)", url: "https://shop.example.com/my/orders", kind: "SERVICE", systemCode: "USR" });

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
  // 디자인: 컨셉 3종 제안만 받은 상태 (선택 대기) → 와이어프레임은 아직 글로만 작성
  proposeDesign(m, "USR");
  proposeDesign(m, "ADM");
  m.storyboard.screens.push({
    screenId: "USR_MY_ORD_010",
    systemCode: "USR",
    title: "주문 내역",
    template: "list",
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

  // 스냅샷 이후 메일로 받은 변경 요청 CR-001 반영
  const mail = await addKnowledgeFile(dir, m, path.join(FIXTURES, "SHOPMY", "추가요청_주문내역_엑셀.eml"), { title: "추가 요청 메일(2026-09-24)", now: FIXED_NOW });
  m.changes.push({
    id: "CR-001",
    title: "주문 내역 엑셀 다운로드 추가",
    receivedAt: FIXED_NOW.toISOString(),
    sourceIds: [mail.source.id],
    requirementIds: ["REQ-003"],
    status: "APPLYING",
    summary: "",
  });
  const cr = { ...c, crId: "CR-001" };
  addRequirement(m, { title: "주문 내역 엑셀 다운로드", sources: [{ sourceId: mail.source.id, locator: "본문 문단 1" }] }, cr);
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
