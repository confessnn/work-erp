package com.workerp.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Bundle;
import android.widget.TextView;
import android.widget.Toast;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * 앱을 열었을 때 보이는 화면.
 *
 * 위젯만 있는 앱이라 처음에는 실행 아이콘을 두지 않았는데, 그러면
 * (1) 삼성에서 한 번도 실행되지 않은 앱이 멈춤 상태로 남을 수 있고
 * (2) 무엇이 잘못됐는지 사용자에게 보여 줄 자리가 없다.
 * 그래서 상태와 마지막 오류를 보여 주는 화면을 둔다.
 */
public class MainActivity extends Activity {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.main_activity);
        findViewById(R.id.refresh).setOnClickListener(v -> {
            RefreshWorker.schedule(this);
            RefreshWorker.runNow(this);
            Toast.makeText(this, R.string.main_refreshing, Toast.LENGTH_SHORT).show();
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        ((TextView) findViewById(R.id.status)).setText(status());
    }

    private String status() {
        int[] ids = AppWidgetManager.getInstance(this)
                .getAppWidgetIds(new ComponentName(this, CalendarWidget.class));
        if (ids.length == 0) {
            return "홈 화면에 올린 위젯이 아직 없습니다.\n\n"
                    + "홈 화면 빈 곳을 길게 누르기 → 위젯 → 'ERP 달력' 을 끌어다 놓으세요. "
                    + "그때 주소를 묻는 화면이 뜹니다.";
        }
        StringBuilder sb = new StringBuilder("홈 화면 위젯 " + ids.length + "개\n");
        Store store = new Store(this);
        for (int id : ids) {
            sb.append("\n• ");
            if (store.url(id) == null) {
                sb.append("주소가 아직 없습니다. 위젯을 눌러 넣어 주세요.");
                continue;
            }
            long at = store.feedAt(id);
            sb.append(at == 0 ? "아직 한 번도 못 받았습니다" : "마지막 수신 " + stamp(at));
            String err = store.error(id);
            if (err != null) sb.append("\n  최근 오류: ").append(err);
        }
        return sb.toString();
    }

    private static String stamp(long millis) {
        return DateTimeFormatter.ofPattern("M/d HH:mm").format(Instant.ofEpochMilli(millis).atZone(SEOUL));
    }
}
