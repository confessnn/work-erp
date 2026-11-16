// 수업펜 (ClassPen) - 수업용 화면 판서·확대 도구
// 빌드: build.ps1 (윈도우 기본 .NET Framework 4.x 의 csc.exe, C# 5)
// 단축키: Ctrl+Shift+1 확대 / Ctrl+Shift+2 판서 / Ctrl+Shift+3 칠판
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace ClassPen
{
    static class Program
    {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
        [DllImport("shcore.dll")] static extern int SetProcessDpiAwareness(int value);

        [STAThread]
        static void Main()
        {
            bool created;
            using (var mutex = new Mutex(true, "ClassPen_SingleInstance_v1", out created))
            {
                if (!created)
                {
                    MessageBox.Show("수업펜이 이미 실행 중이에요.\n작업 표시줄 오른쪽 아래 아이콘을 확인하세요.", "수업펜");
                    return;
                }
                // 고해상도 화면에서 흐려지지 않도록 실제 픽셀 단위로 동작
                try { SetProcessDpiAwareness(2); } catch { try { SetProcessDPIAware(); } catch { } }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new TrayApp());
            }
        }
    }

    public enum StartMode { Draw, Zoom, Board }

    /// <summary>작업 표시줄 아이콘 + 전역 단축키</summary>
    class TrayApp : ApplicationContext
    {
        const int MOD_CONTROL = 0x2, MOD_SHIFT = 0x4, MOD_NOREPEAT = 0x4000, WM_HOTKEY = 0x312;
        [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, int mods, int vk);
        [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        readonly NotifyIcon tray;
        readonly HotkeyWindow hotkeys;
        Overlay current;

        class HotkeyWindow : NativeWindow
        {
            public Action<int> OnHotkey;
            public HotkeyWindow() { CreateHandle(new CreateParams()); }
            protected override void WndProc(ref Message m)
            {
                if (m.Msg == WM_HOTKEY && OnHotkey != null) OnHotkey(m.WParam.ToInt32());
                base.WndProc(ref m);
            }
        }

        public TrayApp()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("판서 시작 (Ctrl+Shift+2)", null, delegate { Open(StartMode.Draw); });
            menu.Items.Add("확대 시작 (Ctrl+Shift+1)", null, delegate { Open(StartMode.Zoom); });
            menu.Items.Add("칠판 열기 (Ctrl+Shift+3)", null, delegate { Open(StartMode.Board); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("사용법", null, delegate { ShowHelp(); });
            menu.Items.Add("종료", null, delegate { ExitThread(); });

            tray = new NotifyIcon();
            tray.Icon = Art.MakeIcon();
            tray.Text = "수업펜 - Ctrl+Shift+2 판서 / Ctrl+Shift+1 확대";
            tray.ContextMenuStrip = menu;
            tray.Visible = true;
            tray.MouseClick += delegate (object s, MouseEventArgs e) { if (e.Button == MouseButtons.Left) Open(StartMode.Draw); };

            hotkeys = new HotkeyWindow();
            hotkeys.OnHotkey = delegate (int id)
            {
                if (id == 1) Open(StartMode.Zoom);
                else if (id == 2) Open(StartMode.Draw);
                else if (id == 3) Open(StartMode.Board);
            };
            var failed = new List<string>();
            if (!RegisterHotKey(hotkeys.Handle, 1, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, (int)Keys.D1)) failed.Add("Ctrl+Shift+1");
            if (!RegisterHotKey(hotkeys.Handle, 2, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, (int)Keys.D2)) failed.Add("Ctrl+Shift+2");
            if (!RegisterHotKey(hotkeys.Handle, 3, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, (int)Keys.D3)) failed.Add("Ctrl+Shift+3");

            string msg = failed.Count == 0
                ? "Ctrl+Shift+2 판서, Ctrl+Shift+1 확대, Ctrl+Shift+3 칠판. Esc로 끝내요."
                : "다른 프로그램이 쓰고 있어 " + string.Join(", ", failed.ToArray()) + " 단축키를 못 썼어요. 아이콘 메뉴로 실행하세요.";
            tray.ShowBalloonTip(4000, "수업펜 실행 중", msg, ToolTipIcon.Info);
        }

        void Open(StartMode mode)
        {
            // 열려 있으면 같은 단축키로 닫는다
            if (current != null && !current.IsDisposed) { current.Close(); return; }
            current = new Overlay(Screen.FromPoint(Cursor.Position), mode);
            current.FormClosed += delegate { current = null; };
            current.Show();
            current.Activate();
        }

        void ShowHelp()
        {
            MessageBox.Show(
                "■ 시작\n" +
                "  Ctrl+Shift+2  판서 (지금 화면 위에 쓰기)\n" +
                "  Ctrl+Shift+1  확대 (휠로 배율, 클릭하면 멈추고 판서)\n" +
                "  Ctrl+Shift+3  칠판 (흰 화면에 쓰기)\n\n" +
                "■ 판서 중\n" +
                "  P 펜   H 형광펜   R 네모   L 직선(Shift: 수평·수직)   T 글자\n" +
                "  휠 / [ ]  굵기     Ctrl+Z 되돌리기     E 모두 지우기\n" +
                "  W 흰 칠판   K 검은 칠판   Z 확대로 돌아가기\n" +
                "  Ctrl+S 바탕화면에 그림 저장   Ctrl+C 그림 복사\n" +
                "  Esc 끝내기 (같은 단축키를 다시 눌러도 끝나요)",
                "수업펜 사용법");
        }

        protected override void ExitThreadCore()
        {
            if (current != null && !current.IsDisposed) current.Close();
            UnregisterHotKey(hotkeys.Handle, 1);
            UnregisterHotKey(hotkeys.Handle, 2);
            UnregisterHotKey(hotkeys.Handle, 3);
            hotkeys.DestroyHandle();
            tray.Visible = false;
            tray.Dispose();
            base.ExitThreadCore();
        }
    }

    enum Tool { Pen, Marker, Rect, Line, Text }

    class Shape
    {
        public Tool Tool;
        public Color Color;
        public float Width;
        public List<PointF> Points = new List<PointF>();
        public string Text;

        public void Draw(Graphics g)
        {
            if (Points.Count == 0) return;
            if (Tool == Tool.Text)
            {
                using (var f = Art.TextFont(Width))
                using (var b = new SolidBrush(Color))
                    g.DrawString(Text ?? "", f, b, Points[0]);
                return;
            }
            Color c = Tool == Tool.Marker ? Color.FromArgb(110, Color) : Color;
            float w = Tool == Tool.Marker ? Width * 3.5f : Width;
            using (var p = new Pen(c, w))
            {
                p.StartCap = p.EndCap = Tool == Tool.Marker ? LineCap.Square : LineCap.Round;
                p.LineJoin = LineJoin.Round;
                if (Tool == Tool.Rect)
                {
                    PointF a = Points[0], b = Points[Points.Count - 1];
                    g.DrawRectangle(p, Math.Min(a.X, b.X), Math.Min(a.Y, b.Y), Math.Abs(a.X - b.X), Math.Abs(a.Y - b.Y));
                }
                else if (Tool == Tool.Line)
                {
                    g.DrawLine(p, Points[0], Points[Points.Count - 1]);
                }
                else if (Points.Count == 1)
                {
                    using (var b = new SolidBrush(c)) g.FillEllipse(b, Points[0].X - w / 2, Points[0].Y - w / 2, w, w);
                }
                else
                {
                    // 형광펜이 겹쳐도 진해지지 않도록 한 경로로 그린다
                    using (var path = new GraphicsPath())
                    {
                        path.AddLines(Points.ToArray());
                        g.DrawPath(p, path);
                    }
                }
            }
        }
    }

    static class Art
    {
        public static Font TextFont(float width) { return new Font("맑은 고딕", 14f + width * 3f, FontStyle.Bold, GraphicsUnit.Pixel); }

        public static Icon MakeIcon()
        {
            using (var bmp = new Bitmap(32, 32))
            {
                using (var g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    using (var bg = new SolidBrush(Color.FromArgb(10, 10, 10))) g.FillEllipse(bg, 1, 1, 30, 30);
                    using (var p = new Pen(Color.FromArgb(232, 185, 74), 4f)) { p.StartCap = p.EndCap = LineCap.Round; g.DrawLine(p, 9, 23, 23, 9); }
                    using (var p = new Pen(Color.FromArgb(255, 250, 240), 2f)) g.DrawLine(p, 8, 25, 13, 25);
                }
                return Icon.FromHandle(bmp.GetHicon());
            }
        }
    }

    /// <summary>화면을 덮는 판서·확대 창. 화면을 찍어 두고 그 위에 그린다.</summary>
    class Overlay : Form
    {
        static readonly Color[] Palette = { Color.FromArgb(230, 30, 40), Color.FromArgb(20, 90, 230), Color.FromArgb(20, 160, 60), Color.FromArgb(250, 200, 0), Color.Black, Color.White };
        static readonly string[] PaletteNames = { "빨강", "파랑", "초록", "노랑", "검정", "흰색" };
        static readonly float[] Widths = { 2f, 4f, 6f, 9f, 14f };

        readonly Bitmap shot;          // 시작할 때 찍은 화면
        Bitmap cache;                  // 배경 + 끝난 그림
        readonly List<Shape> shapes = new List<Shape>();
        Shape drawing;
        Tool tool = Tool.Pen;
        Color color = Palette[0];
        int widthIndex = 1;

        bool zoomLive;                 // 마우스를 따라 확대 중 (판서 안 됨)
        float zoom = 1f;
        RectangleF zoomSrc;            // 확대할 때 보여 주는 원본 영역
        int board;                     // 0 없음, 1 흰 칠판, 2 검은 칠판

        readonly FlowLayoutPanel bar;
        readonly Label status;
        readonly Dictionary<Tool, Button> toolButtons = new Dictionary<Tool, Button>();
        readonly List<Button> colorButtons = new List<Button>();
        TextBox textBox;

        public Overlay(Screen screen, StartMode mode)
        {
            Rectangle b = screen.Bounds;
            shot = new Bitmap(b.Width, b.Height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(shot)) g.CopyFromScreen(b.Location, Point.Empty, b.Size);

            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            Bounds = b;
            TopMost = true;
            ShowInTaskbar = false;
            KeyPreview = true;
            DoubleBuffered = true;
            Cursor = Cursors.Cross;
            Text = "수업펜";

            bar = new FlowLayoutPanel();
            bar.AutoSize = true;
            bar.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            bar.WrapContents = false;
            bar.BackColor = Color.FromArgb(255, 250, 240);
            bar.Padding = new Padding(6);
            bar.Cursor = Cursors.Default;
            AddToolButton("펜 P", Tool.Pen);
            AddToolButton("형광펜 H", Tool.Marker);
            AddToolButton("네모 R", Tool.Rect);
            AddToolButton("직선 L", Tool.Line);
            AddToolButton("글자 T", Tool.Text);
            AddGap();
            for (int i = 0; i < Palette.Length; i++) AddColorButton(i);
            AddGap();
            AddButton("가늘게 [", delegate { SetWidth(widthIndex - 1); });
            AddButton("굵게 ]", delegate { SetWidth(widthIndex + 1); });
            AddGap();
            AddButton("되돌리기", delegate { Undo(); });
            AddButton("모두 지우기", delegate { ClearAll(); });
            AddGap();
            AddButton("확대 Z", delegate { StartZoom(); });
            AddButton("칠판 W", delegate { ToggleBoard(1); });
            AddButton("저장", delegate { SaveImage(); });
            AddButton("끝내기 Esc", delegate { Close(); });
            status = new Label();
            status.AutoSize = true;
            status.Margin = new Padding(10, 9, 4, 0);
            status.ForeColor = Color.FromArgb(90, 90, 90);
            bar.Controls.Add(status);
            Controls.Add(bar);

            if (mode == StartMode.Board) { board = 1; color = Color.Black; }
            if (mode == StartMode.Zoom) { zoom = 2f; zoomLive = true; }
            UpdateZoomSrc(PointToClientSafe(Cursor.Position));
            Rebuild();
            RefreshBar();
        }

        Point PointToClientSafe(Point screenPt) { return new Point(screenPt.X - Bounds.X, screenPt.Y - Bounds.Y); }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            bar.Location = new Point((ClientSize.Width - bar.Width) / 2, 12);
        }

        // ---------- 도구 막대 ----------
        Button MakeButton(string text)
        {
            var btn = new Button();
            btn.Text = text;
            btn.AutoSize = true;
            btn.FlatStyle = FlatStyle.Flat;
            btn.FlatAppearance.BorderColor = Color.FromArgb(232, 226, 210);
            btn.Font = new Font("맑은 고딕", 10f);
            btn.Margin = new Padding(2);
            btn.TabStop = false;
            btn.UseVisualStyleBackColor = false;
            btn.BackColor = Color.White;
            return btn;
        }
        void AddButton(string text, EventHandler onClick) { var b = MakeButton(text); b.Click += onClick; bar.Controls.Add(b); }
        void AddToolButton(string text, Tool t)
        {
            var b = MakeButton(text);
            b.Click += delegate { SetTool(t); };
            toolButtons[t] = b;
            bar.Controls.Add(b);
        }
        void AddColorButton(int i)
        {
            var b = MakeButton("");
            b.AutoSize = false;
            b.Size = new Size(30, 30);
            b.BackColor = Palette[i];
            b.Tag = Palette[i];
            new ToolTip().SetToolTip(b, PaletteNames[i]);
            b.Click += delegate { color = Palette[i]; if (zoomLive) LockZoom(); RefreshBar(); };
            colorButtons.Add(b);
            bar.Controls.Add(b);
        }
        void AddGap() { var p = new Panel(); p.Size = new Size(10, 30); bar.Controls.Add(p); }

        void RefreshBar()
        {
            foreach (var kv in toolButtons)
                kv.Value.BackColor = kv.Key == tool && !zoomLive ? Color.FromArgb(232, 185, 74) : Color.White;
            foreach (var b in colorButtons)
            {
                bool on = (Color)b.Tag == color;
                b.FlatAppearance.BorderSize = on ? 3 : 1;
                b.FlatAppearance.BorderColor = on ? Color.FromArgb(10, 10, 10) : Color.FromArgb(200, 200, 200);
            }
            status.Text = zoomLive
                ? "확대 " + zoom.ToString("0.#") + "배 · 휠로 배율 · 클릭하면 멈추고 판서"
                : "굵기 " + (widthIndex + 1) + (zoom > 1f ? " · 확대 " + zoom.ToString("0.#") + "배" : "");
            if (IsHandleCreated) bar.Location = new Point((ClientSize.Width - bar.Width) / 2, bar.Location.Y);
        }

        void SetTool(Tool t) { CommitText(); if (zoomLive) LockZoom(); tool = t; Cursor = t == Tool.Text ? Cursors.IBeam : Cursors.Cross; RefreshBar(); }
        void SetWidth(int i) { widthIndex = Math.Max(0, Math.Min(Widths.Length - 1, i)); RefreshBar(); }

        // ---------- 그리기 ----------
        void DrawBackground(Graphics g)
        {
            if (board == 1) { g.Clear(Color.White); return; }
            if (board == 2) { g.Clear(Color.FromArgb(25, 35, 30)); return; }
            if (zoom > 1f)
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.Half;
                g.DrawImage(shot, new RectangleF(0, 0, ClientSize.Width, ClientSize.Height), zoomSrc, GraphicsUnit.Pixel);
            }
            else g.DrawImageUnscaled(shot, 0, 0);
        }

        void Rebuild()
        {
            if (cache != null) cache.Dispose();
            cache = new Bitmap(shot.Width, shot.Height, PixelFormat.Format32bppPArgb);
            using (var g = Graphics.FromImage(cache))
            {
                DrawBackground(g);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                foreach (var s in shapes) s.Draw(g);
            }
            Invalidate();
        }

        protected override void OnPaintBackground(PaintEventArgs e) { }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.DrawImageUnscaled(cache, 0, 0);
            if (drawing != null)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                drawing.Draw(e.Graphics);
            }
            if (zoomLive)
            {
                using (var p = new Pen(Color.FromArgb(232, 185, 74), 4f)) e.Graphics.DrawRectangle(p, 2, 2, ClientSize.Width - 4, ClientSize.Height - 4);
            }
        }

        // ---------- 확대 ----------
        void UpdateZoomSrc(Point mouse)
        {
            float w = shot.Width / zoom, h = shot.Height / zoom;
            // 마우스 아래의 점이 확대해도 마우스 아래에 있도록
            float x = mouse.X - mouse.X / zoom, y = mouse.Y - mouse.Y / zoom;
            x = Math.Max(0, Math.Min(shot.Width - w, x));
            y = Math.Max(0, Math.Min(shot.Height - h, y));
            zoomSrc = new RectangleF(x, y, w, h);
        }

        void StartZoom()
        {
            CommitText();
            if (shapes.Count > 0 && MessageBox.Show(this, "확대 화면으로 돌아가면 지금 그린 것이 지워져요. 계속할까요?", "수업펜", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
            shapes.Clear();
            board = 0;
            if (zoom < 1.25f) zoom = 2f;
            zoomLive = true;
            UpdateZoomSrc(PointToClient(Cursor.Position));
            Rebuild();
            RefreshBar();
        }

        void LockZoom() { zoomLive = false; Rebuild(); RefreshBar(); }

        // ---------- 마우스 ----------
        bool OnBar(Point p) { return bar.Bounds.Contains(p); }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button != MouseButtons.Left) return;
            if (zoomLive) { LockZoom(); return; }
            CommitText();
            if (tool == Tool.Text) { StartText(e.Location); return; }
            drawing = new Shape();
            drawing.Tool = tool;
            drawing.Color = color;
            drawing.Width = Widths[widthIndex];
            drawing.Points.Add(e.Location);
            if (tool == Tool.Rect || tool == Tool.Line) drawing.Points.Add(e.Location);
            Capture = true;
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            if (zoomLive) { UpdateZoomSrc(e.Location); Rebuild(); return; }
            if (drawing == null) return;
            PointF p = e.Location;
            if (drawing.Tool == Tool.Rect || drawing.Tool == Tool.Line)
            {
                if (drawing.Tool == Tool.Line && (ModifierKeys & Keys.Shift) != 0)
                {
                    PointF a = drawing.Points[0];
                    if (Math.Abs(p.X - a.X) >= Math.Abs(p.Y - a.Y)) p = new PointF(p.X, a.Y); else p = new PointF(a.X, p.Y);
                }
                drawing.Points[1] = p;
            }
            else
            {
                PointF last = drawing.Points[drawing.Points.Count - 1];
                if (Math.Abs(last.X - p.X) + Math.Abs(last.Y - p.Y) < 1.5f) return;
                drawing.Points.Add(p);
            }
            Invalidate();
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            if (drawing == null) return;
            Capture = false;
            shapes.Add(drawing);
            using (var g = Graphics.FromImage(cache)) { g.SmoothingMode = SmoothingMode.AntiAlias; drawing.Draw(g); }
            drawing = null;
            Invalidate();
        }

        protected override void OnMouseWheel(MouseEventArgs e)
        {
            base.OnMouseWheel(e);
            if (zoomLive)
            {
                zoom = Math.Max(1.25f, Math.Min(8f, zoom * (e.Delta > 0 ? 1.25f : 0.8f)));
                UpdateZoomSrc(e.Location);
                Rebuild();
                RefreshBar();
            }
            else SetWidth(widthIndex + (e.Delta > 0 ? 1 : -1));
        }

        // ---------- 글자 ----------
        void StartText(Point at)
        {
            textBox = new TextBox();
            textBox.BorderStyle = BorderStyle.FixedSingle;
            textBox.Font = Art.TextFont(Widths[widthIndex]);
            textBox.ForeColor = color == Color.White ? Color.Black : color;
            textBox.BackColor = Color.FromArgb(255, 252, 235);
            textBox.Location = at;
            textBox.Width = Math.Max(200, Math.Min(900, ClientSize.Width - at.X - 20));
            textBox.KeyDown += delegate (object s, KeyEventArgs k)
            {
                if (k.KeyCode == Keys.Enter) { CommitText(); k.SuppressKeyPress = true; }
                else if (k.KeyCode == Keys.Escape) { CancelText(); k.SuppressKeyPress = true; k.Handled = true; }
            };
            Controls.Add(textBox);
            textBox.BringToFront();
            textBox.Focus();
            // 클릭 처리가 끝난 뒤 한 번 더 초점을 줘서, 바로 입력해도 글자가 단축키로 새지 않게 한다
            var tb = textBox;
            BeginInvoke((MethodInvoker)delegate { if (tb == textBox && !tb.IsDisposed) { Activate(); tb.Focus(); } });
        }

        void CommitText()
        {
            if (textBox == null) return;
            string t = textBox.Text.Trim();
            Point at = textBox.Location;
            Controls.Remove(textBox);
            textBox.Dispose();
            textBox = null;
            if (t.Length == 0) return;
            var s = new Shape();
            s.Tool = Tool.Text;
            s.Color = color;
            s.Width = Widths[widthIndex];
            s.Text = t;
            s.Points.Add(new PointF(at.X + 2, at.Y + 2));
            shapes.Add(s);
            Rebuild();
            Focus();
        }

        void CancelText()
        {
            if (textBox == null) return;
            Controls.Remove(textBox);
            textBox.Dispose();
            textBox = null;
            Focus();
        }

        // ---------- 키보드 ----------
        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            if (textBox != null) return; // 글자 입력 중에는 단축키를 쓰지 않는다
            if (e.KeyCode == Keys.Escape) { Close(); return; }
            if (e.Control && e.KeyCode == Keys.Z) { Undo(); return; }
            if (e.Control && e.KeyCode == Keys.S) { SaveImage(); return; }
            if (e.Control && e.KeyCode == Keys.C) { CopyImage(); return; }
            if (e.Control || e.Alt) return;
            switch (e.KeyCode)
            {
                case Keys.P: SetTool(Tool.Pen); break;
                case Keys.H: SetTool(Tool.Marker); break;
                case Keys.R: SetTool(Tool.Rect); break;
                case Keys.L: SetTool(Tool.Line); break;
                case Keys.T: SetTool(Tool.Text); break;
                case Keys.E: ClearAll(); break;
                case Keys.W: ToggleBoard(1); break;
                case Keys.K: ToggleBoard(2); break;
                case Keys.Z: StartZoom(); break;
                case Keys.OemOpenBrackets: SetWidth(widthIndex - 1); break;
                case Keys.OemCloseBrackets: SetWidth(widthIndex + 1); break;
            }
        }

        void Undo() { CommitText(); if (shapes.Count == 0) return; shapes.RemoveAt(shapes.Count - 1); Rebuild(); }
        void ClearAll() { CommitText(); shapes.Clear(); Rebuild(); }

        void ToggleBoard(int kind)
        {
            CommitText();
            board = board == kind ? 0 : kind;
            zoomLive = false;
            if (board == 1 && color == Color.White) color = Color.Black;
            if (board == 2 && color == Color.Black) color = Color.White;
            Rebuild();
            RefreshBar();
        }

        Bitmap Snapshot()
        {
            // 도구 막대 없이 지금 그림만
            var bmp = new Bitmap(cache.Width, cache.Height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp)) g.DrawImageUnscaled(cache, 0, 0);
            return bmp;
        }

        void SaveImage()
        {
            CommitText();
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "수업펜 캡처");
            Directory.CreateDirectory(dir);
            string file = Path.Combine(dir, DateTime.Now.ToString("yyyy-MM-dd HHmmss") + ".png");
            using (var bmp = Snapshot()) bmp.Save(file, ImageFormat.Png);
            status.Text = "저장함: 바탕화면\\수업펜 캡처";
        }

        void CopyImage()
        {
            CommitText();
            using (var bmp = Snapshot()) Clipboard.SetImage(bmp);
            status.Text = "그림을 복사했어요";
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            base.OnFormClosed(e);
            shot.Dispose();
            if (cache != null) cache.Dispose();
        }
    }
}
