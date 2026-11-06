import Link from "next/link";
import { saveBabyInfo } from "@/features/baby/actions";
import { ageLabel } from "@/features/baby/age";
import { PhotoGallery } from "@/features/baby/components/photo-gallery";
import { PhotoUploader } from "@/features/baby/components/photo-uploader";
import { getBabyInfo, listPhotoMonths, listPhotosInMonth } from "@/features/baby/queries";
import { driveStatus } from "@/features/documents/queries";
import { todayInSeoul } from "@/lib/format";

export default async function BabyPage({ searchParams }: PageProps<"/baby">) {
  const sp = await searchParams;
  const [status, baby, months] = await Promise.all([driveStatus(), getBabyInfo(), listPhotoMonths()]);
  const month = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : (months[0]?.month ?? todayInSeoul().slice(0, 7));
  const photos = await listPhotosInMonth(month);
  const today = todayInSeoul();
  const title = baby.name ? `${baby.name} 사진` : "아기 사진";

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {baby.birthDate && <p className="text-sm text-muted">오늘 {ageLabel(baby.birthDate, today)}</p>}
      </div>

      {status !== "ready" ? (
        <section className="card text-sm">
          {status === "needs_reconnect" ? "구글 드라이브 권한이 아직 없습니다. " : "구글 계정이 연결되어 있지 않습니다. "}
          <Link href="/integrations" className="underline">연동 화면으로</Link>
        </section>
      ) : (
        <>
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
              <button type="submit" className="btn-primary">저장</button>
            </form>
            <p className="mt-2 text-xs text-muted">태어난 날을 넣으면 날짜마다 &apos;생후 N일&apos;과 백일·첫 돌 같은 기념일을 표시합니다.</p>
          </details>

          <section className="card space-y-3">
            <h2 className="section-title">사진 올리기</h2>
            <p className="text-sm text-muted">
              여러 장을 한 번에 고르면 사진에 기록된 <b>찍은 날짜</b>로 나눠서 구글 드라이브 <b>work-erp/아기 사진/2026-11/2026-11-05</b>{" "}
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
                <PhotoGallery photos={photos} birthDate={baby.birthDate} />
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
