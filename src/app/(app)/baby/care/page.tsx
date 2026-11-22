import { ageLabel } from "@/features/baby/age";
import { getBabyInfo } from "@/features/baby/queries";
import { BabyTabs } from "@/features/baby-care/components/baby-tabs";
import { CareBoard } from "@/features/baby-care/components/care-board";
import { getLatestCare, listCareDay } from "@/features/baby-care/queries";
import { todayInSeoul } from "@/lib/format";

/** 육아 기록: 수유·기저귀·수면 등. 가족(나·아내)이 같은 기록을 함께 쓴다 */
export default async function BabyCarePage({ searchParams }: PageProps<"/baby/care">) {
  const sp = await searchParams;
  const today = todayInSeoul();
  const day = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const [baby, logs, latest] = await Promise.all([getBabyInfo(), listCareDay(day), getLatestCare()]);

  return (
    <>
      <div className="space-y-2">
        <h1 className="page-title">{baby.name ? `${baby.name} 육아 기록` : "육아 기록"}</h1>
        {baby.birthDate && <p className="text-sm text-muted">오늘 {ageLabel(baby.birthDate, today)}</p>}
        <BabyTabs active="care" />
      </div>
      <CareBoard key={day} day={day} today={today} logs={logs} latest={latest} />
    </>
  );
}
