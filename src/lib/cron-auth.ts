import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** 길이·내용과 상관없이 같은 시간에 비교 (해시끼리 비교해서 길이 차이도 드러나지 않음) */
export function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Vercel Cron 요청인지: Authorization: Bearer $CRON_SECRET (비밀값이 없거나 32자 미만이면 항상 거절) */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  return sameSecret(header, `Bearer ${secret}`);
}
