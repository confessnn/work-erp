import type { Metadata } from "next";
import Link from "next/link";
import { PLAN_LABEL, RESULT_LABEL, summarize, type Submission } from "@/features/bid-inbox/submissions";
import { won } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "투찰 기록 · work-erp" };

type Row = Submission & { bid_notices: { title: string; notice_org: string | null; award_method: string | null } | null };

/** 내가 낸 투찰과 결과 모음. 1등과의 차이를 보고 다음 3안을 고친다 */
export default async function BidRecordsPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("bid_submissions")
    .select("*, bid_notices(title, notice_org, award_method)")
    .order("submitted_on", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Row[];
  const sum = summarize(rows);
  const byPlan = (["attack", "balanced", "safe", "manual"] as const).map((p) => ({ p, ...summarize(rows.filter((r) => r.plan === p)) }));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">투찰 기록</h1>
        <Link href="/bids?cat=cost" className="chip text-sm">
          공고 수신함으로
        </Link>
      </div>

      <section className="card grid gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted">기록</p>
          <p className="text-xl font-bold tabular-nums">{sum.total}건</p>
        </div>
        <div>
          <p className="text-xs text-muted">낙찰</p>
          <p className="text-xl font-bold tabular-nums">{sum.won}건</p>
        </div>
        <div>
          <p className="text-xs text-muted">낙찰 비율 (결과 난 것 중)</p>
          <p className="text-xl font-bold tabular-nums">{sum.winRate !== null ? `${sum.winRate.toFixed(0)}%` : "-"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">1등과 평균 차이 (우리 − 1등)</p>
          <p className="text-xl font-bold tabular-nums">{sum.avgGap !== null ? `${sum.avgGap >= 0 ? "+" : ""}${sum.avgGap.toFixed(3)}%p` : "-"}</p>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="card space-y-2 text-sm">
          <h2 className="section-title">안별 결과</h2>
          <div className="grid gap-2 sm:grid-cols-4">
            {byPlan.map((b) => (
              <div key={b.p} className="rounded-lg border border-line p-2">
                <p className="font-semibold">{PLAN_LABEL[b.p]}안</p>
                <p className="text-muted tabular-nums">
                  {b.total}건 · 낙찰 {b.won} · 차이 {b.avgGap !== null ? `${b.avgGap.toFixed(3)}%p` : "-"}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">차이가 +면 1등보다 높게 낸 것(가격에서 밀림), −면 낮게 낸 것이에요. 협상 계약은 가격 순위만 참고하세요.</p>
        </section>
      )}

      <section className="card">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">아직 기록이 없습니다. 입찰가 계산기 아래 &lsquo;내 투찰 기록&rsquo;에서 낸 금액을 남겨 주세요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 pr-2">투찰일</th>
                  <th className="py-1 pr-2">공고</th>
                  <th className="py-1 pr-2">안</th>
                  <th className="py-1 pr-2 text-right">금액</th>
                  <th className="py-1 pr-2 text-right">순위</th>
                  <th className="py-1 pr-2 text-right">우리 / 1등</th>
                  <th className="py-1">결과</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap tabular-nums">{r.submitted_on}</td>
                    <td className="py-1.5 pr-2">
                      <Link href={`/bids/calculator?notice=${r.notice_id}`} className="underline">
                        {r.bid_notices?.title ?? "(지워진 공고)"}
                      </Link>
                      <span className="text-muted"> · {r.bid_notices?.notice_org ?? ""}</span>
                    </td>
                    <td className="py-1.5 pr-2">{PLAN_LABEL[r.plan]}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{won(Number(r.amount))}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{r.rank ? `${r.rank}/${r.participants}` : "-"}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {r.open_rate !== null ? Number(r.open_rate).toFixed(3) : "-"} / {r.winner_rate !== null ? Number(r.winner_rate).toFixed(3) : "-"}
                    </td>
                    <td className="py-1.5">{RESULT_LABEL[r.result]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
