package com.workerp.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

/**
 * 위젯을 홈 화면에 놓을 때 한 번 뜨는 화면. ERP 공유 화면에서 복사한 주소를 붙여넣는다.
 * 주소에 토큰이 들어 있으므로 화면에 다시 보여 주거나 로그에 찍지 않는다.
 */
public class ConfigActivity extends Activity {

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // 설정 도중에 취소하면 위젯을 놓지 않은 것으로 한다
        setResult(RESULT_CANCELED);
        setContentView(R.layout.config_activity);

        Bundle extras = getIntent().getExtras();
        if (extras != null) {
            widgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        EditText input = findViewById(R.id.url);
        String current = new Store(this).url(widgetId);
        if (current != null) input.setText(current);

        ((TextView) findViewById(R.id.help)).setText(R.string.config_help);
        findViewById(R.id.save).setOnClickListener(view -> save(input.getText().toString().trim()));
    }

    private void save(String url) {
        if (!Feed.looksValid(url)) {
            Toast.makeText(this, R.string.config_bad_url, Toast.LENGTH_LONG).show();
            return;
        }
        Store store = new Store(this);
        store.setUrl(widgetId, url);
        store.setError(widgetId, null);

        CalendarWidget.render(this, AppWidgetManager.getInstance(this), widgetId);
        RefreshWorker.schedule(this);
        RefreshWorker.runNow(this);

        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        finish();
    }
}
