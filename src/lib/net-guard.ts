/**
 * 서버가 사용자가 준 주소를 읽을 때(링크 미리보기, iCal 가져오기 등) 접속하면 안 되는 IP 판별.
 * 내 컴퓨터·내부망·클라우드 메타데이터(169.254.169.254)·멀티캐스트, 그리고 IPv4 를 품은 IPv6 표기까지 본다.
 */

function privateV4(parts: number[]): boolean {
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // 192.0.0.0/24 (IETF), 192.0.2.0/24 (문서용)
    (a === 198 && (b === 18 || b === 19))
  );
}

function parseV4(s: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return null;
  const p = s.split(".").map(Number);
  return p.every((n) => n <= 255) ? p : null;
}

/** IPv6 → 16비트 8칸. 끝에 IPv4 표기(::ffff:1.2.3.4)도 받는다. 못 읽으면 null */
function parseV6(s: string): number[] | null {
  let x = s.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(x);
  if (tail) {
    const v4 = parseV4(tail[1]);
    if (!v4) return null;
    x = x.slice(0, -tail[1].length) + ((v4[0] << 8) | v4[1]).toString(16) + ":" + ((v4[2] << 8) | v4[3]).toString(16);
  }
  const halves = x.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...rest];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

const v4From = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];

/** 접속하면 안 되는 주소면 true. 읽을 수 없는 값도 안전하게 true */
export function isPrivateAddress(ip: string): boolean {
  const v4 = parseV4(ip);
  if (v4) return privateV4(v4);
  const g = parseV6(ip);
  if (!g) return true;
  const zeros = (n: number) => g.slice(0, n).every((v) => v === 0);

  if (zeros(8)) return true; // ::
  if (zeros(7) && g[7] === 1) return true; // ::1
  if (zeros(5) && (g[5] === 0xffff || g[5] === 0)) return privateV4(v4From(g[6], g[7])); // ::ffff:a.b.c.d, ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return privateV4(v4From(g[6], g[7])); // NAT64 64:ff9b::/96 (·/48)
  if (g[0] === 0x2002) return privateV4(v4From(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo (안에 든 IPv4 를 확인하기 어려움)
  if (g[0] === 0x100 && zeros(4)) return true; // 100::/64 버림 주소
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 내부망
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // 링크·사이트 로컬
  if ((g[0] & 0xff00) === 0xff00) return true; // 멀티캐스트
  return false;
}
