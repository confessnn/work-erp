"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { openCertificateRegistration, saveTaxProfile } from "../actions";
import { TAXATION_LABEL, cannotIssue } from "../invoice";
import type { BoltaMode, TaxProfile } from "../types";
import { BusinessFieldInputs, toValues } from "./business-fields";

/**
 * 볼타 테스트 환경의 가상 사업자. 실제 사업자가 아니다.
 * 등록증 읽기의 고정 결과(1000000014)와 겹치지 않고 세금계산서를 낼 수 있는 번호를 쓴다.
 */
const TEST_BUSINESS = {
  identification_number: "1000000106",
  organization_name: "테스트 청소",
  representative_name: "테스트",
  address: "서울특별시 테스트구 가상로 2",
};

type Props = {
  profile: TaxProfile | null;
  mode: BoltaMode;
  certificate: { expiresAt: string } | null;
  issuerError: string | null;
};

export function ProfileForm({ profile, mode, certificate, issuerError }: Props) {
  const [state, formAction, pending] = useActionState(saveTaxProfile, {});
  const [values, setValues] = useState(toValues(profile));
  const [opening, startOpening] = useTransition();
  const [certError, setCertError] = useState<string | null>(null);

  function openCertificate() {
    // 비동기 뒤에 새 창을 열면 차단되므로 먼저 열어 둔다
    const win = window.open("", "_blank");
    startOpening(async () => {
      const r = await openCertificateRegistration();
      if (r.url && win) {
        win.location.href = r.url;
        setCertError(null);
      } else {
        win?.close();
        setCertError(r.error ?? "인증서 등록 화면을 열지 못했습니다.");
      }
    });
  }

  return (
    <details className="card" open={!profile}>
      <summary className="section-title cursor-pointer">
        내 사업자 정보 {profile ? `· ${profile.organization_name}` : "(먼저 입력해 주세요)"}
      </summary>
      <form
        action={formAction}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}
        className="mt-4 space-y-4"
      >
        {mode === "test" && (
          <button type="button" className="chip text-sm" onClick={() => setValues((v) => ({ ...v, ...TEST_BUSINESS }))}>
            테스트용 가상 사업자 넣기
          </button>
        )}
        <BusinessFieldInputs values={values} onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))} />
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className="btn-primary">{pending ? "저장 중…" : "저장"}</button>
      </form>

      {profile && (
        <div className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
          {profile.taxation_type && (
            <p className={cannotIssue(profile.taxation_type) ? "font-semibold text-danger" : "text-muted"}>
              과세 유형: {TAXATION_LABEL[profile.taxation_type] ?? profile.taxation_type}
            </p>
          )}
          {issuerError && <p className="text-danger">{issuerError}</p>}
          {mode !== "none" && (
            <div className="flex flex-wrap items-center gap-3">
              <span className={certificate ? "text-success" : "text-warn"}>
                공동인증서: {certificate ? `등록됨 (${certificate.expiresAt.slice(0, 10)}까지)` : "등록 전"}
              </span>
              <button type="button" disabled={opening} onClick={openCertificate} className="chip">
                {opening ? "여는 중…" : certificate ? "인증서 다시 등록" : "인증서 등록하기"}
              </button>
            </div>
          )}
          {certError && <p className="text-danger">{certError}</p>}
          {mode === "test" && <p className="text-muted">테스트 화면에서는 실제 인증서 없이 결과 코드만 골라 제출할 수 있습니다. 등록 뒤 이 페이지를 새로고침해 주세요.</p>}
        </div>
      )}
    </details>
  );
}
