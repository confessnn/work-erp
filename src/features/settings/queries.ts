import "server-only";
import { cache } from "react";
import type { NavPref } from "@/components/nav-items";
import { requireUser } from "@/lib/supabase/server";

/** 내가 정한 상단 메뉴 순서·숨김 (없으면 null = 기본) */
export const getNavPrefs = cache(async (): Promise<NavPref[] | null> => {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("user_settings").select("nav_prefs").maybeSingle();
  return (data?.nav_prefs as NavPref[] | null) ?? null;
});
