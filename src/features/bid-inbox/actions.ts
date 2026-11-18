"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { fetchAllNotices } from "./fetch-all";
import { fetchAwards, fetchOpening, fillBids, fillMethods, mergeAwards, pickSimilar, type Award, type Similar } from "./award-history";
import { guessAwardMode, type CalcHints } from "./calc";
import { extractCalcHints } from "./calc-hints";
import { matchOpening, type Submission, type SubmissionPlan, type SubmissionResult } from "./submissions";
import { summarizeNotice } from "./summarize";
import type { BidStatus } from "./types";

/** '지금 수신' 버튼. 처음 누르면 설정 행이 생겨 매일 자동 수신도 시작된다. */
export async function fetchBidsNow(): Promise<{ message: string; failed?: boolean }> {
  const { supabase, userId } = await requireUser();

  const { data: known } = await supabase
    .from("bid_checked")
    .select("check_key")
    .order("created_at", { ascending: false })
    .limit(1000);
  const results = await fetchAllNotices(new Set((known ?? []).map((k) => k.check_key as string)));

  const parts: string[] = [];
  let failed = false;
  for (const r of results) {
    let added = 0;
    if (r.rows.length) {
      const { data, error } = await supabase
        .from("bid_notices")
        .upsert(r.rows, { onConflict: "user_id,category,bid_no,bid_ord", ignoreDuplicates: true })
        .select("id");
      if (error) {
        parts.push(`${r.label} 저장 실패: ${error.message}`);
        failed = true;
        continue;
      }
      added = data?.length ?? 0;
    }
    if (r.checked?.length) {
      await supabase
        .from("bid_checked")
        .upsert(r.checked.map((check_key) => ({ check_key })), { onConflict: "user_id,check_key", ignoreDuplicates: true });
    }
    if (r.error) failed = true;
    parts.push(
      r.error
        ? `${r.label} 수신 실패: ${r.error}`
        : `${r.label} ${r.rows.length}건 확인, ${added}건 새로 수신${r.note ? ` (${r.note})` : ""}`,
    );
  }
  const message = parts.join(" / ");

  await supabase.from("bid_settings").upsert(
    { user_id: userId, last_fetched_at: new Date().toISOString(), last_fetch_result: message },
    { onConflict: "user_id" },
  );
  revalidatePath("/bids");
  return { message, failed };
}

/** '요약 만들기' 버튼. 아침 수신 전이거나 실패한 공고를 바로 요약한다 */
export async function summarizeBid(id: string) {
  const { supabase } = await requireUser();
  const { data: notice, error } = await supabase.from("bid_notices").select("bid_no, bid_ord, title").eq("id", id).single();
  if (error) throw new Error(error.message);

  const saved = await summarizeNotice(notice.bid_no, notice.bid_ord, notice.title).then(
    (r) => ({ summary: r.summary, summary_files: r.files, summary_error: null }),
    (e) => ({ summary: null, summary_files: null, summary_error: e instanceof Error ? e.message : "알 수 없는 오류" }),
  );
  const { error: e2 } = await supabase
    .from("bid_notices")
    .update({ ...saved, summarized_at: new Date().toISOString() })
    .eq("id", id);
  if (e2) throw new Error(e2.message);
  revalidatePath("/bids");
}

export async function setBidStatus(id: string, status: BidStatus) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("bid_notices").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/bids");
}

/**
 * 계산기의 '공고문에서 값 채우기'. 공고 요약에서 낙찰방식·기준금액·하한율·배점을 읽어 돌려준다.
 * 한 번 읽은 값은 저장해 두고 다시 쓴다 (again=true면 새로 읽는다).
 */
export async function loadCalcHints(id: string, again = false): Promise<{ hints?: CalcHints; error?: string }> {
  const { supabase } = await requireUser();
  const { data: n, error } = await supabase
    .from("bid_notices")
    .select("title, award_method, presumed_price, summary, calc_hints")
    .eq("id", id)
    .single();
  if (error) return { error: error.message };
  if (n.calc_hints && !again) return { hints: n.calc_hints as CalcHints };
  if (!n.summary) return { error: "공고 요약이 아직 없습니다. 공고 수신함에서 '요약 만들기'를 먼저 눌러 주세요." };

  try {
    const hints = await extractCalcHints({ title: n.title, award_method: n.award_method, presumed_price: n.presumed_price, summary: n.summary });
    await supabase.from("bid_notices").update({ calc_hints: hints }).eq("id", id);
    return { hints };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "알 수 없는 오류" };
  }
}

const AWARD_KEYWORD = "원가";
const AWARD_DAYS = 365;
const AWARD_CACHE_MS = 24 * 3_600_000;
/** 화면 요청 한 번(최대 180초) 안에서 낙찰방법 조회를 멈추는 시각 (요청 시작부터) */
const METHOD_DEADLINE_MS = 165_000;
/** 경쟁사 투찰 분포에 쓰는 비슷한 적격심사 사례 수 */
const DIST_CASES = 6;

export type SimilarAwards = { rows: Similar[]; total: number; fetchedAt: string; failedWeeks: number };

/**
 * 계산기의 '지난 낙찰률 가져오기'. 최근 1년 공고명에 '원가'가 들어간 용역 낙찰 결과 중
 * 같은 기관·같은 용역·비슷한 금액을 골라 돌려준다. 받은 결과는 하루 동안 다시 쓴다 (again=true면 새로 받음).
 */
export async function loadSimilarAwards(id: string, again = false): Promise<{ data?: SimilarAwards; error?: string }> {
  const { supabase, userId } = await requireUser();
  const { data: n, error } = await supabase
    .from("bid_notices")
    .select("title, notice_org, demand_org, presumed_price, bid_no, award_method")
    .eq("id", id)
    .single();
  if (error) return { error: error.message };
  const started = Date.now();

  const { data: cache } = await supabase.from("bid_award_cache").select("fetched_at, failed_weeks, awards").eq("keyword", AWARD_KEYWORD).maybeSingle();
  let awards = (cache?.awards as Award[] | undefined) ?? [];
  let fetchedAt = cache?.fetched_at as string | undefined;
  let failedWeeks = (cache?.failed_weeks as number | undefined) ?? 0;

  if (again || !fetchedAt || Date.now() - Date.parse(fetchedAt) > AWARD_CACHE_MS) {
    try {
      // 처음이거나 지난번에 빠진 주가 있으면 1년 전체, 아니면 지난번 이후 며칠(+7일 겹침)만 더 받는다
      const full = again || !fetchedAt || failedWeeks > 0;
      const days = full ? AWARD_DAYS : Math.min(AWARD_DAYS, Math.ceil((Date.now() - Date.parse(fetchedAt!)) / 86_400_000) + 7);
      const got = await fetchAwards(AWARD_KEYWORD, days);
      // 예전에 찾아 둔 낙찰방법을 잃지 않도록 늘 합친다 (1년 넘은 것은 합칠 때 빠진다)
      awards = mergeAwards(awards, got.awards, AWARD_DAYS);
      failedWeeks = got.failedWeeks;
      fetchedAt = new Date().toISOString();
    } catch (e) {
      if (!fetchedAt) return { error: e instanceof Error ? e.message : "알 수 없는 오류" };
      // 새로 받기가 실패하면 예전에 받은 결과로 보여 준다
    }
  }

  // 이번 공고와 비슷한 후보만 낙찰방법(협상·적격심사 등)을 찾아 채운다. 시간이 모자라면 다음에 이어서 찾는다
  const notice = { title: n.title, org: n.demand_org ?? n.notice_org, base: n.presumed_price, bidNo: n.bid_no };
  const candidates = new Set(pickSimilar(awards, notice).slice(0, 30).map((a) => a.bidNo));
  const needs = awards.filter((a) => candidates.has(a.bidNo) && a.method === undefined);
  if (needs.length) {
    const filled = await fillMethods(needs, started + METHOD_DEADLINE_MS);
    const byNo = new Map(filled.map((a) => [a.bidNo, a]));
    awards = awards.map((a) => byNo.get(a.bidNo) ?? a);
  }
  const mode = n.award_method ? guessAwardMode(n.award_method) : null;
  // 적격심사 공고: 계산에 쓰는 비슷한 적격심사 사례(최대 6건)의 개찰 순위를 받아 경쟁사 투찰 분포를 만든다
  let bidsFilled = 0;
  if (mode === "qualified") {
    const targets = new Set(pickSimilar(awards, { ...notice, mode }).filter((a) => a.use).slice(0, DIST_CASES).map((a) => a.bidNo));
    const want = awards.filter((a) => targets.has(a.bidNo) && a.bids === undefined);
    if (want.length) {
      const filled = await fillBids(want, started + METHOD_DEADLINE_MS);
      bidsFilled = filled.filter((a) => a.bids !== undefined).length;
      const byNo = new Map(filled.map((a) => [a.bidNo, a]));
      awards = awards.map((a) => byNo.get(a.bidNo) ?? a);
    }
  }
  if (fetchedAt && (needs.length || bidsFilled || fetchedAt !== cache?.fetched_at)) {
    await supabase
      .from("bid_award_cache")
      .upsert({ user_id: userId, keyword: AWARD_KEYWORD, fetched_at: fetchedAt, failed_weeks: failedWeeks, awards }, { onConflict: "user_id,keyword" });
  }

  const rows = pickSimilar(awards, { ...notice, mode });
  return { data: { rows: rows.slice(0, 30), total: awards.length, fetchedAt: fetchedAt!, failedWeeks } };
}

// ---------- 내 투찰 기록 ----------

/** 이 공고의 투찰 기록과 우리 사업자번호 */
export async function listSubmissions(noticeId: string): Promise<{ list: Submission[]; bizno: string | null }> {
  const { supabase } = await requireUser();
  const [{ data }, { data: settings }] = await Promise.all([
    supabase.from("bid_submissions").select("*").eq("notice_id", noticeId).order("created_at", { ascending: false }),
    supabase.from("bid_settings").select("my_bizno").maybeSingle(),
  ]);
  return { list: (data ?? []) as Submission[], bizno: (settings?.my_bizno as string | null) ?? null };
}

export async function saveSubmission(input: {
  noticeId: string;
  plan: SubmissionPlan;
  amount: number;
  base: number | null;
  submittedOn: string;
  memo: string;
}): Promise<{ error?: string }> {
  const { supabase } = await requireUser();
  if (!(input.amount > 0)) return { error: "투찰 금액을 넣어 주세요." };
  const rate = input.base && input.base > 0 ? Math.round((input.amount / input.base) * 100_000) / 1000 : null;
  const { error } = await supabase.from("bid_submissions").insert({
    notice_id: input.noticeId,
    plan: input.plan,
    amount: Math.round(input.amount),
    base_amount: input.base && input.base > 0 ? Math.round(input.base) : null,
    rate,
    ...(input.submittedOn ? { submitted_on: input.submittedOn } : {}),
    memo: input.memo.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/bids/records");
  return {};
}

export async function setSubmissionResult(id: string, result: SubmissionResult): Promise<{ error?: string }> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("bid_submissions").update({ result }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/bids/records");
  return {};
}

export async function deleteSubmission(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("bid_submissions").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/bids/records");
  return {};
}

export async function saveMyBizno(bizno: string): Promise<{ error?: string }> {
  const digits = bizno.replace(/\D/g, "");
  if (digits.length !== 10) return { error: "사업자번호 10자리를 넣어 주세요." };
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("bid_settings").upsert({ user_id: userId, my_bizno: digits }, { onConflict: "user_id" });
  return error ? { error: error.message } : {};
}

/** 나라장터 개찰 순위에서 우리 업체를 찾아 순위·1등 투찰률·결과를 채운다 */
export async function checkSubmissionOpening(id: string): Promise<{ message: string; ok: boolean }> {
  const { supabase } = await requireUser();
  const { data: s, error } = await supabase.from("bid_submissions").select("notice_id").eq("id", id).single();
  if (error) return { ok: false, message: error.message };
  const [{ data: n }, { data: settings }] = await Promise.all([
    supabase.from("bid_notices").select("bid_no, bid_ord, award_method, source").eq("id", s.notice_id).single(),
    supabase.from("bid_settings").select("my_bizno").maybeSingle(),
  ]);
  if (!n) return { ok: false, message: "공고를 찾지 못했습니다." };
  if (n.source !== "g2b") return { ok: false, message: "나라장터 공고만 개찰 결과를 확인할 수 있습니다." };
  if (!settings?.my_bizno) return { ok: false, message: "먼저 우리 사업자번호를 저장해 주세요." };
  try {
    const rows = await fetchOpening(n.bid_no, n.bid_ord ?? "000");
    if (rows.length === 0) return { ok: false, message: "아직 개찰 결과가 없습니다. 개찰 뒤 다시 눌러 주세요." };
    const m = matchOpening(rows, settings.my_bizno as string, guessAwardMode(n.award_method) === "negotiation");
    if (!m) return { ok: false, message: `개찰 결과 ${rows.length}곳 중 우리 사업자번호를 찾지 못했습니다. 번호를 확인해 주세요.` };
    const { error: e2 } = await supabase.from("bid_submissions").update({ ...m, checked_at: new Date().toISOString() }).eq("id", id);
    if (e2) return { ok: false, message: e2.message };
    revalidatePath("/bids/records");
    const where = `${rows.length}곳 중 ${m.rank ?? "?"}위`;
    if (m.result === "won") return { ok: true, message: `낙찰 (${where})` };
    if (m.result === "lost") return { ok: true, message: `탈락 (${where})` };
    return { ok: true, message: `가격 순위 ${where}. 협상은 기술평가 뒤 결과를 직접 골라 주세요.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "알 수 없는 오류" };
  }
}
