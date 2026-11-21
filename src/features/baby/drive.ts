import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { decryptSecret } from "@/features/google-calendar/crypto";
import { accessToken, DRIVE_SCOPE, hasScope } from "@/features/google-calendar/google-api";
import { driveContext } from "@/features/google-drive/context";
import { getFamilyRole } from "@/features/family/queries";

/**
 * 아기 사진용 드라이브. 사진은 늘 가족을 만든 사람(사장님)의 드라이브·기록에 저장한다.
 * - 만든 사람: 평소 드라이브 연결 그대로
 * - 가족 구성원(아내): 서버 비밀값으로 잠긴 DB 함수에서 만든 사람의 연결을 받아 서버에서 토큰을 만든다
 */
export async function babyDriveContext() {
  const role = await getFamilyRole();
  if (role.role === "owner") {
    const c = await driveContext();
    return {
      supabase: c.supabase,
      ownerId: c.userId,
      isOwner: true,
      token: c.token,
      docsFolder: c.folders.docs,
      babyFolder: (c.conn.drive_baby_folder_id as string | null) ?? null,
      async setBabyRoot(id: string) {
        await c.supabase.from("google_connections").update({ drive_baby_folder_id: id }).eq("user_id", c.userId);
        // 최상위가 새로 생겼으면 예전 날짜 폴더 기록은 쓸모없음
        await c.supabase.from("baby_folders").delete().eq("user_id", c.userId);
      },
    };
  }

  const { supabase } = await requireUser();
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("서버 설정(CRON_SECRET)이 없어 사진을 올릴 수 없습니다.");
  const { data, error } = await supabase.rpc("family_owner_drive", { p_secret: secret });
  if (error) throw new Error(error.message);
  const conn = (data ?? [])[0] as
    | { owner_id: string; refresh_token_enc: string; scopes: string | null; drive_docs_folder_id: string | null; drive_baby_folder_id: string | null }
    | undefined;
  if (!conn || !hasScope(conn.scopes, DRIVE_SCOPE) || !conn.drive_docs_folder_id) {
    throw new Error("가족 대표 계정의 구글 드라이브가 연결되어 있지 않습니다. 대표 계정에서 '연동'을 먼저 확인해 주세요.");
  }
  const { token } = await accessToken(decryptSecret(conn.refresh_token_enc), [DRIVE_SCOPE]);
  return {
    supabase,
    ownerId: conn.owner_id,
    isOwner: false,
    token,
    docsFolder: conn.drive_docs_folder_id,
    babyFolder: conn.drive_baby_folder_id,
    async setBabyRoot(id: string) {
      const { error: e } = await supabase.rpc("family_set_baby_root", { p_secret: secret, p_folder: id });
      if (e) throw new Error(e.message);
    },
  };
}

export type BabyDriveContext = Awaited<ReturnType<typeof babyDriveContext>>;
