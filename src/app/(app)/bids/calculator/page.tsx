import Link from "next/link";
import { guessAwardMode } from "@/features/bid-inbox/calc";
import { BidCalculator } from "@/features/bid-inbox/components/bid-calculator";
import { getBidNotice } from "@/features/bid-inbox/queries";

export default async function BidCalculatorPage({ searchParams }: PageProps<"/bids/calculator">) {
  const { notice: id } = await searchParams;
  const notice = typeof id === "string" ? await getBidNotice(id) : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">원가 입찰가 계산기</h1>
        <Link href="/bids?cat=cost" className="chip text-sm">
          공고 수신함으로
        </Link>
      </div>

      {notice && (
        <div className="card space-y-1">
          <p className="font-medium">{notice.title}</p>
          <p className="text-sm text-muted">
            {[notice.notice_org, notice.contract_method, notice.award_method].filter(Boolean).join(" · ")}
          </p>
        </div>
      )}

      <BidCalculator
        key={notice?.id ?? "blank"}
        draftKey={`bid-calc:${notice?.id ?? "blank"}`}
        mode={guessAwardMode(notice?.award_method ?? null)}
        base={notice?.presumed_price ?? null}
      />
    </>
  );
}
