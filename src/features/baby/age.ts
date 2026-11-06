/** 아기 나이 표시와 사진 날짜 계산 (순수 함수) */

const DAY = 86_400_000;
const toUtc = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};

/**
 * 생후 N일: 태어난 날을 1일로 센다 (백일 = 태어난 날 + 99일, 한국식 날짜 세기).
 * 태어나기 전이면 0 이하.
 */
export function dayOfLife(birth: string, date: string) {
  return Math.round((toUtc(date) - toUtc(birth)) / DAY) + 1;
}

/** 만 개월 수 (같은 '일'이 지나야 1개월) */
export function monthsOld(birth: string, date: string) {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = date.split("-").map(Number);
  let months = (y - by) * 12 + (m - bm);
  if (d < bd) months -= 1;
  return Math.max(0, months);
}

/** 기념일 이름 (해당 날짜만) */
export function milestone(birth: string, date: string): string | null {
  const n = dayOfLife(birth, date);
  if (n === 1) return "태어난 날";
  if (n === 50) return "50일";
  if (n === 100) return "백일";
  if (n === 200) return "200일";
  if (n === 300) return "300일";
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = date.split("-").map(Number);
  if (m === bm && d === bd && y > by) return y - by === 1 ? "첫 돌" : `${y - by}번째 생일`;
  return null;
}

/** 화면 표시: "생후 37일 · 1개월" / 기념일이면 앞에 붙임 */
export function ageLabel(birth: string | null, date: string): string | null {
  if (!birth) return null;
  const n = dayOfLife(birth, date);
  if (n < 1) return null;
  const mo = monthsOld(birth, date);
  const parts = [`생후 ${n}일`];
  if (mo >= 1) parts.push(mo >= 24 ? `${Math.floor(mo / 12)}살` : `${mo}개월`);
  const ms = milestone(birth, date);
  return ms ? `🎉 ${ms} · ${parts.join(" · ")}` : parts.join(" · ");
}

/** Date → 한국 시간 날짜 "YYYY-MM-DD" */
export function seoulDate(d: Date) {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/**
 * 사진 촬영 시각 정하기.
 * - EXIF 촬영 시각(카메라 기준 '현지 시각', 시간대 정보가 없으면 한국 시간으로 봄)이 가장 정확
 * - 없으면 파일 수정 시각 (카톡으로 받은 사진 등은 받은 날짜일 수 있음)
 */
export function pickTakenAt(
  exif: { DateTimeOriginal?: Date | string; CreateDate?: Date | string; OffsetTimeOriginal?: string } | null,
  lastModified: number,
): { takenAt: Date; source: "exif" | "file" } {
  const raw = exif?.DateTimeOriginal ?? exif?.CreateDate;
  if (raw) {
    // exifr 는 시간대 없는 EXIF 시각을 '브라우저 현지 시각'으로 Date 를 만든다 → 숫자만 꺼내서 한국 시간으로 다시 해석
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000) {
      const offset = exif?.OffsetTimeOriginal && /^[+-]\d{2}:\d{2}$/.test(exif.OffsetTimeOriginal) ? exif.OffsetTimeOriginal : "+09:00";
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset}`;
      const t = new Date(local);
      if (!Number.isNaN(t.getTime())) return { takenAt: t, source: "exif" };
    }
  }
  return { takenAt: new Date(lastModified), source: "file" };
}

/** 드라이브 폴더 이름: 월 폴더 "2026-11", 날짜 폴더 "2026-11-05" */
export const monthKey = (date: string) => date.slice(0, 7);
