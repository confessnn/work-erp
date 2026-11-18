"use client";

import { useMemo, useState } from "react";
import { won } from "@/lib/format";
import { calcQuote, DEFAULT_WAGES, defaultExpenses, EXPENSE_ROWS, fillQuoteHwpx, GRADES, type Expense, type ExpenseKey } from "../quote";
import { PLAN_LABEL, type SubmissionPlan } from "../submissions";

type PlanPrice = { key: Exclude<SubmissionPlan, "manual">; price: number };

const num = (s: string) => Number(s.replaceAll(",", "")) || 0;

/** 계산기 아래: 투찰 금액(총계)에 맞춘 견적서를 한글(hwpx) 양식으로 내려받는다 */
export function QuotePanel({ title, plans }: { title: string; plans: PlanPrice[] }) {
  const [open, setOpen] = useState(false);
  const [service, setService] = useState(title ? `${title} 견적서` : "");
  const [total, setTotal] = useState("");
  const [months, setMonths] = useState("1");
  const [wages, setWages] = useState(DEFAULT_WAGES.map(String));
  const [shares, setShares] = useState(["40", "20", "40"]);
  const [adminRate, setAdminRate] = useState("6");
  const [expenses, setExpenses] = useState<Record<ExpenseKey, Expense> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const totalNum = num(total);
  const ex = useMemo(() => expenses ?? defaultExpenses(totalNum), [expenses, totalNum]);
  const result = useMemo(() => {
    if (!totalNum) return null;
    try {
      return {
        q: calcQuote({
          service,
          total: totalNum,
          months: Number(months) || 0,
          wages: wages.map(num) as [number, number, number],
          shares: shares.map(num) as [number, number, number],
          expenses: ex,
          adminRate: Number(adminRate) || 0,
        }),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "계산하지 못했어요." };
    }
  }, [service, totalNum, months, wages, shares, ex, adminRate]);

  const setExp = (k: ExpenseKey, field: "unit" | "qty", v: string) => setExpenses({ ...ex, [k]: { ...ex[k], [field]: num(v) } });

  const download = async () => {
    if (!result || !("q" in result) || !result.q) return;
    setBusy(true);
    setMsg(null);
    try {
      // 양식(약 60KB)은 누를 때만 불러온다
      const { QUOTE_TEMPLATE_B64 } = await import("../quote-template");
      const tpl = Uint8Array.from(atob(QUOTE_TEMPLATE_B64), (c) => c.charCodeAt(0));
      const bytes = fillQuoteHwpx(tpl, service.trim(), result.q, Number(adminRate) || 0);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/hwp+zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(service.trim() || "견적서").replace(/[\\/:*?"<>|]/g, " ")}.hwpx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMsg("내려받았어요. 한글에서 열어 단가·참여율을 한 번 확인해 주세요.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <section className="card flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">5. 견적서 만들기 (한글)</h2>
          <p className="text-sm text-muted">투찰 금액에 맞춰 인건비·경비·일반관리비를 나눈 견적서를 기존 양식 그대로 내려받아요.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          견적서 만들기
        </button>
      </section>
    );
  }

  const q = result && "q" in result ? result.q : null;
  return (
    <section className="card space-y-3 text-sm">
      <h2 className="section-title">5. 견적서 만들기 (한글)</h2>

      <label className="block space-y-1">
        <span className="text-muted">용역명 (양식의 &lsquo;용역명:&rsquo; 줄)</span>
        <input className="input w-full" value={service} onChange={(e) => setService(e.target.value)} />
      </label>

      <div className="space-y-1">
        <span className="text-muted">총계 (부가세 포함, 보통 투찰 금액)</span>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-44 tabular-nums" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="22,000,000" />
          {plans.map((p) => (
            <button key={p.key} type="button" className="chip" onClick={() => setTotal(String(p.price))}>
              {PLAN_LABEL[p.key]}안 {won(p.price)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr]">
        <span className="text-muted sm:col-span-3">인건비 (월 단가는 해마다 학술연구용역 인건비 기준단가로 확인)</span>
        {GRADES.map((g, i) => (
          <div key={g} className="contents">
            <span className="self-center">{g}</span>
            <label className="flex items-center gap-1">
              <span className="text-xs text-muted">월 단가</span>
              <input className="input w-full tabular-nums" inputMode="numeric" value={wages[i]} onChange={(e) => setWages(wages.map((w, j) => (j === i ? e.target.value : w)))} />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-xs text-muted">나눔 %</span>
              <input className="input w-20 tabular-nums" inputMode="decimal" value={shares[i]} onChange={(e) => setShares(shares.map((s, j) => (j === i ? e.target.value : s)))} />
              {q && <span className="text-xs text-muted tabular-nums">참여율 {q.rates[i].toFixed(2)}%</span>}
            </label>
          </div>
        ))}
        <label className="flex items-center gap-1 sm:col-span-3">
          <span className="text-muted">기간</span>
          <input className="input w-20 tabular-nums" inputMode="decimal" value={months} onChange={(e) => setMonths(e.target.value)} />
          <span className="text-muted">개월 · 일반관리비</span>
          <input className="input w-16 tabular-nums" inputMode="decimal" value={adminRate} onChange={(e) => setAdminRate(e.target.value)} />
          <span className="text-muted">% 이내</span>
        </label>
      </div>

      <div className="space-y-1">
        <span className="text-muted">경비 (단가 × 수량, 안 쓰는 줄은 0)</span>
        {EXPENSE_ROWS.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center gap-2">
            <span className="w-20">{r.label}</span>
            <input className="input w-28 tabular-nums" inputMode="numeric" value={ex[r.key].unit || ""} placeholder="단가" onChange={(e) => setExp(r.key, "unit", e.target.value)} />
            <span className="text-muted">원 ×</span>
            <input className="input w-24 tabular-nums" inputMode="numeric" value={ex[r.key].qty || ""} placeholder="수량" onChange={(e) => setExp(r.key, "qty", e.target.value)} />
            <span className="text-muted">{r.unitLabel}</span>
          </div>
        ))}
      </div>

      {result && "error" in result && <p className="text-danger">{result.error}</p>}
      {q && (
        <table className="w-full max-w-md text-sm tabular-nums">
          <tbody>
            {[
              ["인건비", q.laborSum],
              ["경비", q.expenseSum],
              ["일반관리비", q.admin],
              ["합계", q.subtotal],
              ["부가가치세", q.vat],
              ["총계", q.total],
            ].map(([k, v]) => (
              <tr key={k as string} className="border-t border-line">
                <td className="py-1">{k}</td>
                <td className="py-1 text-right">{won(v as number)}</td>
                <td className="py-1 pl-2 text-right text-muted">{(((v as number) / q.total) * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!q || busy || !service.trim()} onClick={download}>
          {busy ? "만드는 중…" : "견적서(한글) 내려받기"}
        </button>
        <button type="button" className="chip" onClick={() => setOpen(false)}>
          접기
        </button>
      </div>
      {msg && <p className="text-muted">{msg}</p>}
      <p className="text-xs text-muted">양식: 충북대학교 산학협력단 원가분석 용역 견적서. 이윤은 비영리법인이라 0%로 둡니다. 직인은 한글에서 직접 넣어 주세요.</p>
    </section>
  );
}
