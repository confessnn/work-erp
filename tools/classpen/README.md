# 수업펜 (ClassPen)

수업 때 화면 위에 판서·확대하는 윈도우 프로그램. ERP `/tools` 에서 내려받는다.

- 소스: `ClassPen.cs` (C# 5, WinForms, .NET Framework 4.x)
- 빌드: PowerShell 에서 `./build.ps1` → `ClassPen.exe` (윈도우 기본 csc.exe 사용, 설치 불필요)
- 배포: 빌드한 exe 를 `public/downloads/ClassPen.exe` 로 복사해 커밋 (로그인해야 내려받기 가능)

단축키: Ctrl+Shift+2 판서, Ctrl+Shift+1 확대, Ctrl+Shift+3 칠판, Esc 끝내기.
