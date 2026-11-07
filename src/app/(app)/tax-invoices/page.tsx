import Link from "next/link";
import { boltaMode } from "@/features/tax-invoice/bolta";
import { ProfileForm } from "@/features/tax-invoice/components/profile-form";
import { RefreshButton } from "@/features/tax-invoice/components/refresh-button";
import { PURPOSE_LABEL, REGISTRATION_LABEL } from "@/features/tax-invoice/invoice";
import { getIssuerState, getTaxProfile, listTaxInvoices, listTaxPartners } from "@/features/tax-invoice/queries";
import type { InvoiceStatus } from "@/features/tax-invoice/types";
import { won } from "@/lib/format";

const STATUS: Record<InvoiceStatus, { label: string; className: string }> = {
  sending: { label: "요청 중", className: "badge-unpaid" },
  requested: { label: "처리 중", className: "badge-unpaid" },
  issued: { label: "발행 완료", className: "badge-paid" },
  failed: { label: "실패", className: "bg-danger/10 text-danger" },
  unknown: { label: "확인 필요", className: "badge-unpaid" },
};

export default async function TaxInvoicesPage() {
  const mode = boltaMode();
  const [profile, partners, invoices] = await Promise.all([getTaxProfile(), listTaxPartners(), listTaxInvoices()]);
  const { issuer, error: issuerError } = await getIssuerState(profile);
  const canIssue = mode !== "none" && profile && partners.length > 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">세금계산서</h1>
        {canIssue && <Link href="/tax-invoices/new" className="btn-primary">+ 세금계산서 발행</Link>}
      </div>

      {mode === "none" && <p className="card text-sm text-warn">볼타 API 키(BOLTA_API_KEY)를 등록하면 사용할 수 있습니다.</p>}
      {mode === "test" && <p className="rounded-2xl bg-ochre/30 p-4 text-sm font-medium">테스트 모드입니다. 발행해도 국세청에 전송되지 않습니다.</p>}
      {mode === "live" && <p className="rounded-2xl bg-danger/10 p-4 text-sm font-medium text-danger">실제 발행 모드입니다. 발행하면 국세청에 전송됩니다.</p>}

      <ProfileForm profile={profile} mode={mode} certificate={issuer?.certificate ?? null} issuerError={issuerError} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">거래처</h2>
          <Link href="/tax-invoices/partners/new" className="chip text-sm">+ 거래처 추가</Link>
        </div>
        {partners.length === 0 ? (
          <p className="card text-center text-muted">사업자등록증을 올려 거래처를 추가해 주세요.</p>
        ) : (
          <ul className="space-y-2">
            {partners.map((p) => (
              <li key={p.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/tax-invoices/partners/${p.id}`} className="font-semibold hover:underline">{p.organization_name}</Link>
                  <div className="text-sm text-muted">{p.identification_number} · {p.representative_name} · {p.manager_email}</div>
                </div>
                {p.registration_status && (
                  <span className={`badge ${p.registration_status === "ACTIVE" ? "badge-paid" : "bg-danger/10 text-danger"}`}>
                    {REGISTRATION_LABEL[p.registration_status] ?? p.registration_status}
                  </span>
                )}
                {canIssue && <Link href={`/tax-invoices/new?partner=${p.id}`} className="chip text-sm">발행</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="section-title">발행 내역</h2>
        {invoices.length === 0 ? (
          <p className="card text-center text-muted">아직 발행한 세금계산서가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {invoices.map((i) => (
              <li key={i.id} className="card space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{i.partner_name}</span>
                  <span className={`badge ${STATUS[i.status].className}`}>{STATUS[i.status].label}</span>
                  {i.is_test && <span className="badge bg-ochre/30">테스트</span>}
                  <span className="ml-auto font-semibold tabular-nums">{won(i.supply_cost + i.tax)}</span>
                </div>
                <div className="text-sm text-muted">
                  {i.invoice_date} · {i.item_name} · {PURPOSE_LABEL[i.purpose]} · 공급가액 {won(i.supply_cost)} · 세액 {won(i.tax)}
                </div>
                {i.nts_transaction_id && <div className="text-sm">국세청 승인번호 {i.nts_transaction_id}</div>}
                {i.error && <div className="text-sm text-danger">{i.error}</div>}
                {(i.status === "requested" || i.status === "unknown" || i.status === "sending") && <RefreshButton id={i.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
