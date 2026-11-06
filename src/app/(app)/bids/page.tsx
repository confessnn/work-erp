import Link from "next/link";
import { CATEGORIES } from "@/features/bid-inbox/categories";
import { FetchButton } from "@/features/bid-inbox/components/fetch-button";
import { NoticeList } from "@/features/bid-inbox/components/notice-list";
import { getBidSettings, listBidNotices, type BidTab } from "@/features/bid-inbox/queries";

const TABS: { v: BidTab; label: string }[] = [
  { v: "open", label: "마감 전" },
  { v: "interested", label: "관심" },
  { v: "dismissed", label: "제외" },
  { v: "all", label: "전체" },
];

export default async function BidsPage({ searchParams }: PageProps<"/bids">) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.v === sp.tab)?.v ?? "open";
  const category = CATEGORIES.find((c) => c.key === sp.cat)?.key;
  const [notices, settings] = await Promise.all([listBidNotices(tab, category), getBidSettings()]);

  const href = (t: BidTab, c?: string) => `/bids?tab=${t}${c ? `&cat=${c}` : ""}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">공고 수신함</h1>
        <FetchButton />
      </div>

      <p className="text-sm text-muted">
        원가계산 용역과 한일ENG 공사(나라장터·국방부) 공고를 매일 아침 받아 옵니다. 판정은 목록 정보만 본 1차 결과이니, 투찰 전에 공고문을 확인하세요.
        {settings?.last_fetch_result && (
          <>
            <br />
            마지막 수신: {settings.last_fetch_result}
            {settings.last_fetched_at &&
              ` (${new Date(settings.last_fetched_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })})`}
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={href(tab)} className={`chip ${!category ? "chip-on" : ""}`}>
          전체 구분
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c.key} href={href(tab, c.key)} className={`chip ${category === c.key ? "chip-on" : ""}`}>
            {c.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {TABS.map((t) => (
          <Link key={t.v} href={href(t.v, category)} className={`chip ${tab === t.v ? "chip-on" : ""}`}>
            {t.label}
          </Link>
        ))}
        <span className="ml-auto text-muted">{notices.length}건</span>
      </div>

      <NoticeList notices={notices} />
    </>
  );
}
