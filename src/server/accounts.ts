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

const User = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  passHash: z.string(),
  createdAt: z.string(),
  ai: AiStored.optional(),
});
export type User = z.infer<typeof User>;

const Member = z.object({
  project: z.string(),
  userId: z.string(),
  role: z.enum(ROLES),
  addedAt: z.string(),
  /** true면 이 프로젝트에서도 프로젝트 AI 설정 대신 내 개인 설정을 쓴다 */
  usePersonalAi: z.boolean().default(false),
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

/** API로 내보내는 AI 설정. 키는 절대 담지 않는다 */
export interface AiPublic {
  provider: AiProvider;
  model: string;
  /** 설정 주인(프로젝트 운영자·본인)에게만 보인다 */
  baseUrl?: string;
  hasKey: boolean;
  updatedAt: string;
}
/** 실제 호출에 쓰는 설정 (서버 안에서만) */
export interface AiResolved {
  source: "project" | "personal" | "server";
  provider: AiProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}
export interface AiInput {
  provider: AiProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  clearKey?: boolean;
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

  // ── AI 설정 ──────────────────────────────────
  private toStored(input: AiInput, prev: AiStored | undefined, by: string): AiStored {
    const provider = input.provider;
    if (!AI_PROVIDERS.includes(provider)) throw new HttpError(400, "provider는 anthropic 또는 openai-compatible 입니다");
    const model = String(input.model ?? "").trim();
    if (!model) throw new HttpError(400, "모델 이름을 입력하세요");
    let baseUrl = String(input.baseUrl ?? "").trim() || undefined;
    if (baseUrl) {
      let u: URL;
      try {
        u = new URL(baseUrl);
      } catch {
        throw new HttpError(400, "API 주소가 URL 형식이 아닙니다");
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new HttpError(400, "API 주소는 http 또는 https 여야 합니다");
      baseUrl = u.toString().replace(/\/$/, "");
    }
    if (provider === "openai-compatible" && !baseUrl) throw new HttpError(400, "OpenAI 호환 API는 주소가 필요합니다 (예: http://localhost:11434/v1)");
    // 키: 새 값이 오면 바꾸고, clearKey면 지우고, 아무것도 없으면 이전 값을 그대로 둔다 (같은 provider일 때만)
    let keyEnc = prev && prev.provider === provider ? prev.keyEnc : undefined;
    if (input.clearKey) keyEnc = undefined;
    if (input.apiKey && String(input.apiKey).trim()) keyEnc = encrypt(this.key, String(input.apiKey).trim());
    if (provider === "anthropic" && !keyEnc) throw new HttpError(400, "Anthropic API 키가 필요합니다");
    return { provider, model: model.slice(0, 120), baseUrl, keyEnc, updatedAt: this.iso(), updatedBy: by };
  }
  async setUserAi(userId: string, input: AiInput) {
    const u = (await this.getUser(userId))!;
    u.ai = this.toStored(input, u.ai, userId);
    await this.putUser(u);
  }
  async clearUserAi(userId: string) {
    const u = (await this.getUser(userId))!;
    delete u.ai;
    await this.putUser(u);
  }
  async setProjectAi(project: string, input: AiInput, by: string) {
    await this.kv.set(K.pai(project), JSON.stringify(this.toStored(input, await this.projectAi(project), by)));
  }
  async clearProjectAi(project: string) {
    await this.kv.del(K.pai(project));
  }
  /** full=false면 주소도 숨긴다 (프로젝트 설정을 보는 운영자 아닌 멤버) */
  aiPublic(s: AiStored | undefined, full: boolean): AiPublic | null {
    if (!s) return null;
    return { provider: s.provider, model: s.model, ...(full && s.baseUrl ? { baseUrl: s.baseUrl } : {}), hasKey: !!s.keyEnc, updatedAt: s.updatedAt };
  }
  async userAi(userId: string) {
    return (await this.getUser(userId))?.ai;
  }
  projectAi(project: string) {
    return this.json(K.pai(project), AiStored);
  }
  hasServerAi() {
    return !!this.opts.serverAi;
  }

  /** 우선순위: (개인 설정 사용 선택 시) 개인 → 프로젝트 → 개인 → 서버 기본 */
  private async pick(project: string | null, userId: string): Promise<{ s: AiStored; source: "project" | "personal" } | { s: null; source: "server" } | null> {
    const personal = await this.userAi(userId);
    const m = project ? await this.membership(project, userId) : undefined;
    const proj = project ? await this.projectAi(project) : undefined;
    if (m?.usePersonalAi && personal) return { s: personal, source: "personal" };
    if (proj) return { s: proj, source: "project" };
    if (personal) return { s: personal, source: "personal" };
    if (this.opts.serverAi) return { s: null, source: "server" };
    return null;
  }
  /** 이 사람이 이 프로젝트에서 AI를 부를 때 쓸 설정 (키 복호화 — 서버 안에서만) */
  async resolveAi(project: string | null, userId: string): Promise<AiResolved | null> {
    const p = await this.pick(project, userId);
    if (!p) return null;
    if (!p.s) return { source: "server", ...this.opts.serverAi! };
    return { source: p.source, provider: p.s.provider, model: p.s.model, baseUrl: p.s.baseUrl, apiKey: p.s.keyEnc ? decrypt(this.key, p.s.keyEnc) : undefined };
  }
  /** 어떤 설정이 쓰이는지 (비밀값 없이) */
  async aiSource(project: string | null, userId: string): Promise<{ source: AiResolved["source"]; provider: AiProvider; model: string } | null> {
    const p = await this.pick(project, userId);
    if (!p) return null;
    if (!p.s) return { source: "server", provider: this.opts.serverAi!.provider, model: this.opts.serverAi!.model };
    return { source: p.source, provider: p.s.provider, model: p.s.model };
  }
}

function publicInvite(i: Invite) {
  return { id: i.id, project: i.project, email: i.email, role: i.role, invitedBy: i.invitedBy, createdAt: i.createdAt, expiresAt: i.expiresAt };
}
export function maskEmail(e: string) {
  const [a, d] = e.split("@");
  return `${(a ?? "").slice(0, 2)}***@${d ?? ""}`;
}
