"use client";

import { useState, useTransition } from "react";
import { reviewSeriesAction } from "../actions";

/** 같은 일의 지난 기록을 AI가 돌아보고 개선점을 정리한다 (누를 때마다 새로 정리) */
export function ReviewButton({ seriesKey, count }: { seriesKey: string; count: number }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setError(null);
      const r = await reviewSeriesAction(seriesKey);
      if (r.ok) setText(r.text);
      else setError(r.message);
    });

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title">AI 개선점 정리</h2>
        <button type="button" onClick={run} disabled={pending} className="btn-primary text-sm">
          {pending ? "정리하는 중… (1분쯤)" : text ? "다시 정리" : `기록 ${count}개로 정리하기`}
        </button>
      </div>
      {!text && !error && !pending && (
        <p className="text-sm text-muted">지난 회차 기록을 읽고 반복되는 문제, 잘 된 점, 다음 회차 체크리스트를 뽑아요. 최근 30회차까지 봐요.</p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      {text && <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text}</div>}
      {text && <p className="text-xs text-muted">AI 정리는 저장되지 않아요. 기록에 근거해 쓰지만, 틀릴 수 있으니 기록과 같이 보세요.</p>}
    </section>
  );
}
