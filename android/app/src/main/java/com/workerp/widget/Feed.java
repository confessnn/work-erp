package com.workerp.widget;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

/** 서버에서 피드 받아오기. 주소는 https 의 /api/widget/<토큰> 만 받는다. */
public final class Feed {
    private Feed() {}

    private static final int TIMEOUT_MS = 15000;
    private static final int MAX_BYTES = 1024 * 1024;

    /** 설정 화면에서 받은 주소가 쓸 만한지 */
    public static boolean looksValid(String url) {
        if (url == null) return false;
        String u = url.trim();
        return u.startsWith("https://") && u.contains("/api/widget/") && !u.endsWith("/api/widget/") && u.length() < 300;
    }

    /** 본문을 돌려준다. 실패하면 IOException (호출한 쪽에서 캐시를 그대로 쓴다) */
    public static String fetch(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(TIMEOUT_MS);
            c.setReadTimeout(TIMEOUT_MS);
            c.setRequestProperty("Accept", "application/json");
            int code = c.getResponseCode();
            if (code != 200) throw new IOException(String.format(Locale.US, "서버 응답 %d", code));
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    if (out.size() > MAX_BYTES) throw new IOException("응답이 너무 큽니다");
                }
                return out.toString("UTF-8");
            }
        } finally {
            c.disconnect();
        }
    }
}
