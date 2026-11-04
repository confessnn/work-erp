"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { todayInSeoul } from "@/lib/format";
import { schedulePush } from "@/features/google-calendar/push";
import { calculateWithholding, grossFrom, hoursBetween, type IncomeType } from "./tax";

export type FormState = { error?: string };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v === null) return null;
  const n = Number(v.replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
};

/** 폼 입력을 DB 행으로 변환. 금액·세금은 서버에서 다시 계산해 저장한다. */
function toRow(fd: FormData) {
  const title = str(fd, "title");
  const lectureDate = str(fd, "lecture_date");
  if (!title) return { error: "강의명을 입력하세요." } as const;
  if (!lectureDate) return { error: "날짜를 입력하세요." } as const;

  const startTime = str(fd, "start_time");
  const endTime = str(fd, "end_time");
  const hours = num(fd, "hours") ?? hoursBetween(startTime, endTime);
  const hourlyRate = Math.round(num(fd, "hourly_rate") ?? 0);
  const grossOverride = num(fd, "gross_override");
  const gross = grossOverride !== null ? Math.round(grossOverride) : grossFrom(hours, hourlyRate);
  if (hours < 0 || hourlyRate < 0 || gross < 0) return { error: "금액과 시간은 0 이상이어야 합니다." } as const;

  const incomeType: IncomeType = str(fd, "income_type") === "other" ? "other" : "business";
  const applyExemption = fd.get("apply_tax_exemption") === "on";
  const tax = calculateWithholding(gross, incomeType, applyExemption);

  const isPaid = fd.get("is_paid") === "on";
  const paidAmount = num(fd, "paid_amount");

  return {
    row: {
      title,
      organization: str(fd, "organization"),
      lecture_date: lectureDate,
      start_time: startTime,
      end_time: endTime,
      hours,
      hourly_rate: hourlyRate,
      gross_amount: gross,
      income_type: incomeType,
      apply_tax_exemption: applyExemption,
      income_tax: tax.incomeTax,
      local_tax: tax.localTax,
      expected_net: tax.net,
      is_paid: isPaid,
      paid_date: isPaid ? (str(fd, "paid_date") ?? todayInSeoul()) : null,
      paid_amount: isPaid ? (paidAmount !== null ? Math.round(paidAmount) : tax.net) : null,
      memo: str(fd, "memo"),
    },
  } as const;
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function createLecture(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await requireUser();
  const parsed = toRow(fd);
  if ("error" in parsed) return { error: parsed.error };
  const { error } = await supabase.from("lectures").insert({ ...parsed.row, user_id: userId });
  if (error) return { error: `저장 실패: ${error.message}` };
  schedulePush(supabase);
  refresh();
  redirect("/lectures");
}

export async function updateLecture(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const parsed = toRow(fd);
  if ("error" in parsed) return { error: parsed.error };
  const { error } = await supabase.from("lectures").update(parsed.row).eq("id", id);
  if (error) return { error: `저장 실패: ${error.message}` };
  schedulePush(supabase);
  refresh();
  redirect("/lectures");
}

export async function deleteLecture(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("lectures").delete().eq("id", id);
  schedulePush(supabase);
  refresh();
  redirect("/lectures");
}

/** 목록에서 수령 체크 / 해제. 수령 시 실수령액은 예상 수령액, 수령일은 오늘로 기록. */
export async function setPaid(id: string, paid: boolean) {
  const { supabase } = await requireUser();
  if (paid) {
    const { data } = await supabase.from("lectures").select("expected_net").eq("id", id).single();
    await supabase
      .from("lectures")
      .update({
        is_paid: true,
        paid_date: todayInSeoul(),
        paid_amount: data?.expected_net ?? null,
      })
      .eq("id", id);
  } else {
    await supabase
      .from("lectures")
      .update({ is_paid: false, paid_date: null, paid_amount: null })
      .eq("id", id);
  }
  schedulePush(supabase);
  refresh();
}
