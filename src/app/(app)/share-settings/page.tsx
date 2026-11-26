import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ViewerAdmin } from "@/features/bid-viewer/components/viewer-admin";
import { listBidViewerAdmin } from "@/features/bid-viewer/queries";
import { InviteForm, InviteList, MemberList } from "@/features/family/components/family-admin";
import { getFamilyRole, listFamilyAdmin } from "@/features/family/queries";
import { createWidgetToken, deleteWidgetToken } from "@/features/home-widget/actions";
import { listWidgetTokens } from "@/features/home-widget/queries";
import { createShareLink, deleteShareLink, setShowOrganization } from "@/features/share/actions";
import { CopyField } from "@/features/share/components/copy-field";
import { listShareLinks } from "@/features/share/queries";

export default async function ShareSettingsPage() {
  if ((await getFamilyRole()).role !== "owner") redirect("/family");
  const [links, h, family, bidViewers, widgets] = await Promise.all([
    listShareLinks(),
    headers(),
    listFamilyAdmin(),
    listBidViewerAdmin(),
    listWidgetTokens(),
  ]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;

  return (
    <>
      <h1 className="page-title">공유</h1>
      <p className="text-sm text-muted">누구에게 무엇을 보여 줄지 여기서 한 번에 관리합니다.</p>

      <section id="family" className="card space-y-4">
        <div>
          <h2 className="section-title">가족 계정 초대 (아내 등)</h2>
          <p className="mt-1 text-sm text-muted">
            초대받은 가족은 본인 이메일로 가입해 <b>가족 달력</b>만 씁니다. 가족 일정은 같이 보고 입력하며, 강의는 제목과 시간만 보입니다.
            강의료·세금·수령 여부·메모·공고·서류함은 볼 수 없습니다.
          </p>
        </div>
        <MemberList members={family.members} />
        <InviteList invites={family.invites} origin={origin} />
        <InviteForm />
        <p className="text-xs text-muted">링크는 7일 동안, 한 번만 쓸 수 있어요. 카톡으로 보내 주세요.</p>
      </section>

      <section id="bids" className="card space-y-3">
        <h2 className="section-title">한일ENG 공고 공유 (동생)</h2>
        <ViewerAdmin origin={origin} invites={bidViewers.invites} members={bidViewers.members} />
      </section>

      <h2 className="section-title pt-2">로그인 없이 보는 일정 링크</h2>
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

      <h2 id="widget" className="section-title pt-2">안드로이드 홈 화면 위젯</h2>
      <p className="text-sm text-muted">
        휴대폰 홈 화면에 달력 위젯을 올려 두면 일정이 바로 보입니다. 위젯이 읽는 주소에는
        <b> 날짜 · 시간 · 제목</b>과 가족 일정의 <b>사람</b>만 담깁니다. 강의료 · 세금 · 수령 여부 · 메모는 절대 담기지 않습니다.
        주소는 비밀번호처럼 다루고, 지우면 바로 못 쓰게 됩니다.
      </p>

      {widgets.map((w) => (
        <section key={w.id} className="card space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="section-title">{w.label}</h2>
            <span className="text-xs text-muted">
              {w.last_used_at ? `마지막 사용 ${new Date(w.last_used_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : "아직 안 씀"}
            </span>
            <form action={deleteWidgetToken.bind(null, w.id)} className="ml-auto">
              <button type="submit" className="text-sm text-danger hover:underline">주소 삭제</button>
            </form>
          </div>
          <ol className="space-y-3 text-sm">
            <li>
              <p className="font-medium">① 앱 설치</p>
              <a href="/downloads/work-erp-widget.apk" download className="btn-primary mt-1.5">위젯 앱 내려받기</a>
              <p className="mt-1.5 text-xs text-muted">
                받은 파일을 열면 설치됩니다. 안드로이드가 &apos;출처를 알 수 없는 앱&apos; 설치를 한 번 물어보면 허용해 주세요. 아이폰에서는 쓸 수 없습니다.
              </p>
            </li>
            <li>
              <p className="font-medium">② 홈 화면에 위젯 올리기</p>
              <p className="mt-1 text-xs text-muted">홈 화면 빈 곳을 길게 누르기 → <b>위젯</b> → <b>ERP 달력</b> → 홈 화면으로 끌어다 놓기.</p>
            </li>
            <li>
              <p className="font-medium">③ 아래 주소를 복사해 위젯에 붙여넣기</p>
              <p className="mt-1 text-xs text-muted">
                위젯을 놓으면 주소를 묻는 화면이 뜹니다. <b>복사</b> 를 눌러 붙여넣으세요.
                이 주소는 눌러서 여는 곳이 아니라 위젯이 읽어 가는 자료라, 브라우저로 열면 글자만 잔뜩 나옵니다.
              </p>
            </li>
          </ol>
          <CopyField label="위젯에 붙여넣을 주소 (눌러서 열지 말고 복사하세요)" value={`${origin}/api/widget/${w.token}`} />
        </section>
      ))}

      {widgets.length === 0 && (
        <form action={createWidgetToken} className="card">
          <button type="submit" className="btn-primary">위젯 주소 만들기</button>
        </form>
      )}

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
