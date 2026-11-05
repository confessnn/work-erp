import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { decryptSecret } from "@/features/google-calendar/crypto";
import { accessToken, DRIVE_SCOPE, hasScope } from "@/features/google-calendar/google-api";
import { ensureFolders } from "@/features/documents/drive";

/**
 * 서버용 드라이브 토큰(드라이브 권한만) + work-erp 폴더 (없으면 생성).
 * 서류함·아기 사진 등 드라이브를 쓰는 기능이 공통으로 사용. ('use server' 파일이 아니라 브라우저에서 호출 불가)
 */
export async function driveContext() {
  const { supabase, userId } = await requireUser();
  const { data: conn } = await supabase.from("google_connections").select("*").maybeSingle();
  if (!conn) throw new Error("구글이 연결되어 있지 않습니다. '연동' 화면에서 연결해주세요.");
  if (!hasScope(conn.scopes, DRIVE_SCOPE)) {
    throw new Error("드라이브 권한이 없습니다. '연동' 화면에서 구글을 다시 연결해주세요.");
  }
  const { token } = await accessToken(decryptSecret(conn.refresh_token_enc), [DRIVE_SCOPE]);
  const folders = await ensureFolders(token, { docs: conn.drive_docs_folder_id, bundles: conn.drive_bundles_folder_id });
  if (folders.changed) {
    await supabase
      .from("google_connections")
      .update({ drive_docs_folder_id: folders.docs, drive_bundles_folder_id: folders.bundles })
      .eq("user_id", userId);
  }
  return { supabase, userId, token, conn, folders };
}

export const failResult = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "알 수 없는 오류" });
