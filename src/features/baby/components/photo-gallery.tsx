"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePhotoDate, deleteBabyPhoto } from "../actions";
import { ageLabel } from "../age";
import type { BabyPhoto } from "../queries";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dayTitle = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${m}월 ${day}일 (${WEEK[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]})`;
};
const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }) : "";

export function PhotoGallery({ photos, birthDate }: { photos: BabyPhoto[]; birthDate: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState<BabyPhoto | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const days = new Map<string, BabyPhoto[]>();
  for (const p of photos) days.set(p.taken_date, [...(days.get(p.taken_date) ?? []), p]);
  // 최근 날짜가 위로
  const ordered = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="space-y-6">
      {ordered.map(([date, list]) => (
        <section key={date} className="space-y-2">
          <h3 className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold">{dayTitle(date)}</span>
            {birthDate && <span className="text-sm text-muted">{ageLabel(birthDate, date)}</span>}
            <span className="ml-auto text-xs text-muted">{list.length}장</span>
          </h3>
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {list.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setErr(null);
                    setOpen(p);
                  }}
                  className="block aspect-square w-full overflow-hidden rounded-xl bg-bg"
                >
                  {p.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center p-1 text-center text-xs text-muted">{p.file_name}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setOpen(null)}>
          <div className="card w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            {open.thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.thumb} alt="" className="mx-auto max-h-64 rounded-xl" />
            )}
            <p className="text-sm">
              {dayTitle(open.taken_date)} {timeOf(open.taken_at)}
              <span className="ml-2 text-muted">
                {open.date_source === "exif" ? "· 사진에 기록된 날짜" : open.date_source === "manual" ? "· 직접 지정한 날짜" : "· 파일 날짜"}
              </span>
            </p>
            <a
              href={`https://drive.google.com/file/d/${open.drive_file_id}/view`}
              target="_blank"
              rel="noreferrer"
              className="btn-primary w-full"
            >
              원본 보기 (구글 드라이브)
            </a>
            <form
              className="flex items-end gap-2"
              action={(fd) =>
                start(async () => {
                  const r = await changePhotoDate(open.id, String(fd.get("date")));
                  if (!r.ok) return setErr(r.error);
                  setOpen(null);
                  router.refresh();
                })
              }
            >
              <label className="field flex-1">
                <span>날짜 바꾸기 (드라이브 폴더도 이동)</span>
                <input name="date" type="date" defaultValue={open.taken_date} className="input" />
              </label>
              <button type="submit" disabled={pending} className="chip">변경</button>
            </form>
            {err && <p className="text-sm text-danger">{err}</p>}
            <div className="flex justify-between border-t border-line pt-3 text-sm">
              <button
                type="button"
                disabled={pending}
                className="text-danger underline"
                onClick={() => {
                  if (!confirm("이 사진을 삭제할까요? 드라이브에서는 휴지통으로 이동합니다(30일 안에 복구 가능).")) return;
                  start(async () => {
                    const r = await deleteBabyPhoto(open.id);
                    if (!r.ok) return setErr(r.error);
                    setOpen(null);
                    router.refresh();
                  });
                }}
              >
                삭제
              </button>
              <button type="button" className="underline" onClick={() => setOpen(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
