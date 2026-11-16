# 수업펜 빌드: 윈도우에 기본으로 있는 .NET Framework 4.x 컴파일러(csc.exe)만 쓴다. 따로 설치할 것 없음.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { $csc = "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe" }

# 실행 파일 아이콘 (트레이 아이콘과 같은 그림)
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 32, 32
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(10, 10, 10))), 1, 1, 30, 30)
$p = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(232, 185, 74)), 4
$p.StartCap = $p.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($p, 9, 23, 23, 9)
$g.DrawLine((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 250, 240)), 2), 8, 25, 13, 25)
$g.Dispose()
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$ico = Join-Path $here "ClassPen.ico"
$fs = [System.IO.File]::Create($ico); $icon.Save($fs); $fs.Close()

$out = Join-Path $here "ClassPen.exe"
& $csc /nologo /target:winexe /optimize+ /codepage:65001 "/win32icon:$ico" "/out:$out" `
  /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll (Join-Path $here "ClassPen.cs")
if ($LASTEXITCODE -ne 0) { throw "빌드 실패" }
Get-Item $out | Select-Object Name, Length
