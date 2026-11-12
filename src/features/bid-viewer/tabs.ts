import type { BidNotice } from "@/features/bid-inbox/types";

export type ViewerTab = "open" | "interested" | "dismissed" | "all";

export const VIEWER_TABS: { v: ViewerTab; label: string }[] = [
  { v: "open", label: "마감 전" },
  { v: "interested", label: "관심" },
  { v: "dismissed", label: "제외" },
  { v: "all", label: "전체" },
];

/**
 * 열람자 탭 나누기 (status 는 열람자 본인의 표시).
 * - 마감 전: 제외하지 않았고 아직 마감 전이거나 마감일 모름. 불가 판정도 보여 준다 (동생이 직접 판단)
 * - 관심·제외: 본인이 표시한 것 / 전체: 전부
 * 마감 전 탭은 마감 가까운 순, 나머지는 최근 공고 순.
 */
export function filterViewerTab(notices: BidNotice[], tab: ViewerTab, now: number): BidNotice[] {
  if (tab === "interested" || tab === "dismissed") return notices.filter((n) => n.status === tab);
  if (tab === "all") return notices;
  const open = notices.filter((n) => n.status !== "dismissed" && (!n.closes_at || Date.parse(n.closes_at) >= now));
  const key = (n: BidNotice) => (n.closes_at ? Date.parse(n.closes_at) : Number.MAX_SAFE_INTEGER);
  return open.sort((a, b) => key(a) - key(b));
}
