import { headers } from "next/headers";
import { createShareLink, deleteShareLink, setShowOrganization } from "@/features/share/actions";
import { CopyField } from "@/features/share/components/copy-field";
import { listShareLinks } from "@/features/share/queries";

export default async function ShareSettingsPage() {
  const [links, h] = await Promise.all([listShareLinks(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;

  return (
    <>
      <h1 className="text-2xl font-bold">가족 공유</h1>
      <p className="text-sm text-muted">
        공유 링크로는 <b>날짜 · 시간 · 강의명 · 기관</b>만 보입니다. 강의료 · 세금 · 수령 여부 · 메모는 절대 보이지 않습니다.
        링크를 삭제하면 바로 볼 수 없게 됩니다.
      </p>

      {links.map((l) => {
        const page = `${origin}/share/${l.token}`;
        const feed = `${origin}/share/${l.token}/calendar.ics`;
        const webcal = feed.replace(/^https?:\/\//, "webcal://");
        return (
          <section key={l.id} className="card space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="section-title">{l.label}</h2>
              <form action={deleteShareLink.bind(null, l.id)} className="ml-auto">
                <button type="submit" className="text-sm text-danger hover:underline">링크 삭제</button>
              </form>
            </div>

            <CopyField label="① 웹으로 보기 (카톡으로 보내기)" value={page} />
            <CopyField label="② 휴대폰 캘린더에 구독 (iCal 주소)" value={feed} />

            <div className="flex flex-wrap gap-2 text-sm">
              <a href={webcal} className="chip">아이폰에서 바로 구독 열기</a>
              <a
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}
                target="_blank"
                rel="noreferrer"
                className="chip"
              >
                구글 캘린더에 추가
              </a>
            </div>

            <form action={setShowOrganization.bind(null, l.id, !l.show_organization)} className="text-sm">
              <span className="text-muted">기관 이름 {l.show_organization ? "보이는 중" : "숨기는 중"} · </span>
              <button type="submit" className="underline">{l.show_organization ? "숨기기" : "보이기"}</button>
            </form>

            <details className="text-sm">
              <summary className="cursor-pointer font-medium">아내분 휴대폰에서 구독하는 방법</summary>
              <div className="mt-2 space-y-2 text-muted">
                <p><b>아이폰</b>: ②번 주소를 카톡으로 보내기 → 아내분 아이폰에서 설정 → 캘린더 → 계정 → 계정 추가 → 기타 → 구독 캘린더 추가 → 주소 붙여넣기. (또는 아이폰에서 위 &apos;아이폰에서 바로 구독 열기&apos; 링크를 누르기)</p>
                <p><b>안드로이드 / 구글 캘린더</b>: PC에서 calendar.google.com → 왼쪽 &apos;다른 캘린더&apos; + → URL로 추가 → ②번 주소 붙여넣기. 휴대폰 구글 캘린더 앱에 자동으로 나타납니다.</p>
                <p>새 일정·수정 사항은 캘린더 앱이 주기적으로 가져갑니다 (아이폰은 설정에서 가져오기 주기 조절, 구글은 보통 몇 시간 간격).</p>
              </div>
            </details>
          </section>
        );
      })}

      <form action={createShareLink} className="card flex flex-wrap items-end gap-3">
        <label className="field flex-1">
          <span>새 공유 링크 이름</span>
          <input name="label" defaultValue={links.length ? "" : "아내"} placeholder="예: 아내" className="input" />
        </label>
        <button type="submit" className="btn-primary">공유 링크 만들기</button>
      </form>
    </>
  );
}
