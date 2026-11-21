import { requireUser } from "@/lib/supabase/server";
import { babyDriveContext } from "@/features/baby/drive";
import { clampRange, isVideo } from "@/features/baby/video";

/**
 * 아기 사진·동영상 원본을 ERP 안에서 보기. 가족 구성원(아내)은 대표 계정 드라이브를 직접 열 수 없어서,
 * 서버가 대표 계정 토큰으로 드라이브에서 받아 그대로 보내 준다. 어떤 파일을 볼 수 있는지는 DB RLS가 정한다.
 * 동영상은 재생기가 나눠 받을 수 있게 Range 요청을 받고, 서버 응답 크기 제한 때문에 한 번에 4MB까지만 보낸다.
 */
export async function GET(req: Request, ctx: RouteContext<"/baby/photo/[id]">) {
  const { id } = await ctx.params;
  const { supabase } = await requireUser();
  const { data: p } = await supabase.from("baby_photos").select("drive_file_id, mime_type, file_name").eq("id", id).maybeSingle();
  if (!p) return new Response("사진을 찾지 못했습니다.", { status: 404 });
  try {
    const drive = await babyDriveContext();
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(p.drive_file_id)}?alt=media`;
    const type = p.mime_type || "application/octet-stream";

    if (isVideo(p.mime_type, p.file_name)) {
      const { start, end } = clampRange(req.headers.get("range"));
      const res = await fetch(url, { headers: { authorization: `Bearer ${drive.token}`, range: `bytes=${start}-${end}` } });
      if (res.status === 416) return new Response(null, { status: 416 });
      if (!res.ok || !res.body) return new Response("드라이브에서 동영상을 받지 못했습니다.", { status: 502 });
      const headers = new Headers({ "content-type": type, "accept-ranges": "bytes", "cache-control": "private, max-age=3600" });
      for (const h of ["content-range", "content-length"]) {
        const v = res.headers.get(h);
        if (v) headers.set(h, v);
      }
      return new Response(res.body, { status: res.status === 206 ? 206 : 200, headers });
    }

    const res = await fetch(url, { headers: { authorization: `Bearer ${drive.token}` } });
    if (!res.ok || !res.body) return new Response("드라이브에서 사진을 받지 못했습니다.", { status: 502 });
    return new Response(res.body, { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "오류", { status: 502 });
  }
}
