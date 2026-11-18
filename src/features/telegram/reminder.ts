import { escapeTg } from "./api";

const ERP_URL = "https://work-erp-one.vercel.app";

/** 일정 알림 한 건 (금액 없음). url 은 ERP 안의 경로만 받는다 */
export function reminderTelegram(title: string, body: string, url: string) {
  const link = url.startsWith("/") && !url.startsWith("//") ? `${ERP_URL}${url}` : ERP_URL;
  return {
    html: `⏰ <b>${escapeTg(title)}</b>\n${escapeTg(body)}`,
    buttons: [{ text: "ERP에서 보기", url: link }],
  };
}

export type TelegramEvents = "all" | "selected" | "off";
export const TELEGRAM_EVENT_OPTIONS: { v: TelegramEvents; label: string }[] = [
  { v: "all", label: "내 강의·가족 일정 전부" },
  { v: "selected", label: "🔔 켠 일정만" },
  { v: "off", label: "받지 않기" },
];
