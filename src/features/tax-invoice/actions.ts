"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { BoltaError, boltaMode, certificateUrl, checkBusinessStatus, findByReference, issueInvoice, listIssuers, registerIssuer, retrieveInvoice } from "./bolta";
import { blockedRecipient, buildIssueRequest, cannotIssue, digitsOnly, isValidBusinessNumber, isValidEmail, validateIssue, type IssueInput } from "./invoice";
import type { BusinessFields, CertificateValidation, TaxPartner, TaxProfile } from "./types";

export type FormState = { error?: string };

const PAGE = "/tax-invoices";
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const text = (fd: FormData, k: string, max: number) => {
  const v = String(fd.get(k) ?? "").trim();
  return v ? v.slice(0, max) : null;
};

/** 폼 입력을 사업자 항목으로 바꾼다. 세금계산서에 꼭 필요한 값을 여기서 막는다 */
function readBusiness(fd: FormData): { fields: BusinessFields } | { error: string } {
  const number = digitsOnly(String(fd.get("identification_number") ?? ""));
  const branch = digitsOnly(String(fd.get("tax_registration_id") ?? "")) || null;
  const organization = text(fd, "organization_name", 70);
  const representative = text(fd, "representative_name", 30);
  const email = text(fd, "manager_email", 40);

  if (!isValidBusinessNumber(number)) return { error: "사업자등록번호를 확인해 주세요. (10자리, 끝자리 검증 실패)" };
  if (branch && (!/^\d{4}$/.test(branch) || branch === "0000")) return { error: "종사업장 번호는 4자리로 넣어 주세요." };
  if (!organization) return { error: "상호를 넣어 주세요." };
  if (!representative) return { error: "대표자를 넣어 주세요." };
  if (!email || !isValidEmail(email)) return { error: "세금계산서를 받을 이메일을 확인해 주세요. (40자 이내)" };

  return {
    fields: {
      identification_number: number,
      tax_registration_id: branch,
      organization_name: organization,
      representative_name: representative,
      address: text(fd, "address", 150),
      business_type: text(fd, "business_type", 100),
      business_item: text(fd, "business_item", 100),
      manager_email: email,
      manager_name: text(fd, "manager_name", 30),
    },
  };
}

/** 상태 조회는 참고용이라 실패해도 저장을 막지 않는다. 테스트 키는 정해진 번호만 조회된다 */
async function statusOrNull(number: string) {
  try {
    return await checkBusinessStatus(number);
  } catch {
    return null;
  }
}

export async function saveTaxProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await requireUser();
  const read = readBusiness(fd);
  if ("error" in read) return { error: read.error };

  const status = boltaMode() === "none" ? null : await statusOrNull(read.fields.identification_number);
  const { error } = await supabase.from("tax_profiles").upsert({
    ...read.fields,
    user_id: userId,
    taxation_type: status?.taxationType ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath(PAGE);
  return {};
}

export async function saveTaxPartner(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await requireUser();
  const read = readBusiness(fd);
  if ("error" in read) return { error: read.error };

  const validation = String(fd.get("validation") ?? "");
  const status = boltaMode() === "none" ? null : await statusOrNull(read.fields.identification_number);
  const row = {
    ...read.fields,
    registration_status: status?.registrationStatus ?? null,
    taxation_type: status?.taxationType ?? null,
    status_checked_at: status ? new Date().toISOString() : null,
    ...(["MATCHED", "NOT_MATCHED", "UNAVAILABLE"].includes(validation) ? { validation: validation as CertificateValidation } : {}),
  };
  const { error } = id
    ? await supabase.from("tax_partners").update(row).eq("id", id)
    : await supabase.from("tax_partners").insert({ ...row, user_id: userId });
  if (error) return { error: error.code === "23505" ? "이미 등록된 거래처입니다." : `저장 실패: ${error.message}` };
  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function deleteTaxPartner(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("tax_partners").delete().eq("id", id);
  revalidatePath(PAGE);
  redirect(PAGE);
}

/** 내 사업자를 볼타 발급자로 등록하고 공동인증서 등록 주소를 돌려준다 (5분간 유효) */
export async function openCertificateRegistration(): Promise<{ url?: string; error?: string }> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("tax_profiles").select("*").maybeSingle();
  const profile = data as TaxProfile | null;
  if (!profile) return { error: "내 사업자 정보를 먼저 저장해 주세요." };

  try {
    const issuers = await listIssuers();
    const issuer =
      issuers.find((i) => i.identificationNumber === profile.identification_number) ??
      (await registerIssuer({
        identificationNumber: profile.identification_number,
        taxRegistrationId: profile.tax_registration_id,
        organizationName: profile.organization_name,
        representativeName: profile.representative_name,
      }));
    const { url } = await certificateUrl(issuer.issuerId);
    revalidatePath(PAGE);
    return { url };
  } catch (e) {
    return { error: message(e, "인증서 등록 주소를 받지 못했습니다.") };
  }
}

/**
 * 세금계산서 발행. 실제 키에서는 국세청에 전송되므로 확인 화면을 거친 뒤에만 부른다.
 * 응답을 받지 못하면 다시 보내지 않고 '확인 필요'로 남긴다. 두 번 발행되는 일을 막기 위해서다.
 */
export async function issueTaxInvoice(partnerId: string, input: IssueInput): Promise<FormState> {
  const { supabase, userId } = await requireUser();
  const mode = boltaMode();
  if (mode === "none") return { error: "BOLTA_API_KEY가 설정되지 않았습니다." };

  const invalid = validateIssue(input);
  if (invalid) return { error: invalid };

  const [{ data: profileRow }, { data: partnerRow }] = await Promise.all([
    supabase.from("tax_profiles").select("*").maybeSingle(),
    supabase.from("tax_partners").select("*").eq("id", partnerId).maybeSingle(),
  ]);
  const profile = profileRow as TaxProfile | null;
  const partner = partnerRow as TaxPartner | null;
  if (!profile) return { error: "내 사업자 정보를 먼저 저장해 주세요." };
  if (!partner) return { error: "거래처를 찾지 못했습니다." };
  if (cannotIssue(profile.taxation_type)) return { error: "내 과세 유형으로는 세금계산서를 발행할 수 없습니다." };
  if (blockedRecipient(partner.registration_status)) return { error: "폐업했거나 등록되지 않은 거래처입니다. 사업자 상태를 확인해 주세요." };

  const request = buildIssueRequest(profile, partner, input);
  const { data: invoice, error } = await supabase
    .from("tax_invoices")
    .insert({
      user_id: userId,
      partner_id: partner.id,
      is_test: mode === "test",
      invoice_date: input.date,
      purpose: input.purpose,
      item_name: input.itemName.trim(),
      partner_name: partner.organization_name,
      supply_cost: input.supplyCost,
      tax: input.tax,
      request,
    })
    .select("id")
    .single();
  if (error) return { error: `저장 실패: ${error.message}` };

  let failure: string | null = null;
  try {
    const { issuanceKey } = await issueInvoice(request, invoice.id);
    await supabase.from("tax_invoices").update({ status: "requested", issuance_key: issuanceKey }).eq("id", invoice.id);
  } catch (e) {
    const reason = message(e, "발행 요청 실패");
    // 4xx 는 볼타가 거절한 것이고, 그 밖에는 접수 여부를 알 수 없다
    const rejected = e instanceof BoltaError && e.status !== null && e.status >= 400 && e.status < 500;
    await supabase.from("tax_invoices").update({ status: rejected ? "failed" : "unknown", error: reason }).eq("id", invoice.id);
    failure = rejected ? reason : `${reason} 접수됐을 수 있으니 다시 발행하지 말고 목록에서 '결과 확인'을 눌러 주세요.`;
  }
  revalidatePath(PAGE);
  if (failure) return { error: failure };
  redirect(PAGE);
}

/** 발행 결과 확인. 발행이 끝난 세금계산서만 조회되므로 조회 실패는 아직 처리 중으로 본다 */
export async function refreshTaxInvoice(id: string): Promise<FormState> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("tax_invoices").select("status, issuance_key").eq("id", id).single();
  if (!data) return { error: "발행 내역을 찾지 못했습니다." };

  let key = data.issuance_key as string | null;
  if (!key) {
    try {
      key = (await findByReference(id)).issuanceKey;
      await supabase.from("tax_invoices").update({ status: "requested", issuance_key: key, error: null }).eq("id", id);
    } catch (e) {
      if (e instanceof BoltaError && e.status === 400) {
        await supabase.from("tax_invoices").update({ status: "failed", error: "볼타에 접수되지 않은 요청입니다." }).eq("id", id);
        revalidatePath(PAGE);
        return {};
      }
      return { error: message(e, "결과를 확인하지 못했습니다.") };
    }
  }

  try {
    const r = await retrieveInvoice(key);
    await supabase
      .from("tax_invoices")
      .update({ status: "issued", nts_transaction_id: r.ntsTransactionId, issued_at: r.issuedAt, error: null })
      .eq("id", id);
    revalidatePath(PAGE);
    return {};
  } catch (e) {
    revalidatePath(PAGE);
    if (e instanceof BoltaError && e.status === 401) return { error: e.message };
    return { error: "아직 발행 완료가 확인되지 않았습니다. 잠시 뒤 다시 눌러 주세요." };
  }
}
