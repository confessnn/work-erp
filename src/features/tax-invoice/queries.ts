import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { BoltaError, boltaMode, listIssuers, type Issuer } from "./bolta";
import type { TaxInvoice, TaxPartner, TaxProfile } from "./types";

export async function getTaxProfile() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("tax_profiles").select("*").maybeSingle();
  return data as TaxProfile | null;
}

export async function listTaxPartners() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("tax_partners").select("*").order("organization_name");
  return (data ?? []) as TaxPartner[];
}

export async function getTaxPartner(id: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("tax_partners").select("*").eq("id", id).maybeSingle();
  return data as TaxPartner | null;
}

export async function listTaxInvoices() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("tax_invoices")
    .select("id, is_test, invoice_date, purpose, item_name, partner_name, supply_cost, tax, status, nts_transaction_id, error")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as TaxInvoice[];
}

/** 내 사업자가 볼타 발급자로 등록됐는지, 인증서가 있는지. 조회 실패는 화면에 이유를 보여 준다 */
export async function getIssuerState(profile: TaxProfile | null): Promise<{ issuer: Issuer | null; error: string | null }> {
  if (!profile || boltaMode() === "none") return { issuer: null, error: null };
  try {
    const issuers = await listIssuers();
    return { issuer: issuers.find((i) => i.identificationNumber === profile.identification_number) ?? null, error: null };
  } catch (e) {
    return { issuer: null, error: e instanceof BoltaError ? e.message : "발급자 정보를 읽지 못했습니다." };
  }
}
