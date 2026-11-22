import Link from "next/link";
import { dayOfLife } from "@/features/baby/age";
import { getBabyInfo } from "@/features/baby/queries";
import { KIND_COLOR, KINDS, seoulDate, type CareKind } from "@/features/baby-care/care";
import { BabyTabs } from "@/features/baby-care/components/baby-tabs";
import { KindIcon } from "@/features/baby-care/components/kind-icon";
import { DayClock, WeekBars } from "@/features/baby-care/components/pattern-charts";
import { daySegments, parseKinds, shiftDay } from "@/features/baby-care/pattern";
import { listCareRange } from "@/features/baby-care/queries";
import { dateLabel, todayInSeoul } from "@/lib/format";

const ALL = KINDS.map((k) => k.key);
const DEFAULT: CareKind[] = ["formula", "breast", "pumped", "pump", "diaper", "sleep", "medicine"];
const WEEK = 7;
/** 서버에서 화면을 만드는 시각 (요청마다 한 번) */
const requestTime = () => Date.now();
const WD = ["일", "월", "화", "수", "목", "금", "토"];

/** 패턴: 하루 일과표(24시간 시계)와 최근 7일 주간 패턴. 보고 싶은 종류만 골라 본다 */
export default async function BabyPatternPage({ searchParams }: PageProps<"/baby/pattern">) {
  const sp = await searchParams;
  const today = todayInSeoul();
  const day = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) && sp.d <= today ? sp.d : today;
  const kinds = parseKinds(typeof sp.k === "string" ? sp.k : undefined, ALL, DEFAULT);
  const view = sp.v === "week" ? "week" : "day";
  const from = shiftDay(day, -(WEEK - 1));
  const [baby, logs] = await Promise.all([getBabyInfo(), listCareRange(view === "week" ? from : day, day)]);
  const now = requestTime();

  const href = (o: { d?: string; k?: CareKind[]; v?: string }) => {
    const q = new URLSearchParams();
    const d = o.d ?? day;
    if (d !== today) q.set("d", d);
    const k = o.k ?? kinds;
    if (k.join(",") !== DEFAULT.join(",")) q.set("k", k.join(","));
    const v = o.v ?? view;
    if (v === "week") q.set("v", "week");
    const s = q.toString();
    return `/baby/pattern${s ? `?${s}` : ""}`;
  };
  const toggle = (k: CareKind) => (kinds.includes(k) ? kinds.filter((x) => x !== k) : ALL.filter((x) => x === k || kinds.includes(x)));
  const wd = (d: string) => WD[new Date(`${d}T00:00:00Z`).getUTCDay()];
  const segments = daySegments(logs, day, now, kinds);
  const nowMin = day === today ? (now - Date.parse(`${today}T00:00:00+09:00`)) / 60_000 : null;
  const counts = kinds
    .map((k) => ({ k, n: logs.filter((l) => l.kind === k && seoulDate(l.started_at) === day).length }))
    .filter((x) => x.n > 0);

  return (
    <>
      <div className="space-y-2">
        <h1 className="page-title">{baby.name ? `${baby.name} 패턴` : "패턴"}</h1>
        <BabyTabs active="pattern" />
      </div>

      <section className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {KINDS.map((k) => {
            const on = kinds.includes(k.key);
            return (
              <Link
                key={k.key}
                href={href({ k: toggle(k.key) })}
                scroll={false}
                aria-pressed={on}
                className={`flex shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-2 py-1.5 text-[11px] ${on ? "border-transparent text-fg" : "border-line text-muted opacity-50 grayscale"}`}
                style={on ? { background: `${KIND_COLOR[k.key]}33` } : undefined}
              >
                <span className="text-xl">
                  <KindIcon kind={k.key} />
                </span>
                {k.label}
              </Link>
            );
          })}
        </div>
        <p className="text-center text-xs text-muted">
          {KINDS.length}개 중 {kinds.length}개 선택됨 ·{" "}
          <Link href={href({ k: ALL })} scroll={false} className="underline">
            전부
          </Link>{" "}
          ·{" "}
          <Link href={href({ k: DEFAULT })} scroll={false} className="underline">
            기본
          </Link>
        </p>
      </section>

      <nav className="flex justify-center">
        <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm">
          <Link href={href({ v: "day" })} className={`rounded-full px-4 py-1.5 ${view === "day" ? "bg-accent-soft font-semibold" : "text-muted"}`}>
            일과표
          </Link>
          <Link href={href({ v: "week" })} className={`rounded-full px-4 py-1.5 ${view === "week" ? "bg-accent-soft font-semibold" : "text-muted"}`}>
            주간 패턴
          </Link>
        </div>
      </nav>

      <div className="flex items-center justify-center gap-3">
        <Link href={href({ d: shiftDay(day, view === "week" ? -WEEK : -1) })} className="btn-ghost text-xl" aria-label="이전">
          ‹
        </Link>
        <h2 className="section-title min-w-40 text-center">
          {view === "week"
            ? `${from.slice(5).replace("-", "/")} ~ ${day.slice(5).replace("-", "/")}`
            : `${day === today ? "오늘 · " : ""}${dateLabel(day)} (${wd(day)})`}
        </h2>
        {day < today ? (
          <Link href={href({ d: [shiftDay(day, view === "week" ? WEEK : 1), today].sort()[0] })} className="btn-ghost text-xl" aria-label="다음">
            ›
          </Link>
        ) : (
          <span className="btn-ghost invisible text-xl">›</span>
        )}
      </div>

      {view === "day" ? (
        <section className="card space-y-3">
          <DayClock
            segments={segments}
            sub={baby.birthDate ? "DAY" : undefined}
            center={baby.birthDate ? `${dayOfLife(baby.birthDate, day)}일` : `${segments.length}건`}
            nowMin={nowMin}
          />
          {counts.length ? (
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
              {counts.map(({ k, n }) => (
                <li key={k} className="flex items-center gap-1.5">
                  <span className="inline-block size-3 rounded-full" style={{ background: KIND_COLOR[k] }} aria-hidden />
                  {KINDS.find((x) => x.key === k)!.label} {n}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-sm text-muted">이날 고른 종류의 기록이 없어요.</p>
          )}
          <p className="text-center text-xs text-muted">0시가 맨 위, 시계 방향이에요. 조각을 길게 누르면(마우스는 올리면) 시각이 보여요.</p>
        </section>
      ) : (
        <section className="card space-y-3">
          <WeekBars
            rows={Array.from({ length: WEEK }, (_, i) => {
              const d = shiftDay(from, i);
              return { label: `${d.slice(5).replace("-", "/")} ${wd(d)}`, segments: daySegments(logs, d, now, kinds), on: d === today };
            })}
          />
          <p className="text-xs text-muted">하루를 한 줄로(왼쪽 0시 → 오른쪽 24시) 쌓았어요. 위아래로 같은 시간대에 색이 모이면 규칙이 생긴 거예요.</p>
        </section>
      )}
    </>
  );
}
