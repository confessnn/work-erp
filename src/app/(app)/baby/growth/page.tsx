import Link from "next/link";
import { ageLabel } from "@/features/baby/age";
import { getBabyInfo } from "@/features/baby/queries";
import { seoulDate, type BabyLog } from "@/features/baby-care/care";
import { BabyTabs } from "@/features/baby-care/components/baby-tabs";
import { GrowthChart, type ChartPoint } from "@/features/baby-care/components/growth-chart";
import { assess, compareAge, curve, dailyFeedGuide, ML_PER_KG, percentileLabel, type Measure, type Sex } from "@/features/baby-care/growth";
import { latestWeightKg, listMeasurements, listRecentFeeds } from "@/features/baby-care/queries";
import { todayInSeoul } from "@/lib/format";

const FEED_DAYS = 7;

function shiftDay(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 성장: WHO 기준 백분위·성장 곡선·수유 기준량 (참고용) */
export default async function BabyGrowthPage() {
  const today = todayInSeoul();
  const [baby, measures, weight, feeds] = await Promise.all([getBabyInfo(), listMeasurements(), latestWeightKg(), listRecentFeeds(today, FEED_DAYS)]);
  const ready = baby.birthDate && baby.sex;

  return (
    <>
      <div className="space-y-2">
        <h1 className="page-title">{baby.name ? `${baby.name} 성장` : "성장"}</h1>
        {baby.birthDate && <p className="text-sm text-muted">오늘 {ageLabel(baby.birthDate, today)}</p>}
        <BabyTabs active="growth" />
      </div>

      {!ready ? (
        <section className="card text-sm">
          성장 백분위를 계산하려면 아기 <b>태어난 날</b>과 <b>성별</b>이 필요해요.{" "}
          <Link href="/baby" className="underline">
            사진 탭의 &apos;아기 정보&apos;에서 넣어 주세요
          </Link>
          .
        </section>
      ) : (
        <Growth birthDate={baby.birthDate!} sex={baby.sex!} gestWeeks={baby.gestWeeks} gestDays={baby.gestDays} measures={measures} />
      )}

      <FeedGuide today={today} weight={weight} feeds={feeds} />

      <p className="text-xs text-muted">
        키·몸무게 비교는 WHO 아동 성장 기준(질병관리청 한국 성장도표가 만 3세 미만에 쓰는 기준)으로 계산한 참고용이에요. 걱정되는 점은 영유아 검진·소아과에서
        확인해 주세요.
      </p>
    </>
  );
}

type Row = { log: BabyLog; date: string; age: number; days: number | null; corrected: boolean };

function Growth({
  birthDate,
  sex,
  gestWeeks,
  gestDays,
  measures,
}: {
  birthDate: string;
  sex: Sex;
  gestWeeks: number | null;
  gestDays: number | null;
  measures: BabyLog[];
}) {
  const rows: Row[] = measures.map((log) => {
    const date = seoulDate(log.started_at);
    return { log, date, ...compareAge(birthDate, date, gestWeeks, gestDays) };
  });
  const lastOf = (m: Measure) => [...rows].reverse().find((r) => (m === "weight" ? r.log.value : r.log.height_cm) !== null) ?? null;
  const val = (r: Row, m: Measure) => Number(m === "weight" ? r.log.value : r.log.height_cm);
  const unit = (m: Measure) => (m === "weight" ? "kg" : "cm");
  const name = (m: Measure) => (m === "weight" ? "몸무게" : "키");
  const nowAge = compareAge(birthDate, todayInSeoul(), gestWeeks, gestDays);
  const gestLabel = gestWeeks ? `${gestWeeks}주${gestDays ? ` ${gestDays}일` : ""}` : "";
  const early = rows.some((r) => r.days === null && r.age >= 0);

  const card = (m: Measure) => {
    const r = lastOf(m);
    if (!r) return <Card key={m} title={name(m)} main="기록 없음" sub="육아 기록의 📏 키·몸무게 버튼으로 적어 주세요" />;
    const a = r.days !== null ? assess(m, sex, r.days, val(r, m)) : null;
    return (
      <Card
        key={m}
        title={`${name(m)} · ${r.date.slice(5).replace("-", "/")}`}
        main={`${val(r, m)}${unit(m)}`}
        badge={a ? percentileLabel(a.percentile) : undefined}
        sub={
          a
            ? `같은 ${r.corrected ? "교정 " : ""}나이 ${sex === "male" ? "남자" : "여자"}아이 100명 중 작은 쪽부터 ${Math.max(1, Math.min(100, Math.round(a.percentile)))}번째쯤 · 중간값 ${a.median.toFixed(m === "weight" ? 2 : 1)}${unit(m)}`
            : "예정일 전 기록이라 WHO 표로 비교하지 않아요"
        }
      />
    );
  };

  const chart = (m: Measure) => {
    const pts: ChartPoint[] = rows
      .filter((r) => r.days !== null && (m === "weight" ? r.log.value : r.log.height_cm) !== null)
      .map((r) => ({ day: r.days!, value: val(r, m), title: `${r.date} ${val(r, m)}${unit(m)}` }));
    const lastDay = Math.max(nowAge.days ?? 0, ...pts.map((p) => p.day));
    const to = Math.min(730, Math.max(90, Math.ceil((lastDay + 30) / 30) * 30));
    return (
      <section key={m} className="card space-y-2">
        <h2 className="section-title">
          {name(m)} 성장 곡선 <span className="text-sm font-normal text-muted">(WHO {sex === "male" ? "남아" : "여아"} 3·50·97 백분위)</span>
        </h2>
        <GrowthChart curve={curve(m, sex, 0, to, 2)} points={pts} unit={unit(m)} step={m === "weight" ? 1 : 5} />
        {pts.length === 0 && <p className="text-sm text-muted">아직 비교할 기록이 없어요.</p>}
      </section>
    );
  };

  return (
    <>
      {(nowAge.corrected || gestWeeks === null) && (
        <p className="text-sm text-muted">
          {nowAge.corrected
            ? `${gestLabel}에 태어나서 교정 나이로 비교해요 (오늘 실제 ${nowAge.age}일 · 교정 ${nowAge.days ?? "예정일 전"}${nowAge.days !== null ? "일" : ""}).`
            : "37주 전에 태어났다면 사진 탭 '아기 정보'에 출생 주수를 넣어 주세요. 교정 나이로 더 정확하게 비교해요."}
        </p>
      )}
      <section className="grid gap-2 sm:grid-cols-2">{(["weight", "length"] as const).map(card)}</section>
      {early && <p className="text-xs text-muted">예정일 전에 잰 기록은 WHO 표(만삭 기준)로 비교하지 않고 그래프에서도 빠져요.</p>}
      {(["weight", "length"] as const).map(chart)}

      {rows.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title">잰 기록</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-normal">날짜</th>
                <th className="font-normal">몸무게</th>
                <th className="font-normal">키</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...rows].reverse().map((r) => {
                const cell = (m: Measure) => {
                  const has = (m === "weight" ? r.log.value : r.log.height_cm) !== null;
                  if (!has) return <span className="text-muted">–</span>;
                  const a = r.days !== null ? assess(m, sex, r.days, val(r, m)) : null;
                  return (
                    <>
                      {val(r, m)}
                      {unit(m)} {a && <span className="text-xs text-muted">({percentileLabel(a.percentile)})</span>}
                    </>
                  );
                };
                return (
                  <tr key={r.log.id}>
                    <td className="py-1.5 tabular-nums">
                      {r.date.slice(5).replace("-", "/")} <span className="text-xs text-muted">{r.log.note === "출생" ? "출생" : `${r.age}일`}</span>
                    </td>
                    <td className="tabular-nums">{cell("weight")}</td>
                    <td className="tabular-nums">{cell("length")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function Card({ title, main, badge, sub }: { title: string; main: string; badge?: string; sub: string }) {
  return (
    <div className="card space-y-1">
      <div className="text-xs text-muted">{title}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{main}</span>
        {badge && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-sm font-semibold">{badge}</span>}
      </div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );
}

/** 수유 기준량(체중 × 150ml)과 최근 7일 실제 수유량 */
function FeedGuide({ today, weight, feeds }: { today: string; weight: { kg: number; at: string } | null; feeds: BabyLog[] }) {
  const guide = weight ? dailyFeedGuide(weight.kg) : null;
  const days = Array.from({ length: FEED_DAYS }, (_, i) => shiftDay(today, i - FEED_DAYS + 1));
  const total = (d: string) => feeds.filter((l) => seoulDate(l.started_at) === d).reduce((s, l) => s + (l.amount_ml ?? 0), 0);
  const breast = (d: string) => feeds.filter((l) => seoulDate(l.started_at) === d && l.kind === "breast").length;
  const max = Math.max(guide ?? 0, ...days.map(total), 1);

  return (
    <section className="card space-y-3">
      <h2 className="section-title">수유량 · 기준량</h2>
      {guide ? (
        <p className="text-sm">
          마지막 몸무게 <b>{weight!.kg}kg</b> ({seoulDate(weight!.at).slice(5).replace("-", "/")}) 기준 하루 약 <b>{guide}ml</b>
          <span className="text-muted"> (체중 1kg당 {ML_PER_KG}ml, 분유 기준 어림값)</span>
        </p>
      ) : (
        <p className="text-sm text-muted">몸무게를 기록하면 하루 기준량을 계산해요.</p>
      )}
      <ul className="space-y-1.5">
        {days.map((d) => {
          const ml = total(d);
          const b = breast(d);
          return (
            <li key={d} className="flex items-center gap-2 text-sm">
              <span className="w-16 shrink-0 tabular-nums text-muted">{d === today ? "오늘" : d.slice(5).replace("-", "/")}</span>
              <span className="relative h-4 flex-1 overflow-hidden rounded-full bg-fg/5">
                <span className="absolute inset-y-0 left-0 rounded-full bg-accent/70" style={{ width: `${(ml / max) * 100}%` }} />
                {guide && <span className="absolute inset-y-0 w-0.5 bg-danger" style={{ left: `${(guide / max) * 100}%` }} aria-hidden />}
              </span>
              <span className="w-28 shrink-0 text-right tabular-nums">
                {ml}ml{guide && d !== today ? <span className="text-xs text-muted"> ({Math.round((ml / guide) * 100)}%)</span> : null}
                {b ? <span className="block text-xs text-muted">+ 모유 {b}회</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {guide && <p className="text-xs text-muted">빨간 세로선이 기준량이에요. 오늘은 아직 하루가 끝나지 않아 비율을 빼요. 모유 직접 수유는 양을 알 수 없어 합계에 없어요.</p>}
    </section>
  );
}
