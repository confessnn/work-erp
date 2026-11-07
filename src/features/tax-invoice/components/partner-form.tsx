"use client";

import { startTransition, useActionState, useState } from "react";
import type { FormState } from "../actions";
import type { BoltaMode, ExtractedCertificate, TaxPartner } from "../types";
import { BusinessFieldInputs, toValues } from "./business-fields";

const VALIDATION_TEXT = {
  MATCHED: "국세청 진위확인 일치 (등록번호·대표자·개업일). 상호, 주소, 업태·종목은 직접 확인해 주세요.",
  NOT_MATCHED: "국세청 진위확인 불일치입니다. 번호와 대표자를 등록증과 대조해 주세요.",
  UNAVAILABLE: "국세청 확인이 잠시 안 됩니다. 읽은 내용을 등록증과 대조해 주세요.",
};

type Props = {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  partner?: TaxPartner;
  mode: BoltaMode;
};

export function PartnerForm({ action, partner, mode }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState(toValues(partner));
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedCertificate | null>(null);

  async function readCertificate(file: File) {
    setReading(true);
    setReadError(null);
    setExtracted(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/tax/extract", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setReadError(body.error ?? "사업자등록증을 읽지 못했습니다.");
        return;
      }
      const data = body as ExtractedCertificate;
      setExtracted(data);
      // 이메일과 담당자는 등록증에 없으므로 입력한 값을 남긴다
      setValues((v) => ({ ...toValues(data), manager_email: v.manager_email, manager_name: v.manager_name }));
    } catch {
      setReadError("사업자등록증을 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setReading(false);
    }
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="space-y-6"
    >
      <section className="card space-y-3">
        <h2 className="section-title">사업자등록증 읽기</h2>
        <p className="text-sm text-muted">
          PDF나 사진을 올리면 칸을 채워 줍니다. 파일은 ERP에 보관하지 않습니다.
          {mode === "live" && " 한 번 읽을 때 볼타 100포인트가 차감됩니다."}
        </p>
        {mode === "test" && <p className="text-sm text-warn">테스트 키에서는 어떤 파일을 올려도 볼타의 고정 예시(주식회사 볼타테스트)가 나옵니다.</p>}
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={reading || mode === "none"}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readCertificate(file);
          }}
          className="block w-full text-sm"
        />
        {reading && <p className="text-sm text-muted">읽는 중입니다. 최대 1분쯤 걸립니다…</p>}
        {readError && <p className="text-sm text-danger">{readError}</p>}
        {extracted && (
          <div className="space-y-1 text-sm">
            <p className={extracted.validation === "MATCHED" ? "text-success" : "text-warn"}>{VALIDATION_TEXT[extracted.validation]}</p>
            {extracted.low_resolution && <p className="text-warn">이미지가 흐립니다. 더 선명한 파일로 다시 올리는 편이 안전합니다.</p>}
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="section-title">거래처 정보</h2>
        <BusinessFieldInputs values={values} onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))} />
        <input type="hidden" name="validation" value={extracted?.validation ?? ""} />
      </section>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? "저장 중…" : "거래처 저장"}
      </button>
    </form>
  );
}
