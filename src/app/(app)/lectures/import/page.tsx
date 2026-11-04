import Link from "next/link";
import { deleteSource } from "@/features/calendar-import/actions";
import { AutoSettings } from "@/features/calendar-import/components/auto-settings";
import { ImportList } from "@/features/calendar-import/components/import-list";
import { SourceForm } from "@/features/calendar-import/components/source-form";
import { fetchCandidates, listSources } from "@/features/calendar-import/queries";

const MSG: Record<string, string> = {
  none: "선택한 일정이 없습니다.",
  error: "저장 중 오류가 발생했습니다. 다시 시도해주세요.",
};

export default async function ImportPage({ searchParams }: PageProps<"/lectures/import">) {
  const sp = await searchParams;
  const sources = await listSources();
  const source = sources.find((s) => s.id === sp.source) ?? (sources.length === 1 ? sources[0] : undefined);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const hideImported = sp.all !== "1";

  const result = source ? await fetchCandidates(source, { pastDays: 31, futureDays: 365 }) : null;
  const events = (result?.events ?? []).filter(
    (e) => (!q || `${e.title} ${e.location ?? ""}`.includes(q)) && (!hideImported || !e.imported),
  );

  const msg =
    sp.msg === "ok" ? `${Number(sp.n) || 0}개 일정을 저장했습니다.` : typeof sp.msg === "string" ? MSG[sp.msg] : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">캘린더에서 불러오기</h1>
        <Link href="/lectures" className="text-sm text-muted hover:underline">← 일정 목록</Link>
      </div>

      {msg && <p className="card text-sm">{msg}</p>}

      <section className="card space-y-4">
        <h2 className="section-title">연결된 캘린더</h2>
        {sources.length > 0 && (
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center gap-3 text-sm">
                <Link
                  href={`/lectures/import?source=${s.id}`}
                  className={`chip ${source?.id === s.id ? "chip-on" : ""}`}
                >
                  {s.name}
                </Link>
                {s.auto_import && <span className="badge badge-paid">매일 자동</span>}
                <form action={deleteSource.bind(null, s.id)} className="ml-auto">
                  <button type="submit" className="text-danger hover:underline">연결 해제</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <details open={sources.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">+ 캘린더 추가</summary>
          <div className="mt-3 space-y-3">
            <GoogleHelp />
            <SourceForm />
          </div>
        </details>
      </section>

      {source && (
        <>
          <section className="card space-y-3">
            <h2 className="section-title">자동 불러오기 — {source.name}</h2>
            <AutoSettings key={source.id} source={source} />
          </section>

          <h2 className="section-title pt-2">직접 골라서 불러오기</h2>
          <form className="flex flex-wrap gap-2" action="/lectures/import">
            <input type="hidden" name="source" value={source.id} />
            <input name="q" defaultValue={q} placeholder="제목·장소로 걸러보기 (예: 강의)" className="input flex-1" />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="all" value="1" defaultChecked={!hideImported} /> 불러온 것도 보기
            </label>
            <button type="submit" className="btn-primary">찾기</button>
          </form>
          <p className="text-sm text-muted">지난 1개월 ~ 앞으로 1년 일정</p>
          {result?.error ? <p className="card text-sm text-danger">{result.error}</p> : <ImportList key={`${source.id}-${q}`} events={events} />}
        </>
      )}
    </>
  );
}

function GoogleHelp() {
  return (
    <div className="rounded-lg bg-bg p-3 text-sm leading-relaxed">
      <p className="font-medium">구글 캘린더 주소 찾는 법 (PC 웹)</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted">
        <li>calendar.google.com → 왼쪽 &apos;내 캘린더&apos;에서 캘린더 이름 옆 ⋮ → 설정 및 공유</li>
        <li>맨 아래 &apos;캘린더 통합&apos; → <b>iCal 형식의 비공개 주소</b> 복사</li>
        <li>아래 칸에 붙여넣기 (이 주소는 비밀번호처럼 다른 사람에게 알려주지 마세요)</li>
      </ol>
      <p className="mt-2 text-muted">아이폰(iCloud) 캘린더: 캘린더 앱 → 캘린더 목록 ⓘ → &apos;공개 캘린더&apos; 켜고 링크 복사 (공개 링크라 주소를 아는 사람은 볼 수 있음)</p>
    </div>
  );
}
