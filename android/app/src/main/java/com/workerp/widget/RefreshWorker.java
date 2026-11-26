package com.workerp.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/**
 * 일정을 주기적으로 새로 받아온다.
 *
 * 안드로이드가 허용하는 가장 짧은 주기가 15분이라 30분으로 잡았다 (배터리와 맞바꿈).
 * 위젯의 달 이름을 누르면 그 자리에서 한 번 더 받아온다.
 */
public class RefreshWorker extends Worker {

    private static final String PERIODIC = "work-erp-widget-refresh";
    private static final String ONE_SHOT = "work-erp-widget-refresh-now";

    public RefreshWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }

    public static void schedule(Context ctx) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(RefreshWorker.class, 30, TimeUnit.MINUTES)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req);
    }

    public static void runNow(Context ctx) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(RefreshWorker.class)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
        WorkManager.getInstance(ctx).enqueueUniqueWork(ONE_SHOT, ExistingWorkPolicy.REPLACE, req);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        Store store = new Store(ctx);
        int[] ids = AppWidgetManager.getInstance(ctx)
                .getAppWidgetIds(new ComponentName(ctx, CalendarWidget.class));

        for (int id : ids) {
            String url = store.url(id);
            if (url == null) continue;
            try {
                String body = Feed.fetch(url);
                // 받은 것이 말이 되는지 확인한 뒤에만 캐시를 바꾼다 (깨진 응답으로 달력을 비우지 않게)
                FeedParser.parse(body);
                store.setFeed(id, body);
                store.setError(id, null);
            } catch (Exception e) {
                store.setError(id, shortMessage(e));
            }
        }
        CalendarWidget.renderAll(ctx);
        // 실패해도 캐시로 그린다. 다시 받아오는 건 다음 차례에 (연달아 재시도하면 배터리만 먹는다)
        return Result.success();
    }

    /** 화면에 한 줄로 넣을 만큼만. 주소·토큰은 절대 넣지 않는다 */
    private static String shortMessage(Exception e) {
        String m = e.getMessage();
        if (m == null || m.isEmpty()) return "연결 실패";
        if (m.length() > 40) m = m.substring(0, 40);
        return m;
    }
}
