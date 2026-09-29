/**
 * 서비스 계정 저장소 — 회원·세션·프로젝트 멤버·초대·AI 설정.
 * 키-값 저장소(Kv) 위에 둔다. 요청마다 저장소에서 새로 읽으므로 서버리스(여러 인스턴스)에서도 맞는 값을 본다.
 *
 * 키 (접두어 acc:)
 *  user:{id} → User · email:{email} → id · users (집합)
 *  sess:{토큰 해시} → 세션 (만료 30일)
 *  members:{프로젝트} (해시 userId → Member) · uproj:{userId} (집합)
 *  inv:{id} → Invite (만료 14일) · invtok:{토큰 해시} → id · pinv:{프로젝트} · einv:{email} (집합)
 *  pai:{프로젝트} → 프로젝트 AI 설정
 *
 * 권한 (PRD §4.11)
 *  OWNER  운영자 — 프로젝트를 만든 사람. 멤버 초대·권한 변경·삭제, 프로젝트 AI 설정, 프로젝트 삭제
 *  EDITOR 작업자 — 요구사항·Task·산출물 편집, AI 생성
 *  VIEWER 열람자 — 보기, 디자인 댓글
 */
import { z } from "zod";
import { decrypt, deriveKey, encrypt, hashPassword, newId, newToken, sha256, verifyPassword } from "./crypto.js";
import type { Kv } from "./kv.js";

export const ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];
const RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };
export const atLeast = (role: Role | null | undefined, need: Role) => !!role && RANK[role] >= RANK[need];

export const AI_PROVIDERS = ["anthropic", "openai-compatible"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

const AiStored = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().min(1),
  /** openai-compatible: 로컬 LLM(Ollama·LM Studio·vLLM) 또는 외부 API 주소. anthropic: 비우면 기본 주소 */
  baseUrl: z.string().optional(),
  keyEnc: z.string().optional(),
  updatedAt: z.string(),
  updatedBy: z.string(),
});
export type AiStored = z.infer<typeof AiStored>;

/** AI 연결 — 주소·키 하나에 저장해 둔 모델 여러 개 (NVIDIA, LM Studio, Ollama, Anthropic …) */
const AiConn = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.enum(AI_PROVIDERS),
  /** 화면에서 고른 종류 (nvidia · lmstudio · ollama · anthropic · custom) */
  preset: z.string().optional(),
  baseUrl: z.string().optional(),
  keyEnc: z.string().optional(),
  models: z.array(z.string()).default([]),
  /** 최대 출력 토큰 (비우면 8192, 서버가 거부하면 빼고 다시 보냄) */
  maxTokens: z.number().int().positive().optional(),
  /** Google Cloud OAuth (Gemini) — 클라이언트 시크릿·리프레시 토큰은 암호화해 저장 */
  oauth: z
    .object({
      clientId: z.string(),
      secretEnc: z.string(),
      projectId: z.string(),
      refreshEnc: z.string().optional(),
      email: z.string().optional(),
      connectedAt: z.string().optional(),
    })
    .optional(),
  updatedAt: z.string(),
  updatedBy: z.string(),
});
export type AiConn = z.infer<typeof AiConn>;
const AiPick = z.object({ conn: z.string(), model: z.string() });
export type AiPick = z.infer<typeof AiPick>;
const AiSet = z.object({ conns: z.array(AiConn).default([]), active: AiPick.optional() });
export type AiSet = z.infer<typeof AiSet>;
/** 예전 단일 설정({provider, model, …})도 연결 하나로 읽는다 */
export function parseAiSet(raw: unknown): AiSet {
  if (!raw || typeof raw !== "object") return { conns: [] };
  if (!("conns" in raw) && "provider" in raw) {
    const v = AiStored.parse(raw);
    const conn: AiConn = { id: "c_legacy", label: v.provider === "anthropic" ? "Anthropic" : "OpenAI 호환", provider: v.provider, baseUrl: v.baseUrl, keyEnc: v.keyEnc, models: [v.model], updatedAt: v.updatedAt, updatedBy: v.updatedBy };
    return { conns: [conn], active: { conn: conn.id, model: v.model } };
  }
  return AiSet.parse(raw);
}

const User = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  passHash: z.string(),
  createdAt: z.string(),
  /** 개인 AI 연결 (parseAiSet 로 읽는다) */
  ai: z.unknown().optional(),
});
export type User = z.infer<typeof User>;

const Member = z.object({
  project: z.string(),
  userId: z.string(),
  role: z.enum(ROLES),
  addedAt: z.string(),
  /** true면 이 프로젝트에서도 프로젝트 AI 설정 대신 내 개인 설정을 쓴다 */
  usePersonalAi: z.boolean().default(false),
  /** 이 프로젝트에서 쓸 연결·모델 (없으면 프로젝트 기본) */
  aiChoice: z.object({ scope: z.enum(["project", "personal"]), conn: z.string(), model: z.string() }).optional(),
});
export type Member = z.infer<typeof Member>;
const Invite = z.object({
  id: z.string(),
  tokenHash: z.string(),
  project: z.string(),
  email: z.string(),
  role: z.enum(ROLES),
  invitedBy: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type Invite = z.infer<typeof Invite>;

/** API로 내보내는 AI 연결. 키는 절대 담지 않는다 */
export interface AiConnPublic {
  id: string;
  label: string;
  provider: AiProvider;
  preset?: string;
  /** 설정 주인(프로젝트 운영자·본인)에게만 보인다 */
  baseUrl?: string;
  hasKey: boolean;
  models: string[];
  maxTokens?: number;
  /** Google OAuth 연결 상태 (클라이언트 ID·프로젝트는 설정 주인에게만, 시크릿·토큰은 절대 내보내지 않는다) */
  oauth?: { hasSecret: boolean; connected: boolean; email?: string; connectedAt?: string; clientId?: string; projectId?: string };
  updatedAt: string;
}
export interface AiSetPublic {
  conns: AiConnPublic[];
  active: AiPick | null;
}
export type AiScope = "project" | "personal";
export type AiChoice = { scope: AiScope } & AiPick;
/** 실제 호출에 쓰는 설정 (서버 안에서만) */
export interface AiResolved {
  source: "project" | "personal" | "server";
  provider: AiProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  maxTokens?: number;
  /** 연결 이름·ID (서버 기본이면 없음) */
  label?: string;
  conn?: string;
  /** Google OAuth 연결 (액세스 토큰은 호출할 때 리프레시 토큰으로 받는다) */
  oauth?: OAuthCreds;
  /** Google 연결을 아직 안 한 연결 — 호출하면 안내 오류 */
  needsOauth?: boolean;
}
export interface OAuthCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  projectId: string;
}
export interface AiConnInput {
  id?: string;
  label: string;
  provider: AiProvider;
  preset?: string;
  baseUrl?: string;
  apiKey?: string;
  clearKey?: boolean;
  models?: string[];
  maxTokens?: number | string | null;
  /** Google Cloud OAuth: 클라이언트 ID·시크릿(비우면 기존 유지)·프로젝트 ID */
  oauth?: { clientId?: string; clientSecret?: string; projectId?: string };
}
/** 모델 목록 불러오기용 — 저장 전 입력값 또는 저장된 연결(키 재사용) */
export interface AiProbe {
  provider: AiProvider;
  baseUrl?: string;
  apiKey?: string;
  oauth?: OAuthCreds;
}

const SESSION_DAYS = 30;
const INVITE_DAYS = 14;
const DAY = 86400;
export const normEmail = (e: string) => String(e ?? "").trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface AccountsOptions {
  /** AI 키 암호화 비밀값 (32바이트 키로 변환) */
  secret: string;
  /** 서비스 관리자 이메일 (없으면 첫 가입자만 관리자) */
  admins?: string[];
  /** 서버 기본 AI (환경변수 ANTHROPIC_API_KEY 등) — 프로젝트·개인 설정이 없을 때 */
  serverAi?: Omit<AiResolved, "source"> | null;
  now?: () => Date;
}

const K = {
  user: (id: string) => `acc:user:${id}`,
  email: (e: string) => `acc:email:${e}`,
  users: "acc:users",
  sess: (h: string) => `acc:sess:${h}`,
  members: (p: string) => `acc:members:${p}`,
  uproj: (u: string) => `acc:uproj:${u}`,
  inv: (id: string) => `acc:inv:${id}`,
  invtok: (h: string) => `acc:invtok:${h}`,
  pinv: (p: string) => `acc:pinv:${p}`,
  einv: (e: string) => `acc:einv:${e}`,
  pai: (p: string) => `acc:pai:${p}`,
};

export class Accounts {
  private key: Buffer;
  private now: () => Date;

  constructor(private kv: Kv, private opts: AccountsOptions) {
    this.key = deriveKey(opts.secret);
    this.now = opts.now ?? (() => new Date());
  }

  private iso(offsetDays = 0) {
    return new Date(this.now().getTime() + offsetDays * 864e5).toISOString();
  }
  private async json<T>(key: string, schema: z.ZodType<T>): Promise<T | undefined> {
    const s = await this.kv.get(key);
    return s ? schema.parse(JSON.parse(s)) : undefined;
  }

  // ── 회원 ─────────────────────────────────────
  async userCount() {
    return (await this.kv.smembers(K.users)).length;
  }
  getUser(id: string) {
    return this.json(K.user(id), User);
  }
  private async putUser(u: User) {
    await this.kv.set(K.user(u.id), JSON.stringify(u));
  }
  async findByEmail(email: string) {
    const id = await this.kv.get(K.email(normEmail(email)));
    return id ? this.getUser(id) : undefined;
  }
  publicUser(u: User) {
    return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
  }

  // ── 서비스 관리자 ────────────────────────────
  /** 서비스 관리자: 첫 가입자, 또는 PLANNING_ADMINS 에 적은 이메일 */
  async isAdmin(u: User): Promise<boolean> {
    if ((this.opts.admins ?? []).map(normEmail).includes(u.email)) return true;
    return (await this.kv.get("acc:first")) === u.id;
  }
  /** 전체 회원과 참여 프로젝트 (관리자 화면) */
  async listUsers() {
    const ids = await this.kv.smembers(K.users);
    const docs = await this.kv.mget(ids.map(K.user));
    const first = await this.kv.get("acc:first");
    const admins = (this.opts.admins ?? []).map(normEmail);
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      if (!docs[i]) continue;
      const u = User.parse(JSON.parse(docs[i]!));
      const projects = [];
      for (const code of await this.projectsOf(u.id)) {
        const m = await this.membership(code, u.id);
        if (m) projects.push({ code, role: m.role });
      }
      out.push({ ...this.publicUser(u), projects, isAdmin: u.id === first || admins.includes(u.email) });
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  /** 회원 삭제 — 혼자 운영자인 프로젝트가 있으면 막는다 (운영자를 먼저 넘기거나 프로젝트를 지워야 함) */
  async deleteUser(userId: string) {
    const u = await this.getUser(userId);
    if (!u) throw new HttpError(404, "없는 회원입니다");
    const codes = await this.projectsOf(userId);
    const sole: string[] = [];
    for (const code of codes) if ((await this.membership(code, userId))?.role === "OWNER" && (await this.ownerCount(code)) === 1) sole.push(code);
    if (sole.length) throw new HttpError(409, `${u.email} 님이 혼자 운영하는 프로젝트가 있어 삭제할 수 없습니다: ${sole.join(", ")}. 다른 멤버를 운영자로 지정하거나 프로젝트를 먼저 삭제하세요`);
    for (const code of codes) await this.kv.hdel(K.members(code), userId);
    // 세션은 회원 문서가 없어지면 더 이상 로그인으로 인정되지 않는다 (sessionUser → 없음)
    await this.kv.del(K.uproj(userId), K.user(userId), K.email(u.email));
    await this.kv.srem(K.users, userId);
    return { email: u.email, projects: codes.length };
  }

  /** 가입. first=true면 이 서버의 첫 가입자다 */
  async signup(input: { email: string; name: string; password: string }): Promise<{ user: User; first: boolean }> {
    const email = normEmail(input.email);
    const name = String(input.name ?? "").trim();
    if (!EMAIL.test(email)) throw new HttpError(400, "이메일 형식이 아닙니다");
    if (!name) throw new HttpError(400, "이름을 입력하세요");
    if (String(input.password ?? "").length < 8) throw new HttpError(400, "비밀번호는 8자 이상이어야 합니다");
    const user: User = { id: newId("u"), email, name: name.slice(0, 60), passHash: hashPassword(input.password), createdAt: this.iso() };
    if (!(await this.kv.set(K.email(email), user.id, { nx: true }))) throw new HttpError(409, "이미 가입한 이메일입니다");
    await this.putUser(user);
    await this.kv.sadd(K.users, user.id);
    const first = await this.kv.set("acc:first", user.id, { nx: true });
    return { user, first };
  }

  async login(email: string, password: string): Promise<User> {
    const u = await this.findByEmail(email ?? "");
    // 없는 계정도 같은 시간이 걸리도록 해시를 한 번 계산한다
    const ok = u ? verifyPassword(password ?? "", u.passHash) : (verifyPassword(password ?? "", hashPassword("x")), false);
    if (!u || !ok) throw new HttpError(401, "이메일 또는 비밀번호가 맞지 않습니다");
    return u;
  }

  async changePassword(userId: string, current: string, next: string) {
    const u = (await this.getUser(userId))!;
    if (!verifyPassword(current ?? "", u.passHash)) throw new HttpError(400, "현재 비밀번호가 맞지 않습니다");
    if (String(next ?? "").length < 8) throw new HttpError(400, "새 비밀번호는 8자 이상이어야 합니다");
    u.passHash = hashPassword(next);
    await this.putUser(u);
  }

  /** 로그인 시도 제한: 15분에 10번 */
  async loginAttempt(key: string) {
    const n = await this.kv.incr(`acc:rl:${sha256(key)}`, 15 * 60);
    if (n > 10) throw new HttpError(429, "로그인 시도가 많습니다. 15분 뒤 다시 시도하세요");
  }

  // ── 세션 ─────────────────────────────────────
  async createSession(userId: string): Promise<string> {
    const token = newToken();
    await this.kv.set(K.sess(sha256(token)), userId, { ttlSec: SESSION_DAYS * DAY });
    return token;
  }
  async sessionUser(token: string | undefined): Promise<User | undefined> {
    if (!token) return undefined;
    const id = await this.kv.get(K.sess(sha256(token)));
    return id ? this.getUser(id) : undefined;
  }
  async endSession(token: string | undefined) {
    if (token) await this.kv.del(K.sess(sha256(token)));
  }

  // ── 프로젝트 멤버 ────────────────────────────
  async membership(project: string, userId: string): Promise<Member | undefined> {
    const all = await this.kv.hgetall(K.members(project));
    return all[userId] ? Member.parse(JSON.parse(all[userId]!)) : undefined;
  }
  async roleOf(project: string, userId: string): Promise<Role | null> {
    return (await this.membership(project, userId))?.role ?? null;
  }
  async projectsOf(userId: string): Promise<string[]> {
    return (await this.kv.smembers(K.uproj(userId))).sort();
  }
  private async memberList(project: string): Promise<Member[]> {
    return Object.values(await this.kv.hgetall(K.members(project))).map((s) => Member.parse(JSON.parse(s)));
  }
  async hasOwner(project: string) {
    return (await this.memberList(project)).some((m) => m.role === "OWNER");
  }
  async members(project: string) {
    const list = await this.memberList(project);
    const users = await Promise.all(list.map((m) => this.getUser(m.userId)));
    return list
      .map((m, i) => ({ userId: m.userId, name: users[i]?.name ?? "(탈퇴)", email: users[i]?.email ?? "", role: m.role, addedAt: m.addedAt }))
      .sort((a, b) => RANK[b.role] - RANK[a.role] || a.addedAt.localeCompare(b.addedAt));
  }
  private async putMember(m: Member) {
    await this.kv.hset(K.members(m.project), m.userId, JSON.stringify(m));
    await this.kv.sadd(K.uproj(m.userId), m.project);
  }
  async addMember(project: string, userId: string, role: Role) {
    const m = await this.membership(project, userId);
    if (m) {
      if (RANK[role] > RANK[m.role]) await this.putMember({ ...m, role });
    } else await this.putMember({ project, userId, role, addedAt: this.iso(), usePersonalAi: false });
  }
  async setRole(project: string, userId: string, role: Role) {
    const m = await this.membership(project, userId);
    if (!m) throw new HttpError(404, "멤버가 아닙니다");
    if (m.role === "OWNER" && role !== "OWNER" && (await this.ownerCount(project)) === 1)
      throw new HttpError(400, "운영자가 한 명뿐이라 권한을 낮출 수 없습니다. 다른 멤버를 먼저 운영자로 지정하세요");
    await this.putMember({ ...m, role });
  }
  async removeMember(project: string, userId: string) {
    const m = await this.membership(project, userId);
    if (!m) throw new HttpError(404, "멤버가 아닙니다");
    if (m.role === "OWNER" && (await this.ownerCount(project)) === 1) throw new HttpError(400, "마지막 운영자는 나갈 수 없습니다");
    await this.kv.hdel(K.members(project), userId);
    await this.kv.srem(K.uproj(userId), project);
  }
  async setUsePersonalAi(project: string, userId: string, on: boolean) {
    const m = await this.membership(project, userId);
    if (!m) throw new HttpError(404, "멤버가 아닙니다");
    await this.putMember({ ...m, usePersonalAi: on });
  }
  private async ownerCount(project: string) {
    return (await this.memberList(project)).filter((m) => m.role === "OWNER").length;
  }
  /** 프로젝트 삭제 시 멤버·초대·AI 설정 정리 */
  async dropProject(project: string) {
    for (const m of await this.memberList(project)) await this.kv.srem(K.uproj(m.userId), project);
    for (const i of await this.invitesRaw(K.pinv(project))) await this.deleteInvite(i);
    await this.kv.del(K.members(project), K.pinv(project), K.pai(project));
  }

  // ── 초대 ─────────────────────────────────────
  private async invitesRaw(setKey: string): Promise<Invite[]> {
    const ids = await this.kv.smembers(setKey);
    const docs = await this.kv.mget(ids.map(K.inv));
    const out: Invite[] = [];
    for (let i = 0; i < ids.length; i++) {
      const d = docs[i];
      if (d) out.push(Invite.parse(JSON.parse(d)));
      else await this.kv.srem(setKey, ids[i]!); // 만료된 초대 정리
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  private async deleteInvite(i: Invite) {
    await this.kv.del(K.inv(i.id), K.invtok(i.tokenHash));
    await this.kv.srem(K.pinv(i.project), i.id);
    await this.kv.srem(K.einv(i.email), i.id);
  }
  /** 초대를 만들고 한 번만 보여 줄 토큰을 돌려준다 (저장은 해시) */
  async invite(project: string, email: string, role: Role, invitedBy: string): Promise<{ invite: Invite; token: string }> {
    const e = normEmail(email);
    if (!EMAIL.test(e)) throw new HttpError(400, "이메일 형식이 아닙니다");
    if (!ROLES.includes(role)) throw new HttpError(400, "권한 값이 올바르지 않습니다");
    const existing = await this.findByEmail(e);
    if (existing && (await this.roleOf(project, existing.id))) throw new HttpError(409, "이미 이 프로젝트 멤버입니다");
    for (const old of await this.invitesRaw(K.pinv(project))) if (old.email === e) await this.deleteInvite(old);
    const token = newToken();
    const invite: Invite = { id: newId("inv"), tokenHash: sha256(token), project, email: e, role, invitedBy, createdAt: this.iso(), expiresAt: this.iso(INVITE_DAYS) };
    const ttl = INVITE_DAYS * DAY;
    await this.kv.set(K.inv(invite.id), JSON.stringify(invite), { ttlSec: ttl });
    await this.kv.set(K.invtok(invite.tokenHash), invite.id, { ttlSec: ttl });
    await this.kv.sadd(K.pinv(project), invite.id);
    await this.kv.sadd(K.einv(e), invite.id);
    return { invite, token };
  }
  async invitesOf(project: string) {
    return (await this.invitesRaw(K.pinv(project))).map(publicInvite);
  }
  async invitesFor(email: string) {
    return (await this.invitesRaw(K.einv(normEmail(email)))).map(publicInvite);
  }
  async inviteByToken(token: string): Promise<Invite | undefined> {
    const id = await this.kv.get(K.invtok(sha256(token ?? "")));
    return id ? this.json(K.inv(id), Invite) : undefined;
  }
  async cancelInvite(project: string, id: string) {
    const inv = await this.json(K.inv(id), Invite);
    if (!inv || inv.project !== project) throw new HttpError(404, "초대가 없습니다");
    await this.deleteInvite(inv);
  }
  /** 초대 수락 — 초대받은 이메일로 가입한 사람만 받을 수 있다 */
  async accept(user: User, by: { id?: string; token?: string }): Promise<Invite> {
    const inv = by.token ? await this.inviteByToken(by.token) : by.id ? await this.json(K.inv(by.id), Invite) : undefined;
    if (!inv) throw new HttpError(404, "초대가 없거나 기한이 지났습니다");
    if (inv.email !== user.email) throw new HttpError(403, `이 초대는 ${maskEmail(inv.email)} 계정용입니다. 그 이메일로 가입하거나 로그인하세요`);
    await this.addMember(inv.project, user.id, inv.role);
    await this.deleteInvite(inv);
    return inv;
  }
  async declineInvite(user: User, id: string) {
    const inv = await this.json(K.inv(id), Invite);
    if (!inv || inv.email !== user.email) throw new HttpError(404, "초대가 없습니다");
    await this.deleteInvite(inv);
  }

  // ── AI 연결 ──────────────────────────────────
  private async userSet(userId: string): Promise<AiSet> {
    return parseAiSet((await this.getUser(userId))?.ai);
  }
  private async projectSet(project: string): Promise<AiSet> {
    const s = await this.kv.get(K.pai(project));
    return parseAiSet(s ? JSON.parse(s) : undefined);
  }
  async aiSet(scope: AiScope, owner: string): Promise<AiSet> {
    return scope === "project" ? this.projectSet(owner) : this.userSet(owner);
  }
  private async putSet(scope: AiScope, owner: string, set: AiSet) {
    if (scope === "project") {
      if (set.conns.length) await this.kv.set(K.pai(owner), JSON.stringify(set));
      else await this.kv.del(K.pai(owner));
    } else {
      const u = (await this.getUser(owner))!;
      u.ai = set.conns.length ? set : undefined;
      await this.putUser(u);
    }
  }
  /** 연결 추가·수정. 키는 새 값이 오면 바꾸고, clearKey면 지우고, 없으면 그대로 둔다 */
  async saveConn(scope: AiScope, owner: string, input: AiConnInput, by: string): Promise<AiConn> {
    const set = await this.aiSet(scope, owner);
    const prev = input.id ? set.conns.find((c) => c.id === input.id) : undefined;
    if (input.id && !prev) throw new HttpError(404, "없는 연결입니다");
    const provider = input.provider;
    if (!AI_PROVIDERS.includes(provider)) throw new HttpError(400, "호출 방법이 올바르지 않습니다");
    const label = String(input.label ?? "").trim().slice(0, 60);
    if (!label) throw new HttpError(400, "연결 이름을 입력하세요");
    const baseUrl = input.preset === GOOGLE_PRESET ? normUrl(input.baseUrl) ?? GEMINI_BASE : normUrl(input.baseUrl);
    // 액세스 토큰이 엉뚱한 주소로 가지 않도록 Google OAuth 연결은 Gemini 주소만 쓴다 (테스트용 예외: 환경변수)
    if (input.preset === GOOGLE_PRESET && new URL(baseUrl!).host !== "generativelanguage.googleapis.com" && !process.env.PLANNING_ALLOW_ANY_OAUTH_BASE) throw new HttpError(400, "Google OAuth 연결의 API 주소는 generativelanguage.googleapis.com 이어야 합니다");
    if (provider === "openai-compatible" && !baseUrl) throw new HttpError(400, "API 주소를 입력하세요 (예: https://integrate.api.nvidia.com/v1)");
    const isG = input.preset === GOOGLE_PRESET;
    if (isG && provider !== "openai-compatible") throw new HttpError(400, "Google OAuth 연결은 Gemini(OpenAI 호환) 방식입니다");
    let oauth: AiConn["oauth"];
    if (isG) {
      const o = input.oauth ?? {};
      const clientId = String(o.clientId ?? prev?.oauth?.clientId ?? "").trim();
      const projectId = String(o.projectId ?? prev?.oauth?.projectId ?? "").trim();
      if (!/^[0-9]+-[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId) && !/^[\w.-]{10,}$/.test(clientId)) throw new HttpError(400, "OAuth 클라이언트 ID를 입력하세요 (…apps.googleusercontent.com)");
      if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new HttpError(400, "Google Cloud 프로젝트 ID를 입력하세요 (예: my-gemini-project-123, 이름이 아니라 ID)");
      const secret = String(o.clientSecret ?? "").trim();
      const secretEnc = secret ? encrypt(this.key, secret) : prev?.oauth?.secretEnc;
      if (!secretEnc) throw new HttpError(400, "OAuth 클라이언트 시크릿을 입력하세요");
      const sameClient = prev?.oauth?.clientId === clientId && !secret;
      // 클라이언트가 바뀌면 이전 토큰은 쓸 수 없으므로 다시 연결하게 한다
      oauth = { clientId, secretEnc, projectId, ...(sameClient && prev?.oauth ? { refreshEnc: prev.oauth.refreshEnc, email: prev.oauth.email, connectedAt: prev.oauth.connectedAt } : {}) };
    }
    let keyEnc = !isG && prev && prev.provider === provider ? prev.keyEnc : undefined;
    if (input.clearKey) keyEnc = undefined;
    if (!isG && input.apiKey && String(input.apiKey).trim()) keyEnc = encrypt(this.key, String(input.apiKey).trim());
    if (provider === "anthropic" && !keyEnc) throw new HttpError(400, "Anthropic은 API 키가 필요합니다");
    const models = [...new Set((input.models ?? []).map((m) => String(m).trim()).filter(Boolean))].slice(0, 50).map((m) => m.slice(0, 200));
    if (!models.length) throw new HttpError(400, "모델을 하나 이상 고르거나 입력하세요");
    const mt = input.maxTokens === null || input.maxTokens === "" || input.maxTokens === undefined ? undefined : Number(input.maxTokens);
    if (mt !== undefined && (!Number.isInteger(mt) || mt < 256 || mt > 200000)) throw new HttpError(400, "최대 출력 토큰은 256~200000 사이 정수입니다");
    const conn: AiConn = { id: prev?.id ?? newId("c"), label, provider, preset: input.preset ? String(input.preset).slice(0, 20) : undefined, baseUrl, keyEnc, models, maxTokens: mt, ...(oauth ? { oauth } : {}), updatedAt: this.iso(), updatedBy: by };
    set.conns = prev ? set.conns.map((c) => (c.id === conn.id ? conn : c)) : [...set.conns, conn];
    if (!set.active || !set.conns.some((c) => c.id === set.active!.conn)) set.active = { conn: conn.id, model: models[0]! };
    else if (set.active.conn === conn.id && !models.includes(set.active.model)) set.active = { conn: conn.id, model: models[0]! };
    await this.putSet(scope, owner, set);
    return conn;
  }
  async deleteConn(scope: AiScope, owner: string, id: string) {
    const set = await this.aiSet(scope, owner);
    if (!set.conns.some((c) => c.id === id)) throw new HttpError(404, "없는 연결입니다");
    set.conns = set.conns.filter((c) => c.id !== id);
    if (set.active?.conn === id) set.active = set.conns[0] ? { conn: set.conns[0].id, model: set.conns[0].models[0]! } : undefined;
    await this.putSet(scope, owner, set);
  }
  /** 기본으로 쓸 연결·모델 */
  async setActive(scope: AiScope, owner: string, pick: AiPick) {
    const set = await this.aiSet(scope, owner);
    const conn = set.conns.find((c) => c.id === pick?.conn);
    if (!conn) throw new HttpError(404, "없는 연결입니다");
    const model = String(pick.model ?? "").trim();
    if (!model) throw new HttpError(400, "모델을 고르세요");
    if (!conn.models.includes(model)) conn.models.push(model);
    set.active = { conn: conn.id, model };
    await this.putSet(scope, owner, set);
  }
  /** 멤버가 이 프로젝트에서 쓸 연결·모델 (null이면 프로젝트 기본) */
  async setChoice(project: string, userId: string, choice: AiChoice | null) {
    const m = await this.membership(project, userId);
    if (!m) throw new HttpError(404, "멤버가 아닙니다");
    if (choice) {
      const set = await this.aiSet(choice.scope, choice.scope === "project" ? project : userId);
      if (!set.conns.some((c) => c.id === choice.conn)) throw new HttpError(404, "없는 연결입니다");
      if (!String(choice.model ?? "").trim()) throw new HttpError(400, "모델을 고르세요");
    }
    await this.putMember({ ...m, aiChoice: choice ? { scope: choice.scope, conn: choice.conn, model: String(choice.model).trim() } : undefined, usePersonalAi: false });
  }
  /** full=false면 주소를 숨긴다 (프로젝트 연결을 보는 운영자 아닌 멤버) */
  aiSetPublic(set: AiSet, full: boolean): AiSetPublic {
    return {
      conns: set.conns.map((c) => ({ id: c.id, label: c.label, provider: c.provider, preset: c.preset, ...(full && c.baseUrl ? { baseUrl: c.baseUrl } : {}), hasKey: !!c.keyEnc, models: c.models, maxTokens: c.maxTokens, ...(c.oauth ? { oauth: { hasSecret: true, connected: !!c.oauth.refreshEnc, email: c.oauth.email, connectedAt: c.oauth.connectedAt, ...(full ? { clientId: c.oauth.clientId, projectId: c.oauth.projectId } : {}) } } : {}), updatedAt: c.updatedAt })),
      active: set.active ?? null,
    };
  }
  /** 모델 목록을 부를 때 쓸 주소·키 — 저장된 연결이면 키를 다시 쓴다 */
  async probeFor(scope: AiScope, owner: string, input: AiProbe & { connId?: string }): Promise<AiProbe> {
    let baseUrl = normUrl(input.baseUrl);
    let apiKey = input.apiKey && String(input.apiKey).trim() ? String(input.apiKey).trim() : undefined;
    let oauth: OAuthCreds | undefined;
    if (input.connId) {
      const conn = (await this.aiSet(scope, owner)).conns.find((c) => c.id === input.connId);
      // OAuth 연결은 저장된 주소로만 부른다 (화면에서 보낸 주소로 액세스 토큰이 가지 않게)
      if (conn?.oauth) baseUrl = conn.baseUrl;
      if (!apiKey && conn?.keyEnc && conn.provider === input.provider) apiKey = decrypt(this.key, conn.keyEnc);
      if (conn?.oauth && !conn.oauth.refreshEnc) throw new HttpError(409, "먼저 ‘Google 계정 연결’을 완료하세요. 연결한 뒤에 모델 목록을 불러올 수 있습니다.");
      if (conn?.oauth?.refreshEnc) oauth = this.oauthOf(conn.oauth);
    }
    if (!AI_PROVIDERS.includes(input.provider)) throw new HttpError(400, "호출 방법이 올바르지 않습니다");
    if (input.provider === "openai-compatible" && !baseUrl) throw new HttpError(400, "API 주소를 입력하세요");
    return { provider: input.provider, baseUrl, apiKey, ...(oauth ? { oauth } : {}) };
  }
  private oauthOf(o: NonNullable<AiConn["oauth"]>): OAuthCreds {
    return { clientId: o.clientId, clientSecret: decrypt(this.key, o.secretEnc), refreshToken: decrypt(this.key, o.refreshEnc!), projectId: o.projectId };
  }
  /** OAuth 시작·콜백용: 클라이언트 정보 (리프레시 토큰 없이) */
  async oauthClient(scope: AiScope, owner: string, connId: string): Promise<{ clientId: string; clientSecret: string; projectId: string; label: string }> {
    const conn = (await this.aiSet(scope, owner)).conns.find((c) => c.id === connId);
    if (!conn?.oauth) throw new HttpError(404, "Google OAuth 연결이 아닙니다");
    return { clientId: conn.oauth.clientId, clientSecret: decrypt(this.key, conn.oauth.secretEnc), projectId: conn.oauth.projectId, label: conn.label };
  }
  /** 로그인을 마친 뒤 리프레시 토큰 저장 */
  async saveOauthToken(scope: AiScope, owner: string, connId: string, token: { refreshToken: string; email?: string }) {
    const set = await this.aiSet(scope, owner);
    const conn = set.conns.find((c) => c.id === connId);
    if (!conn?.oauth) throw new HttpError(404, "Google OAuth 연결이 아닙니다");
    conn.oauth = { ...conn.oauth, refreshEnc: encrypt(this.key, token.refreshToken), email: token.email, connectedAt: this.iso() };
    conn.updatedAt = this.iso();
    await this.putSet(scope, owner, set);
  }
  async disconnectOauth(scope: AiScope, owner: string, connId: string) {
    const set = await this.aiSet(scope, owner);
    const conn = set.conns.find((c) => c.id === connId);
    if (!conn?.oauth) throw new HttpError(404, "Google OAuth 연결이 아닙니다");
    conn.oauth = { clientId: conn.oauth.clientId, secretEnc: conn.oauth.secretEnc, projectId: conn.oauth.projectId };
    await this.putSet(scope, owner, set);
  }
  hasServerAi() {
    return !!this.opts.serverAi;
  }
  async choiceOf(project: string, userId: string): Promise<AiChoice | null> {
    const m = await this.membership(project, userId);
    return m?.aiChoice ?? null;
  }

  /** 우선순위: 멤버가 고른 연결·모델 → (예전) 개인 설정 사용 → 프로젝트 기본 → 개인 기본 → 서버 기본 */
  async resolveAi(project: string | null, userId: string, override?: AiChoice | null): Promise<AiResolved | null> {
    const personal = await this.userSet(userId);
    const m = project ? await this.membership(project, userId) : undefined;
    const proj = project ? await this.projectSet(project) : { conns: [] } as AiSet;
    const use = (set: AiSet, pick: AiPick | undefined, source: "project" | "personal"): AiResolved | null => {
      const c = pick && set.conns.find((x) => x.id === pick.conn);
      if (!c || !pick) return null;
      return { source, provider: c.provider, model: pick.model, baseUrl: c.baseUrl, apiKey: c.keyEnc ? decrypt(this.key, c.keyEnc) : undefined, maxTokens: c.maxTokens, label: c.label, conn: c.id, ...(c.oauth ? (c.oauth.refreshEnc ? { oauth: this.oauthOf(c.oauth) } : { needsOauth: true }) : {}) };
    };
    const choice = override ?? m?.aiChoice;
    if (choice) {
      const r = use(choice.scope === "project" ? proj : personal, choice, choice.scope);
      if (r) return r;
      if (override) throw new HttpError(404, "없는 연결입니다");
    }
    if (m?.usePersonalAi) {
      const r = use(personal, personal.active, "personal");
      if (r) return r;
    }
    return use(proj, proj.active, "project") ?? use(personal, personal.active, "personal") ?? (this.opts.serverAi ? { source: "server", ...this.opts.serverAi, label: "서버 기본" } : null);
  }
  /** 어떤 연결·모델이 쓰이는지 (비밀값 없이) */
  async aiSource(project: string | null, userId: string) {
    const r = await this.resolveAi(project, userId);
    return r ? { source: r.source, provider: r.provider, model: r.model, label: r.label ?? "", conn: r.conn ?? null } : null;
  }
}

export const GOOGLE_PRESET = "gemini-oauth";
export const GEMINI_BASE = process.env.PLANNING_GEMINI_BASE ?? "https://generativelanguage.googleapis.com/v1beta/openai";

function normUrl(raw: unknown): string | undefined {
  const v = String(raw ?? "").trim();
  if (!v) return undefined;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new HttpError(400, "API 주소가 URL 형식이 아닙니다");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new HttpError(400, "API 주소는 http 또는 https 여야 합니다");
  return u.toString().replace(/\/$/, "");
}

function publicInvite(i: Invite) {
  return { id: i.id, project: i.project, email: i.email, role: i.role, invitedBy: i.invitedBy, createdAt: i.createdAt, expiresAt: i.expiresAt };
}
export function maskEmail(e: string) {
  const [a, d] = e.split("@");
  return `${(a ?? "").slice(0, 2)}***@${d ?? ""}`;
}
