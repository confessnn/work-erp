"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { todayInSeoul } from "@/lib/format";
import { schedulePush } from "@/features/google-calendar/push";
import { feeFields, feeFrom, isBlankFee, titleKey, type FeeRecord } from "./fee-memory";
import { calculateWithholding, grossFrom, hoursBetween, type IncomeType } from "./tax";

export type FormState = { error?: string; duplicate?: boolean };

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

type Db = Awaited<ReturnType<typeof requireUser>>["supabase"];

function refresh() {
  revalidatePath("/", "layout");
}

/**
 * 저장한 강의료를 같은 제목의 다른 일정에 넣는다. 수령한 일정은 건드리지 않는다.
 * 기본은 강의료가 빈 일정만 채우고, overwrite 면 이미 입력한 일정도 바꾼다.
 * 원래 일정은 이미 저장됐으므로 여기서 실패해도 저장을 되돌리지 않는다.
 */
async function applyFeeToSameTitle(supabase: Db, row: FeeRecord, overwrite: boolean, exceptId?: string) {
  const fee = feeFrom(row);
  if (!fee) return;
  const { data, error } = await supabase.from("lectures").select("id, title, hours, hourly_rate, gross_amount").eq("is_paid", false);
  if (error) {
    console.error("같은 제목 강의료 조회 실패", error.message);
    return;
  }
  const targets = (data ?? []).filter(
    (l) => l.id !== exceptId && titleKey(l.title) === titleKey(row.title) && (overwrite || isBlankFee(l)),
  );
  const results = await Promise.all(targets.map((l) => supabase.from("lectures").update(feeFields(l.hours, fee)).eq("id", l.id)));
  const failed = results.find((r) => r.error);
  if (failed) console.error("같은 제목 강의료 저장 실패", failed.error?.message);
}

export async function createLecture(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await requireUser();
  const parsed = toRow(fd);
  if ("error" in parsed) return { error: parsed.error };

  // 같은 날짜·시작 시각에 이미 일정이 있으면 한 번 확인 (구글에서 불러온 같은 강의를 또 입력하는 경우 방지)
  if (parsed.row.start_time && fd.get("allow_duplicate") !== "on") {
    const { data: same } = await supabase
      .from("lectures")
      .select("title")
      .eq("lecture_date", parsed.row.lecture_date)
      .eq("start_time", parsed.row.start_time)
      .limit(1);
    if (same?.length) {
      return {
        error: `같은 날짜·시각에 이미 '${same[0].title}' 일정이 있습니다. 같은 강의라면 그 일정을 수정해주세요.`,
        duplicate: true,
      };
    }
  }
  const { data: created, error } = await supabase.from("lectures").insert({ ...parsed.row, user_id: userId }).select("id").single();
  if (error) return { error: `저장 실패: ${error.message}` };
  await applyFeeToSameTitle(supabase, parsed.row, false, created.id);
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
  await applyFeeToSameTitle(supabase, parsed.row, fd.get("apply_same_title") === "on", id);
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

/** 달력에서 고른 일정들을 한 번에 수령 처리. 이미 수령한 일정은 건드리지 않는다. */
export async function markPaidMany(ids: string[]): Promise<{ count: number; error?: string }> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) return { count: 0, error: "선택한 일정이 없습니다." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("lectures")
    .select("id, expected_net")
    .in("id", ids)
    .eq("is_paid", false);
  if (error) return { count: 0, error: error.message };

  const today = todayInSeoul();
  let count = 0;
  for (const row of data ?? []) {
    const { error: e } = await supabase
      .from("lectures")
      .update({ is_paid: true, paid_date: today, paid_amount: row.expected_net })
      .eq("id", row.id)
      .eq("is_paid", false);
    if (e) {
      refresh();
      return { count, error: `${count}건 처리 후 실패: ${e.message}` };
    }
    count++;
  }
  schedulePush(supabase);
  refresh();
  return { count };
}
