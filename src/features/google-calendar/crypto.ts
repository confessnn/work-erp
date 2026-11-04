import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * 구글 refresh token 을 DB에 넣기 전에 AES-256-GCM 으로 암호화.
 * 키: 환경변수 GOOGLE_TOKEN_KEY (base64, 32바이트). DB만 유출돼서는 토큰을 쓸 수 없다.
 * 형식: v1.<iv>.<tag>.<ciphertext>  (모두 base64url)
 */

function key(raw = process.env.GOOGLE_TOKEN_KEY): Buffer {
  if (!raw) throw new Error("GOOGLE_TOKEN_KEY 가 설정되지 않았습니다.");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("GOOGLE_TOKEN_KEY 는 32바이트(base64)여야 합니다.");
  return k;
}

export function encryptSecret(plain: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(enc: string, rawKey?: string): string {
  const [v, iv, tag, ct] = enc.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("암호문 형식이 올바르지 않습니다.");
  const decipher = createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
