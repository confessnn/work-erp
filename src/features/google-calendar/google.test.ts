import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";
import { googleEventIdFor, lectureToGoogleEvent } from "./event";

describe("encryptSecret / decryptSecret", () => {
  const k = randomBytes(32).toString("base64");

  it("왕복", () => {
    const enc = encryptSecret("1//refresh-token-값", k);
    expect(enc).not.toContain("refresh");
    expect(decryptSecret(enc, k)).toBe("1//refresh-token-값");
  });

  it("다른 키나 변조된 값은 실패", () => {
    const enc = encryptSecret("abc", k);
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow();
    const parts = enc.split(".");
    parts[3] = Buffer.from("zzz").toString("base64url");
    expect(() => decryptSecret(parts.join("."), k)).toThrow();
  });

  it("매번 다른 암호문", () => {
    expect(encryptSecret("abc", k)).not.toBe(encryptSecret("abc", k));
  });
});

describe("lectureToGoogleEvent", () => {
  const l = {
    id: "lec-1",
    title: "원가계산 특강",
    organization: "OO대학교",
    lecture_date: "2026-11-10",
    start_time: "14:00:00",
    end_time: "17:00:00",
    memo: null,
    gross_amount: 900_000,
    expected_net: 870_300,
    income_type: "business" as const,
    is_paid: false,
  };

  it("시간 있는 일정", () => {
    const e = lectureToGoogleEvent(l, false);
    expect(e.start).toEqual({ dateTime: "2026-11-10T14:00:00", timeZone: "Asia/Seoul" });
    expect(e.end).toEqual({ dateTime: "2026-11-10T17:00:00", timeZone: "Asia/Seoul" });
    expect(e.location).toBe("OO대학교");
    expect(e.extendedProperties.private.erpLectureId).toBe("lec-1");
  });

  it("기본값(showAmounts=false)이면 금액이 전혀 없다", () => {
    const json = JSON.stringify(lectureToGoogleEvent(l, false));
    expect(json).not.toMatch(/900,000|870,300|강의료|수령/);
  });

  it("showAmounts=true 이면 메모에 금액", () => {
    expect(lectureToGoogleEvent(l, true).description).toContain("870,300원");
  });

  it("시간 없으면 종일, 종료 없으면 1시간", () => {
    expect(lectureToGoogleEvent({ ...l, start_time: null, end_time: null }, false)).toMatchObject({
      start: { date: "2026-11-10" },
      end: { date: "2026-11-11" },
    });
    expect(lectureToGoogleEvent({ ...l, end_time: null }, false).end).toEqual({
      dateTime: "2026-11-10T15:00:00",
      timeZone: "Asia/Seoul",
    });
  });
});

describe("googleEventIdFor", () => {
  it("구글 규칙(소문자 a-v, 숫자, 5~1024자)에 맞는 고정 ID", () => {
    const id = googleEventIdFor("3F2504E0-4F89-11D3-9A0C-0305E82C3301");
    expect(id).toBe("erp3f2504e04f8911d39a0c0305e82c3301");
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });
});
