import { describe, expect, it } from "vitest";
import { reminderTelegram } from "./reminder";

describe("reminderTelegram", () => {
  it("제목·내용 이스케이프, ERP 링크 버튼", () => {
    expect(reminderTelegram("1시간 뒤 일정", "14:00 원가 <특강> · A&B대학", "/lectures/abc")).toEqual({
      html: "⏰ <b>1시간 뒤 일정</b>\n14:00 원가 &lt;특강&gt; · A&amp;B대학",
      buttons: [{ text: "ERP에서 보기", url: "https://work-erp-one.vercel.app/lectures/abc" }],
    });
  });
  it("ERP 밖 주소는 쓰지 않는다", () => {
    expect(reminderTelegram("t", "b", "//evil.example").buttons[0].url).toBe("https://work-erp-one.vercel.app");
    expect(reminderTelegram("t", "b", "https://evil.example").buttons[0].url).toBe("https://work-erp-one.vercel.app");
  });
});
