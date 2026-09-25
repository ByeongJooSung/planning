/**
 * 서비스 계정 저장소 — 회원·세션·프로젝트 멤버·초대·AI 설정.
 * <root>/.service/service.json 한 파일에 두고 메모리에 올려 쓴다(작은 팀용). 쓰기는 임시 파일 → 이름 바꾸기로 원자적으로 한다.
 *
 * 권한 (PRD §4.11)
 *  OWNER  운영자 — 프로젝트를 만든 사람. 멤버 초대·권한 변경·삭제, 프로젝트 AI 설정, 프로젝트 삭제
 *  EDITOR 작업자 — 요구사항·Task·산출물 편집, AI 생성
 *  VIEWER 열람자 — 보기, 디자인 댓글
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { decrypt, deriveKey, encrypt, hashPassword, newId, newToken, sha256, verifyPassword } from "./crypto.js";

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

const Session = z.object({ tokenHash: z.string(), userId: z.string(), createdAt: z.string(), expiresAt: z.string() });
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
  role: z.enum(["EDITOR", "VIEWER", "OWNER"]),
  invitedBy: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type Invite = z.infer<typeof Invite>;

const ServiceData = z.object({
  users: z.array(User).default([]),
  sessions: z.array(Session).default([]),
  members: z.array(Member).default([]),
  invites: z.array(Invite).default([]),
  projectAi: z.record(z.string(), AiStored).default({}),
});
type ServiceData = z.infer<typeof ServiceData>;

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

const SESSION_DAYS = 30;
const INVITE_DAYS = 14;
export const normEmail = (e: string) => e.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface AccountsOptions {
  /** AI 키 암호화 비밀값. 없으면 <root>/.service/secret.key 를 만들어 쓴다 */
  secret?: string;
  /** 서버 기본 AI (환경변수 ANTHROPIC_API_KEY 등) — 프로젝트·개인 설정이 없을 때 */
  serverAi?: Omit<AiResolved, "source"> | null;
  now?: () => Date;
}

export class Accounts {
  private data!: ServiceData;
  private key!: Buffer;
  private writing: Promise<void> = Promise.resolve();
  readonly dir: string;
  private now: () => Date;

  constructor(root: string, private opts: AccountsOptions = {}) {
    this.dir = path.join(root, ".service");
    this.now = opts.now ?? (() => new Date());
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const f = path.join(this.dir, "service.json");
    this.data = ServiceData.parse(existsSync(f) ? JSON.parse(await readFile(f, "utf8")) : {});
    if (this.opts.secret) this.key = deriveKey(this.opts.secret);
    else {
      const kf = path.join(this.dir, "secret.key");
      if (!existsSync(kf)) {
        await writeFile(kf, newToken(), { mode: 0o600 });
        await chmod(kf, 0o600);
      }
      this.key = deriveKey((await readFile(kf, "utf8")).trim());
    }
    this.purge();
  }

  private save(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 1);
    this.writing = this.writing.then(async () => {
      const f = path.join(this.dir, "service.json");
      const tmp = `${f}.${process.pid}.tmp`;
      await writeFile(tmp, snapshot, { mode: 0o600 });
      await rename(tmp, f);
    });
    return this.writing;
  }

  private iso(offsetDays = 0) {
    return new Date(this.now().getTime() + offsetDays * 864e5).toISOString();
  }
  private purge() {
    const now = this.iso();
    this.data.sessions = this.data.sessions.filter((s) => s.expiresAt > now);
    this.data.invites = this.data.invites.filter((i) => i.expiresAt > now);
  }

  // ── 회원 ─────────────────────────────────────
  userCount() {
    return this.data.users.length;
  }
  getUser(id: string) {
    return this.data.users.find((u) => u.id === id);
  }
  findByEmail(email: string) {
    return this.data.users.find((u) => u.email === normEmail(email));
  }
  publicUser(u: User) {
    return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
  }

  async signup(input: { email: string; name: string; password: string }): Promise<User> {
    const email = normEmail(input.email ?? "");
    const name = (input.name ?? "").trim();
    if (!EMAIL.test(email)) throw new HttpError(400, "이메일 형식이 아닙니다");
    if (!name) throw new HttpError(400, "이름을 입력하세요");
    if ((input.password ?? "").length < 8) throw new HttpError(400, "비밀번호는 8자 이상이어야 합니다");
    if (this.findByEmail(email)) throw new HttpError(409, "이미 가입한 이메일입니다");
    const user: User = { id: newId("u"), email, name: name.slice(0, 60), passHash: hashPassword(input.password), createdAt: this.iso() };
    this.data.users.push(user);
    await this.save();
    return user;
  }

  login(email: string, password: string): User {
    const u = this.findByEmail(email ?? "");
    // 없는 계정도 같은 시간이 걸리도록 해시를 한 번 계산한다
    const ok = u ? verifyPassword(password ?? "", u.passHash) : (verifyPassword(password ?? "", hashPassword("x")), false);
    if (!u || !ok) throw new HttpError(401, "이메일 또는 비밀번호가 맞지 않습니다");
    return u;
  }

  async changePassword(userId: string, current: string, next: string) {
    const u = this.getUser(userId)!;
    if (!verifyPassword(current ?? "", u.passHash)) throw new HttpError(400, "현재 비밀번호가 맞지 않습니다");
    if ((next ?? "").length < 8) throw new HttpError(400, "새 비밀번호는 8자 이상이어야 합니다");
    u.passHash = hashPassword(next);
    await this.save();
  }

  // ── 세션 ─────────────────────────────────────
  async createSession(userId: string): Promise<string> {
    const token = newToken();
    this.purge();
    this.data.sessions.push({ tokenHash: sha256(token), userId, createdAt: this.iso(), expiresAt: this.iso(SESSION_DAYS) });
    await this.save();
    return token;
  }
  sessionUser(token: string | undefined): User | undefined {
    if (!token) return undefined;
    const h = sha256(token);
    const s = this.data.sessions.find((x) => x.tokenHash === h && x.expiresAt > this.iso());
    return s ? this.getUser(s.userId) : undefined;
  }
  async endSession(token: string | undefined) {
    if (!token) return;
    const h = sha256(token);
    this.data.sessions = this.data.sessions.filter((s) => s.tokenHash !== h);
    await this.save();
  }

  // ── 프로젝트 멤버 ────────────────────────────
  roleOf(project: string, userId: string): Role | null {
    return this.data.members.find((m) => m.project === project && m.userId === userId)?.role ?? null;
  }
  membership(project: string, userId: string) {
    return this.data.members.find((m) => m.project === project && m.userId === userId);
  }
  projectsOf(userId: string) {
    return this.data.members.filter((m) => m.userId === userId);
  }
  hasOwner(project: string) {
    return this.data.members.some((m) => m.project === project && m.role === "OWNER");
  }
  members(project: string) {
    return this.data.members
      .filter((m) => m.project === project)
      .map((m) => {
        const u = this.getUser(m.userId);
        return { userId: m.userId, name: u?.name ?? "(탈퇴)", email: u?.email ?? "", role: m.role, addedAt: m.addedAt };
      })
      .sort((a, b) => RANK[b.role] - RANK[a.role] || a.addedAt.localeCompare(b.addedAt));
  }
  async addMember(project: string, userId: string, role: Role) {
    const m = this.membership(project, userId);
    if (m) {
      if (RANK[role] > RANK[m.role]) m.role = role;
    } else this.data.members.push({ project, userId, role, addedAt: this.iso(), usePersonalAi: false });
    await this.save();
  }
  async setRole(project: string, userId: string, role: Role) {
    const m = this.membership(project, userId);
    if (!m) throw new HttpError(404, "멤버가 아닙니다");
    if (m.role === "OWNER" && role !== "OWNER" && this.ownerCount(project) === 1) throw new HttpError(400, "운영자가 한 명뿐이라 권한을 낮출 수 없습니다. 다른 멤버를 먼저 운영자로 지정하세요");
    m.role = role;
    await this.save();
  }
  async removeMember(project: string, userId: string) {
    const m = this.membership(project, userId);
    if (!m) throw new HttpError(404, "멤버가 아닙니다");
    if (m.role === "OWNER" && this.ownerCount(project) === 1) throw new HttpError(400, "마지막 운영자는 나갈 수 없습니다");
    this.data.members = this.data.members.filter((x) => x !== m);
    await this.save();
  }
  async setUsePersonalAi(project: string, userId: string, on: boolean) {
    const m = this.membership(project, userId);
    if (!m) throw new HttpError(404, "멤버가 아닙니다");
    m.usePersonalAi = on;
    await this.save();
  }
  private ownerCount(project: string) {
    return this.data.members.filter((m) => m.project === project && m.role === "OWNER").length;
  }
  /** 프로젝트 삭제 시 멤버·초대·AI 설정 정리 */
  async dropProject(project: string) {
    this.data.members = this.data.members.filter((m) => m.project !== project);
    this.data.invites = this.data.invites.filter((i) => i.project !== project);
    delete this.data.projectAi[project];
    await this.save();
  }

  // ── 초대 ─────────────────────────────────────
  /** 초대를 만들고 한 번만 보여 줄 토큰을 돌려준다 (저장은 해시) */
  async invite(project: string, email: string, role: Role, invitedBy: string): Promise<{ invite: Invite; token: string }> {
    const e = normEmail(email ?? "");
    if (!EMAIL.test(e)) throw new HttpError(400, "이메일 형식이 아닙니다");
    if (!ROLES.includes(role)) throw new HttpError(400, "권한 값이 올바르지 않습니다");
    const existing = this.findByEmail(e);
    if (existing && this.roleOf(project, existing.id)) throw new HttpError(409, "이미 이 프로젝트 멤버입니다");
    this.data.invites = this.data.invites.filter((i) => !(i.project === project && i.email === e));
    const token = newToken();
    const invite: Invite = { id: newId("inv"), tokenHash: sha256(token), project, email: e, role, invitedBy, createdAt: this.iso(), expiresAt: this.iso(INVITE_DAYS) };
    this.data.invites.push(invite);
    await this.save();
    return { invite, token };
  }
  invitesOf(project: string) {
    this.purge();
    return this.data.invites.filter((i) => i.project === project).map(publicInvite);
  }
  invitesFor(email: string) {
    this.purge();
    return this.data.invites.filter((i) => i.email === normEmail(email)).map(publicInvite);
  }
  inviteByToken(token: string) {
    const h = sha256(token ?? "");
    return this.data.invites.find((i) => i.tokenHash === h && i.expiresAt > this.iso());
  }
  async cancelInvite(project: string, id: string) {
    const before = this.data.invites.length;
    this.data.invites = this.data.invites.filter((i) => !(i.project === project && i.id === id));
    if (before === this.data.invites.length) throw new HttpError(404, "초대가 없습니다");
    await this.save();
  }
  /** 초대 수락 — 초대받은 이메일로 가입한 사람만 받을 수 있다 */
  async accept(user: User, by: { id?: string; token?: string }): Promise<Invite> {
    this.purge();
    const inv = by.token ? this.inviteByToken(by.token) : this.data.invites.find((i) => i.id === by.id);
    if (!inv) throw new HttpError(404, "초대가 없거나 기한이 지났습니다");
    if (inv.email !== user.email) throw new HttpError(403, `이 초대는 ${maskEmail(inv.email)} 계정용입니다. 그 이메일로 가입하거나 로그인하세요`);
    await this.addMember(inv.project, user.id, inv.role);
    this.data.invites = this.data.invites.filter((i) => i !== inv);
    await this.save();
    return inv;
  }
  async declineInvite(user: User, id: string) {
    const inv = this.data.invites.find((i) => i.id === id && i.email === user.email);
    if (!inv) throw new HttpError(404, "초대가 없습니다");
    this.data.invites = this.data.invites.filter((i) => i !== inv);
    await this.save();
  }

  // ── AI 설정 ──────────────────────────────────
  private toStored(input: AiInput, prev: AiStored | undefined, by: string): AiStored {
    const provider = input.provider;
    if (!AI_PROVIDERS.includes(provider)) throw new HttpError(400, "provider는 anthropic 또는 openai-compatible 입니다");
    const model = (input.model ?? "").trim();
    if (!model) throw new HttpError(400, "모델 이름을 입력하세요");
    let baseUrl = (input.baseUrl ?? "").trim() || undefined;
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
    if (input.apiKey && input.apiKey.trim()) keyEnc = encrypt(this.key, input.apiKey.trim());
    if (provider === "anthropic" && !keyEnc) throw new HttpError(400, "Anthropic API 키가 필요합니다");
    return { provider, model: model.slice(0, 120), baseUrl, keyEnc, updatedAt: this.iso(), updatedBy: by };
  }
  async setUserAi(userId: string, input: AiInput) {
    const u = this.getUser(userId)!;
    u.ai = this.toStored(input, u.ai, userId);
    await this.save();
  }
  async clearUserAi(userId: string) {
    delete this.getUser(userId)!.ai;
    await this.save();
  }
  async setProjectAi(project: string, input: AiInput, by: string) {
    this.data.projectAi[project] = this.toStored(input, this.data.projectAi[project], by);
    await this.save();
  }
  async clearProjectAi(project: string) {
    delete this.data.projectAi[project];
    await this.save();
  }
  /** full=false면 주소도 숨긴다 (프로젝트 설정을 보는 운영자 아닌 멤버) */
  aiPublic(s: AiStored | undefined, full: boolean): AiPublic | null {
    if (!s) return null;
    return { provider: s.provider, model: s.model, ...(full && s.baseUrl ? { baseUrl: s.baseUrl } : {}), hasKey: !!s.keyEnc, updatedAt: s.updatedAt };
  }
  userAi(userId: string) {
    return this.getUser(userId)?.ai;
  }
  projectAi(project: string) {
    return this.data.projectAi[project];
  }
  hasServerAi() {
    return !!this.opts.serverAi;
  }

  /** 이 사람이 이 프로젝트에서 AI를 부를 때 쓸 설정. 우선순위: (개인 설정 사용 선택 시) 개인 → 프로젝트 → 개인 → 서버 기본 */
  resolveAi(project: string | null, userId: string): AiResolved | null {
    const personal = this.userAi(userId);
    const m = project ? this.membership(project, userId) : undefined;
    const proj = project ? this.projectAi(project) : undefined;
    const pick = (s: AiStored, source: AiResolved["source"]): AiResolved => ({
      source,
      provider: s.provider,
      model: s.model,
      baseUrl: s.baseUrl,
      apiKey: s.keyEnc ? decrypt(this.key, s.keyEnc) : undefined,
    });
    if (m?.usePersonalAi && personal) return pick(personal, "personal");
    if (proj) return pick(proj, "project");
    if (personal) return pick(personal, "personal");
    if (this.opts.serverAi) return { source: "server", ...this.opts.serverAi };
    return null;
  }
  /** 어떤 설정이 쓰이는지 (비밀값 없이) */
  aiSource(project: string | null, userId: string): { source: AiResolved["source"]; provider: AiProvider; model: string } | null {
    const personal = this.userAi(userId);
    const m = project ? this.membership(project, userId) : undefined;
    const proj = project ? this.projectAi(project) : undefined;
    if (m?.usePersonalAi && personal) return { source: "personal", provider: personal.provider, model: personal.model };
    if (proj) return { source: "project", provider: proj.provider, model: proj.model };
    if (personal) return { source: "personal", provider: personal.provider, model: personal.model };
    if (this.opts.serverAi) return { source: "server", provider: this.opts.serverAi.provider, model: this.opts.serverAi.model };
    return null;
  }
}

export interface AiInput {
  provider: AiProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  clearKey?: boolean;
}

function publicInvite(i: Invite) {
  return { id: i.id, project: i.project, email: i.email, role: i.role, invitedBy: i.invitedBy, createdAt: i.createdAt, expiresAt: i.expiresAt };
}
export function maskEmail(e: string) {
  const [a, d] = e.split("@");
  return `${(a ?? "").slice(0, 2)}***@${d ?? ""}`;
}
