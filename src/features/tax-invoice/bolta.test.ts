import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BoltaError, boltaMode, checkBusinessStatus, extractCertificate, issueInvoice } from "./bolta";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("BOLTA_API_KEY", "test_key");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("boltaMode", () => {
  it("키의 앞부분으로 환경을 나눈다", () => {
    expect(boltaMode()).toBe("test");
    vi.stubEnv("BOLTA_API_KEY", "live_key");
    expect(boltaMode()).toBe("live");
    vi.stubEnv("BOLTA_API_KEY", "");
    expect(boltaMode()).toBe("none");
  });
});

describe("issueInvoice", () => {
  it("Basic 인증과 요청 번호를 보낸다", async () => {
    fetchMock.mockResolvedValue(reply(200, { issuanceKey: "K" }));
    await expect(issueInvoice({ a: 1 }, "ref-1")).resolves.toEqual({ issuanceKey: "K" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://xapi.bolta.io/v1/taxInvoices/issue");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("test_key:").toString("base64")}`);
    expect(init.headers["Bolta-Client-Reference-Id"]).toBe("ref-1");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
  });

  it("거절되면 볼타의 이유와 상태 코드를 전한다", async () => {
    fetchMock.mockResolvedValue(reply(400, { code: "INVALID_REQUEST", message: "발행 기한이 지났습니다." }));
    const error = await issueInvoice({}, "r").catch((e) => e);
    expect(error).toBeInstanceOf(BoltaError);
    expect(error.status).toBe(400);
    expect(error.message).toBe("발행 기한이 지났습니다.");
  });

  it("연결이 끊기면 접수 여부를 모르는 오류로 구분한다", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    const error = await issueInvoice({}, "r").catch((e) => e);
    expect(error).toBeInstanceOf(BoltaError);
    expect(error.status).toBeNull();
  });

  it("다시 보내지 않는다", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    await issueInvoice({}, "r").catch(() => null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("키가 없으면 요청하지 않는다", async () => {
    vi.stubEnv("BOLTA_API_KEY", "");
    await expect(issueInvoice({}, "r")).rejects.toThrow("BOLTA_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("extractCertificate", () => {
  it("첫 대표자와 첫 업태로 칸을 채운다", async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        certificate: {
          businessRegistrationNumber: "1000000014",
          organizationName: "(주)볼타테스트",
          representativeNames: ["김볼타", "이볼타"],
          openedOn: "2020-01-01",
          address: "서울",
          industries: [{ businessType: "서비스", businessItem: "청소" }, { businessType: "도소매", businessItem: "용품" }],
          corporationRegistrationNumber: null,
          taxRegistrationId: null,
        },
        inputQuality: "LOW_RESOLUTION",
        validation: "MATCHED",
      }),
    );
    const result = await extractCertificate(new File(["x"], "a.pdf", { type: "application/pdf" }));
    expect(result).toMatchObject({
      identification_number: "1000000014",
      representative_name: "김볼타",
      business_type: "서비스",
      business_item: "청소",
      validation: "MATCHED",
      low_resolution: true,
    });
    expect(fetchMock.mock.calls[0][1].body).toBeInstanceOf(FormData);
    expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();
  });
});

describe("checkBusinessStatus", () => {
  it("상태와 과세 유형을 읽는다", async () => {
    fetchMock.mockResolvedValue(reply(200, { registration: { status: "ACTIVE", closedOn: null }, taxation: { type: "GENERAL", changedOn: null } }));
    await expect(checkBusinessStatus("1000000014")).resolves.toEqual({ registrationStatus: "ACTIVE", taxationType: "GENERAL" });
  });
  it("과세 유형이 없어도 된다", async () => {
    fetchMock.mockResolvedValue(reply(200, { registration: { status: "NOT_REGISTERED", closedOn: null }, taxation: null }));
    await expect(checkBusinessStatus("1000000085")).resolves.toEqual({ registrationStatus: "NOT_REGISTERED", taxationType: null });
  });
});
