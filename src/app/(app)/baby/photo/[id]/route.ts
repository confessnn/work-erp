import { requireUser } from "@/lib/supabase/server";
import { babyDriveContext } from "@/features/baby/drive";

/**
 * 아기 사진 원본을 ERP 안에서 보기. 가족 구성원(아내)은 대표 계정 드라이브를 직접 열 수 없어서,
 * 서버가 대표 계정 토큰으로 드라이브에서 받아 그대로 보내 준다. 어떤 사진을 볼 수 있는지는 DB RLS가 정한다.
 */
export async function GET(_req: Request, ctx: RouteContext<"/baby/photo/[id]">) {
  const { id } = await ctx.params;
  const { supabase } = await requireUser();
  const { data: p } = await supabase.from("baby_photos").select("drive_file_id, mime_type").eq("id", id).maybeSingle();
  if (!p) return new Response("사진을 찾지 못했습니다.", { status: 404 });
  try {
    const drive = await babyDriveContext();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(p.drive_file_id)}?alt=media`, {
      headers: { authorization: `Bearer ${drive.token}` },
    });
    if (!res.ok || !res.body) return new Response("드라이브에서 사진을 받지 못했습니다.", { status: 502 });
    return new Response(res.body, {
      headers: {
        "content-type": p.mime_type || res.headers.get("content-type") || "application/octet-stream",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "오류", { status: 502 });
  }
}
