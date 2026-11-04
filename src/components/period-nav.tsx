import Link from "next/link";

export type PeriodParams = { year: number; month?: number };

/** searchParams(y, m) → 기간. m=all 이면 연도 전체. */
export function parsePeriod(sp: Record<string, string | string[] | undefined>, fallback: { year: number; month: number }): PeriodParams {
  const y = Number(sp.y);
  const year = Number.isInteger(y) && y > 2000 && y < 2100 ? y : fallback.year;
  if (sp.m === "all") return { year };
  const m = Number(sp.m);
  const month = Number.isInteger(m) && m >= 1 && m <= 12 ? m : sp.y ? undefined : fallback.month;
  return month ? { year, month } : { year };
}

function href(base: string, p: PeriodParams, extra: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  q.set("y", String(p.year));
  q.set("m", p.month ? String(p.month) : "all");
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  return `${base}?${q}`;
}

export function PeriodNav({
  base,
  period,
  extra = {},
}: {
  base: string;
  period: PeriodParams;
  extra?: Record<string, string | undefined>;
}) {
  const { year, month } = period;
  const prev = month
    ? month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
    : { year: year - 1 };
  const next = month
    ? month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
    : { year: year + 1 };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={href(base, prev, extra)} className="btn-ghost" aria-label="이전">‹</Link>
      <span className="min-w-28 text-center text-lg font-semibold">
        {year}년{month ? ` ${month}월` : " 전체"}
      </span>
      <Link href={href(base, next, extra)} className="btn-ghost" aria-label="다음">›</Link>
      <div className="ml-auto flex rounded-lg border border-line p-0.5 text-sm">
        <Link
          href={href(base, { year, month: month ?? 1 }, extra)}
          className={`rounded-md px-3 py-1 ${month ? "bg-accent text-white" : ""}`}
        >
          월별
        </Link>
        <Link
          href={href(base, { year }, extra)}
          className={`rounded-md px-3 py-1 ${month ? "" : "bg-accent text-white"}`}
        >
          연도별
        </Link>
      </div>
    </div>
  );
}
