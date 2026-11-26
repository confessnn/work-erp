package com.workerp.widget;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 위젯별 설정·캐시. 주소는 비밀값이므로 앱 안(앱 전용 저장소)에만 두고 로그에 찍지 않는다.
 * 캐시가 있어야 통신이 안 될 때도 지난번 일정을 그대로 보여 줄 수 있다.
 */
public final class Store {
    private static final String FILE = "widget";

    private final SharedPreferences prefs;

    public Store(Context ctx) {
        this.prefs = ctx.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    private static String k(int id, String name) {
        return id + "." + name;
    }

    public String url(int id) {
        return prefs.getString(k(id, "url"), null);
    }

    public void setUrl(int id, String url) {
        prefs.edit().putString(k(id, "url"), url).apply();
    }

    public String feed(int id) {
        return prefs.getString(k(id, "feed"), null);
    }

    public void setFeed(int id, String body) {
        prefs.edit().putString(k(id, "feed"), body).putLong(k(id, "feedAt"), System.currentTimeMillis()).apply();
    }

    public long feedAt(int id) {
        return prefs.getLong(k(id, "feedAt"), 0L);
    }

    /** 지금 보고 있는 달이 이번 달에서 몇 달 떨어졌는지 */
    public int monthOffset(int id) {
        return prefs.getInt(k(id, "offset"), 0);
    }

    public void setMonthOffset(int id, int offset) {
        prefs.edit().putInt(k(id, "offset"), offset).apply();
    }

    /** 마지막 받아오기가 실패했으면 그 까닭 (화면 아래에 작게 보여 준다) */
    public String error(int id) {
        return prefs.getString(k(id, "err"), null);
    }

    public void setError(int id, String message) {
        prefs.edit().putString(k(id, "err"), message).apply();
    }

    public void forget(int id) {
        SharedPreferences.Editor e = prefs.edit();
        for (String name : new String[] {"url", "feed", "feedAt", "offset", "err"}) e.remove(k(id, name));
        e.apply();
    }
}
