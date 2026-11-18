import type { Metadata } from "next";

export const metadata: Metadata = { title: "수업 도구 · work-erp" };

const SHORTCUTS: [string, string][] = [
  ["Ctrl+Shift+2", "판서 시작 (지금 화면 위에 쓰기)"],
  ["Ctrl+Shift+1", "확대 시작 (휠로 배율, 클릭하면 멈추고 판서)"],
  ["Ctrl+Shift+3", "칠판 (흰 화면에 쓰기)"],
  ["Ctrl+Shift+4", "라이브 줌 (움직이는 화면 그대로 확대, 키보드 입력은 그대로 돼요)"],
  ["Ctrl+휠 (라이브 줌 중)", "라이브 줌 배율"],
  ["왼쪽 클릭 (라이브 줌 중)", "확대된 화면을 멈추고 그 위에 판서 (판서 키도 같아요)"],
  ["P / H / R / L / T", "펜 / 형광펜 / 네모 / 직선 / 글자"],
  ["Ctrl 누른 채 끌기", "그 동안만 네모 (ZoomIt처럼)"],
  ["Shift 누른 채 끌기", "그 동안만 직선 (직선 도구에서는 수평·수직 밑줄)"],
  ["휠 또는 [ ]", "굵기"],
  ["Ctrl+Z / E", "되돌리기 / 모두 지우기"],
  ["W / K", "흰 칠판 / 검은 칠판"],
  ["Z", "확대 화면으로 돌아가기"],
  ["Ctrl+S / Ctrl+C", "바탕화면에 그림 저장 / 그림 복사"],
  ["Esc", "끝내기 (같은 단축키를 다시 눌러도 끝나요)"],
];

/** 수업 때 쓰는 프로그램 내려받기. 파일은 public/downloads, 소스는 tools/ */
export default function ToolsPage() {
  return (
    <>
      <h1 className="page-title">수업 도구</h1>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">수업펜</h2>
            <p className="text-sm text-muted">
              엑셀·PPT·한글 등 어떤 화면 위에든 펜·형광펜·네모·밑줄·글자를 쓰고, 화면을 확대해 그 위에 판서하는 프로그램이에요. 라이브 줌으로 동영상·프로그램이 움직이는 그대로 확대해서 보여 줄 수도 있어요.
            </p>
          </div>
          <a href="/downloads/ClassPen.exe" download="수업펜.exe" className="btn-primary">
            내려받기 (Windows, 41KB)
          </a>
        </div>

        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>설치하지 않아요. 내려받은 파일을 더블클릭하면 작업 표시줄 오른쪽 아래에 아이콘이 생기고 바로 쓸 수 있어요.</li>
          <li>Windows 10·11에 기본으로 있는 .NET만 써서 따로 깔 것이 없어요. USB에 넣어 다녀도 돼요.</li>
          <li>
            처음 실행할 때 <b>“Windows의 PC 보호”</b> 창이 뜨면 <b>추가 정보 → 실행</b>을 눌러 주세요. 직접 만든 프로그램이라 서명이 없어서
            뜨는 안내예요. 학교 PC에서 실행이 막혀 있으면 전산 담당자에게 허용을 요청해야 해요.
          </li>
          <li>
            단축키는 작업 표시줄 아이콘을 오른쪽 클릭 → <b>단축키 설정</b>에서 바꿀 수 있어요. 칸을 누르고 원하는 키를 누르면 돼요. 이 PC에
            저장되고, <b>기본값으로</b> 버튼으로 되돌릴 수 있어요.
          </li>
          <li>끝낼 때는 작업 표시줄 아이콘을 오른쪽 클릭 → <b>종료</b>.</li>
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="section-title">기본 단축키</h2>
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k} className="border-t border-line first:border-t-0">
                <td className="w-40 py-2 pr-3 font-mono text-xs font-semibold whitespace-nowrap sm:w-48">{k}</td>
                <td className="py-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted">판서 화면 위쪽의 도구 막대로도 도구·색·굵기를 바꿀 수 있어요. 도구 막대에는 바꾼 단축키가 표시돼요. Esc·Ctrl+Z·Ctrl+S·Ctrl+C는 바꿀 수 없어요. ‘누른 채 끌면 네모·직선’ 칸에는 Ctrl·Shift·Alt만 눌렀다 떼서 지정해요.</p>
      </section>
    </>
  );
}
