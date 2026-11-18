# 수업펜 (ClassPen)

수업 때 화면 위에 판서·확대하는 윈도우 프로그램. ERP `/tools` 에서 내려받는다.

- 소스: `ClassPen.cs` (C# 5, WinForms, .NET Framework 4.x)
- 빌드: PowerShell 에서 `./build.ps1` → `ClassPen.exe` (윈도우 기본 csc.exe 사용, 설치 불필요)
- 배포: 빌드한 exe 를 `public/downloads/ClassPen.exe` 로 복사해 커밋 (로그인해야 내려받기 가능)

단축키: Ctrl+Shift+2 판서, Ctrl+Shift+1 확대, Ctrl+Shift+3 칠판, Ctrl+Shift+4 라이브 줌, Esc 끝내기.

라이브 줌은 Windows 돋보기와 같은 화면 전체 확대(Magnification API, `MagSetFullscreenTransform`)를 쓴다. 확대는 DWM이 하므로 끊기지 않는다. 확대 위치는 별도 스레드에서 DwmFlush로 화면이 그려지는 박자마다 한 번씩, 마우스 쪽으로 미끄러지듯(남은 거리의 50%) 옮긴다. 마우스가 멈추면 마우스 아래 점이 그대로 마우스 아래에 온다. Ctrl+휠(저수준 마우스 훅)로 배율을 부드럽게 바꾼다. 프로그램이 강제로 꺼져도 Windows가 확대를 풀어 준다. 시험할 때 환경 변수 `CLASSPEN_DEBUG`에 파일 경로를 주면 마지막 확대 상태를 적는다.
