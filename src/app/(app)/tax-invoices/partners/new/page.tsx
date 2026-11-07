import { saveTaxPartner } from "@/features/tax-invoice/actions";
import { boltaMode } from "@/features/tax-invoice/bolta";
import { PartnerForm } from "@/features/tax-invoice/components/partner-form";

/** 테스트·실제 키에 따라 안내가 달라지므로 빌드 때 고정하지 않는다 */
export const dynamic = "force-dynamic";

export default function NewTaxPartnerPage() {
  return (
    <>
      <h1 className="page-title">거래처 추가</h1>
      <PartnerForm action={saveTaxPartner.bind(null, null)} mode={boltaMode()} />
    </>
  );
}
