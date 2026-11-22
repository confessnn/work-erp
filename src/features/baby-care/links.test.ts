import { describe, expect, it } from "vitest";
import { charsetOf, extractPage, isPrivateAddress, moveItem, normalizeUrl, parseDescribe } from "./links";

describe("normalizeUrl", () => {
  it("https를 붙이고 #뒤를 뗀다", () => {
    expect(normalizeUrl(" www.example.com/a#x ")).toBe("https://www.example.com/a");
    expect(normalizeUrl("http://example.co.kr")).toBe("http://example.co.kr/");
  });
  it("http(s)가 아니거나 이상한 주소는 막는다", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("ftp://example.com")).toBeNull();
    expect(normalizeUrl("localhost:3000")).toBeNull();
    expect(normalizeUrl("https://user:pw@example.com")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });
});

describe("isPrivateAddress", () => {
  it("내부망·내 컴퓨터·메타데이터 주소", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "::ffff:127.0.0.1"])
      expect(isPrivateAddress(ip), ip).toBe(true);
  });
  it("인터넷 주소는 허용", () => {
    for (const ip of ["8.8.8.8", "211.231.99.80", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("extractPage", () => {
  it("og 제목·설명을 먼저, 본문은 스크립트를 빼고", () => {
    const html = `<html><head><title>기본 제목</title><meta property="og:title" content="아기 예방접종 안내 &amp; 일정">
      <meta name="description" content="국가 예방접종 일정"></head><body><script>var x=1</script><h1>예방접종</h1><p>생후 2개월&nbsp;접종</p></body></html>`;
    expect(extractPage(html)).toEqual({ title: "아기 예방접종 안내 & 일정", description: "국가 예방접종 일정", text: "예방접종 생후 2개월 접종" });
  });
  it("og가 없으면 title 태그", () => {
    expect(extractPage("<title> 쇼핑몰 </title><body>x</body>").title).toBe("쇼핑몰");
  });
});

describe("기타", () => {
  it("charsetOf: 헤더 → meta → 기본 utf-8, cp949는 euc-kr로", () => {
    expect(charsetOf("text/html; charset=EUC-KR", "")).toBe("euc-kr");
    expect(charsetOf("text/html", '<meta charset="cp949">')).toBe("euc-kr");
    expect(charsetOf(null, "")).toBe("utf-8");
  });
  it("parseDescribe", () => {
    expect(parseDescribe("제목: 예방접종도우미\n설명: 질병관리청의 예방접종 일정 안내 사이트예요.")).toEqual({
      title: "예방접종도우미",
      description: "질병관리청의 예방접종 일정 안내 사이트예요.",
    });
  });
});

describe("moveItem", () => {
  it("위·아래·맨 위로 옮기고, 범위 밖이면 그대로", () => {
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
  });
});
