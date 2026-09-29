/**
 * 정보구조도 표(엑셀) 편집 · 채널(웹·모바일·태블릿) · 화면 기반 테스트 케이스
 *  - 표의 칸 하나를 고치는 setIaCell (기획 진행은 화면설계서 작업 상태로 계산하므로 여기서 받지 않는다)
 *  - 테스트 케이스는 정보구조도 화면에 붙고, 결과는 채널별로 남긴다
 *  - 초안: 화면설계서 설명 번호(입력 검증·메시지·선택지·이동)와 연결 Task로 케이스를 만든다
 */
import { z } from "zod";
import { IaChannel, TestCase, TestResult, TrackStatus, type IANode, type Model, type TestCase as TestCaseT } from "../model/schema.js";

export const TRACK_KEYS = ["design", "publish", "dev"] as const;
const TEXT_FIELDS = ["name", "func", "boardType", "devNeeded", "note", "decision", "changeReason"] as const;

function screenNode(m: Model, id: string): IANode {
  const n = m.ia.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`정보구조도에 없는 항목입니다: ${id}`);
  return n;
}

/** 표의 칸 하나 고치기. field: name·func·boardType·devNeeded·note·decision·changeReason·pages·loginRequired·change·devices·track.design|publish|dev */
export function setIaCell(m: Model, id: string, field: string, value: unknown) {
  const n = screenNode(m, id);
  if ((TEXT_FIELDS as readonly string[]).includes(field)) {
    const v = String(value ?? "").trim();
    if (field === "name") {
      if (!v) throw new Error("이름은 비울 수 없습니다");
      n.name = v;
    } else if (v) (n as Record<string, unknown>)[field] = v;
    else delete (n as Record<string, unknown>)[field];
    return;
  }
  if (field === "pages") {
    if (value === "" || value == null) delete n.pages;
    else {
      const k = Number(value);
      if (!Number.isInteger(k) || k < 0) throw new Error("페이지 본수는 0 이상의 정수입니다");
      n.pages = k;
    }
    return;
  }
  if (field === "loginRequired") {
    n.loginRequired = value === true || value === "true" || value === "Y";
    return;
  }
  if (field === "change") {
    const v = String(value);
    if (!["NEW", "CHANGED", "DELETED", "KEPT"].includes(v)) throw new Error(`변경 구분이 올바르지 않습니다: ${v}`);
    n.change = v as IANode["change"];
    return;
  }
  if (field === "devices") {
    if (n.kind === "MENU") throw new Error("메뉴에는 채널을 지정하지 않습니다");
    const known = new Set(m.ia.channels.map((c) => c.id));
    const list = (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
    const bad = list.filter((x) => !known.has(x));
    if (bad.length) throw new Error(`없는 채널입니다: ${bad.join(", ")}`);
    n.devices = m.ia.channels.map((c) => c.id).filter((c) => list.includes(c));
    if (!n.devices.length) delete n.devices;
    return;
  }
  const t = /^track\.(design|publish|dev)$/.exec(field);
  if (t) {
    const key = t[1] as (typeof TRACK_KEYS)[number];
    const track = { ...(n.track ?? {}) };
    if (value === "" || value == null || value === "NOT_STARTED") delete track[key];
    else track[key] = TrackStatus.parse(value);
    if (Object.keys(track).length) n.track = track;
    else delete n.track;
    return;
  }
  throw new Error(`고칠 수 없는 칸입니다: ${field}`);
}

/** 기기 구분 없이 테스트할 때 결과를 두는 칸 */
export const ALL_DEVICES = "ALL";

/** 이 시스템에서 테스트할 채널 — 빈 배열이면 기기 구분 없음 */
export function systemChannels(m: Model, systemCode: string): string[] {
  const all = m.ia.channels.map((c) => c.id);
  const set = m.ia.systemChannels[systemCode];
  return set ? all.filter((c) => set.includes(c)) : all;
}

/** 시스템별 테스트 기기 정하기. null이면 모든 채널(기본), 빈 배열이면 기기 구분 없이 */
export function setSystemChannels(m: Model, systemCode: string, list: string[] | null) {
  const sys = m.systems.find((s) => s.code === systemCode);
  if (!sys?.hasScreens) throw new Error(`화면이 있는 시스템이 아닙니다: ${systemCode}`);
  if (list === null) {
    delete m.ia.systemChannels[systemCode];
    return;
  }
  const known = new Set(m.ia.channels.map((c) => c.id));
  const bad = list.filter((x) => !known.has(x));
  if (bad.length) throw new Error(`없는 채널입니다: ${bad.join(", ")}`);
  m.ia.systemChannels[systemCode] = m.ia.channels.map((c) => c.id).filter((c) => list.includes(c));
}

/** 채널 목록 바꾸기 — 지운 채널은 화면·테스트 케이스에서도 뗀다 (결과 기록은 남긴다) */
export function setChannels(m: Model, raw: unknown) {
  const list = z.array(IaChannel).min(1, "채널은 하나 이상 있어야 합니다").parse(raw);
  const ids = list.map((c) => c.id);
  if (new Set(ids).size !== ids.length) throw new Error("채널 ID가 겹칩니다");
  const keep = new Set(ids);
  m.ia.channels = list;
  for (const n of m.ia.nodes) {
    if (!n.devices) continue;
    n.devices = n.devices.filter((d) => keep.has(d));
    if (!n.devices.length) delete n.devices;
  }
  for (const t of m.ia.tests) t.devices = t.devices.filter((d) => keep.has(d));
  for (const k of Object.keys(m.ia.systemChannels)) m.ia.systemChannels[k] = m.ia.systemChannels[k]!.filter((d) => keep.has(d));
}

function nextCaseId(m: Model, screenId: string, taken = new Set(m.ia.tests.map((t) => t.id))) {
  for (let i = 1; ; i++) {
    const id = `TC-${screenId}-${String(i).padStart(2, "0")}`;
    if (!taken.has(id)) return id;
  }
}

const CaseInput = TestCase.partial().extend({ screenId: z.string(), title: z.string().trim().min(1, "테스트 항목 이름을 입력하세요") });

/** 테스트 케이스 추가·수정 (id가 없으면 새로). 결과는 qa.result로만 바꾼다 */
export function upsertCase(m: Model, raw: unknown): TestCaseT {
  const inp = CaseInput.parse(raw);
  const node = screenNode(m, inp.screenId);
  if (node.kind === "MENU") throw new Error("테스트는 화면에만 붙일 수 있습니다");
  const known = new Set(m.ia.channels.map((c) => c.id));
  const devices = (inp.devices ?? []).filter((d) => known.has(d));
  const cur = inp.id ? m.ia.tests.find((t) => t.id === inp.id) : undefined;
  if (inp.id && !cur) throw new Error(`없는 테스트 케이스입니다: ${inp.id}`);
  const next = TestCase.parse({
    ...(cur ?? {}),
    ...inp,
    id: cur?.id ?? nextCaseId(m, inp.screenId),
    devices,
    results: cur?.results ?? {},
    source: cur ? (cur.source === "MANUAL" ? "MANUAL" : cur.source) : (inp.source ?? "MANUAL"),
  });
  if (cur) m.ia.tests[m.ia.tests.indexOf(cur)] = next;
  else m.ia.tests.push(next);
  return next;
}

export function removeCase(m: Model, id: string) {
  const i = m.ia.tests.findIndex((t) => t.id === id);
  if (i < 0) throw new Error(`없는 테스트 케이스입니다: ${id}`);
  m.ia.tests.splice(i, 1);
}

/** 채널 하나의 결과 기록. status가 비면 기록을 지운다(미실행) */
export function setResult(m: Model, id: string, device: string, status: string | null, by: string, now: Date, note = "") {
  const t = m.ia.tests.find((x) => x.id === id);
  if (!t) throw new Error(`없는 테스트 케이스입니다: ${id}`);
  if (device !== ALL_DEVICES && !m.ia.channels.some((c) => c.id === device)) throw new Error(`없는 채널입니다: ${device}`);
  if (!status) {
    delete t.results[device];
    return;
  }
  t.results[device] = TestResult.parse({ status, at: now.toISOString(), by, note });
}

/** 케이스가 실제로 돌려야 할 채널 */
export function caseDevices(m: Model, t: TestCaseT): string[] {
  const n = m.ia.nodes.find((x) => x.id === t.screenId);
  const allowed = n ? systemChannels(m, n.systemCode) : m.ia.channels.map((c) => c.id);
  if (!allowed.length) return [ALL_DEVICES];
  const pick = t.devices.length ? t.devices : n?.devices?.length ? n.devices : allowed;
  const out = pick.filter((d) => allowed.includes(d));
  return out.length ? out : allowed;
}

/**
 * 화면설계서·Task로 테스트 케이스 초안 만들기 (규칙 기반). 이미 있는 초안(DRAFT)은 바꾸고, 직접 쓴 케이스는 그대로 둔다.
 * replace=false면 이미 있는 제목은 건너뛴다.
 */
export function draftCases(m: Model, screenId: string): { added: number; removed: number } {
  const node = screenNode(m, screenId);
  if (node.kind === "MENU") throw new Error("테스트는 화면에만 붙일 수 있습니다");
  const sb = m.storyboard.screens.find((s) => s.screenId === screenId);
  const tasks = m.requirements.flatMap((r) => r.tasks.map((t) => ({ r, t }))).filter(({ t }) => node.taskIds.includes(t.id));
  const out: Omit<z.input<typeof TestCase>, "id">[] = [];
  const push = (c: Omit<z.input<typeof TestCase>, "id" | "screenId" | "source">) => out.push({ ...c, screenId, source: "DRAFT" });
  push({ title: `${node.name} 화면 진입`, type: "UI", pre: node.loginRequired ? "로그인한 상태" : "", steps: `${pathOf(m, node).join(" > ")} 메뉴로 이동한다`, expected: "화면이 오류 없이 열리고 화면설계서의 구성 요소가 모두 보인다" });
  if (node.loginRequired) push({ title: "로그인하지 않고 접근", type: "권한", steps: "로그아웃 상태에서 이 화면 주소로 바로 들어간다", expected: "로그인 화면으로 이동하고, 로그인 뒤 이 화면으로 돌아온다" });
  for (const { r, t } of tasks) push({ title: `${t.action}`, type: "기능", taskIds: [t.id], pre: t.actor ? `${t.actor} 권한` : "", steps: `${t.actor ? `[${t.actor}] ` : ""}${t.action}`, expected: `${r.title} 요구사항대로 처리된다 (${r.id})` });
  for (const c of sb?.components ?? []) {
    const v = c.validation;
    if (v?.required) push({ title: `${c.label} 필수 입력 확인`, type: "예외", componentNo: c.no, steps: `‘${c.label}’ 항목을 비운 채 진행한다`, expected: v.messages.find((x) => /미입력|필수|비/.test(x.condition))?.text || "필수 입력 안내 문구가 보이고 진행되지 않는다" });
    if (v?.maxLength) push({ title: `${c.label} 최대 ${v.maxLength}자 제한`, type: "예외", componentNo: c.no, steps: `‘${c.label}’ 항목에 ${v.maxLength + 1}자를 입력한다`, expected: `${v.maxLength}자까지만 입력되거나 안내 문구가 보인다` });
    if (v?.format) push({ title: `${c.label} 형식(${v.format}) 검증`, type: "예외", componentNo: c.no, steps: `‘${c.label}’ 항목에 형식에 맞지 않는 값을 입력한다`, expected: v.messages.find((x) => /형식|올바/.test(x.condition))?.text || "형식 오류 안내 문구가 보인다" });
    for (const msg of v?.messages ?? []) if (!/미입력|필수|형식|올바/.test(msg.condition)) push({ title: `${c.label}: ${msg.condition}`, type: "예외", componentNo: c.no, steps: `${msg.condition} 상황을 만든다`, expected: `“${msg.text}” 문구가 보인다` });
    const opts = c.options?.values ?? [];
    if (opts.length > 1) push({ title: `${c.label} 선택지 확인`, type: "UI", componentNo: c.no, steps: `‘${c.label}’의 선택지를 차례로 고른다`, expected: `선택지 ${opts.join(" · ")}가 보이고${c.options?.default ? ` 기본값은 ${c.options.default}` : ""}, 고른 값에 맞게 결과가 바뀐다` });
    if (c.ui?.link) {
      const to = m.ia.nodes.find((x) => x.id === c.ui!.link);
      push({ title: `${c.label} → ${to ? to.name : c.ui.link} 이동`, type: "기능", componentNo: c.no, steps: `‘${c.label}’ 버튼(링크)을 누른다`, expected: `${c.ui.link}${to ? " " + to.name : ""} 화면으로 이동한다` });
    }
  }
  const before = m.ia.tests.length;
  const manual = m.ia.tests.filter((t) => t.screenId !== screenId || t.source !== "DRAFT");
  const oldDraft = new Map(m.ia.tests.filter((t) => t.screenId === screenId && t.source === "DRAFT").map((t) => [t.title, t]));
  const titles = new Set(manual.filter((t) => t.screenId === screenId).map((t) => t.title));
  m.ia.tests = manual;
  const taken = new Set(m.ia.tests.map((t) => t.id));
  let added = 0;
  for (const c of out) {
    if (titles.has(c.title)) continue;
    titles.add(c.title);
    const prev = oldDraft.get(c.title);
    const id = prev?.id ?? nextCaseId(m, screenId, taken);
    taken.add(id);
    m.ia.tests.push(TestCase.parse({ ...c, id, results: prev?.results ?? {} }));
    if (!prev) added++;
  }
  return { added, removed: Math.max(0, before - m.ia.tests.length + added) };
}

/** AI 결과(케이스 목록)를 한 화면에 넣는다 — 이전 AI 케이스는 바꾸고 직접 쓴 케이스는 둔다 */
export function applyAiCases(m: Model, screenId: string, raw: unknown): number {
  const node = screenNode(m, screenId);
  if (node.kind === "MENU") throw new Error("테스트는 화면에만 붙일 수 있습니다");
  const obj = raw as { cases?: unknown };
  const list = z
    .array(z.object({ title: z.string().min(1), type: z.string().optional(), pre: z.string().optional(), steps: z.string().optional(), expected: z.string().optional(), taskIds: z.array(z.string()).optional(), componentNo: z.number().int().optional(), devices: z.array(z.string()).optional() }))
    .min(1, "케이스가 없습니다")
    .parse(Array.isArray(raw) ? raw : obj?.cases);
  const known = new Set(m.requirements.flatMap((r) => r.tasks.map((t) => t.id)));
  const ch = new Set(m.ia.channels.map((c) => c.id));
  const oldAi = new Map(m.ia.tests.filter((t) => t.screenId === screenId && t.source === "AI").map((t) => [t.title, t]));
  m.ia.tests = m.ia.tests.filter((t) => !(t.screenId === screenId && t.source === "AI"));
  const taken = new Set(m.ia.tests.map((t) => t.id));
  for (const c of list) {
    const prev = oldAi.get(c.title);
    const id = prev?.id ?? nextCaseId(m, screenId, taken);
    taken.add(id);
    m.ia.tests.push(
      TestCase.parse({ ...c, id, screenId, source: "AI", taskIds: (c.taskIds ?? []).filter((x) => known.has(x)), devices: (c.devices ?? []).filter((d) => ch.has(d)), results: prev?.results ?? {} }),
    );
  }
  return list.length;
}

export function pathOf(m: Model, node: IANode): string[] {
  const out: string[] = [];
  let cur: IANode | undefined = node;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur.name);
    cur = cur.parentId ? m.ia.nodes.find((x) => x.id === cur!.parentId) : undefined;
  }
  return out;
}
