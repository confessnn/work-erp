import { redirect } from "next/navigation";
import { boltaMode } from "@/features/tax-invoice/bolta";
import { InvoiceForm } from "@/features/tax-invoice/components/invoice-form";
import { getTaxProfile, listTaxPartners } from "@/features/tax-invoice/queries";
import { todayInSeoul } from "@/lib/format";

export default async function NewTaxInvoicePage({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const mode = boltaMode();
  const [profile, partners, { partner }] = await Promise.all([getTaxProfile(), listTaxPartners(), searchParams]);
  if (mode === "none" || !profile || partners.length === 0) redirect("/tax-invoices");

  return (
    <>
      <h1 className="page-title">세금계산서 발행</h1>
      <InvoiceForm profile={profile} partners={partners} mode={mode} today={todayInSeoul()} initialPartnerId={partner} />
    </>
  );
}
