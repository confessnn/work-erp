import Link from "next/link";
import { BabyTabs } from "@/features/baby-care/components/baby-tabs";
import { saveBabyInfo } from "@/features/baby/actions";
import { ageLabel } from "@/features/baby/age";
import { PhotoGallery } from "@/features/baby/components/photo-gallery";
import { PhotoUploader } from "@/features/baby/components/photo-uploader";
import { getBabyInfo, listPhotoMonths, listPhotosInMonth } from "@/features/baby/queries";
import { driveStatus } from "@/features/documents/queries";
import { getFamilyRole } from "@/features/family/queries";
import { todayInSeoul } from "@/lib/format";

export default async function BabyPage({ searchParams }: PageProps<"/baby">) {
  const sp = await searchParams;
  const isOwner = (await getFamilyRole()).role === "owner";
  // 가족 구성원(아내)은 대표 계정의 드라이브를 쓰므로 자기 구글 연결이 필요 없다
  const [status, baby, months] = await Promise.all([
    isOwner ? driveStatus() : Promise.resolve("ready" as const),
    getBabyInfo(),
    listPhotoMonths(),
  ]);
  const month = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : (months[0]?.month ?? todayInSeoul().slice(0, 7));
  const photos = await listPhotosInMonth(month);
  const today = todayInSeoul();
  const title = baby.name ? `${baby.name} 사진` : "아기 사진";

  return (
    <>
      <div className="space-y-2">
        <h1 className="page-title">{title}</h1>
        {baby.birthDate && <p className="text-sm text-muted">오늘 {ageLabel(baby.birthDate, today)}</p>}
        <BabyTabs active="photos" />
      </div>

      {status !== "ready" ? (
        <section className="card text-sm">
          {status === "needs_reconnect" ? "구글 드라이브 권한이 아직 없습니다. " : "구글 계정이 연결되어 있지 않습니다. "}
          <Link href="/integrations" className="underline">연동 화면으로</Link>
        </section>
      ) : (
        <>
          {isOwner && (
            <details className="card" open={!baby.birthDate}>
              <summary className="cursor-pointer font-medium">아기 정보 {baby.birthDate ? `(${baby.birthDate} 출생)` : ""}</summary>
              <form action={saveBabyInfo} className="mt-3 flex flex-wrap items-end gap-3">
                <label className="field">
                  <span>이름 (태명도 좋아요)</span>
                  <input name="baby_name" defaultValue={baby.name ?? ""} className="input" />
                </label>
                <label className="field">
                  <span>태어난 날</span>
                  <input name="baby_birth_date" type="date" defaultValue={baby.birthDate ?? ""} className="input" />
                </label>
                <label className="field">
                  <span>성별</span>
                  <select name="baby_sex" defaultValue={baby.sex ?? ""} className="input">
                    <option value="">모름</option>
                    <option value="male">남자</option>
                    <option value="female">여자</option>
                  </select>
                </label>
                <div className="field">
                  <span>출생 주수 (선택)</span>
                  <div className="flex items-center gap-1">
                    <input name="baby_gest_weeks" aria-label="주" type="number" inputMode="numeric" min={22} max={44} defaultValue={baby.gestWeeks ?? ""} placeholder="36" className="input w-20" />
                    주
                    <input name="baby_gest_days" aria-label="일" type="number" inputMode="numeric" min={0} max={6} defaultValue={baby.gestDays ?? ""} placeholder="4" className="input w-16" />
                    일
                  </div>
                </div>
                <button type="submit" className="btn-primary">저장</button>
              </form>
              <p className="mt-2 text-xs text-muted">
                태어난 날을 넣으면 날짜마다 &apos;생후 N일&apos;과 백일·첫 돌 같은 기념일을 표시합니다. 성별은 성장 백분위(WHO 기준) 계산에 씁니다.
                37주 전에 태어났으면 출생 주수를 넣어 주세요. 성장 비교를 &apos;교정 나이&apos;로 합니다.
              </p>
            </details>
          )}

          <section className="card space-y-3">
            <h2 className="section-title">사진·동영상 올리기</h2>
            <p className="text-sm text-muted">
              사진과 동영상을 여러 개 한 번에 고르면 기록된 <b>찍은 날짜</b>로 나눠서 구글 드라이브 <b>work-erp/아기 사진/2026-11/2026-11-05</b>{" "}
              같은 날짜 폴더에 넣습니다. 이미 올린 사진은 건너뜁니다.
            </p>
            <PhotoUploader birthDate={baby.birthDate} />
          </section>

          {months.length > 0 && (
            <section className="space-y-4">
              <nav className="flex gap-2 overflow-x-auto pb-1 text-sm">
                {months.map((m) => (
                  <Link key={m.month} href={`/baby?m=${m.month}`} className={`chip shrink-0 ${m.month === month ? "chip-on" : ""}`}>
                    {Number(m.month.slice(0, 4))}년 {Number(m.month.slice(5))}월 · {m.count}
                  </Link>
                ))}
              </nav>
              {photos.length ? (
                <PhotoGallery photos={photos} birthDate={baby.birthDate} showDriveLink={isOwner} />
              ) : (
                <p className="card text-center text-muted">이 달에는 사진이 없습니다.</p>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
