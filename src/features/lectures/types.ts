import type { IncomeType } from "./tax";

/** public.lectures 테이블 한 행 (supabase/migrations 참고) */
export type Lecture = {
  id: string;
  user_id: string;
  title: string;
  organization: string | null;
  lecture_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  hours: number;
  hourly_rate: number;
  gross_amount: number;
  income_type: IncomeType;
  apply_tax_exemption: boolean;
  income_tax: number;
  local_tax: number;
  expected_net: number;
  is_paid: boolean;
  paid_date: string | null;
  paid_amount: number | null;
  memo: string | null;
  external_uid: string | null; // 캘린더에서 불러온 일정이면 원본 ID
  google_event_id?: string | null; // 구글로 내보낸 일정 ID
  google_synced_at?: string | null;
  created_at: string;
  updated_at: string;
};
