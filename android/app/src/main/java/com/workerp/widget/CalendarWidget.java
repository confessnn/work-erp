package com.workerp.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 홈 화면 달력 위젯.
 *
 * 그리는 것: 그달 달력 칸 + 날짜마다 일정 제목(강의는 초록, 가족은 사람 색).
 * 금액은 애초에 받아오지 않는다 (서버 피드에 금액 칸이 없음).
 *
 * 자료는 Store 에 캐시해 두고, RefreshWorker 가 주기적으로 새로 받아온다.
 * 통신이 안 되면 마지막으로 받은 것을 그대로 보여 준다 (빈 달력이 되지 않게).
 */
public class CalendarWidget extends AppWidgetProvider {

    static final String ACTION_PREV = "com.workerp.widget.PREV";
    static final String ACTION_NEXT = "com.workerp.widget.NEXT";
    static final String ACTION_REFRESH = "com.workerp.widget.REFRESH";

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String[] WEEKDAYS = {"일", "월", "화", "수", "목", "금", "토"};

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(ctx, mgr, id);
        RefreshWorker.schedule(ctx);
        RefreshWorker.runNow(ctx);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id != AppWidgetManager.INVALID_APPWIDGET_ID
                && (ACTION_PREV.equals(action) || ACTION_NEXT.equals(action) || ACTION_REFRESH.equals(action))) {
            Store store = new Store(ctx);
            if (ACTION_PREV.equals(action)) store.setMonthOffset(id, store.monthOffset(id) - 1);
            else if (ACTION_NEXT.equals(action)) store.setMonthOffset(id, store.monthOffset(id) + 1);
            else RefreshWorker.runNow(ctx);
            render(ctx, AppWidgetManager.getInstance(ctx), id);
            return;
        }
        super.onReceive(ctx, intent);
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        Store store = new Store(ctx);
        for (int id : ids) store.forget(id);
    }

    /** 모든 위젯 다시 그리기 (자료를 새로 받아온 뒤 부른다) */
    static void renderAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, CalendarWidget.class));
        for (int id : ids) render(ctx, mgr, id);
    }

    static void render(Context ctx, AppWidgetManager mgr, int id) {
        Store store = new Store(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget);

        LocalDate today = LocalDate.now(SEOUL);
        YearMonth ym = YearMonth.from(today).plusMonths(store.monthOffset(id));
        v.setTextViewText(R.id.title, ym.getYear() + "년 " + ym.getMonthValue() + "월");

        v.setOnClickPendingIntent(R.id.prev, selfIntent(ctx, ACTION_PREV, id));
        v.setOnClickPendingIntent(R.id.next, selfIntent(ctx, ACTION_NEXT, id));

        // 요일 머리글 (일요일 빨강, 토요일 파랑 — 폰 달력과 같게)
        v.removeAllViews(R.id.weekdays);
        for (int i = 0; i < 7; i++) {
            RemoteViews w = new RemoteViews(ctx.getPackageName(), R.layout.widget_weekday);
            w.setTextViewText(R.id.weekday_text, WEEKDAYS[i]);
            w.setTextColor(R.id.weekday_text, color(ctx, i == 0 ? R.color.sunday : i == 6 ? R.color.saturday : R.color.muted));
            v.addView(R.id.weekdays, w);
        }

        String body = store.feed(id);
        Map<String, List<Event>> byDate = Collections.emptyMap();
        if (body != null) {
            try {
                byDate = FeedParser.parse(body);
            } catch (Exception e) {
                byDate = Collections.emptyMap();
            }
        }

        v.removeAllViews(R.id.weeks);
        for (LocalDate[] week : MonthGrid.of(ym.getYear(), ym.getMonthValue())) {
            RemoteViews row = new RemoteViews(ctx.getPackageName(), R.layout.widget_week);
            for (int di = 0; di < 7; di++) {
                row.addView(R.id.week_row, cell(ctx, week[di], di, today, byDate));
            }
            v.addView(R.id.weeks, row);
        }

        // 아래 한 줄: 주소를 아직 안 넣었거나, 받아오기가 실패했을 때만 보여 준다
        String note = note(ctx, store, id);
        if (note == null) {
            v.setViewVisibility(R.id.status, View.GONE);
        } else {
            v.setViewVisibility(R.id.status, View.VISIBLE);
            v.setTextViewText(R.id.status, note);
        }

        // 달력을 누르면 ERP 달력 화면이 열린다 (주소를 아직 안 넣었으면 설정 화면)
        v.setOnClickPendingIntent(R.id.weeks, store.url(id) == null ? configIntent(ctx, id) : openErpIntent(ctx, store.url(id)));
        v.setOnClickPendingIntent(R.id.title, selfIntent(ctx, ACTION_REFRESH, id));

        mgr.updateAppWidget(id, v);
    }

    private static String note(Context ctx, Store store, int id) {
        if (store.url(id) == null) return "눌러서 위젯 주소를 넣어 주세요";
        String err = store.error(id);
        if (err == null) return null;
        long at = store.feedAt(id);
        if (at == 0) return "불러오지 못했어요 · " + err;
        return "최신이 아닐 수 있어요 (" + stamp(at) + ")";
    }

    private static String stamp(long millis) {
        return DateTimeFormatter.ofPattern("M/d HH:mm")
                .format(java.time.Instant.ofEpochMilli(millis).atZone(SEOUL));
    }

    private static RemoteViews cell(Context ctx, LocalDate date, int weekday, LocalDate today, Map<String, List<Event>> byDate) {
        RemoteViews c = new RemoteViews(ctx.getPackageName(), R.layout.widget_cell);
        if (date == null) {
            c.setTextViewText(R.id.day, "");
            return c;
        }
        c.setTextViewText(R.id.day, String.valueOf(date.getDayOfMonth()));
        if (date.equals(today)) {
            c.setInt(R.id.day, "setBackgroundResource", R.drawable.today_circle);
            c.setTextColor(R.id.day, color(ctx, R.color.today_fg));
        } else {
            c.setInt(R.id.day, "setBackgroundResource", 0);
            c.setTextColor(R.id.day, color(ctx, weekday == 0 ? R.color.sunday : weekday == 6 ? R.color.saturday : R.color.fg));
        }

        List<Event> list = byDate.get(date.toString());
        if (list == null) return c;
        int shown = Math.min(list.size(), FeedParser.MAX_PER_DAY);
        for (int i = 0; i < shown; i++) {
            Event e = list.get(i);
            RemoteViews chip = new RemoteViews(ctx.getPackageName(), R.layout.widget_chip);
            chip.setTextViewText(R.id.chip_text, e.label());
            chip.setInt(R.id.chip_text, "setBackgroundResource", e.chipBackground());
            c.addView(R.id.chips, chip);
        }
        if (list.size() > shown) {
            RemoteViews more = new RemoteViews(ctx.getPackageName(), R.layout.widget_chip);
            more.setTextViewText(R.id.chip_text, "+" + (list.size() - shown));
            more.setInt(R.id.chip_text, "setBackgroundResource", 0);
            more.setTextColor(R.id.chip_text, color(ctx, R.color.muted));
            c.addView(R.id.chips, more);
        }
        return c;
    }

    private static int color(Context ctx, int res) {
        return ctx.getResources().getColor(res, ctx.getTheme());
    }

    private static PendingIntent selfIntent(Context ctx, String action, int id) {
        Intent i = new Intent(ctx, CalendarWidget.class).setAction(action)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        return PendingIntent.getBroadcast(ctx, (action + id).hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent configIntent(Context ctx, int id) {
        Intent i = new Intent(ctx, ConfigActivity.class)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(ctx, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** 피드 주소(https://…/api/widget/<토큰>) 에서 사이트 주소만 떼어 ERP 달력 화면을 연다 */
    private static PendingIntent openErpIntent(Context ctx, String feedUrl) {
        String origin = feedUrl.substring(0, feedUrl.indexOf("/api/widget/"));
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(origin + "/calendar/widget"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, feedUrl.hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
