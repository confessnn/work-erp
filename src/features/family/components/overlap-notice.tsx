import type { FormEvent } from "react";

/** 저장하려는 일정과 시간이 겹치는 일정이 있을 때 다시 묻는 상자. [겹쳐도 저장]은 allow_overlap=on 으로 다시 제출한다 */
export function OverlapNotice({ overlaps, pending }: { overlaps: string[]; pending: boolean }) {
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-warn bg-warn/10 p-3 text-sm">
      <p className="font-medium">⚠️ 시간이 겹치는 일정이 있어요</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {overlaps.map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ul>
      <p className="text-muted">그래도 저장할까요? 아니면 시간을 고친 뒤 아래 저장 버튼을 눌러 주세요.</p>
      <button type="submit" name="allow_overlap" value="on" disabled={pending} className="btn-ghost">
        겹쳐도 저장
      </button>
    </div>
  );
}

/** 폼 제출 시 입력칸이 비지 않도록 직접 제출한다. 누른 버튼(name/value)도 함께 보낸다 */
export function submitKeepingInputs(e: FormEvent<HTMLFormElement>, run: (fd: FormData) => void) {
  e.preventDefault();
  const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  run(new FormData(e.currentTarget, submitter));
}
