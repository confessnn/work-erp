// 개찰 결과 자동 확인 (5분 크론에서 몇 건씩). 찾으면 투찰 기록을 채우고 텔레그램으로 알린다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeTg, sendMessage } from "@/features/telegram/api";
import { fetchOpening } from "./award-history";
import { guessAwardMode } from "./calc";
import { matchOpening, PLAN_LABEL, type SubmissionPlan } from "./submissions";

const ERP_URL = "https://work-erp-one.vercel.app";

export type DueOpening = {
  id: string;
  user_id: string;
  bid_no: string;
  bid_ord: string;
  award_method: string | null;
  title: string;
  notice_org: string | null;
  my_bizno: string;
  amount: number;
  plan: SubmissionPlan;
  token: string | null;
  chat_id: number | null;
};

type Match = NonNullable<ReturnType<typeof matchOpening>>;

/** 텔레그램 알림 한 건 (HTML) */
export function openingTelegram(d: Pick<DueOpening, "title" | "notice_org" | "plan">, m: Match) {
  const head = m.result === "won" ? "🎉 <b>낙찰!</b>" : m.result === "lost" ? "📭 <b>개찰 결과: 탈락</b>" : "📬 <b>개찰 결과 (협상: 가격 순위)</b>";
  const lines = [head, `${escapeTg(d.title)}${d.notice_org ? ` · ${escapeTg(d.notice_org)}` : ""}`, `순위 ${m.rank ?? "?"} / ${m.participants}곳 · ${PLAN_LABEL[d.plan]}안`];
  if (m.open_rate !== null && m.winner_rate !== null) {
    const gap = m.open_rate - m.winner_rate;
    lines.push(`우리 ${m.open_rate.toFixed(3)}% · 1등 ${m.winner_rate.toFixed(3)}% (차이 ${gap >= 0 ? "+" : ""}${gap.toFixed(3)}%p)`);
  }
  if (m.result === "pending") lines.push("협상 계약은 기술평가 뒤 결과가 정해져요. 결과가 나오면 기록에서 골라 주세요.");
  return { html: lines.join("\n"), buttons: [{ text: "투찰 기록 보기", url: `${ERP_URL}/bids/records` }] };
}

/** 개찰된 투찰을 확인한다. 한 건이 실패해도 나머지는 계속한다 */
export async function checkDueOpenings(db: SupabaseClient, secret: string): Promise<string> {
  const { data, error } = await db.rpc("cron_due_openings", { p_secret: secret });
  if (error) return `조회 실패: ${error.message}`;
  const due = (data ?? []) as DueOpening[];
  if (!due.length) return "확인할 것 없음";

  let found = 0;
  const problems: string[] = [];
  const startedAt = Date.now();
  for (const d of due) {
    // 5분 크론(최대 60초) 안에 끝나도록, 25초가 지나면 남은 건은 다음 번에
    if (Date.now() - startedAt > 25_000) break;
    try {
      const rows = await fetchOpening(d.bid_no, d.bid_ord);
      const m = rows.length ? matchOpening(rows, d.my_bizno, guessAwardMode(d.award_method) === "negotiation") : null;
      const { error: e2 } = await db.rpc("cron_save_opening", { p_secret: secret, p_id: d.id, p_found: m });
      if (e2) throw new Error(e2.message);
      if (!m) continue;
      found++;
      if (d.token && d.chat_id) {
        const msg = openingTelegram(d, m);
        await sendMessage(d.token, Number(d.chat_id), msg.html, msg.buttons).catch(() => problems.push("텔레그램 발송 실패"));
      }
    } catch (e) {
      problems.push(e instanceof Error ? e.message : "알 수 없는 오류");
      // 다음 번에 다시 보도록 시각만 남긴다
      await db.rpc("cron_save_opening", { p_secret: secret, p_id: d.id, p_found: null });
    }
  }
  return `${due.length}건 확인, ${found}건 결과 기록${problems.length ? ` (문제: ${problems.join(", ")})` : ""}`;
}
