"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { won } from "@/lib/format";
import {
  calcCost,
  clearsLowerBound,
  parseRates,
  plansFromLowerRate,
  plansFromRates,
  priceScore,
  vatPair,
  type AwardMode,
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
export function BidCalculator({ draftKey, mode, base }: { draftKey: string; mode: AwardMode; base: number | null }) {
  const ready = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!ready) return <p className="card text-center text-muted">계산기를 준비하고 있습니다.</p>;
  return <Form draftKey={draftKey} initial={blankDraft(mode, base ? String(base) : "")} />;
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

function Form({ draftKey, initial }: { draftKey: string; initial: Draft }) {
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

  const plans = d.mode === "qualified" ? plansFromLowerRate(base, lowerRate) : plansFromRates(base, rates);
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
            <small className="text-muted">나라장터에서 찾은 값을 붙여 넣으세요. 읽은 값 {rates.length}개로 3안을 만듭니다.</small>
          </label>
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
              <input aria-label={`${s.label} 인원`} className="input tabular-nums" inputMode="decimal" value={s.people} onChange={(e) => setStaff(i, "people", e.target.value)} />
              <input aria-label={`${s.label} 월수`} className="input tabular-nums" inputMode="decimal" value={s.months} onChange={(e) => setStaff(i, "months", e.target.value)} />
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
                    <div className={margin < 0 ? "font-semibold text-red-500" : ""}>
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
    </div>
  );
}
