import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { safeFetch } from "./safe-fetch";

// 내 컴퓨터에 서버를 띄우고, 어떤 표기로 불러도 서버가 닿지 않는지 본다
let server: http.Server;
let port = 0;
let hits = 0;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    hits++;
    res.end("secret");
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

const reasonOf = (url: string, protocols?: ("http:" | "https:")[]) =>
  safeFetch(url, { maxBytes: 1000, timeoutMs: 3000, protocols }).then(
    () => "fetched",
    (e: { reason?: string }) => e.reason,
  );

describe("safeFetch", () => {
  it("내 컴퓨터·내부망 주소는 어떤 표기로도 접속하지 않음", async () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]", "[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "0.0.0.0", "169.254.169.254"]) {
      expect(await reasonOf(`http://${host}:${port}/`), host).toBe("blocked");
    }
    expect(hits).toBe(0);
  });

  it("http(s) 가 아니거나 허용하지 않은 방식이면 거절", async () => {
    expect(await reasonOf("file:///etc/passwd")).toBe("protocol");
    expect(await reasonOf("ftp://example.com/")).toBe("protocol");
    expect(await reasonOf("http://example.com/", ["https:"])).toBe("protocol");
    expect(await reasonOf("not a url")).toBe("protocol");
  });

  it("주소에 아이디·비밀번호를 넣으면 거절", async () => {
    expect(await reasonOf("https://user:pw@example.com/")).toBe("blocked");
  });
});
