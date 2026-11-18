"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { todayInSeoul, won } from "@/lib/format";
import { checkSubmissionOpening, deleteSubmission, listSubmissions, saveMyBizno, saveSubmission, setSubmissionResult } from "../actions";
import { PLAN_LABEL, RESULT_LABEL, type Submission, type SubmissionPlan, type SubmissionResult } from "../submissions";

type PlanPrice = { key: Exclude<SubmissionPlan, "manual">; price: number };

const RESULT_CLS: Record<SubmissionResult, string> = {
  pending: "bg-line",
  won: "bg-mint",
  lost: "bg-peach",
  invalid: "bg-line",
  cancelled: "bg-line",
};

/** 계산기 아래: 실제로 낸 금액을 기록하고, 개찰 뒤 나라장터 순위로 결과를 맞춰 본다 */
export function SubmissionPanel({ noticeId, base, plans }: { noticeId: string; base: number; plans: PlanPrice[] }) {
  const [pending, start] = useTransition();
  const [list, setList] = useState<Submission[]>([]);
  const [bizno, setBizno] = useState<string | null>(null);
  const [biznoInput, setBiznoInput] = useState("");
  const [plan, setPlan] = useState<SubmissionPlan>("manual");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInSeoul());
  const [memo, setMemo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = useCallback(
    () =>
      start(async () => {
        const r = await listSubmissions(noticeId);
        setList(r.list);
        setBizno(r.bizno);
      }),
    [noticeId],
  );
  useEffect(() => reload(), [reload]);

  const choosePlan = (p: SubmissionPlan) => {
    setPlan(p);
    const found = plans.find((x) => x.key === p);
    if (found) setAmount(String(found.price));
  };

  const run = (fn: () => Promise<{ error?: string } | { ok: boolean; message: string }>, okText?: string) =>
    start(async () => {
      const r = await fn();
      if ("message" in r) setMsg({ ok: r.ok, text: r.message });
      else if (r.error) setMsg({ ok: false, text: r.error });
      else if (okText) setMsg({ ok: true, text: okText });
      const fresh = await listSubmissions(noticeId);
      setList(fresh.list);
      setBizno(fresh.bizno);
    });

  const amountNum = Number(amount.replaceAll(",", "")) || 0;

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">4. 내 투찰 기록</h2>
        <Link href="/bids/records" className="chip text-sm">
          전체 투찰 기록
        </Link>
      </div>
      <p className="text-sm text-muted">나라장터에 실제로 낸 금액을 남겨 두면, 개찰 뒤 순위와 1등 투찰률을 불러와 다음 3안을 고칠 근거가 됩니다.</p>

      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
        <select className="input" value={plan} onChange={(e) => choosePlan(e.target.value as SubmissionPlan)} aria-label="어느 안으로 냈는지">
          {(["attack", "balanced", "safe", "manual"] as SubmissionPlan[]).map((p) => (
            <option key={p} value={p} disabled={p !== "manual" && !plans.some((x) => x.key === p)}>
              {PLAN_LABEL[p]}안{p === "manual" ? " (직접 입력)" : ""}
            </option>
          ))}
        </select>
        <input className="input tabular-nums" inputMode="numeric" placeholder="낸 금액 (원)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="투찰일" />
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1" placeholder="메모 (선택)" value={memo} maxLength={500} onChange={(e) => setMemo(e.target.value)} />
        <button
          type="button"
          className="btn-primary"
          disabled={pending || amountNum <= 0}
          onClick={() =>
            run(async () => {
              const r = await saveSubmission({ noticeId, plan, amount: amountNum, base: base > 0 ? base : null, submittedOn: date, memo });
              if (!r.error) {
                setAmount("");
                setMemo("");
              }
              return r;
            }, "기록했습니다.")
          }
        >
          투찰 기록
        </button>
      </div>
      {amountNum > 0 && base > 0 && <p className="text-xs text-muted">기준금액 대비 {((amountNum / base) * 100).toFixed(3)}% · {won(amountNum)}</p>}

      {!bizno && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft p-3 text-sm">
          <span>개찰 결과를 불러오려면 우리 사업자번호가 필요해요.</span>
          <input className="input w-40 tabular-nums" inputMode="numeric" placeholder="000-00-00000" value={biznoInput} onChange={(e) => setBiznoInput(e.target.value)} />
          <button type="button" className="chip" disabled={pending} onClick={() => run(() => saveMyBizno(biznoInput), "사업자번호를 저장했습니다.")}>
            저장
          </button>
        </div>
      )}

      {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}

      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map((s) => (
            <li key={s.id} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 text-xs font-semibold ${RESULT_CLS[s.result]}`}>{RESULT_LABEL[s.result]}</span>
                <span className="tabular-nums">{s.submitted_on}</span>
                <span>{PLAN_LABEL[s.plan]}안</span>
                <b className="tabular-nums">{won(Number(s.amount))}</b>
                {s.rate !== null && <span className="text-muted tabular-nums">({Number(s.rate).toFixed(3)}%)</span>}
              </div>
              {s.checked_at && (
                <p className="mt-1 text-muted tabular-nums">
                  개찰: {s.participants}곳 중 {s.rank ?? "?"}위 · 우리 투찰률 {s.open_rate !== null ? `${Number(s.open_rate).toFixed(3)}%` : "-"} · 1등{" "}
                  {s.winner_rate !== null ? `${Number(s.winner_rate).toFixed(3)}%` : "-"}
                  {s.open_rate !== null && s.winner_rate !== null && ` (차이 ${(Number(s.open_rate) - Number(s.winner_rate)).toFixed(3)}%p)`}
                </p>
              )}
              {s.memo && <p className="mt-1 text-muted">{s.memo}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className="chip" disabled={pending} onClick={() => run(() => checkSubmissionOpening(s.id))}>
                  개찰 결과 확인
                </button>
                <select
                  className="input w-auto py-1 text-sm"
                  value={s.result}
                  aria-label="결과 직접 고르기"
                  onChange={(e) => run(() => setSubmissionResult(s.id, e.target.value as SubmissionResult))}
                >
                  {(Object.keys(RESULT_LABEL) as SubmissionResult[]).map((r) => (
                    <option key={r} value={r}>
                      {RESULT_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="chip"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("이 투찰 기록을 지울까요?")) run(() => deleteSubmission(s.id), "지웠습니다.");
                  }}
                >
                  지우기
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
