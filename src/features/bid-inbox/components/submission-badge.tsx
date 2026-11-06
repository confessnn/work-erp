import { SUBMISSION_HINT, SUBMISSION_LABEL, submissionKind, type SubmissionKind } from "../submission";

const CLASS: Record<SubmissionKind, string> = {
  proposal: "bg-violet-100 text-violet-800",
  price: "bg-sky-100 text-sky-800",
  unknown: "text-muted",
};

const ICON: Record<SubmissionKind, React.ReactNode> = {
  // 문서
  proposal: (
    <>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v4h4M9 12h6M9 16h6" />
    </>
  ),
  // 원화 동전
  price: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m7 8 2.5 8L12 9l2.5 7L17 8M6.5 11.5h11" />
    </>
  ),
  // 물음표
  unknown: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17h.01" />
    </>
  ),
};

/** 제안서를 내는 공고인지 가격만 내는 공고인지 보여 주는 표시 */
export function SubmissionBadge({ awardMethod }: { awardMethod: string | null }) {
  const kind = submissionKind(awardMethod);
  return (
    <span className={`badge inline-flex items-center gap-1 ${CLASS[kind]}`} title={SUBMISSION_HINT[kind]}>
      <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICON[kind]}
      </svg>
      {SUBMISSION_LABEL[kind]}
    </span>
  );
}
