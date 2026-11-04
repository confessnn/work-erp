"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";

export async function createShareLink(fd: FormData) {
  const { supabase } = await requireUser();
  const label = String(fd.get("label") ?? "").trim() || "가족 공유";
  await supabase.from("share_links").insert({ label: label.slice(0, 50) });
  revalidatePath("/share-settings");
}

export async function deleteShareLink(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("share_links").delete().eq("id", id);
  revalidatePath("/share-settings");
}

export async function setShowOrganization(id: string, show: boolean) {
  const { supabase } = await requireUser();
  await supabase.from("share_links").update({ show_organization: show }).eq("id", id);
  revalidatePath("/share-settings");
}
