# 수업펜 (ClassPen)

수업 때 화면 위에 판서·확대하는 윈도우 프로그램. ERP `/tools` 에서 내려받는다.

- 소스: `ClassPen.cs` (C# 5, WinForms, .NET Framework 4.x)
- 빌드: PowerShell 에서 `./build.ps1` → `ClassPen.exe` (윈도우 기본 csc.exe 사용, 설치 불필요)
- 배포: 빌드한 exe 를 `public/downloads/ClassPen.exe` 로 복사해 커밋 (로그인해야 내려받기 가능)

단축키: Ctrl+Shift+2 판서, Ctrl+Shift+1 확대, Ctrl+Shift+3 칠판, Ctrl+Shift+4 라이브 줌, Esc 끝내기.

라이브 줌은 Windows 돋보기와 같은 화면 전체 확대(Magnification API, `MagSetFullscreenTransform`)를 쓴다. 확대는 DWM이 하므로 화면 내용은 끊기지 않는다. 확대 화면은 마우스가 가운데쪽에 있는 동안 가만히 있고, 보이는 폭의 1/8 가장자리 띠에 닿으면 그만큼만 밀려 움직인다(ZoomIt 공개 소스의 라이브 줌과 같은 방식). 위치는 별도 스레드에서 DwmFlush 박자마다 한 번씩 정하고, Ctrl+휠(저수준 마우스 훅)로 배율을 바꾸면 마우스 자리를 중심으로 부드럽게 커진다. 판서로 넘어갈 때는 보던 원본 영역을 그대로 넘겨 같은 화면을 멈춘다. 프로그램이 강제로 꺼져도 Windows가 확대를 풀어 준다. 시험할 때 환경 변수 `CLASSPEN_DEBUG`에 파일 경로를 주면 움직임 기록을 적는다.
