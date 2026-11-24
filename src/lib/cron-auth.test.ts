import { afterEach, describe, expect, it } from "vitest";
import { isCronRequest, sameSecret } from "./cron-auth";

const SECRET = "x".repeat(40);
const req = (auth?: string) => new Request("https://erp.example/api/cron/x", { headers: auth ? { authorization: auth } : {} });
const before = process.env.CRON_SECRET;
afterEach(() => {
  process.env.CRON_SECRET = before;
});

describe("cron-auth", () => {
  it("sameSecret: 같을 때만 true (길이가 달라도 오류 없이 false)", () => {
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abc", "abd")).toBe(false);
    expect(sameSecret("abc", "abcdef")).toBe(false);
    expect(sameSecret("", "abc")).toBe(false);
  });

  it("isCronRequest: Bearer 비밀값이 맞을 때만 통과", () => {
    process.env.CRON_SECRET = SECRET;
    expect(isCronRequest(req(`Bearer ${SECRET}`))).toBe(true);
    expect(isCronRequest(req(`Bearer ${SECRET}x`))).toBe(false);
    expect(isCronRequest(req(SECRET))).toBe(false);
    expect(isCronRequest(req())).toBe(false);
  });

  it("isCronRequest: 서버 비밀값이 없거나 짧으면 항상 거절", () => {
    delete process.env.CRON_SECRET;
    expect(isCronRequest(req("Bearer undefined"))).toBe(false);
    process.env.CRON_SECRET = "short";
    expect(isCronRequest(req("Bearer short"))).toBe(false);
  });
});
