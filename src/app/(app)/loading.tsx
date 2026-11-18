/** 화면을 서버에서 만드는 동안 바로 보여 주는 자리 표시 (휴대폰에서 빈 화면이 오래 보이지 않게) */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="불러오는 중" className="space-y-8">
      <div className="h-9 w-40 animate-pulse rounded-xl bg-line/60" />
      <div className="h-36 animate-pulse rounded-2xl bg-line/60" />
      <div className="h-72 animate-pulse rounded-2xl bg-line/60" />
      <div className="h-32 animate-pulse rounded-2xl bg-line/60" />
    </div>
  );
}
