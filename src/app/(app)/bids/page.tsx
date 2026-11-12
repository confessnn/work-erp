import Link from "next/link";
import { CATEGORIES } from "@/features/bid-inbox/categories";
import { FetchButton } from "@/features/bid-inbox/components/fetch-button";
import { NoticeList } from "@/features/bid-inbox/components/notice-list";
import { getBidSettings, listBidNotices, type BidTab } from "@/features/bid-inbox/queries";
import { getBidViewer, listViewerNotices } from "@/features/bid-viewer/queries";
import { VIEWER_TABS } from "@/features/bid-viewer/tabs";

// '요약 만들기'가 첨부를 받아 AI 요약까지 기다린다
export const maxDuration = 300;

const TABS: { v: BidTab; label: string }[] = [
  { v: "open", label: "마감 전" },
  { v: "interested", label: "관심" },
  { v: "dismissed", label: "제외" },
  { v: "all", label: "전체" },
];

export default async function BidsPage({ searchParams }: PageProps<"/bids">) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.v === sp.tab)?.v ?? "open";

  // 초대받은 공고 열람자(동생): 나라장터 한일ENG 공고만
  const viewer = await getBidViewer();
  if (viewer) return <ViewerBids tab={VIEWER_TABS.find((t) => t.v === sp.tab)?.v ?? "open"} />;

  const category = CATEGORIES.find((c) => c.key === sp.cat)?.key;
  const [notices, settings] = await Promise.all([listBidNotices(tab, category), getBidSettings()]);

  const href = (t: BidTab, c?: string) => `/bids?tab=${t}${c ? `&cat=${c}` : ""}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">공고 수신함</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/bids/calculator" className="chip text-sm">
            입찰가 계산기
          </Link>
          <FetchButton />
        </div>
      </div>

      <p className="text-sm text-muted">
        원가계산 용역과 한일ENG 공사(나라장터·국방부) 공고를 매일 아침 받아 옵니다. 판정은 목록 정보만 본 1차 결과이니, 투찰 전에 공고문을 확인하세요. 원가계산은 지역 제한이 없거나 충북·청주·전국인 공고만 받습니다. 한일ENG의 불가 판정 공고는 전체 탭에서 볼 수 있습니다.
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

      <p className="text-sm text-muted">
        동생에게 한일ENG 공고만 보여 주려면 <Link href="/share-settings#bids" className="underline">공유</Link> 메뉴에서 초대하세요.
      </p>
    </>
  );
}

/** 공고 열람자 화면: 나라장터 한일ENG 공고 (불가 판정 포함), 관심·제외는 본인 표시 */
async function ViewerBids({ tab }: { tab: (typeof VIEWER_TABS)[number]["v"] }) {
  const notices = await listViewerNotices(tab);
  return (
    <>
      <h1 className="page-title">한일ENG 공고 (나라장터)</h1>
      <p className="text-sm text-muted">
        나라장터의 한일ENG(도장·습식·방수·석공사업) 공사 공고를 매일 아침 받아 옵니다. 판정은 목록 정보만 본 1차 결과(충남 천안, 7억 원까지
        기준)이니, 투찰 전에 공고문을 확인하세요. 제목을 누르면 나라장터 공고문이 열립니다.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {VIEWER_TABS.map((t) => (
          <Link key={t.v} href={`/bids?tab=${t.v}`} className={`chip ${tab === t.v ? "chip-on" : ""}`}>
            {t.label}
          </Link>
        ))}
        <span className="ml-auto text-muted">{notices.length}건</span>
      </div>
      <NoticeList notices={notices} viewer />
    </>
  );
}
