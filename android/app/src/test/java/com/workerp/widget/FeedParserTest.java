package com.workerp.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.List;
import java.util.Map;

public class FeedParserTest {

    private static final String BODY =
            "{\"at\":\"2026-11-26T00:00:00.000Z\",\"items\":["
                    + "{\"k\":\"l\",\"t\":\"백석대 ITQ\",\"d\":\"2026-11-16\",\"s\":\"09:30\",\"n\":\"12:00\"},"
                    + "{\"k\":\"e\",\"t\":\"채현 외래\",\"d\":\"2026-11-05\",\"p\":\"baby\"},"
                    + "{\"k\":\"l\",\"t\":\"재경관리사\",\"d\":\"2026-11-16\"}"
                    + "]}";

    @Test
    public void 날짜별로_모은다() throws Exception {
        Map<String, List<Event>> m = FeedParser.parse(BODY);
        assertEquals(2, m.size());
        assertEquals(2, m.get("2026-11-16").size());
        assertEquals(1, m.get("2026-11-05").size());
        assertNull(m.get("2026-11-17"));
    }

    @Test
    public void 시간과_사람을_읽는다() throws Exception {
        Event lec = FeedParser.parse(BODY).get("2026-11-16").get(0);
        Event baby = FeedParser.parse(BODY).get("2026-11-05").get(0);
        assertEquals("09:30", lec.start);
        assertNull(lec.person);
        assertEquals("baby", baby.person);
        assertNull(baby.start);
    }

    @Test
    public void 만든_시각을_읽는다() {
        assertEquals("2026-11-26T00:00:00.000Z", FeedParser.updatedAt(BODY));
    }

    @Test
    public void 망가진_항목은_건너뛴다() throws Exception {
        String bad = "{\"items\":["
                + "{\"k\":\"l\",\"t\":\"\",\"d\":\"2026-11-16\"},"      // 제목 없음
                + "{\"k\":\"l\",\"t\":\"날짜이상\",\"d\":\"2026-11\"},"  // 날짜 길이 이상
                + "{\"k\":\"l\",\"t\":\"정상\",\"d\":\"2026-11-16\"}]}";
        Map<String, List<Event>> m = FeedParser.parse(bad);
        assertEquals(1, m.size());
        assertEquals("정상", m.get("2026-11-16").get(0).title);
    }

    @Test
    public void items_가_없어도_터지지_않는다() throws Exception {
        assertTrue(FeedParser.parse("{}").isEmpty());
        assertTrue(FeedParser.parse("{\"items\":[]}").isEmpty());
    }
}
