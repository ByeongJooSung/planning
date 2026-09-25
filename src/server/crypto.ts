/**
 * 비밀번호 해시(scrypt), 세션·초대 토큰, AI 키 암호화(AES-256-GCM).
 * AI 키는 서버 밖으로 나가지 않는다: 저장할 때 암호화하고, API 응답에는 "저장됨" 여부만 담는다.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64");
  const got = scryptSync(password, Buffer.from(salt, "base64"), want.length);
  return timingSafeEqual(want, got);
}

export const newToken = () => randomBytes(32).toString("base64url");
export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** 32바이트 키로 AES-256-GCM 암호화. 결과: v1.iv.tag.data (base64url) */
export function encrypt(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(key: Buffer, sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("암호문 형식이 아닙니다");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

/** 환경변수 비밀값(아무 길이) → 32바이트 키 */
export const deriveKey = (secret: string) => createHash("sha256").update(`planning-studio:${secret}`).digest();
