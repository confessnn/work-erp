import { Suspense } from "react";
import { ApiCreditsSection } from "@/features/api-credits/components/api-credits-section";
import { GooglePanel } from "@/features/google-calendar/components/google-panel";
import { DRIVE_SCOPE, hasScope, isGoogleConfigured } from "@/features/google-calendar/google-api";
import { TelegramPanel, type TelegramState } from "@/features/telegram/components/telegram-panel";
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
  const { data: telegram } = await supabase
    .from("telegram_links")
    .select("bot_username, chat_id, link_code, linked_at, last_sent_at, last_error, notify_events, hook_hash")
    .maybeSingle();
  const msg = typeof sp.google === "string" ? MSG[sp.google] : undefined;
  const configured = isGoogleConfigured();

  return (
    <>
      <h1 className="page-title">연동</h1>
      {msg && <p className={`card text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}

      <section className="card space-y-3">
        <div>
          <h2 className="section-title">텔레그램 알림</h2>
          <p className="mt-1 text-sm text-muted">
            매일 아침 7시쯤 <b>오늘 할 일</b>(오늘·내일 강의, 가족 일정, 새 입찰 공고)을 내 텔레그램 봇으로 받습니다. 연결하지 않았거나 보내지
            못한 날은 메일로 대신 보냅니다. 강의료 같은 금액은 보내지 않습니다.
          </p>
        </div>
        <TelegramPanel
          state={telegram ? ({ ...telegram, hook_hash: undefined, inbox_on: !!telegram.hook_hash } as TelegramState) : null}
        />
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="section-title">구글 캘린더로 내보내기</h2>
          <p className="mt-1 text-sm text-muted">
            ERP에서 일정을 저장·수정·삭제하면 구글의 <b>강의 일정(ERP)</b> 캘린더에 바로 반영됩니다. 아이폰에 구글 계정을 추가해
            두면 애플 캘린더에서도 보입니다. 구글에서 불러온 일정은 이미 구글에 있으므로 다시 올리지 않습니다.
          </p>
        </div>

        {conn && !hasScope(conn.scopes, DRIVE_SCOPE) && (
          <div className="rounded-xl border border-warn/40 p-3 text-sm">
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
          <p className="rounded-xl bg-bg p-3 text-sm text-muted">
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

      <section className="space-y-2">
        <h2 className="section-title">API 잔액</h2>
        <Suspense fallback={<div aria-hidden className="h-40 animate-pulse rounded-2xl bg-line/60" />}>
          <ApiCreditsSection />
        </Suspense>
        <p className="text-xs text-muted">
          잔액과 충전 시점은 입력값에서 사용액을 빼 계산한 추정치이고, 사용액은 UTC 날짜 기준입니다.
          Claude 사용액은 보통 4시간, 길면 24시간 늦게 반영됩니다. 실제 잔액과 다르면 다시 입력하세요.
        </p>
      </section>
    </>
  );
}
