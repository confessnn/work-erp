import { describe, expect, it } from "vitest";
import { isPublicPath } from "./proxy";

describe("로그인 없이 열리는 경로", () => {
  it("연구소 워커가 부르는 API 는 열려 있다", () => {
    // 워커는 맥에서 돌아 로그인 세션이 없다. 막으면 /login 으로 307 되고 워커가 못 닿는다.
    // 확인은 그 경로에서 워커 전용 비밀값으로 한다.
    expect(isPublicPath("/api/lab/summarize")).toBe(true);
  });

  it("연구소 화면은 열려 있지 않다", () => {
    // /api/lab 을 열어도 사람이 보는 /lab 까지 열려선 안 된다
    expect(isPublicPath("/lab")).toBe(false);
    expect(isPublicPath("/lab/board")).toBe(false);
  });

  it("비슷한 이름에 걸려 열리지 않는다", () => {
    expect(isPublicPath("/api/labs")).toBe(false);
    expect(isPublicPath("/api/cronjobs")).toBe(false);
    expect(isPublicPath("/logins")).toBe(false);
  });

  it("기존 공개 경로는 그대로다", () => {
    for (const p of ["/login", "/auth/callback", "/api/cron/bid-sync", "/api/widget/events", "/join/abc", "/sw.js", "/manifest.webmanifest"]) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });

  it("보통 화면은 로그인이 필요하다", () => {
    for (const p of ["/", "/lectures", "/bids", "/settings", "/api/google/callback"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });
});
