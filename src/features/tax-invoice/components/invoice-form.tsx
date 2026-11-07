"use client";

import { useState, useTransition } from "react";
import { won } from "@/lib/format";
import { issueTaxInvoice } from "../actions";
import { PURPOSE_LABEL, REGISTRATION_LABEL, TAXATION_LABEL, blockedRecipient, taxFromSupply, validateIssue, type IssueInput } from "../invoice";
import type { BoltaMode, InvoicePurpose, TaxPartner, TaxProfile } from "../types";

type Props = {
  profile: TaxProfile;
  partners: TaxPartner[];
  mode: Exclude<BoltaMode, "none">;
  today: string;
  initialPartnerId?: string;
};

const toInt = (v: string) => Number(v.replaceAll(",", ""));

/** 입력 → 확인 → 발행 두 단계. 확인 화면을 거쳐야 발행 버튼이 나온다 */
export function InvoiceForm({ profile, partners, mode, today, initialPartnerId }: Props) {
  const [partnerId, setPartnerId] = useState(initialPartnerId ?? partners[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [purpose, setPurpose] = useState<InvoicePurpose>("CLAIM");
  const [itemName, setItemName] = useState("");
  const [supply, setSupply] = useState("");
  const [taxEdit, setTaxEdit] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const partner = partners.find((p) => p.id === partnerId);
  const supplyCost = toInt(supply);
  const autoTax = Number.isInteger(supplyCost) && supplyCost > 0 ? taxFromSupply(supplyCost) : 0;
  const tax = taxEdit === null ? autoTax : toInt(taxEdit);
  const input: IssueInput = { date, purpose, itemName, supplyCost, tax };

  function review() {
    const problem = !partner ? "거래처를 골라 주세요." : blockedRecipient(partner.registration_status) ? "폐업했거나 등록되지 않은 거래처입니다." : validateIssue(input);
    setError(problem);
    if (!problem) setConfirming(true);
  }

  function issue() {
    start(async () => {
      const r = await issueTaxInvoice(partnerId, input);
      if (r?.error) setError(r.error);
    });
  }

  if (confirming && partner) {
    return (
      <div className="space-y-6">
        <section className="card space-y-3">
          <h2 className="section-title">이 내용으로 발행할까요?</h2>
          <dl className="calc">
            <div><dt>공급자</dt><dd>{profile.organization_name} ({profile.identification_number})</dd></div>
            <div><dt>공급받는자</dt><dd>{partner.organization_name} ({partner.identification_number})</dd></div>
            <div><dt>받는 이메일</dt><dd>{partner.manager_email}</dd></div>
            <div><dt>사업자 상태</dt><dd>{partner.registration_status ? (REGISTRATION_LABEL[partner.registration_status] ?? partner.registration_status) : "미확인"}{partner.taxation_type ? ` · ${TAXATION_LABEL[partner.taxation_type] ?? partner.taxation_type}` : ""}</dd></div>
            <div><dt>작성일자</dt><dd>{date}</dd></div>
            <div><dt>품목</dt><dd>{itemName.trim()}</dd></div>
            <div><dt>구분</dt><dd>{PURPOSE_LABEL[purpose]}</dd></div>
            <div><dt>공급가액</dt><dd>{won(supplyCost)}</dd></div>
            <div><dt>세액</dt><dd>{won(tax)}</dd></div>
            <div className="calc-total"><dt>합계</dt><dd>{won(supplyCost + tax)}</dd></div>
          </dl>
          {mode === "live" ? (
            <p className="text-sm font-semibold text-danger">실제 발행입니다. 국세청에 전송되고, 거래처에도 메일이 갑니다. 잘못 발행하면 수정 세금계산서로 처리해야 합니다.</p>
          ) : (
            <p className="text-sm text-warn">테스트 발행입니다. 국세청에 전송되지 않습니다.</p>
          )}
        </section>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={issue} className="btn-primary">
            {pending ? "발행 중…" : mode === "live" ? "세금계산서 발행" : "테스트 발행"}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="chip">돌아가서 고치기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <label className="field">
          <span>거래처</span>
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="input">
            {partners.map((p) => <option key={p.id} value={p.id}>{p.organization_name} ({p.identification_number})</option>)}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="field">
            <span>작성일자</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </label>
          <label className="field">
            <span>품목</span>
            <input value={itemName} maxLength={100} placeholder="예: 에어컨 청소" onChange={(e) => setItemName(e.target.value)} className="input" />
          </label>
          <label className="field">
            <span>공급가액 (원, 부가세 별도)</span>
            <input
              inputMode="numeric"
              value={supply}
              placeholder="예: 100000"
              onChange={(e) => {
                setSupply(e.target.value);
                setTaxEdit(null);
              }}
              className="input tabular-nums"
            />
          </label>
          <label className="field">
            <span>세액 (원, 자동 10%)</span>
            <input inputMode="numeric" value={taxEdit ?? String(autoTax)} onChange={(e) => setTaxEdit(e.target.value)} className="input tabular-nums" />
          </label>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">구분</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["CLAIM", "RECEIPT"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPurpose(p)} className={`choice ${purpose === p ? "choice-on" : ""}`}>
                {PURPOSE_LABEL[p]} {p === "CLAIM" ? "(대금을 받을 예정)" : "(이미 받음)"}
              </button>
            ))}
          </div>
        </fieldset>
        <dl className="calc">
          <div><dt>공급가액</dt><dd>{won(Number.isFinite(supplyCost) ? supplyCost : 0)}</dd></div>
          <div><dt>세액</dt><dd>{won(Number.isFinite(tax) ? tax : 0)}</dd></div>
          <div className="calc-total"><dt>합계</dt><dd>{won((Number.isFinite(supplyCost) ? supplyCost : 0) + (Number.isFinite(tax) ? tax : 0))}</dd></div>
        </dl>
      </section>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="button" onClick={review} className="btn-primary w-full sm:w-auto">발행 전 확인</button>
    </div>
  );
}
