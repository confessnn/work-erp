package com.workerp.widget;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 서버 피드(JSON) → 날짜별 일정. org.json 만 쓰므로 JVM 테스트에서도 돈다. */
public final class FeedParser {
    private FeedParser() {}

    /** 한 칸에 너무 많이 그리면 느려지고 읽기도 어렵다 */
    public static final int MAX_PER_DAY = 4;

    /** 피드 본문 → 날짜(YYYY-MM-DD) → 그날 일정 (서버가 이미 정렬해서 보낸다) */
    public static Map<String, List<Event>> parse(String body) throws JSONException {
        Map<String, List<Event>> byDate = new LinkedHashMap<>();
        JSONArray items = new JSONObject(body).optJSONArray("items");
        if (items == null) return byDate;
        for (int i = 0; i < items.length(); i++) {
            JSONObject o = items.optJSONObject(i);
            if (o == null) continue;
            String date = o.optString("d", "");
            String title = o.optString("t", "");
            if (date.length() != 10 || title.isEmpty()) continue;
            Event e = new Event(
                    o.optString("k", "l"),
                    title,
                    date,
                    emptyToNull(o.optString("s", "")),
                    emptyToNull(o.optString("p", "")));
            List<Event> list = byDate.get(date);
            if (list == null) {
                list = new ArrayList<>();
                byDate.put(date, list);
            }
            list.add(e);
        }
        return byDate;
    }

    /** 피드를 만든 시각 (없으면 빈 문자열) */
    public static String updatedAt(String body) {
        try {
            return new JSONObject(body).optString("at", "");
        } catch (JSONException e) {
            return "";
        }
    }

    private static String emptyToNull(String s) {
        return s == null || s.isEmpty() ? null : s;
    }
}
