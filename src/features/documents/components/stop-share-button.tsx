"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { stopBundleSharing } from "../actions";

export function StopShareButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="ml-auto text-danger underline"
      onClick={() => {
        if (!confirm("공유를 중지할까요? 링크로 더 이상 열 수 없고, 드라이브의 압축파일은 휴지통으로 이동합니다.")) return;
        start(async () => {
          const r = await stopBundleSharing(id);
          if (!r.ok) alert(r.error);
          router.refresh();
        });
      }}
    >
      {pending ? "중지 중…" : "공유 중지"}
    </button>
  );
}
