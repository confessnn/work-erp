import type { Forecast } from "../forecast";
import type { ApiProvider, CreditSettings } from "../types";
import { CreditSettingsForm } from "./credit-settings-form";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateLabel = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${m}월 ${d}일`;
};

const synced = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function Outlook({ settings, f }: { settings: CreditSettings | undefined; f: Forecast }) {
  if (f.balance === null || settings?.reload_threshold_cents == null || settings.reload_amount_cents == null) {
    return <p className="text-xs text-muted">잔액과 충전 설정을 넣으면 충전일을 계산합니다.</p>;
  }
  if (f.daysLeft === null || f.nextReloadDate === null) {
    return <p className="text-xs text-muted">사용 기록이 적어 충전일을 예측하기 어렵습니다.</p>;
  }
  const amount = f.nextReloadAmount ? `, ${usd(f.nextReloadAmount)}` : "";
  return (
    <p className="text-xs">
      {f.daysLeft === 0 ? <>충전 기준 {usd(settings.reload_threshold_cents)}에 거의 닿음. </> : <>충전 기준까지 약 {f.daysLeft}일. </>}
      다음 충전 <strong>{dateLabel(f.nextReloadDate)}</strong>{amount}
    </p>
  );
}

/** 서비스 하나의 크레딧 요약 */
export function CreditCard({ provider, label, keyName, hasKey, settings, forecast: f }: { provider: ApiProvider; label: string; keyName: string; hasKey: boolean; settings: CreditSettings | undefined; forecast: Forecast }) {
  return (
    <div className="min-w-0 space-y-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        {settings?.last_synced_at && <span className="text-[11px] text-muted">{synced(settings.last_synced_at)}</span>}
      </div>

      <div>
        <div className="text-xs text-muted">예상 잔액</div>
        <div className="text-xl font-bold tabular-nums">{f.balance === null ? "입력 전" : usd(f.balance)}</div>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
        <dt className="text-muted">이번 달</dt>
        <dd className="text-right tabular-nums">{usd(f.monthCost)}</dd>
        <dt className="text-muted">토큰</dt>
        <dd className="truncate text-right tabular-nums">{f.monthTokens === null ? "없음" : f.monthTokens.toLocaleString("ko-KR")}</dd>
        <dt className="text-muted">7일 평균</dt>
        <dd className="text-right tabular-nums">{usd(f.dailyAverage)}/일</dd>
        {f.reloads > 0 && (
          <>
            <dt className="text-muted">충전 추정</dt>
            <dd className="text-right tabular-nums">{f.reloads}회, {usd(f.reloadedTotal)}</dd>
          </>
        )}
      </dl>

      <Outlook settings={settings} f={f} />

      {!hasKey && <p className="text-xs break-words text-warn">관리자 키 {keyName} 미등록</p>}
      {settings?.last_sync_error && <p className="text-xs break-words text-red-500">조회 실패: {settings.last_sync_error}</p>}

      <CreditSettingsForm provider={provider} settings={settings} />
    </div>
  );
}
