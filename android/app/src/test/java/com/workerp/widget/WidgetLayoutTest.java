package com.workerp.widget;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Test;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 위젯 레이아웃이 RemoteViews 가 펼칠 수 있는 뷰만 쓰는지 검사한다.
 *
 * RemoteViews 는 @RemoteView 가 붙은 클래스만 펼친다. 아닌 것을 쓰면 (예: plain View)
 * 홈 화면에 올릴 때 런처가 "위젯을 추가할 수 없습니다" 만 내고 끝난다 —
 * 컴파일도 되고 테스트도 통과하므로 이렇게 따로 막아 둔다.
 */
public class WidgetLayoutTest {

    /** RemoteViews 가 허용하는 뷰 (android.widget.RemoteViews 문서 기준) */
    private static final Set<String> ALLOWED = new HashSet<>(Arrays.asList(
            "FrameLayout", "LinearLayout", "RelativeLayout", "GridLayout",
            "AnalogClock", "Button", "Chronometer", "ImageButton", "ImageView",
            "ProgressBar", "TextView", "ViewFlipper", "ListView", "GridView",
            "StackView", "AdapterViewFlipper", "TextClock", "Space"));

    /** 위젯이 RemoteViews 로 그리는 레이아웃만 (설정·상태 화면은 보통 액티비티라 해당 없음) */
    private static final List<String> WIDGET_LAYOUTS = Arrays.asList(
            "widget.xml", "widget_week.xml", "widget_cell.xml", "widget_chip.xml", "widget_weekday.xml");

    private static final Pattern TAG = Pattern.compile("<([A-Za-z][A-Za-z0-9_.]*)");

    @Test
    public void 위젯_레이아웃은_RemoteViews_가_허용하는_뷰만_쓴다() throws IOException {
        for (String name : WIDGET_LAYOUTS) {
            File f = new File("src/main/res/layout/" + name);
            assertTrue(name + " 를 찾을 수 없음 (" + f.getAbsolutePath() + ")", f.isFile());
            String xml = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
            // 주석 안의 예시는 검사하지 않는다
            xml = xml.replaceAll("(?s)<!--.*?-->", "");
            Matcher m = TAG.matcher(xml);
            while (m.find()) {
                String tag = m.group(1);
                if (tag.equals("?xml") || tag.startsWith("!")) continue;
                if (!ALLOWED.contains(tag)) {
                    fail(name + " 의 <" + tag + "> 는 RemoteViews 가 펼칠 수 없습니다. "
                            + "허용되는 뷰로 바꾸세요 (구분선은 ImageView). 허용 목록: " + ALLOWED);
                }
            }
        }
    }

    @Test
    public void 위젯_설정에_적힌_레이아웃이_실제로_있다() throws IOException {
        String info = new String(
                Files.readAllBytes(new File("src/main/res/xml/widget_info.xml").toPath()), StandardCharsets.UTF_8);
        for (String attr : new String[] {"initialLayout", "previewLayout"}) {
            Matcher m = Pattern.compile("android:" + attr + "=\"@layout/([a-z_]+)\"").matcher(info);
            if (m.find()) {
                assertTrue(attr + " 가 가리키는 @layout/" + m.group(1) + " 가 없음",
                        new File("src/main/res/layout/" + m.group(1) + ".xml").isFile());
            }
        }
    }
}
