import type { BusinessFields as Business } from "../types";

export type BusinessValues = Record<keyof Business, string>;

export const toValues = (b?: Partial<{ [K in keyof Business]: string | null }> | null): BusinessValues => ({
  identification_number: b?.identification_number ?? "",
  tax_registration_id: b?.tax_registration_id ?? "",
  organization_name: b?.organization_name ?? "",
  representative_name: b?.representative_name ?? "",
  address: b?.address ?? "",
  business_type: b?.business_type ?? "",
  business_item: b?.business_item ?? "",
  manager_email: b?.manager_email ?? "",
  manager_name: b?.manager_name ?? "",
});

const FIELD: { key: keyof Business; label: string; required?: boolean; placeholder?: string; type?: string }[] = [
  { key: "identification_number", label: "사업자등록번호", required: true, placeholder: "000-00-00000" },
  { key: "tax_registration_id", label: "종사업장 번호 (있을 때만)", placeholder: "0001" },
  { key: "organization_name", label: "상호", required: true },
  { key: "representative_name", label: "대표자", required: true },
  { key: "business_type", label: "업태" },
  { key: "business_item", label: "종목" },
  { key: "manager_email", label: "세금계산서 이메일", required: true, type: "email", placeholder: "등록증에 없어서 직접 입력" },
  { key: "manager_name", label: "담당자 이름" },
];

/** 내 사업자 정보와 거래처가 같이 쓰는 입력칸 */
export function BusinessFieldInputs({ values, onChange }: { values: BusinessValues; onChange: (key: keyof Business, value: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {FIELD.map((f) => (
        <label key={f.key} className="field">
          <span>{f.label}{f.required && " *"}</span>
          <input
            name={f.key}
            type={f.type ?? "text"}
            required={f.required}
            value={values[f.key]}
            placeholder={f.placeholder}
            onChange={(e) => onChange(f.key, e.target.value)}
            className="input"
          />
        </label>
      ))}
      <label className="field sm:col-span-2">
        <span>주소</span>
        <input name="address" value={values.address} onChange={(e) => onChange("address", e.target.value)} className="input" />
      </label>
    </div>
  );
}
