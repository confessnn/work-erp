import type { BusinessFields, InvoicePurpose } from "./types";

export const PURPOSE_LABEL: Record<InvoicePurpose, string> = { CLAIM: "청구", RECEIPT: "영수" };

export const REGISTRATION_LABEL: Record<string, string> = {
  ACTIVE: "계속사업자",
  SUSPENDED: "휴업",
  CLOSED: "폐업",
  NOT_REGISTERED: "미등록",
  UNKNOWN: "확인 불가",
};

export const TAXATION_LABEL: Record<string, string> = {
  GENERAL: "일반과세자",
  SIMPLIFIED_RECEIPT_ISSUER: "간이과세자 (세금계산서 발행 불가)",
  SIMPLIFIED_TAX_INVOICE_ISSUER: "간이과세자 (세금계산서 발행 가능)",
  SPECIAL_TAXPAYER: "특례",
  TAX_FREE: "면세사업자",
  NONPROFIT: "비영리",
  UNIQUE_NUMBER_ORGANIZATION: "고유번호 단체",
};

/** 세금계산서를 낼 수 없는 내 과세 유형 */
export const cannotIssue = (taxationType: string | null) =>
  taxationType === "SIMPLIFIED_RECEIPT_ISSUER" || taxationType === "TAX_FREE";

/** 받는 쪽으로 쓸 수 없는 등록 상태 */
export const blockedRecipient = (status: string | null) => status === "CLOSED" || status === "NOT_REGISTERED";

export const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** 사업자등록번호 끝자리 검증 */
export function isValidBusinessNumber(value: string) {
  if (!/^\d{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((acc, w, i) => acc + w * d[i], 0) + Math.floor((d[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9];
}

export const isValidEmail = (value: string) => value.length <= 40 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** 세액: 공급가액의 10%, 원 미만 버림. 거래처와 금액이 다르면 화면에서 고칠 수 있다 */
export const taxFromSupply = (supplyCost: number) => Math.floor(supplyCost / 10);

export type IssueInput = {
  date: string;
  purpose: InvoicePurpose;
  itemName: string;
  supplyCost: number;
  tax: number;
};

/** 발행 전 검사. 문제가 없으면 null */
export function validateIssue(input: IssueInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "작성일자를 넣어 주세요.";
  if (!input.itemName.trim()) return "품목을 넣어 주세요.";
  if (input.itemName.trim().length > 100) return "품목은 100자까지 쓸 수 있습니다.";
  if (!Number.isInteger(input.supplyCost) || input.supplyCost < 1) return "공급가액은 1원 이상의 정수로 넣어 주세요.";
  if (!Number.isInteger(input.tax) || input.tax < 0) return "세액은 0원 이상의 정수로 넣어 주세요.";
  return null;
}

const party = (b: BusinessFields) => ({
  identificationNumber: b.identification_number,
  taxRegistrationId: b.tax_registration_id,
  organizationName: b.organization_name,
  representativeName: b.representative_name,
  address: b.address,
  businessItem: b.business_item,
  businessType: b.business_type,
});

const manager = (b: BusinessFields) => ({ email: b.manager_email, name: b.manager_name });

/** 볼타 정발행 요청 본문 (과세, 품목 1개) */
export function buildIssueRequest(profile: BusinessFields, partner: BusinessFields, input: IssueInput) {
  return {
    date: input.date,
    purpose: input.purpose,
    taxType: "TAXABLE",
    supplier: { ...party(profile), manager: manager(profile) },
    supplied: { ...party(partner), managers: [manager(partner)] },
    items: [{ date: input.date, name: input.itemName.trim(), supplyCost: input.supplyCost, tax: input.tax }],
  };
}
