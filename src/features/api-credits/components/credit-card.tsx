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
    return <p className="text-sm text-muted">현재 잔액과 자동 충전 설정을 넣으면 다음 충전 시점을 계산합니다.</p>;
  }
  if (f.daysLeft === null || f.nextReloadDate === null) {
    return <p className="text-sm text-muted">최근 사용 기록이 적어 다음 충전 시점을 예측하기 어렵습니다.</p>;
  }
  const amount = f.nextReloadAmount ? `, ${usd(f.nextReloadAmount)}` : "";
  return (
    <p className="text-sm">
      {f.daysLeft === 0 ? (
        <>충전 기준 {usd(settings.reload_threshold_cents)}에 거의 닿았습니다. </>
      ) : (
        <>충전 기준 {usd(settings.reload_threshold_cents)}까지 약 {f.daysLeft}일 남음. </>
      )}
      다음 자동 충전 예상 <strong>{dateLabel(f.nextReloadDate)}</strong>{amount}
    </p>
  );
}

/** 서비스 하나의 크레딧 요약 */
export function CreditCard({ provider, label, keyName, hasKey, settings, forecast: f }: { provider: ApiProvider; label: string; keyName: string; hasKey: boolean; settings: CreditSettings | undefined; forecast: Forecast }) {
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{label}</h3>
        {settings?.last_synced_at && <span className="text-xs text-muted">갱신 {synced(settings.last_synced_at)}</span>}
      </div>

      <div>
        <div className="text-sm text-muted">예상 잔액</div>
        <div className="text-2xl font-bold tabular-nums">{f.balance === null ? "입력 전" : usd(f.balance)}</div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">이번 달 사용</dt>
        <dd className="text-right tabular-nums">{usd(f.monthCost)}</dd>
        <dt className="text-muted">이번 달 토큰</dt>
        <dd className="text-right tabular-nums">{f.monthTokens === null ? "없음" : f.monthTokens.toLocaleString("ko-KR")}</dd>
        <dt className="text-muted">최근 7일 하루 평균</dt>
        <dd className="text-right tabular-nums">{usd(f.dailyAverage)}</dd>
        {f.reloads > 0 && (
          <>
            <dt className="text-muted">충전 추정</dt>
            <dd className="text-right tabular-nums">{f.reloads}회, {usd(f.reloadedTotal)}</dd>
          </>
        )}
      </dl>

      <Outlook settings={settings} f={f} />

      {!hasKey && <p className="text-sm text-warn">관리자 키 {keyName}가 아직 등록되지 않아 사용액을 받지 못합니다.</p>}
      {settings?.last_sync_error && <p className="text-sm text-red-500">조회 실패: {settings.last_sync_error}</p>}

      <CreditSettingsForm provider={provider} settings={settings} />
    </div>
  );
}
