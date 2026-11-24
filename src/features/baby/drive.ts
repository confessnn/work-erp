import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { decryptSecret } from "@/features/google-calendar/crypto";
import { accessToken, DRIVE_SCOPE, hasScope } from "@/features/google-calendar/google-api";
import { driveContext } from "@/features/google-drive/context";
import { getFamilyRole } from "@/features/family/queries";

type Db = Awaited<ReturnType<typeof requireUser>>["supabase"];

export type BabyPhotoRow = {
  drive_file_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  sha1: string;
  taken_at: string | null;
  taken_date: string;
  date_source: "exif" | "file" | "manual";
  thumb: string | null;
  width: number | null;
  height: number | null;
};

/**
 * 드라이브 파일 ID·폴더 ID 는 서버만 쓴다 (브라우저가 공개 키로 직접 쓰면 다른 드라이브 파일을 가리킬 수 있음).
 * 서버 비밀값으로 잠근 DB 함수를 부르고, 사진·폴더는 늘 가족을 만든 사람 것으로 저장된다.
 */
function serverWrites(supabase: Db, secret: string) {
  return {
    async addPhoto(row: BabyPhotoRow) {
      const p = Object.fromEntries(Object.entries(row).map(([k, v]) => [`p_${k}`, v]));
      return supabase.rpc("baby_photo_add", { p_secret: secret, ...p });
    },
    async setFolder(key: string, folderId: string) {
      const { error } = await supabase.rpc("baby_folder_set", { p_secret: secret, p_key: key, p_folder_id: folderId });
      if (error) throw new Error(`날짜 폴더를 기록하지 못했습니다: ${error.message}`);
    },
  };
}

function serverSecret() {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("서버 설정(CRON_SECRET)이 없어 사진을 올릴 수 없습니다.");
  return secret;
}

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
      ...serverWrites(c.supabase, serverSecret()),
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
  const secret = serverSecret();
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
    ...serverWrites(supabase, secret),
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
