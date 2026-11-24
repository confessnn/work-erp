/**
 * 사용자가 준 주소를 서버가 읽을 때 쓰는 안전한 GET (링크 미리보기, iCal 가져오기).
 * - 접속 직전 DNS 조회 결과를 검사하고 '그 IP로만' 접속한다 → 검사 뒤 DNS 를 바꿔치기하는 공격(DNS rebinding)도 막힘
 * - 넘겨주기(redirect)는 직접 따라가며 매번 다시 검사 (http(s) 외 주소·내부망으로 넘겨주면 거절)
 * - 압축을 푼 뒤 크기로 자른다 (압축 폭탄 방지), 전체 시간 제한
 * Node 내장 모듈만 쓰므로 서버에서만 동작한다 (테스트가 이 파일을 불러오는 모듈을 읽어서 server-only 는 붙이지 않음).
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import { isPrivateAddress } from "./net-guard";

export type SafeFetchReason = "protocol" | "blocked" | "dns" | "redirects" | "too_large" | "timeout" | "network";

const MESSAGES: Record<SafeFetchReason, string> = {
  protocol: "http(s) 주소가 아니에요",
  blocked: "읽을 수 없는 주소예요",
  dns: "사이트 주소를 찾을 수 없어요",
  redirects: "넘겨주기가 너무 많아요",
  too_large: "파일이 너무 커요",
  timeout: "시간 안에 응답하지 않아요",
  network: "사이트에 연결하지 못했어요",
};

export class SafeFetchError extends Error {
  constructor(public reason: SafeFetchReason) {
    super(MESSAGES[reason]);
    this.name = "SafeFetchError";
  }
}

export type SafeResponse = {
  status: number;
  url: string;
  contentType: string;
  body: Buffer;
  /** maxBytes 에서 잘렸으면 true (tooLarge: "truncate" 일 때만) */
  truncated: boolean;
};

export type SafeFetchOptions = {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  protocols?: ("http:" | "https:")[];
  /** 크기를 넘으면 앞부분만(truncate) 또는 실패(error) */
  tooLarge?: "truncate" | "error";
  /** 본문을 읽을지 (예: html 만). false 면 본문 없이 상태·종류만 돌려준다 */
  readBody?: (status: number, contentType: string) => boolean;
};

const BLOCKED = "ERP_BLOCKED_ADDRESS";

/** 접속에 쓸 IP 를 직접 조회·검사해서 넘긴다. 검사를 통과한 IP 로만 연결된다 */
const guardedLookup = ((hostname: string, options: { family?: number | string; all?: boolean }, callback: (...args: unknown[]) => void) => {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return callback(err);
    const fam = options.family === 4 || options.family === "IPv4" ? 4 : options.family === 6 || options.family === "IPv6" ? 6 : 0;
    const list = addrs.filter((a) => !fam || a.family === fam);
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error("blocked address"), { code: BLOCKED }));
    }
    if (options.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}) as unknown as net.LookupFunction;

function toReason(e: unknown, signal: AbortSignal): SafeFetchReason {
  if (e instanceof SafeFetchError) return e.reason;
  if (signal.aborted) return "timeout";
  const code = (e as { code?: string } | null)?.code;
  if (code === BLOCKED) return "blocked";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") return "dns";
  return "network";
}

function decoded(res: http.IncomingMessage): Readable {
  const enc = String(res.headers["content-encoding"] ?? "").toLowerCase().trim();
  if (enc === "gzip" || enc === "x-gzip") return res.pipe(zlib.createGunzip());
  if (enc === "deflate") return res.pipe(zlib.createInflate());
  if (enc === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

function getOnce(url: URL, headers: Record<string, string>, signal: AbortSignal): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, {
      method: "GET",
      headers: { "accept-encoding": "gzip, deflate, br", ...headers },
      lookup: guardedLookup,
      agent: false,
      signal,
    });
    req.on("response", resolve);
    req.on("error", reject);
    req.end();
  });
}

async function readLimited(stream: Readable, maxBytes: number, tooLarge: "truncate" | "error") {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  try {
    for await (const chunk of stream) {
      const buf = chunk as Buffer;
      chunks.push(buf);
      size += buf.length;
      if (size > maxBytes) {
        if (tooLarge === "error") throw new SafeFetchError("too_large");
        truncated = true;
        break;
      }
    }
  } finally {
    stream.destroy();
  }
  return { body: Buffer.concat(chunks).subarray(0, maxBytes), truncated };
}

export async function safeFetch(input: string, opts: SafeFetchOptions): Promise<SafeResponse> {
  const protocols = opts.protocols ?? ["http:", "https:"];
  const maxRedirects = opts.maxRedirects ?? 4;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 10_000);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SafeFetchError("protocol");
  }

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (!protocols.includes(url.protocol as "http:" | "https:")) throw new SafeFetchError("protocol");
      if (url.username || url.password) throw new SafeFetchError("blocked");
      // IP 를 바로 적은 주소는 DNS 조회를 건너뛰므로 여기서 검사
      const host = url.hostname.replace(/^\[|\]$/g, "");
      if (net.isIP(host) && isPrivateAddress(host)) throw new SafeFetchError("blocked");

      const res = await getOnce(url, opts.headers ?? {}, signal);
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        url = new URL(location, url);
        continue;
      }
      const contentType = String(res.headers["content-type"] ?? "");
      if (opts.readBody && !opts.readBody(status, contentType)) {
        res.destroy();
        return { status, url: url.toString(), contentType, body: Buffer.alloc(0), truncated: false };
      }
      const { body, truncated } = await readLimited(decoded(res), opts.maxBytes, opts.tooLarge ?? "truncate");
      return { status, url: url.toString(), contentType, body, truncated };
    }
    throw new SafeFetchError("redirects");
  } catch (e) {
    throw new SafeFetchError(toReason(e, signal));
  }
}
