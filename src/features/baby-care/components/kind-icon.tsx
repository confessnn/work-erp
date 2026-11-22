import { kindInfo, type CareKind } from "../care";

/** 기저귀 이모지가 없어서 직접 그린 기저귀 모양 (글자 크기를 따라간다) */
export function DiaperIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden className="inline-block align-[-0.125em]">
      {/* 몸통: 위는 넓고 양옆은 다리 구멍으로 파인 모양 */}
      <path
        d="M1.8 4.5h20.4v3.6c0 1.2-2.6 1.9-3.6 4.4-1 2.7-2.6 7-6.6 7s-5.6-4.3-6.6-7C4.4 10 1.8 9.3 1.8 8.1z"
        fill="#fbf6ee"
        stroke="#a87b55"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {/* 허리 밴드 */}
      <path d="M1.8 4.5h20.4v2.6H1.8z" fill="#e9dcc8" stroke="#a87b55" strokeWidth="1.3" strokeLinejoin="round" />
      {/* 가운데 패드 */}
      <path d="M8.6 9.2h6.8c-.3 3.6-1.5 7.4-3.4 7.4s-3.1-3.8-3.4-7.4z" fill="#f1e6d6" />
      {/* 양쪽 테이프 */}
      <rect x="2.6" y="8" width="3" height="1.8" rx=".6" fill="#7fb0e6" transform="rotate(-20 4.1 8.9)" />
      <rect x="18.4" y="8" width="3" height="1.8" rx=".6" fill="#7fb0e6" transform="rotate(20 19.9 8.9)" />
    </svg>
  );
}

/** 기록 종류 아이콘 (기저귀만 그림, 나머지는 이모지) */
export function KindIcon({ kind }: { kind: CareKind }) {
  return kind === "diaper" ? <DiaperIcon /> : <>{kindInfo(kind).icon}</>;
}
