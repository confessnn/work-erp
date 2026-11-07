import { notFound } from "next/navigation";
import { deleteTaxPartner, saveTaxPartner } from "@/features/tax-invoice/actions";
import { boltaMode } from "@/features/tax-invoice/bolta";
import { PartnerForm } from "@/features/tax-invoice/components/partner-form";
import { getTaxPartner } from "@/features/tax-invoice/queries";

export default async function TaxPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await getTaxPartner(id);
  if (!partner) notFound();

  return (
    <>
      <h1 className="page-title">거래처 수정</h1>
      <PartnerForm action={saveTaxPartner.bind(null, id)} partner={partner} mode={boltaMode()} />
      <form action={deleteTaxPartner.bind(null, id)}>
        <button type="submit" className="text-sm text-danger hover:underline">거래처 삭제 (발행 내역은 남습니다)</button>
      </form>
    </>
  );
}
