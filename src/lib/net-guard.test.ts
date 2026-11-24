import { describe, expect, it } from "vitest";
import { isPrivateAddress } from "./net-guard";

describe("isPrivateAddress", () => {
  it("내부망·내 컴퓨터·메타데이터 주소는 막음", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.0.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::",
      "::1",
      "[::1]",
      "fd00::1",
      "fe80::1%eth0",
      "fec0::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:a9fe:a9fe",
      "::127.0.0.1",
      "64:ff9b::a9fe:a9fe",
      "64:ff9b::10.0.0.1",
      "2002:7f00:1::",
      "2002:a9fe:a9fe::1",
      "2001:0:4136:e378::1",
      "0:0:0:0:0:0:0:1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("공인 주소는 통과", () => {
    for (const ip of ["8.8.8.8", "211.231.99.80", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::1", "2404:6800:4004:80c::200e"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("읽을 수 없는 값은 막음", () => {
    for (const ip of ["", "localhost", "1.2.3", "999.1.1.1", "1::2::3", "gggg::1"]) expect(isPrivateAddress(ip), ip).toBe(true);
  });
});
