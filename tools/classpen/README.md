# 수업펜 (ClassPen)

수업 때 화면 위에 판서·확대하는 윈도우 프로그램. ERP `/tools` 에서 내려받는다.

- 소스: `ClassPen.cs` (C# 5, WinForms, .NET Framework 4.x)
- 빌드: PowerShell 에서 `./build.ps1` → `ClassPen.exe` (윈도우 기본 csc.exe 사용, 설치 불필요)
- 배포: 빌드한 exe 를 `public/downloads/ClassPen.exe` 로 복사해 커밋 (로그인해야 내려받기 가능)

단축키: Ctrl+Shift+2 판서, Ctrl+Shift+1 확대, Ctrl+Shift+3 칠판, Ctrl+Shift+4 라이브 줌, Esc 끝내기.

라이브 줌은 화면을 계속 새로 찍어 확대하는 클릭 통과 창이다. `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`로 자기 창을 화면 찍기에서 빼므로 Windows 10 2004 이상이 필요하다. 그리기는 별도 스레드에서 하고, 한 장면이 28ms를 넘으면 빠른 늘리기(COLORONCOLOR)로 바꾼다. 시험할 때 환경 변수 `CLASSPEN_DEBUG`에 파일 경로를 주면 평균 속도와 확대 화면 한 장을 저장한다.
