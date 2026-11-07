import "server-only";
import type { BoltaMode, CertificateValidation, ExtractedCertificate } from "./types";

const BASE = "https://xapi.bolta.io/v1";

/** status 가 null 이면 볼타가 요청을 받았는지 알 수 없다 (연결 실패·시간 초과) */
export class BoltaError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

/** 키의 앞부분으로 환경을 나눈다. test_ 는 국세청에 전송되지 않고, live_ 는 실제로 발행된다 */
export function boltaMode(): BoltaMode {
  const key = process.env.BOLTA_API_KEY;
  if (!key) return "none";
  return key.startsWith("live_") ? "live" : "test";
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const key = process.env.BOLTA_API_KEY;
  if (!key) throw new BoltaError("BOLTA_API_KEY가 설정되지 않았습니다.", 0);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, ...init.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new BoltaError("볼타 서버에 연결하지 못했습니다.", null);
  }
  if (res.ok) return (await res.json()) as T;

  if (res.status === 401) throw new BoltaError("볼타 API 키를 확인해 주세요.", 401);
  const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (res.status === 402) throw new BoltaError("볼타 포인트가 부족합니다. 개발자센터에서 충전해 주세요.", 402);
  throw new BoltaError(body?.message ?? `볼타 요청 실패 (HTTP ${res.status})`, res.status);
}

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** 사업자등록증을 읽고 국세청 진위확인까지 한다. 실제 키에서는 건당 100포인트 */
export async function extractCertificate(file: File): Promise<ExtractedCertificate> {
  const form = new FormData();
  form.append("file", file);
  const r = await call<{
    certificate: {
      businessRegistrationNumber: string;
      organizationName: string | null;
      representativeNames: string[];
      address: string | null;
      industries: { businessType: string | null; businessItem: string | null }[];
      taxRegistrationId: string | null;
    };
    inputQuality: "SUFFICIENT" | "LOW_RESOLUTION";
    validation: CertificateValidation;
  }>("/businessRegistrationCertificates:extract", { method: "POST", body: form }, 60_000);

  const c = r.certificate;
  return {
    identification_number: c.businessRegistrationNumber,
    tax_registration_id: c.taxRegistrationId,
    organization_name: c.organizationName,
    representative_name: c.representativeNames[0] ?? null,
    address: c.address,
    business_type: c.industries[0]?.businessType ?? null,
    business_item: c.industries[0]?.businessItem ?? null,
    validation: r.validation,
    low_resolution: r.inputQuality === "LOW_RESOLUTION",
  };
}

/** 사업자 등록 상태와 과세 유형. 실제 키에서는 건당 10포인트 */
export async function checkBusinessStatus(number: string) {
  const r = await call<{ registration: { status: string }; taxation: { type: string } | null }>(
    "/businessRegistrationStatuses:check",
    json({ businessRegistrationNumber: number }),
  );
  return { registrationStatus: r.registration.status, taxationType: r.taxation?.type ?? null };
}

export type Issuer = {
  issuerId: string;
  identificationNumber: string;
  certificate: { issuedAt: string; expiresAt: string } | null;
};

export const listIssuers = () => call<Issuer[]>("/issuers");

export const registerIssuer = (b: { identificationNumber: string; taxRegistrationId: string | null; organizationName: string; representativeName: string }) =>
  call<Issuer>("/issuers", json(b));

/** 공동인증서 등록 주소. 5분간 유효 */
export const certificateUrl = (issuerId: string) => call<{ url: string }>(`/issuers/${encodeURIComponent(issuerId)}/certificates/url`);

/** 발행 요청. referenceId 는 키마다 한 번만 쓸 수 있어 같은 요청이 두 번 발행되지 않는다 */
export const issueInvoice = (body: unknown, referenceId: string) => {
  const request = json(body);
  return call<{ issuanceKey: string }>(
    "/taxInvoices/issue",
    { ...request, headers: { ...request.headers, "Bolta-Client-Reference-Id": referenceId } },
    30_000,
  );
};

/** 발행이 끝난 세금계산서만 조회된다 */
export const retrieveInvoice = (issuanceKey: string) =>
  call<{ ntsTransactionId: string; issuedAt: string }>(`/taxInvoices/${encodeURIComponent(issuanceKey)}`);

/** 응답을 받지 못한 요청이 접수됐는지 요청 번호로 찾는다 */
export const findByReference = (referenceId: string) =>
  call<{ issuanceKey: string; message: string }>(`/taxInvoices/issue/status?clientReferenceId=${encodeURIComponent(referenceId)}`);
