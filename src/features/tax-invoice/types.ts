export type BoltaMode = "none" | "test" | "live";
export type InvoicePurpose = "RECEIPT" | "CLAIM";
export type InvoiceStatus = "sending" | "requested" | "issued" | "failed" | "unknown";
export type CertificateValidation = "MATCHED" | "NOT_MATCHED" | "UNAVAILABLE";

/** 공급자·공급받는자 공통 항목 */
export type BusinessFields = {
  identification_number: string;
  tax_registration_id: string | null;
  organization_name: string;
  representative_name: string;
  address: string | null;
  business_type: string | null;
  business_item: string | null;
  manager_email: string;
  manager_name: string | null;
};

export type TaxProfile = BusinessFields & { taxation_type: string | null };

export type TaxPartner = BusinessFields & {
  id: string;
  validation: CertificateValidation | null;
  registration_status: string | null;
  taxation_type: string | null;
};

export type TaxInvoice = {
  id: string;
  is_test: boolean;
  invoice_date: string;
  purpose: InvoicePurpose;
  item_name: string;
  partner_name: string;
  supply_cost: number;
  tax: number;
  status: InvoiceStatus;
  nts_transaction_id: string | null;
  error: string | null;
};

/** 사업자등록증에서 읽은 내용. 저장 전에 사용자가 확인한다 */
export type ExtractedCertificate = {
  identification_number: string;
  tax_registration_id: string | null;
  organization_name: string | null;
  representative_name: string | null;
  address: string | null;
  business_type: string | null;
  business_item: string | null;
  validation: CertificateValidation;
  low_resolution: boolean;
};
