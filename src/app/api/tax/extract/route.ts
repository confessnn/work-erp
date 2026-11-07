import { BoltaError, extractCertificate } from "@/features/tax-invoice/bolta";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 70;

/** Vercel 요청 크기 제한(4.5MB)보다 작게 둔다 */
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/** 사업자등록증을 읽어 내용만 돌려준다. 파일은 저장하지 않는다 */
export async function POST(request: Request) {
  await requireUser();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "파일을 골라 주세요." }, { status: 400 });
  if (!TYPES.includes(file.type)) return Response.json({ error: "PDF, JPG, PNG, WebP 파일만 읽을 수 있습니다." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "4MB 이하 파일로 올려 주세요." }, { status: 400 });

  try {
    return Response.json(await extractCertificate(file));
  } catch (e) {
    const status = e instanceof BoltaError && e.status && e.status >= 400 && e.status < 500 ? 400 : 502;
    return Response.json({ error: e instanceof Error ? e.message : "사업자등록증을 읽지 못했습니다." }, { status });
  }
}
