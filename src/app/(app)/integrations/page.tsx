import { GooglePanel } from "@/features/google-calendar/components/google-panel";
import { DRIVE_SCOPE, hasScope, isGoogleConfigured } from "@/features/google-calendar/google-api";
import { requireUser } from "@/lib/supabase/server";

const MSG: Record<string, { text: string; ok?: boolean }> = {
  connected: { text: "구글에 연결했습니다. 캘린더 일정을 '강의 일정(ERP)'에 반영했고, 서류함(드라이브)도 쓸 수 있습니다.", ok: true },
  denied: { text: "구글 연결을 취소했습니다." },
  state_mismatch: { text: "보안 확인에 실패했습니다. 다시 시도해주세요." },
  scope_missing: { text: "권한이 허용되지 않았습니다. 구글 권한 화면에서 캘린더·드라이브 항목에 체크해주세요." },
  token_failed: { text: "구글 인증에 실패했습니다. 다시 시도해주세요." },
  save_failed: { text: "연결 정보를 저장하지 못했습니다. 다시 시도해주세요." },
  not_configured: { text: "아직 구글 연동 설정이 서버에 없습니다. 아래 안내를 확인해주세요." },
};

export default async function IntegrationsPage({ searchParams }: PageProps<"/integrations">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { data: conn } = await supabase
    .from("google_connections")
    .select("google_email, show_amounts, last_push_at, last_push_result, scopes")
    .maybeSingle();
  const msg = typeof sp.google === "string" ? MSG[sp.google] : undefined;
  const configured = isGoogleConfigured();

  return (
    <>
      <h1 className="text-2xl font-bold">연동</h1>
      {msg && <p className={`card text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}

      <section className="card space-y-4">
        <div>
          <h2 className="section-title">구글 캘린더로 내보내기</h2>
          <p className="mt-1 text-sm text-muted">
            ERP에서 일정을 저장·수정·삭제하면 구글의 <b>강의 일정(ERP)</b> 캘린더에 바로 반영됩니다. 아이폰에 구글 계정을 추가해
            두면 애플 캘린더에서도 보입니다. 구글에서 불러온 일정은 이미 구글에 있으므로 다시 올리지 않습니다.
          </p>
        </div>

        {conn && !hasScope(conn.scopes, DRIVE_SCOPE) && (
          <div className="rounded-lg border border-warn/40 p-3 text-sm">
            <p className="font-medium">서류함(구글 드라이브) 권한 추가가 필요합니다</p>
            <p className="mt-1 text-muted">
              아래 버튼으로 한 번 다시 연결하고, 구글 권한 화면에서 <b>캘린더</b>와 <b>드라이브</b> 항목 모두 체크해주세요. 기존 일정은
              그대로 유지됩니다.
            </p>
            <a href="/api/google/connect" className="btn-primary mt-2">구글 다시 연결 (드라이브 권한 추가)</a>
          </div>
        )}
        {conn ? (
          <GooglePanel conn={conn} />
        ) : configured ? (
          <a href="/api/google/connect" className="btn-primary">구글 캘린더 연결</a>
        ) : (
          <p className="rounded-lg bg-bg p-3 text-sm text-muted">
            관리자 설정(구글 클라우드 OAuth 클라이언트)이 아직 없습니다. 설정이 끝나면 여기에 &apos;구글 캘린더 연결&apos; 버튼이 나타납니다.
          </p>
        )}
      </section>

      <section className="card space-y-2 text-sm">
        <h2 className="section-title">아이폰(애플 캘린더)에서 보기</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>아이폰 설정 → 캘린더 → 캘린더 계정 → 계정 추가 → Google → 같은 구글 계정으로 로그인</li>
          <li>캘린더 앱 → 아래 &apos;캘린더&apos; → <b>강의 일정(ERP)</b>가 켜져 있는지 확인</li>
        </ol>
      </section>
    </>
  );
}
