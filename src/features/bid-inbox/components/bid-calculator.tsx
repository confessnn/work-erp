"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { won } from "@/lib/format";
import { loadCalcHints, loadSimilarAwards, type SimilarAwards } from "../actions";
import { SubmissionPanel } from "./submission-panel";
import type { Similar } from "../award-history";
import {
  bidHistogram,
  calcCost,
  hintsToFields,
  clearsLowerBound,
  parseRates,
  plansFromLowerRate,
  plansFromRates,
  priceScore,
  vatPair,
  type AwardMode,
  type CalcHints,
  type Plan,
} from "../calc";

const MODES: { v: AwardMode; label: string }[] = [
  { v: "negotiation", label: "협상에 의한 계약" },
  { v: "qualified", label: "적격심사" },
  { v: "price", label: "최저가·수의" },
];

const blankDraft = (mode: AwardMode, base: string) => ({
  mode,
  base,
  includesVat: false,
  weight: "",
  floorRate: "60",
  lowest: "",
  lowerRate: "",
  range: "2",
  rates: "",
  /** '지난 낙찰률 가져오기'가 채운 칸 글과 각 사례의 무게. 칸을 고치면 무게 없이(똑같이) 센다 */
  weightedFor: "",
  rateWeights: [] as number[],
  manual: "",
  staff: ["책임연구원", "연구원", "연구보조원", "보조원"].map((label) => ({ label, people: "", months: "", monthlyPay: "" })),
  expenses: "",
  overheadRate: "5",
  profitRate: "10",
});
type Draft = ReturnType<typeof blankDraft>;

const num = (s: string) => Number(s.replaceAll(",", "")) || 0;
const pct = (n: number) => `${n.toLocaleString("ko-KR", { maximumFractionDigits: 3 })}%`;

function loadDraft(key: string, fallback: Draft): Draft {
  try {
    const saved = localStorage.getItem(key);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

const subscribeNothing = () => () => {};

/** 입력값은 이 브라우저에 임시로 기억한다. 서버 화면에는 저장값이 없으므로 브라우저에서만 그린다 */
export function BidCalculator({ draftKey, mode, base, noticeId }: { draftKey: string; mode: AwardMode; base: number | null; noticeId?: string }) {
  const ready = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!ready) return <p className="card text-center text-muted">계산기를 준비하고 있습니다.</p>;
  return <Form draftKey={draftKey} initial={blankDraft(mode, base ? String(base) : "")} noticeId={noticeId} />;
}

const FIELD_NAMES: Record<string, string> = {
  mode: "낙찰 방식",
  base: "기준금액",
  includesVat: "부가세 포함 여부",
  weight: "가격 배점",
  floorRate: "최저입찰가 하한",
  lowerRate: "낙찰하한율",
  range: "복수예비가격 범위",
};

const RATE_ROWS = 12;

/** 나라장터 낙찰정보에서 지난 원가 용역 낙찰률을 가져와 '유사 용역 낙찰률' 칸을 채운다 */
/** 적격심사: 비슷한 공고에서 업체들이 낸 투찰률이 어디에 몰렸는지 */
function BidDistribution({ rows, lowerRate }: { rows: Similar[]; lowerRate: number }) {
  const cases = rows.filter((a) => a.use && a.bids && a.bids.length > 0);
  if (cases.length === 0) return null;
  const all = cases.flatMap((a) => a.bids ?? []);
  const sorted = [...all].sort((x, y) => x - y);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  // 너무 멀리 떨어진 값은 그래프를 넓게만 만들어서, 가운데 90%만 그린다
  const core = all.filter((r) => r >= at(0.05) && r <= at(0.95));
  const outside = all.length - core.length;
  const { bins, top } = bidHistogram(core);
  const max = Math.max(...bins.map((b) => b.count), 1);
  const below = lowerRate > 0 ? all.filter((r) => r < lowerRate).length : 0;
  const winners = cases.map((a) => a.rate);
  return (
    <div className="space-y-2 rounded-lg bg-accent-soft p-3">
      <p className="font-semibold">경쟁사 투찰 분포 (비슷한 적격심사 {cases.length}건, 업체 {all.length}곳이 낸 투찰률)</p>
      <p>
        가장 많이 몰린 구간: <b>{top!.from.toFixed(1)}~{(top!.from + 0.1).toFixed(1)}%</b> ({top!.count}곳) · 가운데 50%: {at(0.25).toFixed(3)}~{at(0.75).toFixed(3)}% · 1등(낙찰) 투찰률: {winners.map((w) => w.toFixed(3)).join(", ")}%
      </p>
      {lowerRate > 0 && (
        <p className="text-muted">
          낙찰하한율 {lowerRate}% 미만으로 낸 곳: {below}곳 ({Math.round((below / all.length) * 100)}%)
        </p>
      )}
      <div className="flex h-28 items-end gap-px overflow-x-auto" aria-label="투찰률 분포 막대그래프">
        {bins.map((b) => (
          <div key={b.from} className="flex min-w-[10px] flex-1 flex-col items-center justify-end" title={`${b.from.toFixed(1)}~${(b.from + 0.1).toFixed(1)}%: ${b.count}곳`}>
            <div
              className={`w-full rounded-t ${lowerRate > 0 && b.from + 0.1 <= lowerRate ? "bg-line" : b === top ? "bg-accent" : "bg-ochre"}`}
              style={{ height: `${(b.count / max) * 100}%`, minHeight: b.count ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted tabular-nums">
        <span>{bins[0].from.toFixed(1)}%</span>
        <span>{(bins[bins.length - 1].from + 0.1).toFixed(1)}%</span>
      </div>
      {outside > 0 && <p className="text-xs text-muted">그래프 밖(아주 낮거나 높게 낸 곳) {outside}곳 · 전체 범위 {sorted[0].toFixed(3)}~{sorted[sorted.length - 1].toFixed(3)}%</p>}
      <p className="text-xs text-muted">투찰률은 각 공고의 예정가격 대비입니다. 이번 공고의 예정가격은 기초금액의 일정 범위 안에서 추첨으로 정해지므로, 구간을 참고만 하세요. 업체 이름은 저장하지 않습니다.</p>
    </div>
  );
}

function AwardPicker({ noticeId, onRates, lowerRate }: { noticeId: string; onRates: (rates: string, weights: number[]) => void; lowerRate: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ data?: SimilarAwards; error?: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const run = (again: boolean) =>
    start(async () => {
      const r = await loadSimilarAwards(noticeId, again);
      setResult(r);
      const used = r.data?.rows.filter((a) => a.use) ?? [];
      if (used.length) onRates(used.map((a) => a.rate.toFixed(3)).join(", "), used.map((a) => a.weight));
    });

  const rows = result?.data?.rows ?? [];
  const used = rows.filter((a) => a.use).length;
  const shown = showAll ? rows : rows.slice(0, RATE_ROWS);
  const when = result?.data ? new Date(result.data.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";

  return (
    <div className="space-y-2 rounded-lg border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={pending} onClick={() => run(false)}>
          {pending ? "나라장터에서 받는 중… (처음 한 번은 2분쯤)" : "지난 낙찰률 가져오기 (최근 1년)"}
        </button>
        {result?.data && (
          <button type="button" className="chip" disabled={pending} onClick={() => run(true)}>
            새로 받기
          </button>
        )}
      </div>
      {result?.error && <p className="text-danger">{result.error}</p>}
      {result?.data && (
        <>
          <p>
            최근 1년 공고명에 ‘원가’가 들어간 용역 낙찰 {result.data.total}건 중 비슷한 {rows.length}건
            {rows.length > 0 && ` (같은 용역 ${rows.filter((a) => a.sameWork).length} · 같은 기관 ${rows.filter((a) => a.sameOrg).length})`}
            <span className="text-muted"> · {when} 기준</span>
            {result.data.failedWeeks > 0 && <span className="text-warn"> · {result.data.failedWeeks}주는 받지 못함</span>}
          </p>
          {rows.length === 0 ? (
            <p className="text-muted">비슷한 낙찰 결과가 없습니다. 낙찰률을 직접 넣어 주세요.</p>
          ) : (
            <>
              <p className="text-muted">
                {used > 0
                  ? `경쟁이 있었고(3곳 이상 참여) 이번 공고와 낙찰 방식이 같은 ${used}건의 낙찰률을 ‘유사 용역 낙찰률’ 칸에 넣었습니다. 흐리게 보이는 줄은 계산에서 뺀 것이에요.`
                  : "조건(3곳 이상 참여, 같은 낙찰 방식)에 맞는 낙찰 결과가 없어 칸을 채우지 않았습니다. 표를 보고 직접 넣어 주세요."}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="py-1 pr-2">낙찰일</th>
                      <th className="py-1 pr-2">공고명 · 발주기관</th>
                      <th className="py-1 pr-2 text-right">낙찰금액</th>
                      <th className="py-1 pr-2 text-right">낙찰률</th>
                      <th className="py-1 text-right">참여</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((a) => (
                      <tr key={a.bidNo} className={`border-t border-line align-top ${a.use ? "" : "opacity-50"}`}>
                        <td className="py-1 pr-2 whitespace-nowrap tabular-nums">{a.date ?? "-"}</td>
                        <td className="py-1 pr-2">
                          {a.sameWork && <span className="mr-1 rounded bg-accent-soft px-1 font-semibold">같은 용역</span>}
                          {!a.sameWork && a.sameOrg && <span className="mr-1 rounded bg-mint px-1 font-semibold">같은 기관</span>}
                          {a.skip && <span className="mr-1 rounded bg-line px-1">{a.skip}</span>}
                          {a.title}
                          <span className="text-muted"> · {a.org ?? "기관 미상"}{a.method ? ` · ${a.method}` : ""}{a.winner ? ` · 낙찰 ${a.winner}` : ""}</span>
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">{won(a.amount)}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{a.rate.toFixed(3)}%{a.use && a.weight !== 1 ? <span className="text-muted"> ×{Number(a.weight.toFixed(2))}</span> : null}</td>
                        <td className="py-1 text-right tabular-nums">{a.participants ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > RATE_ROWS && (
                <button type="button" className="chip" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "접기" : `${rows.length - RATE_ROWS}건 더 보기`}
                </button>
              )}
              <BidDistribution rows={rows} lowerRate={lowerRate} />
              <p className="text-xs text-muted">낙찰률은 예정가격 대비 비율입니다. 기준금액(추정가격)과 기준이 다를 수 있으니 공고문 산식을 확인하세요.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** 공고 요약에서 AI가 읽은 값으로 칸을 채운다. 무엇을 채웠는지와 주의점을 보여 준다 */
function HintFiller({ noticeId, onFill }: { noticeId: string; onFill: (fields: ReturnType<typeof hintsToFields>) => void }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ hints?: CalcHints; filled?: string[]; error?: string } | null>(null);

  const run = (again: boolean) =>
    start(async () => {
      const r = await loadCalcHints(noticeId, again);
      if (!r.hints) return setResult({ error: r.error ?? "값을 읽지 못했습니다." });
      const fields = hintsToFields(r.hints);
      onFill(fields);
      setResult({ hints: r.hints, filled: Object.keys(fields).map((k) => FIELD_NAMES[k] ?? k) });
    });

  return (
    <div className="space-y-2 rounded-lg bg-accent-soft p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={pending} onClick={() => run(false)}>
          {pending ? "공고문 읽는 중…" : "공고문에서 값 채우기"}
        </button>
        {result?.hints && (
          <button type="button" className="chip" disabled={pending} onClick={() => run(true)}>
            다시 읽기
          </button>
        )}
      </div>
      {result?.error && <p className="text-danger">{result.error}</p>}
      {result?.hints && (
        <>
          <p>
            {result.filled?.length ? `채운 칸: ${result.filled.join(", ")}` : "요약에서 계산에 쓸 값을 찾지 못했습니다. 공고문을 보고 직접 넣어 주세요."}
            {result.hints.base_kind ? ` (기준금액은 ${result.hints.base_kind})` : ""}
          </p>
          {result.hints.notes.length > 0 && (
            <ul className="list-disc pl-5 text-muted">
              {result.hints.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">AI가 공고 요약에서 읽은 값입니다. 투찰 전에 공고문 원문과 꼭 맞춰 보세요.</p>
        </>
      )}
    </div>
  );
}

function Field({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input tabular-nums" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <small className="text-muted">{hint}</small>}
    </label>
  );
}

function Form({ draftKey, initial, noticeId }: { draftKey: string; initial: Draft; noticeId?: string }) {
  const [d, setD] = useState<Draft>(() => loadDraft(draftKey, initial));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const setStaff = (i: number, k: "people" | "months" | "monthlyPay", v: string) =>
    setD((prev) => ({ ...prev, staff: prev.staff.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(d));
    } catch {
      // 저장이 막힌 브라우저에서는 기억하지 않을 뿐 계산은 그대로 된다
    }
  }, [draftKey, d]);

  const base = num(d.base);
  const lowerRate = num(d.lowerRate);
  const range = num(d.range);
  const rates = parseRates(d.rates);
  const cost = calcCost({
    staff: d.staff.map((s) => ({ label: s.label, people: num(s.people), months: num(s.months), monthlyPay: num(s.monthlyPay) })),
    expenses: num(d.expenses),
    overheadRate: num(d.overheadRate),
    profitRate: num(d.profitRate),
  });

  const weights = d.weightedFor && d.weightedFor === d.rates && d.rateWeights.length === rates.length ? d.rateWeights : undefined;
  const plans = d.mode === "qualified" ? plansFromLowerRate(base, lowerRate) : plansFromRates(base, rates, weights);
  const manual = num(d.manual);
  const rows: (Pick<Plan, "label" | "price"> & { rate: number })[] = [
    ...plans,
    ...(manual > 0 ? [{ label: "직접 입력", price: manual, rate: base > 0 ? (manual / base) * 100 : 0 }] : []),
  ];
  // 예상 최저입찰가를 안 넣으면 이 화면에서 가장 낮은 금액을 최저로 본다
  const lowest = num(d.lowest) || Math.min(...rows.map((r) => r.price));

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="section-title">1. 공고 기준</h2>
        {noticeId && <HintFiller noticeId={noticeId} onFill={(fields) => setD((prev) => ({ ...prev, ...fields }))} />}
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button key={m.v} type="button" className={`choice ${d.mode === m.v ? "choice-on" : ""}`} onClick={() => set("mode", m.v)}>
              {m.label}
            </button>
          ))}
        </div>
        <Field label="기준금액 (원)" hint="협상은 추정가격, 적격심사는 기초금액을 넣으세요." value={d.base} onChange={(v) => set("base", v)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.includesVat} onChange={(e) => set("includesVat", e.target.checked)} />
          기준금액에 부가세가 포함되어 있습니다 (수신한 추정가격은 부가세 별도)
        </label>

        {d.mode === "negotiation" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="가격 배점 (점)" hint="공고문 평가기준의 값" value={d.weight} onChange={(v) => set("weight", v)} />
            <Field label="최저입찰가 하한 (%)" hint="추정가격 대비. 공고문 확인" value={d.floorRate} onChange={(v) => set("floorRate", v)} />
            <Field label="예상 최저입찰가 (원)" hint="비우면 아래 금액 중 최저" value={d.lowest} onChange={(v) => set("lowest", v)} />
          </div>
        )}
        {d.mode === "qualified" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="낙찰하한율 (%)" hint="공고문의 최신 수치를 그대로 넣으세요." value={d.lowerRate} onChange={(v) => set("lowerRate", v)} />
            <Field label="복수예비가격 범위 (±%)" hint="공고문 확인" value={d.range} onChange={(v) => set("range", v)} />
          </div>
        )}
        {d.mode !== "qualified" && (
          <label className="field">
            <span>유사 용역 낙찰률 (%)</span>
            <textarea className="input" rows={2} placeholder="예: 87.5, 88.2, 90.1, 92" value={d.rates} onChange={(e) => set("rates", e.target.value)} />
            <small className="text-muted">아래 버튼으로 가져오거나 직접 붙여 넣으세요. 읽은 값 {rates.length}개로 3안을 만듭니다.</small>
          </label>
        )}
        {noticeId && (
          <AwardPicker
            noticeId={noticeId}
            lowerRate={lowerRate}
            onRates={(r, w) => setD((prev) => ({ ...prev, rates: r, weightedFor: r, rateWeights: w }))}
          />
        )}
        {weights && d.mode !== "qualified" && (
          <p className="text-xs text-muted">
            3안은 가까운 사례를 더 크게 세서 계산했어요 (같은 용역 ×3, 같은 기관 ×2, 최근 6개월 ×1.5, 비슷한 금액 ×1.5). 칸의 숫자를 고치면 모두 똑같이 셉니다.
          </p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="section-title">2. 우리 원가</h2>
        <div className="grid grid-cols-[auto_3.5rem_3.5rem_minmax(0,1fr)] items-center gap-2 text-sm">
          <span className="font-medium">등급</span>
          <span className="font-medium">인원</span>
          <span className="font-medium">월수</span>
          <span className="font-medium">월 단가(원)</span>
          {d.staff.map((s, i) => (
            <div key={s.label} className="contents">
              <span>{s.label}</span>
              <input aria-label={`${s.label} 인원`} className="input px-2 text-center tabular-nums" inputMode="decimal" value={s.people} onChange={(e) => setStaff(i, "people", e.target.value)} />
              <input aria-label={`${s.label} 월수`} className="input px-2 text-center tabular-nums" inputMode="decimal" value={s.months} onChange={(e) => setStaff(i, "months", e.target.value)} />
              <input aria-label={`${s.label} 월 단가`} className="input tabular-nums" inputMode="numeric" value={s.monthlyPay} onChange={(e) => setStaff(i, "monthlyPay", e.target.value)} />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">월 단가는 당해 연도 학술연구용역 인건비 기준단가를 확인해 넣으세요.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="경비 (원)" hint="여비·인쇄·자료·회의비 등" value={d.expenses} onChange={(v) => set("expenses", v)} />
          <Field label="일반관리비율 (%)" hint="공고문 기준으로 확인" value={d.overheadRate} onChange={(v) => set("overheadRate", v)} />
          <Field label="이윤율 (%)" hint="공고문 기준으로 확인" value={d.profitRate} onChange={(v) => set("profitRate", v)} />
        </div>
        <div className="calc">
          <div><span>인건비</span><span>{won(cost.labor)}</span></div>
          <div><span>경비</span><span>{won(cost.expenses)}</span></div>
          <div><span>일반관리비</span><span>{won(cost.overhead)}</span></div>
          <div className="font-semibold"><span>원가 (이윤 제외)</span><span>{won(cost.cost)}</span></div>
          <div><span>이윤</span><span>{won(cost.profit)}</span></div>
          <div><span>공급가액</span><span>{won(cost.supply)}</span></div>
          <div><span>부가세</span><span>{won(cost.vat)}</span></div>
          <div className="calc-total"><span>합계</span><span>{won(cost.total)}</span></div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="section-title">3. 투찰가 안</h2>
        <Field label="직접 넣어 볼 금액 (원)" hint="기준금액과 같은 부가세 기준으로 넣으세요." value={d.manual} onChange={(v) => set("manual", v)} />

        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            {d.mode === "qualified" ? "기준금액과 낙찰하한율을 넣으면 3안이 나옵니다." : "기준금액과 유사 낙찰률을 넣으면 3안이 나옵니다."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((r) => {
              const { excl, incl } = vatPair(r.price, d.includesVat);
              const score = d.mode === "negotiation" && num(d.weight) > 0 ? priceScore(r.price, lowest, base, num(d.weight), num(d.floorRate)) : null;
              const clears = d.mode === "qualified" && lowerRate > 0 ? clearsLowerBound(r.price, base, lowerRate, range) : null;
              const margin = excl - cost.cost;
              return (
                <div key={r.label} className="calc">
                  <div className="font-semibold"><span>{r.label}</span><span>{pct(r.rate)}</span></div>
                  <div className="calc-total"><span>투찰가</span><span>{won(r.price)}</span></div>
                  <div><span>부가세 별도</span><span>{won(excl)}</span></div>
                  <div><span>부가세 포함</span><span>{won(incl)}</span></div>
                  {score && (
                    <div><span>가격점수</span><span>{score.score.toFixed(2)}점 (-{score.loss.toFixed(2)})</span></div>
                  )}
                  {clears && (
                    <div className="gap-3">
                      <span className="shrink-0">하한 통과</span>
                      <span className="text-right">
                        -{range}% {clears.low ? "통과" : "미달"} · 기준 {clears.mid ? "통과" : "미달"} · +{range}% {clears.high ? "통과" : "미달"}
                      </span>
                    </div>
                  )}
                  {cost.cost > 0 && (
                    <div className={margin < 0 ? "font-semibold text-danger" : ""}>
                      <span>원가 대비</span>
                      <span>{margin < 0 ? `원가 미달 ${won(-margin)}` : `+${won(margin)} (${pct((margin / cost.cost) * 100)})`}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted">1차 계산입니다. 산식·하한율은 공고문이 우선하고, 투찰 금액은 직접 결정하세요. 입력값은 이 브라우저에만 임시로 남습니다.</p>
      </section>

      {noticeId && <SubmissionPanel noticeId={noticeId} base={base} plans={plans.map((p) => ({ key: p.key, price: p.price }))} />}
    </div>
  );
}
