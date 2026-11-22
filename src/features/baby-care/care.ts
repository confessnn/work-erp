// 육아 기록 (supabase/migrations/20261122040000_baby_care_logs.sql). 시각은 모두 한국 시간 기준으로 나눈다.

export type CareKind =
  | "formula" | "breast" | "pumped" | "pump" | "diaper" | "sleep" | "weight" | "medicine"
  | "bath" | "hospital" | "water" | "solid" | "temperature" | "other";

export type BabyLog = {
  id: string;
  kind: CareKind;
  started_at: string;
  ended_at: string | null;
  amount_ml: number | null;
  value: number | null;
  side: "left" | "right" | "both" | null;
  diaper: "pee" | "poo" | "both" | null;
  poo_color: PooColor | null;
  label: string | null;
  note: string | null;
};

export const LOG_COLUMNS = "id, kind, started_at, ended_at, amount_ml, value, side, diaper, poo_color, label, note";

/** 버튼 순서 = 화면 순서. field: 입력 칸 종류 */
export const KINDS: { key: CareKind; label: string; icon: string; field: "ml" | "pump" | "breast" | "diaper" | "sleep" | "kg" | "temp" | "medicine" | "solid" | "text" }[] = [
  { key: "formula", label: "분유", icon: "🍼", field: "ml" },
  { key: "breast", label: "모유", icon: "🤱", field: "breast" },
  { key: "pumped", label: "유축수유", icon: "🥛", field: "ml" },
  { key: "pump", label: "유축", icon: "🫙", field: "pump" },
  { key: "diaper", label: "기저귀", icon: "🧷", field: "diaper" },
  { key: "sleep", label: "수면", icon: "😴", field: "sleep" },
  { key: "weight", label: "몸무게", icon: "⚖️", field: "kg" },
  { key: "medicine", label: "투약", icon: "💊", field: "medicine" },
  { key: "bath", label: "목욕", icon: "🛁", field: "text" },
  { key: "hospital", label: "병원", icon: "🏥", field: "text" },
  { key: "water", label: "물", icon: "💧", field: "ml" },
  { key: "solid", label: "이유식", icon: "🥣", field: "solid" },
  { key: "temperature", label: "체온", icon: "🌡️", field: "temp" },
  { key: "other", label: "기타", icon: "📝", field: "text" },
];
export const kindInfo = (k: CareKind) => KINDS.find((x) => x.key === k) ?? KINDS[KINDS.length - 1];

export const FEED_KINDS: CareKind[] = ["formula", "breast", "pumped"];
export const SIDE_LABEL = { left: "왼쪽", right: "오른쪽", both: "양쪽" } as const;
export const DIAPER_LABEL = { pee: "소변", poo: "대변", both: "소변+대변" } as const;

/** 대변 색 (DB 값 → 이름·화면 색) */
export const POO_COLORS = [
  { key: "yellow", label: "노랑", hex: "#c9954a" },
  { key: "brown", label: "갈색", hex: "#7b5230" },
  { key: "dark", label: "짙은 갈색", hex: "#4a3820" },
  { key: "green", label: "초록", hex: "#6b7b2e" },
  { key: "red", label: "빨강", hex: "#b4563e" },
  { key: "white", label: "회백색", hex: "#c4bcbb" },
] as const;
export type PooColor = (typeof POO_COLORS)[number]["key"];
export const pooColor = (k: string | null | undefined) => POO_COLORS.find((c) => c.key === k) ?? null;

/** 끝난 시각을 적을 수 있는 종류 (수유 시간·유축 시간·잠) */
export const TIMED_KINDS: CareKind[] = ["formula", "breast", "pumped", "pump", "sleep"];

/** datetime-local 값에 분을 더한다 (한국 시간 그대로) */
export function addMinutesLocal(v: string, minutes: number): string | null {
  const iso = fromLocalInput(v);
  return iso ? toLocalInput(new Date(Date.parse(iso) + minutes * MIN).toISOString()) : null;
}

const MIN = 60_000;

/** 한국 시간 하루의 시작·끝 (ISO) */
export function seoulDayRange(day: string) {
  const start = new Date(`${day}T00:00:00+09:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 24 * 60 * MIN).toISOString() };
}

/** 한국 시간 날짜 */
export const seoulDate = (iso: string | Date) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

/** "HH:MM" (한국 시간) */
export const seoulTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });

/** datetime-local 칸 값 ("2026-11-22T14:05", 한국 시간) */
export function toLocalInput(iso: string) {
  return `${seoulDate(iso)}T${seoulTime(iso)}`;
}
/** datetime-local 값(한국 시간) → ISO. 잘못된 값이면 null */
export function fromLocalInput(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "3시간 12분 전", "방금" */
export function agoLabel(iso: string, now: number) {
  const m = Math.max(0, Math.floor((now - Date.parse(iso)) / MIN));
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 ${m % 60}분 전`;
  return `${Math.floor(h / 24)}일 ${h % 24}시간 전`;
}

/** "1시간 25분" */
export function durationLabel(minutes: number) {
  const m = Math.round(minutes);
  if (m < 60) return `${m}분`;
  return m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${Math.floor(m / 60)}시간`;
}

/** 기록 한 줄 설명 (금액 없음) */
export function describe(l: BabyLog, now: number) {
  const parts: string[] = [];
  if (l.amount_ml !== null && ["formula", "pumped", "pump", "water"].includes(l.kind)) parts.push(`${l.amount_ml}ml`);
  if (["breast", "pump"].includes(l.kind) && l.side) parts.push(SIDE_LABEL[l.side]);
  if (["formula", "breast", "pumped", "pump"].includes(l.kind) && l.ended_at) {
    parts.push(durationLabel((Date.parse(l.ended_at) - Date.parse(l.started_at)) / MIN));
  }
  if (l.kind === "diaper" && l.diaper) {
    parts.push(DIAPER_LABEL[l.diaper]);
    const c = l.diaper !== "pee" ? pooColor(l.poo_color) : null;
    if (c) parts.push(`${c.label}색`.replace("색색", "색"));
  }
  if (l.kind === "sleep") {
    parts.push(
      l.ended_at
        ? `${seoulTime(l.ended_at)}까지 · ${durationLabel((Date.parse(l.ended_at) - Date.parse(l.started_at)) / MIN)}`
        : `자는 중 · ${durationLabel((now - Date.parse(l.started_at)) / MIN)}째`,
    );
  }
  if (l.value !== null) {
    if (l.kind === "weight") parts.push(`${Number(l.value)}kg`);
    if (l.kind === "temperature") parts.push(`${Number(l.value)}℃`);
    if (l.kind === "solid") parts.push(`${Number(l.value)}g`);
  }
  if (l.label) parts.push(l.label);
  return parts.join(" · ");
}

export type DaySummary = {
  diapers: number;
  pee: number; // 소변이 있었던 횟수 (둘 다 포함)
  poo: number;
  feedMl: number; // 분유 + 유축수유
  formulaMl: number;
  pumpedMl: number;
  pumpMl: number; // 유축(엄마가 짠 양). 수유량에는 안 들어간다
  pumpCount: number;
  feeds: number; // 수유 횟수 (분유·모유·유축)
  breastCount: number;
  breastMin: number;
  sleepMin: number; // 그날 안에 든 잠 시간 (자정을 넘긴 잠은 나눠 센다, 자는 중이면 지금까지)
  waterMl: number;
  solidG: number;
};

/** 하루 요약 */
export function daySummary(logs: BabyLog[], day: string, now: number): DaySummary {
  const { start, end } = seoulDayRange(day);
  const s0 = Date.parse(start);
  const s1 = Math.min(Date.parse(end), now);
  const inDay = (l: BabyLog) => seoulDate(l.started_at) === day;
  const sum: DaySummary = { diapers: 0, pee: 0, poo: 0, feedMl: 0, formulaMl: 0, pumpedMl: 0, pumpMl: 0, pumpCount: 0, feeds: 0, breastCount: 0, breastMin: 0, sleepMin: 0, waterMl: 0, solidG: 0 };

  for (const l of logs) {
    if (l.kind === "sleep") {
      const a = Math.max(Date.parse(l.started_at), s0);
      const b = Math.min(l.ended_at ? Date.parse(l.ended_at) : now, s1);
      if (b > a) sum.sleepMin += (b - a) / MIN;
      continue;
    }
    if (!inDay(l)) continue;
    const ml = l.amount_ml ?? 0;
    switch (l.kind) {
      case "diaper":
        sum.diapers++;
        if (l.diaper === "pee" || l.diaper === "both") sum.pee++;
        if (l.diaper === "poo" || l.diaper === "both") sum.poo++;
        break;
      case "formula":
        sum.feeds++;
        sum.formulaMl += ml;
        sum.feedMl += ml;
        break;
      case "pumped":
        sum.feeds++;
        sum.pumpedMl += ml;
        sum.feedMl += ml;
        break;
      case "pump":
        sum.pumpCount++;
        sum.pumpMl += ml;
        break;
      case "breast":
        sum.feeds++;
        sum.breastCount++;
        if (l.ended_at) sum.breastMin += (Date.parse(l.ended_at) - Date.parse(l.started_at)) / MIN;
        break;
      case "water":
        sum.waterMl += ml;
        break;
      case "solid":
        sum.solidG += Number(l.value ?? 0);
        break;
    }
  }
  sum.sleepMin = Math.round(sum.sleepMin);
  sum.breastMin = Math.round(sum.breastMin);
  return sum;
}

/** 그 종류의 가장 최근 기록 */
export function latest(logs: BabyLog[], kinds: CareKind[]): BabyLog | null {
  let best: BabyLog | null = null;
  for (const l of logs) if (kinds.includes(l.kind) && (!best || l.started_at > best.started_at)) best = l;
  return best;
}
