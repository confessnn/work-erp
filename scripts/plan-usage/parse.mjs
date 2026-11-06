const iso = (epochSeconds) => (typeof epochSeconds === "number" ? new Date(epochSeconds * 1000).toISOString() : null);
const num = (v) => (typeof v === "number" ? v : null);

/** Claude Code 상태줄 입력 → 보고 값. 한도 정보가 없으면 null */
export function parseClaude(input) {
  const five = input?.rate_limits?.five_hour;
  const week = input?.rate_limits?.seven_day;
  if (!five && !week) return null;
  return {
    plan: null,
    fiveHourPercent: num(five?.used_percentage),
    fiveHourResetsAt: iso(five?.resets_at),
    weeklyPercent: num(week?.used_percentage),
    weeklyResetsAt: iso(week?.resets_at),
    creditsBalance: null,
  };
}

/** Codex 응답 → 보고 값. primary·secondary 이름이 아니라 기간으로 창을 구분한다 */
export function parseCodex(result) {
  const limits = result?.rateLimits;
  if (!limits) return null;
  const windows = [limits.primary, limits.secondary].filter(Boolean);
  const five = windows.find((w) => w.windowDurationMins === 300);
  const week = windows.find((w) => w.windowDurationMins === 10080);
  if (!five && !week) return null;
  const balance = Number(limits.credits?.balance);
  return {
    plan: limits.planType ?? null,
    fiveHourPercent: num(five?.usedPercent),
    fiveHourResetsAt: iso(five?.resetsAt),
    weeklyPercent: num(week?.usedPercent),
    weeklyResetsAt: iso(week?.resetsAt),
    creditsBalance: Number.isFinite(balance) && limits.credits?.balance != null ? balance : null,
  };
}

/** 상태줄에 보여 줄 글자 */
export function statusText(usage) {
  if (!usage) return "";
  const parts = [];
  if (usage.fiveHourPercent !== null) parts.push(`5시간 ${Math.round(usage.fiveHourPercent)}%`);
  if (usage.weeklyPercent !== null) parts.push(`주간 ${Math.round(usage.weeklyPercent)}%`);
  return parts.join(" · ");
}

/** 값이 바뀌었거나 간격이 지났을 때만 보낸다 */
export function shouldReport(last, usage, now, minIntervalMs) {
  if (!usage) return false;
  if (!last) return true;
  return now - last.at >= minIntervalMs || last.fiveHourPercent !== usage.fiveHourPercent || last.weeklyPercent !== usage.weeklyPercent;
}
