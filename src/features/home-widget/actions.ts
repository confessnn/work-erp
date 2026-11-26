"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";

export async function createWidgetToken() {
  const { supabase } = await requireUser();
  await supabase.from("widget_tokens").insert({});
  revalidatePath("/share-settings");
}

export async function deleteWidgetToken(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("widget_tokens").delete().eq("id", id);
  revalidatePath("/share-settings");
}
