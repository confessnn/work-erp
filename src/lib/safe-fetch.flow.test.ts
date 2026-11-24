import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// 이 파일에서만 내부망 판별을 꺼서, 내 컴퓨터에 띄운 서버로 넘겨주기·압축·크기 제한 흐름을 확인한다
vi.mock("./net-guard", () => ({ isPrivateAddress: (ip: string) => ip === "10.0.0.1" }));
const { safeFetch } = await import("./safe-fetch");

let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/hop") return res.writeHead(302, { location: "/page" }).end();
    if (req.url === "/loop") return res.writeHead(302, { location: "/loop" }).end();
    if (req.url === "/to-internal") return res.writeHead(302, { location: "http://10.0.0.1/" }).end();
    if (req.url === "/to-file") return res.writeHead(302, { location: "file:///etc/passwd" }).end();
    if (req.url === "/page") return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<title>안녕</title>");
    if (req.url === "/gzip") {
      res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
      return res.end(zlib.gzipSync("a".repeat(5000)));
    }
    if (req.url === "/pdf") return res.writeHead(200, { "content-type": "application/pdf" }).end("x".repeat(100));
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

const reasonOf = (p: Promise<unknown>) => p.then(() => "fetched", (e: { reason?: string }) => e.reason);

describe("safeFetch 흐름", () => {
  it("넘겨주기를 따라가 최종 주소와 본문을 돌려줌", async () => {
    const r = await safeFetch(`${base}/hop`, { maxBytes: 10_000 });
    expect(r.status).toBe(200);
    expect(r.url).toBe(`${base}/page`);
    expect(r.body.toString("utf8")).toBe("<title>안녕</title>");
  });

  it("넘겨준 곳이 내부망이거나 http(s) 가 아니면 거절, 무한 넘겨주기도 멈춤", async () => {
    expect(await reasonOf(safeFetch(`${base}/to-internal`, { maxBytes: 100 }))).toBe("blocked");
    expect(await reasonOf(safeFetch(`${base}/to-file`, { maxBytes: 100 }))).toBe("protocol");
    expect(await reasonOf(safeFetch(`${base}/loop`, { maxBytes: 100, maxRedirects: 3 }))).toBe("redirects");
  });

  it("압축을 풀고 나서 크기로 자르거나 실패", async () => {
    const cut = await safeFetch(`${base}/gzip`, { maxBytes: 1000 });
    expect(cut.body.length).toBe(1000);
    expect(cut.truncated).toBe(true);
    expect(await reasonOf(safeFetch(`${base}/gzip`, { maxBytes: 1000, tooLarge: "error" }))).toBe("too_large");
    const full = await safeFetch(`${base}/gzip`, { maxBytes: 10_000 });
    expect(full.body.toString()).toBe("a".repeat(5000));
  });

  it("readBody 가 false 면 본문 없이 종류만", async () => {
    const r = await safeFetch(`${base}/pdf`, { maxBytes: 1000, readBody: (_s, t) => t.includes("html") });
    expect(r.contentType).toBe("application/pdf");
    expect(r.body.length).toBe(0);
  });
});
