"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadToSession } from "@/features/documents/drive-browser";
import { prepareBabyUpload, refreshBabyPage, registerBabyPhoto, startBabyUpload } from "../actions";
import { ageLabel, pickTakenAt, seoulDate } from "../age";
import { isVideo, mp4CreationTime } from "../video";

type Item = {
  file: File;
  video: boolean;
  sha1: string;
  takenAt: Date;
  date: string; // 분류 날짜 (사용자가 바꿀 수 있음)
  source: "exif" | "file" | "manual";
  thumb: string | null;
  width: number | null;
  height: number | null;
  status: "ready" | "dup" | "uploading" | "done" | "error";
  error?: string;
};

const PART = 2 * 1024 * 1024;
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * 같은 파일 두 번 올리기 방지용 지문.
 * 사진은 파일 전체 SHA-1, 동영상은 휴대폰 메모리를 아끼려고 크기 + 앞 2MB + 뒤 2MB 의 SHA-1.
 */
async function fingerprint(file: File, video: boolean) {
  if (!video || file.size <= PART * 2) return hex(await crypto.subtle.digest("SHA-1", await file.arrayBuffer()));
  const parts = new Blob([String(file.size), file.slice(0, PART), file.slice(file.size - PART)]);
  return hex(await crypto.subtle.digest("SHA-1", await parts.arrayBuffer()));
}

/** 동영상 촬영 시각: 파일 앞·뒤 일부에서 mvhd 상자를 찾는다 */
async function videoTakenAt(file: File): Promise<Date | null> {
  const head = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
  const found = mp4CreationTime(head);
  if (found || file.size <= 1024 * 1024) return found;
  return mp4CreationTime(new Uint8Array(await file.slice(Math.max(0, file.size - 8 * 1024 * 1024)).arrayBuffer()));
}

/** 동영상 미리보기: 0.5초 지점 화면 (긴 쪽 320px JPEG). 못 만들면 null */
async function videoThumb(file: File): Promise<{ thumb: string | null; width: number | null; height: number | null }> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    v.load();
    await new Promise<void>((ok, fail) => {
      v.onloadeddata = () => ok();
      v.onerror = () => fail(new Error("video"));
      setTimeout(() => fail(new Error("timeout")), 10_000);
    });
    v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
    await new Promise<void>((ok) => {
      v.onseeked = () => ok();
      setTimeout(ok, 3_000);
    });
    const scale = Math.min(1, 320 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    return { thumb: c.toDataURL("image/jpeg", 0.7), width: v.videoWidth, height: v.videoHeight };
  } catch {
    return { thumb: null, width: null, height: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 미리보기 (긴 쪽 320px JPEG). HEIC 처럼 브라우저가 못 여는 형식이면 null */
async function makeThumb(file: File): Promise<{ thumb: string | null; width: number | null; height: number | null }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const out = { thumb: c.toDataURL("image/jpeg", 0.7), width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  } catch {
    return { thumb: null, width: null, height: null };
  }
}

export function PhotoUploader({ birthDate }: { birthDate: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<"idle" | "reading" | "uploading">("idle");
  const [progress, setProgress] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const update = (i: number, patch: Partial<Item>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setMsg(null);
    setPhase("reading");
    const exifr = (await import("exifr")).default;
    const list: Item[] = [];
    const arr = [...files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name) || isVideo(f.type, f.name));
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      const video = isVideo(file.type, file.name);
      setProgress(`사진·동영상 확인 중… (${i + 1}/${arr.length})`);
      let takenAt: Date;
      let source: Item["source"];
      if (video) {
        const t = await videoTakenAt(file).catch(() => null);
        takenAt = t ?? new Date(file.lastModified);
        source = t ? "exif" : "file";
      } else {
        let exif = null;
        try {
          exif = await exifr.parse(file, { pick: ["DateTimeOriginal", "CreateDate", "OffsetTimeOriginal"] });
        } catch {
          /* EXIF 없음 */
        }
        ({ takenAt, source } = pickTakenAt(exif ?? null, file.lastModified));
      }
      const [sha1, t] = await Promise.all([fingerprint(file, video), video ? videoThumb(file) : makeThumb(file)]);
      list.push({ file, sha1, takenAt, date: seoulDate(takenAt), source, video, ...t, status: "ready" });
    }
    // 같은 사진을 두 번 고른 경우
    const seen = new Set<string>();
    for (const it of list) {
      if (seen.has(it.sha1)) it.status = "dup";
      seen.add(it.sha1);
    }
    list.sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
    setItems(list);
    setPhase("idle");
    setProgress("");
    const skipped = files.length - arr.length;
    if (skipped > 0) setMsg({ ok: false, text: `사진·동영상이 아닌 파일 ${skipped}개는 뺐습니다.` });
  }

  async function upload() {
    const todo = items.map((it, i) => ({ it, i })).filter(({ it }) => it.status === "ready" || it.status === "error");
    if (!todo.length) return;
    setPhase("uploading");
    setMsg(null);
    try {
      setProgress("드라이브 날짜 폴더 준비 중…");
      const prep = await prepareBabyUpload({ dates: todo.map(({ it }) => it.date), sha1s: todo.map(({ it }) => it.sha1) });
      if (!prep.ok) throw new Error(prep.error);
      const existing = new Set(prep.existing);

      let done = 0;
      let skipped = 0;
      let failed = 0;
      const queue = [...todo];
      const worker = async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const { it, i } = job;
          if (existing.has(it.sha1)) {
            update(i, { status: "dup" });
            skipped++;
            continue;
          }
          update(i, { status: "uploading" });
          try {
            const mime =
              it.file.type ||
              (/\.(heic|heif)$/i.test(it.file.name) ? "image/heic" : /\.mov$/i.test(it.file.name) ? "video/quicktime" : it.video ? "video/mp4" : "application/octet-stream");
            const session = await startBabyUpload({ date: it.date, name: it.file.name, mimeType: mime, size: it.file.size });
            if (!session.ok) throw new Error(session.error);
            const id = await uploadToSession(session.uploadUrl, it.file, session.mimeType);
            const r = await registerBabyPhoto({
              driveFileId: id,
              sha1: it.sha1,
              takenAt: it.source === "manual" ? null : it.takenAt.toISOString(),
              takenDate: it.date,
              dateSource: it.source,
              thumb: it.thumb,
              width: it.width,
              height: it.height,
            });
            if (!r.ok) throw new Error(r.error);
            update(i, { status: "done" });
            done++;
          } catch (e) {
            update(i, { status: "error", error: e instanceof Error ? e.message : "실패" });
            failed++;
          }
          setProgress(`올리는 중… ${done + skipped + failed}/${todo.length}`);
        }
      };
      await Promise.all([worker(), worker(), worker()]); // 3개씩 동시에
      await refreshBabyPage();
      router.refresh();
      setMsg({
        ok: failed === 0,
        text: [`${done}개 올림`, skipped && `${skipped}개는 이미 있어 건너뜀`, failed && `${failed}개 실패 (다시 누르면 재시도)`]
          .filter(Boolean)
          .join(" · "),
      });
      if (failed === 0) {
        setItems([]);
        if (inputRef.current) inputRef.current.value = "";
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "업로드 실패" });
    } finally {
      setPhase("idle");
      setProgress("");
    }
  }

  const byDate = new Map<string, { item: Item; index: number }[]>();
  items.forEach((item, index) => byDate.set(item.date, [...(byDate.get(item.date) ?? []), { item, index }]));
  const readyCount = items.filter((it) => it.status === "ready" || it.status === "error").length;
  const guessed = items.filter((it) => it.source === "file" && it.status === "ready").length;

  return (
    <div className="space-y-4">
      <label className="block">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*,.heic,.heif"
          multiple
          disabled={phase !== "idle"}
          onChange={(e) => onPick(e.target.files)}
          className="input"
        />
      </label>
      {progress && <p className="text-sm text-muted">{progress}</p>}

      {items.length > 0 && (
        <>
          {guessed > 0 && (
            <p className="text-sm text-warn">
              {guessed}개는 찍은 날짜 정보가 없어 파일 날짜로 넣었습니다(카톡으로 받은 사진 등). 날짜가 다르면 아래에서 바꿔주세요.
            </p>
          )}
          <div className="space-y-4">
            {[...byDate.entries()].map(([date, rows]) => (
              <section key={date}>
                <h3 className="mb-2 text-sm font-semibold">
                  {date}
                  {birthDate && <span className="ml-2 font-normal text-muted">{ageLabel(birthDate, date)}</span>}
                </h3>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {rows.map(({ item, index }) => (
                    <li key={item.sha1 + index} className="space-y-1">
                      <div className="relative aspect-square overflow-hidden rounded-xl bg-bg">
                        {item.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center p-1 text-center text-xs text-muted">{item.file.name}</div>
                        )}
                        {item.video && (
                          <span className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white" aria-label="동영상">
                            ▶
                          </span>
                        )}
                        {item.status !== "ready" && (
                          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-xs text-white">
                            {{ dup: "이미 있음", uploading: "올리는 중", done: "완료", error: "실패", ready: "" }[item.status]}
                          </span>
                        )}
                      </div>
                      {item.status === "ready" && (
                        <input
                          type="date"
                          value={item.date}
                          onChange={(e) => e.target.value && update(index, { date: e.target.value, source: "manual" })}
                          className="w-full rounded border border-line bg-bg px-1 text-xs"
                          title={item.source === "exif" ? "사진에 기록된 찍은 날짜" : "파일 날짜 (찍은 날짜 정보 없음)"}
                        />
                      )}
                      {item.status === "error" && <p className="text-xs text-danger">{item.error}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="sticky bottom-3 flex gap-2">
            <button type="button" onClick={upload} disabled={phase !== "idle" || !readyCount} className="btn-primary shadow-lg">
              {phase === "uploading" ? "올리는 중…" : `${readyCount}개 드라이브에 올리기`}
            </button>
            <button type="button" onClick={() => setItems([])} disabled={phase !== "idle"} className="chip bg-surface">
              취소
            </button>
          </div>
        </>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
