import { afterEach, describe, expect, it, vi } from "vitest";
import { dayWindows, fetchRegionLimits, toApiDate } from "./g2b-api";

const NOW = new Date("2026-11-10T14:14:00Z"); // 한국 시간 11/10 23:14

describe("dayWindows", () => {
  it("7일을 하루씩, 오래된 날부터 빈틈없이 나눈다", () => {
    const w = dayWindows(NOW, 7);
    expect(w).toHaveLength(7);
    expect(toApiDate(w[0].begin)).toBe("202611032314");
    expect(toApiDate(w[6].end)).toBe("202611102314");
    for (let i = 1; i < w.length; i++) expect(w[i].begin.getTime()).toBe(w[i - 1].end.getTime());
  });
});

describe("fetchRegionLimits", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("하루씩 나눠 조회하고 합친다", async () => {
    process.env.BID_API_KEY = "test-key";
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        const begin = new URL(url).searchParams.get("inqryBgnDt");
        const item = { bidNtceNo: `N${begin}`, bidNtceOrd: "000", prtcptPsblRgnNm: "충청북도" };
        return new Response(JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: [item], totalCount: 1 } } }));
      }),
    );
    const regions = await fetchRegionLimits(NOW);
    expect(urls).toHaveLength(7);
    expect(new Set(urls.map((u) => new URL(u).searchParams.get("inqryBgnDt"))).size).toBe(7);
    expect(regions.size).toBe(7);
  });

  it("실패하면 어느 날 몇 쪽인지 알려 준다", async () => {
    process.env.BID_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ response: { header: { resultCode: "07", resultMsg: "입력범위값 초과 에러" } } }))),
    );
    await expect(fetchRegionLimits(NOW)).rejects.toThrow(/입력범위값 초과 에러 \(지역 조회 \d{4}~\d{4} 1쪽\)/);
  });
});
