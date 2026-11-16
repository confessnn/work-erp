// 수업펜 (ClassPen) - 수업용 화면 판서·확대 도구
// 빌드: build.ps1 (윈도우 기본 .NET Framework 4.x 의 csc.exe, C# 5)
// 기본 단축키: Ctrl+Shift+1 확대 / Ctrl+Shift+2 판서 / Ctrl+Shift+3 칠판 (아이콘 메뉴 '단축키 설정'에서 변경)
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
        static void Main(string[] args)
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
                Application.Run(new TrayApp(Array.IndexOf(args, "--settings") >= 0));
            }
        }
    }

    public enum StartMode { Draw, Zoom, Board }

    /// <summary>단축키 하나 (설정 화면에서 바꿀 수 있다)</summary>
    class KeyAction
    {
        public readonly string Id, Label;
        public readonly Keys Default;
        public readonly bool Global; // 다른 프로그램을 쓰는 중에도 동작 (판서·확대·칠판 시작)
        public KeyAction(string id, string label, Keys def, bool global) { Id = id; Label = label; Default = def; Global = global; }
    }

    /// <summary>단축키 저장·불러오기. %APPDATA%\수업펜\단축키.txt 에 "id=키" 줄로 저장</summary>
    static class Hotkeys
    {
        public static readonly KeyAction[] All =
        {
            new KeyAction("draw", "판서 시작", Keys.Control | Keys.Shift | Keys.D2, true),
            new KeyAction("zoom", "확대 시작", Keys.Control | Keys.Shift | Keys.D1, true),
            new KeyAction("board", "칠판 열기", Keys.Control | Keys.Shift | Keys.D3, true),
            new KeyAction("pen", "펜", Keys.P, false),
            new KeyAction("marker", "형광펜", Keys.H, false),
            new KeyAction("rect", "네모", Keys.R, false),
            new KeyAction("line", "직선", Keys.L, false),
            new KeyAction("text", "글자", Keys.T, false),
            new KeyAction("thinner", "가늘게", Keys.OemOpenBrackets, false),
            new KeyAction("thicker", "굵게", Keys.OemCloseBrackets, false),
            new KeyAction("clear", "모두 지우기", Keys.E, false),
            new KeyAction("white", "흰 칠판", Keys.W, false),
            new KeyAction("black", "검은 칠판", Keys.K, false),
            new KeyAction("zoomback", "확대로 돌아가기", Keys.Z, false),
        };

        static Dictionary<string, Keys> map;

        static string FilePath
        {
            get { return Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "수업펜"), "단축키.txt"); }
        }

        public static Dictionary<string, Keys> Defaults()
        {
            var d = new Dictionary<string, Keys>();
            foreach (var a in All) d[a.Id] = a.Default;
            return d;
        }

        public static void Load()
        {
            map = Defaults();
            try
            {
                if (!File.Exists(FilePath)) return;
                foreach (var line in File.ReadAllLines(FilePath))
                {
                    int i = line.IndexOf('=');
                    if (i <= 0) continue;
                    string id = line.Substring(0, i).Trim();
                    if (!map.ContainsKey(id)) continue;
                    Keys k;
                    try { k = (Keys)Enum.Parse(typeof(Keys), line.Substring(i + 1).Trim()); } catch { continue; }
                    map[id] = k;
                }
            }
            catch { map = Defaults(); }
        }

        public static void Save(Dictionary<string, Keys> next)
        {
            map = new Dictionary<string, Keys>(next);
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
            var lines = new List<string>();
            foreach (var a in All) lines.Add(a.Id + "=" + map[a.Id].ToString());
            File.WriteAllLines(FilePath, lines.ToArray());
        }

        public static Keys Get(string id) { if (map == null) Load(); Keys k; return map.TryGetValue(id, out k) ? k : Keys.None; }

        /// <summary>Keys → "Ctrl+Shift+2" 같은 글자</summary>
        public static string Text(Keys k)
        {
            if (k == Keys.None) return "없음";
            var parts = new List<string>();
            if ((k & Keys.Control) != 0) parts.Add("Ctrl");
            if ((k & Keys.Alt) != 0) parts.Add("Alt");
            if ((k & Keys.Shift) != 0) parts.Add("Shift");
            Keys code = k & Keys.KeyCode;
            if (code == Keys.None) return string.Join("+", parts.ToArray());
            string name;
            if (code >= Keys.D0 && code <= Keys.D9) name = ((int)(code - Keys.D0)).ToString();
            else if (code >= Keys.NumPad0 && code <= Keys.NumPad9) name = "숫자패드" + (int)(code - Keys.NumPad0);
            else if (code == Keys.OemOpenBrackets) name = "[";
            else if (code == Keys.OemCloseBrackets) name = "]";
            else if (code == Keys.Oemcomma) name = ",";
            else if (code == Keys.OemPeriod) name = ".";
            else if (code == Keys.OemMinus) name = "-";
            else if (code == Keys.Oemplus) name = "=";
            else if (code == Keys.OemQuestion) name = "/";
            else if (code == Keys.OemSemicolon) name = ";";
            else if (code == Keys.OemQuotes) name = "'";
            else if (code == Keys.Oemtilde) name = "`";
            else if (code == Keys.Space) name = "스페이스";
            else name = code.ToString();
            parts.Add(name);
            return string.Join("+", parts.ToArray());
        }

        public static bool IsModifierOnly(Keys code)
        {
            return code == Keys.ControlKey || code == Keys.ShiftKey || code == Keys.Menu || code == Keys.LWin || code == Keys.RWin || code == Keys.None;
        }
    }

    /// <summary>단축키 설정 창: 칸을 누르고 원하는 키를 누르면 바뀐다</summary>
    class SettingsForm : Form
    {
        readonly Dictionary<string, Keys> working = new Dictionary<string, Keys>();
        readonly Dictionary<string, TextBox> boxes = new Dictionary<string, TextBox>();
        readonly Label message;

        public SettingsForm()
        {
            Text = "수업펜 단축키 설정";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            TopMost = true;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Font = new Font("맑은 고딕", 10f);
            Padding = new Padding(16);
            ShowIcon = false;

            foreach (var a in Hotkeys.All) working[a.Id] = Hotkeys.Get(a.Id);

            var root = new FlowLayoutPanel();
            root.FlowDirection = FlowDirection.TopDown;
            root.AutoSize = true;
            root.WrapContents = false;
            root.Padding = new Padding(14, 10, 14, 10);

            var guide = new Label();
            guide.AutoSize = true;
            guide.MaximumSize = new Size(460, 0);
            guide.Text = "바꿀 칸을 누른 뒤 원하는 키를 그대로 누르세요. Backspace는 그 단축키 끄기예요.\n" +
                         "시작 단축키는 다른 프로그램을 쓰는 중에도 동작해서 Ctrl 또는 Alt를 꼭 함께 눌러야 해요.";
            guide.Margin = new Padding(0, 0, 0, 10);
            root.Controls.Add(guide);

            root.Controls.Add(Section("시작 (어디서나)", true));
            root.Controls.Add(Section("판서 중", false));

            var fixedKeys = new Label();
            fixedKeys.AutoSize = true;
            fixedKeys.MaximumSize = new Size(460, 0);
            fixedKeys.ForeColor = Color.DimGray;
            fixedKeys.Text = "바꿀 수 없는 키: Esc 끝내기, Ctrl+Z 되돌리기, Ctrl+S 저장, Ctrl+C 복사, 휠 굵기";
            fixedKeys.Margin = new Padding(0, 6, 0, 6);
            root.Controls.Add(fixedKeys);

            message = new Label();
            message.AutoSize = true;
            message.MaximumSize = new Size(460, 0);
            message.ForeColor = Color.Firebrick;
            root.Controls.Add(message);

            var buttons = new FlowLayoutPanel();
            buttons.AutoSize = true;
            buttons.Margin = new Padding(0, 8, 0, 0);
            var reset = new Button();
            reset.Text = "기본값으로";
            reset.AutoSize = true;
            reset.Click += delegate
            {
                foreach (var kv in Hotkeys.Defaults()) { working[kv.Key] = kv.Value; boxes[kv.Key].Text = Hotkeys.Text(kv.Value); }
                message.Text = "";
            };
            var save = new Button();
            save.Text = "저장";
            save.AutoSize = true;
            save.Click += delegate { TrySave(); };
            var cancel = new Button();
            cancel.Text = "취소";
            cancel.AutoSize = true;
            cancel.DialogResult = DialogResult.Cancel;
            buttons.Controls.Add(reset);
            buttons.Controls.Add(save);
            buttons.Controls.Add(cancel);
            root.Controls.Add(buttons);

            Controls.Add(root);
            CancelButton = cancel;
        }

        Control Section(string title, bool global)
        {
            var box = new GroupBox();
            box.Text = title;
            box.AutoSize = true;
            box.Padding = new Padding(8);
            var table = new TableLayoutPanel();
            table.ColumnCount = 2;
            table.AutoSize = true;
            table.Location = new Point(10, 26);
            foreach (var a in Hotkeys.All)
            {
                if (a.Global != global) continue;
                var label = new Label();
                label.Text = a.Label;
                label.AutoSize = true;
                label.Anchor = AnchorStyles.Left;
                label.Margin = new Padding(0, 6, 12, 0);
                var tb = new TextBox();
                tb.ReadOnly = true;
                tb.BackColor = Color.White;
                tb.Width = 200;
                tb.Text = Hotkeys.Text(working[a.Id]);
                tb.Cursor = Cursors.Hand;
                string id = a.Id;
                tb.PreviewKeyDown += delegate (object s, PreviewKeyDownEventArgs e) { e.IsInputKey = true; };
                tb.KeyDown += delegate (object s, KeyEventArgs e)
                {
                    e.SuppressKeyPress = true;
                    e.Handled = true;
                    if (e.KeyCode == Keys.Back) { working[id] = Keys.None; tb.Text = Hotkeys.Text(Keys.None); return; }
                    if (Hotkeys.IsModifierOnly(e.KeyCode)) { tb.Text = Hotkeys.Text(e.Modifiers) + "+…"; return; }
                    working[id] = e.KeyData;
                    tb.Text = Hotkeys.Text(e.KeyData);
                    message.Text = "";
                };
                tb.Leave += delegate { tb.Text = Hotkeys.Text(working[id]); };
                boxes[id] = tb;
                table.Controls.Add(label);
                table.Controls.Add(tb);
            }
            box.Controls.Add(table);
            return box;
        }

        void TrySave()
        {
            var seen = new Dictionary<Keys, string>();
            foreach (var a in Hotkeys.All)
            {
                Keys k = working[a.Id];
                if (k == Keys.None) continue;
                if (a.Global && (k & (Keys.Control | Keys.Alt)) == 0)
                {
                    message.Text = "'" + a.Label + "'은(는) Ctrl 또는 Alt를 함께 눌러야 해요. 아니면 글자를 칠 때마다 판서가 켜져요.";
                    return;
                }
                if (!a.Global && (k == Keys.Escape || k == (Keys.Control | Keys.Z) || k == (Keys.Control | Keys.S) || k == (Keys.Control | Keys.C)))
                {
                    message.Text = "'" + a.Label + "'에는 " + Hotkeys.Text(k) + "를 쓸 수 없어요 (바꿀 수 없는 키).";
                    return;
                }
                string other;
                if (seen.TryGetValue(k, out other))
                {
                    message.Text = Hotkeys.Text(k) + " 키가 '" + other + "'와(과) '" + a.Label + "'에 겹쳐요.";
                    return;
                }
                seen[k] = a.Label;
            }
            Hotkeys.Save(working);
            DialogResult = DialogResult.OK;
            Close();
        }
    }

    /// <summary>작업 표시줄 아이콘 + 전역 단축키</summary>
    class TrayApp : ApplicationContext
    {
        const int MOD_ALT = 0x1, MOD_CONTROL = 0x2, MOD_SHIFT = 0x4, MOD_NOREPEAT = 0x4000, WM_HOTKEY = 0x312;
        [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, int mods, int vk);
        [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        static readonly string[] GlobalIds = { "zoom", "draw", "board" }; // 등록 id 1, 2, 3
        readonly NotifyIcon tray;
        readonly HotkeyWindow hotkeys;
        readonly ToolStripMenuItem drawItem, zoomItem, boardItem;
        Overlay current;
        SettingsForm settings;

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

        public TrayApp(bool openSettings)
        {
            Hotkeys.Load();
            var menu = new ContextMenuStrip();
            drawItem = new ToolStripMenuItem("판서 시작", null, delegate { Open(StartMode.Draw); });
            zoomItem = new ToolStripMenuItem("확대 시작", null, delegate { Open(StartMode.Zoom); });
            boardItem = new ToolStripMenuItem("칠판 열기", null, delegate { Open(StartMode.Board); });
            menu.Items.Add(drawItem);
            menu.Items.Add(zoomItem);
            menu.Items.Add(boardItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("단축키 설정", null, delegate { ShowSettings(); });
            menu.Items.Add("사용법", null, delegate { ShowHelp(); });
            menu.Items.Add("종료", null, delegate { ExitThread(); });

            tray = new NotifyIcon();
            tray.Icon = Art.MakeIcon();
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
            var failed = RegisterAll();
            string msg = failed.Count == 0
                ? Hotkeys.Text(Hotkeys.Get("draw")) + " 판서, " + Hotkeys.Text(Hotkeys.Get("zoom")) + " 확대, " + Hotkeys.Text(Hotkeys.Get("board")) + " 칠판. Esc로 끝내요."
                : FailedMessage(failed);
            tray.ShowBalloonTip(4000, "수업펜 실행 중", msg, ToolTipIcon.Info);
            if (openSettings) ShowSettings();
        }

        static string FailedMessage(List<string> failed)
        {
            return "다른 프로그램이 쓰고 있어 " + string.Join(", ", failed.ToArray()) + " 단축키를 못 썼어요. 아이콘 메뉴의 '단축키 설정'에서 바꿔 주세요.";
        }

        /// <summary>시작 단축키를 (다시) 등록하고 메뉴 글자를 맞춘다. 등록 못 한 키 목록을 돌려준다.</summary>
        List<string> RegisterAll()
        {
            var failed = new List<string>();
            for (int i = 0; i < GlobalIds.Length; i++)
            {
                UnregisterHotKey(hotkeys.Handle, i + 1);
                Keys k = Hotkeys.Get(GlobalIds[i]);
                if (k == Keys.None) continue;
                int mods = MOD_NOREPEAT;
                if ((k & Keys.Control) != 0) mods |= MOD_CONTROL;
                if ((k & Keys.Shift) != 0) mods |= MOD_SHIFT;
                if ((k & Keys.Alt) != 0) mods |= MOD_ALT;
                if (!RegisterHotKey(hotkeys.Handle, i + 1, mods, (int)(k & Keys.KeyCode))) failed.Add(Hotkeys.Text(k));
            }
            drawItem.Text = "판서 시작 (" + Hotkeys.Text(Hotkeys.Get("draw")) + ")";
            zoomItem.Text = "확대 시작 (" + Hotkeys.Text(Hotkeys.Get("zoom")) + ")";
            boardItem.Text = "칠판 열기 (" + Hotkeys.Text(Hotkeys.Get("board")) + ")";
            string tip = "수업펜 - " + Hotkeys.Text(Hotkeys.Get("draw")) + " 판서 / " + Hotkeys.Text(Hotkeys.Get("zoom")) + " 확대";
            tray.Text = tip.Length > 63 ? tip.Substring(0, 63) : tip;
            return failed;
        }

        void ShowSettings()
        {
            if (current != null && !current.IsDisposed) current.Close();
            if (settings != null && !settings.IsDisposed) { settings.Activate(); return; }
            var form = new SettingsForm();
            settings = form;
            form.FormClosed += delegate
            {
                bool saved = form.DialogResult == DialogResult.OK;
                settings = null;
                if (!saved) return;
                var failed = RegisterAll();
                tray.ShowBalloonTip(3000, "수업펜", failed.Count == 0 ? "단축키를 저장했어요." : FailedMessage(failed), failed.Count == 0 ? ToolTipIcon.Info : ToolTipIcon.Warning);
            };
            form.Show();
            form.Activate();
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
            Func<string, string> k = delegate (string id) { return Hotkeys.Text(Hotkeys.Get(id)); };
            MessageBox.Show(
                "■ 시작\n" +
                "  " + k("draw") + "  판서 (지금 화면 위에 쓰기)\n" +
                "  " + k("zoom") + "  확대 (휠로 배율, 클릭하면 멈추고 판서)\n" +
                "  " + k("board") + "  칠판 (흰 화면에 쓰기)\n\n" +
                "■ 판서 중\n" +
                "  " + k("pen") + " 펜   " + k("marker") + " 형광펜   " + k("rect") + " 네모   " + k("line") + " 직선(Shift: 수평·수직)   " + k("text") + " 글자\n" +
                "  휠 / " + k("thinner") + " " + k("thicker") + "  굵기     Ctrl+Z 되돌리기     " + k("clear") + " 모두 지우기\n" +
                "  " + k("white") + " 흰 칠판   " + k("black") + " 검은 칠판   " + k("zoomback") + " 확대로 돌아가기\n" +
                "  Ctrl+S 바탕화면에 그림 저장   Ctrl+C 그림 복사\n" +
                "  Esc 끝내기 (시작 단축키를 다시 눌러도 끝나요)\n\n" +
                "단축키는 아이콘 메뉴의 '단축키 설정'에서 바꿀 수 있어요.",
                "수업펜 사용법");
        }

        protected override void ExitThreadCore()
        {
            if (current != null && !current.IsDisposed) current.Close();
            for (int i = 1; i <= GlobalIds.Length; i++) UnregisterHotKey(hotkeys.Handle, i);
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
            AddToolButton(Label("펜", "pen"), Tool.Pen);
            AddToolButton(Label("형광펜", "marker"), Tool.Marker);
            AddToolButton(Label("네모", "rect"), Tool.Rect);
            AddToolButton(Label("직선", "line"), Tool.Line);
            AddToolButton(Label("글자", "text"), Tool.Text);
            AddGap();
            for (int i = 0; i < Palette.Length; i++) AddColorButton(i);
            AddGap();
            AddButton(Label("가늘게", "thinner"), delegate { SetWidth(widthIndex - 1); });
            AddButton(Label("굵게", "thicker"), delegate { SetWidth(widthIndex + 1); });
            AddGap();
            AddButton("되돌리기", delegate { Undo(); });
            AddButton("모두 지우기", delegate { ClearAll(); });
            AddGap();
            AddButton(Label("확대", "zoomback"), delegate { StartZoom(); });
            AddButton(Label("칠판", "white"), delegate { ToggleBoard(1); });
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

        static string Label(string name, string id)
        {
            Keys k = Hotkeys.Get(id);
            return k == Keys.None ? name : name + " " + Hotkeys.Text(k);
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
            // 설정한 단축키
            Keys pressed = e.KeyData;
            if (Is(pressed, "pen")) SetTool(Tool.Pen);
            else if (Is(pressed, "marker")) SetTool(Tool.Marker);
            else if (Is(pressed, "rect")) SetTool(Tool.Rect);
            else if (Is(pressed, "line")) SetTool(Tool.Line);
            else if (Is(pressed, "text")) SetTool(Tool.Text);
            else if (Is(pressed, "clear")) ClearAll();
            else if (Is(pressed, "white")) ToggleBoard(1);
            else if (Is(pressed, "black")) ToggleBoard(2);
            else if (Is(pressed, "zoomback")) StartZoom();
            else if (Is(pressed, "thinner")) SetWidth(widthIndex - 1);
            else if (Is(pressed, "thicker")) SetWidth(widthIndex + 1);
        }

        static bool Is(Keys pressed, string id)
        {
            Keys k = Hotkeys.Get(id);
            return k != Keys.None && k == pressed;
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
