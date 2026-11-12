import { describe, expect, it } from "vitest";
import type { BidNotice } from "@/features/bid-inbox/types";
import { filterViewerTab } from "./tabs";

const NOW = Date.parse("2026-11-12T00:00:00Z");
const n = (id: string, over: Partial<BidNotice> = {}) =>
  ({ id, status: "new", verdict: "possible", closes_at: "2026-11-20T00:00:00Z", ...over }) as BidNotice;

describe("filterViewerTab", () => {
  const list = [
    n("later", { closes_at: "2026-11-30T00:00:00Z" }),
    n("soon", { closes_at: "2026-11-13T00:00:00Z" }),
    n("closed", { closes_at: "2026-11-01T00:00:00Z" }),
    n("nodate", { closes_at: null }),
    n("impossible", { verdict: "impossible" }),
    n("liked", { status: "interested" }),
    n("hidden", { status: "dismissed" }),
  ];

  it("마감 전: 마감 지난 것·제외한 것 빼고, 불가 판정은 포함, 마감 가까운 순", () => {
    expect(filterViewerTab([...list], "open", NOW).map((x) => x.id)).toEqual([
      "soon",
      "impossible",
      "liked",
      "later",
      "nodate",
    ]);
  });

  it("관심·제외·전체", () => {
    expect(filterViewerTab(list, "interested", NOW).map((x) => x.id)).toEqual(["liked"]);
    expect(filterViewerTab(list, "dismissed", NOW).map((x) => x.id)).toEqual(["hidden"]);
    expect(filterViewerTab(list, "all", NOW)).toHaveLength(7);
  });
});
