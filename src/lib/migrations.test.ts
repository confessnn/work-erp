import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Supabase CLI 는 파일 이름 앞 14자리(버전)로 적용 기록을 남긴다. 겹치면 db push·reset 이 실패하거나 한쪽을 건너뛴다.
describe("supabase/migrations", () => {
  const files = readdirSync(join(process.cwd(), "supabase/migrations")).filter((f) => f.endsWith(".sql"));

  it("파일 이름은 <YYYYMMDDHHMMSS>_<이름>.sql", () => {
    expect(files.filter((f) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f))).toEqual([]);
  });

  it("버전(앞 14자리)이 겹치지 않는다", () => {
    const seen = new Map<string, string>();
    const dup: string[] = [];
    for (const f of files) {
      const v = f.slice(0, 14);
      if (seen.has(v)) dup.push(`${seen.get(v)} / ${f}`);
      else seen.set(v, f);
    }
    expect(dup).toEqual([]);
  });
});
