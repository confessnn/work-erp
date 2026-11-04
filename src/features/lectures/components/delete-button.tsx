"use client";

export function DeleteButton() {
  return (
    <button
      type="submit"
      className="text-sm text-danger hover:underline"
      onClick={(e) => {
        if (!confirm("이 일정을 삭제할까요? 되돌릴 수 없습니다.")) e.preventDefault();
      }}
    >
      이 일정 삭제
    </button>
  );
}
