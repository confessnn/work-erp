package com.workerp.widget;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import java.util.Arrays;
import java.util.HashSet;

public class EventTest {

    @Test
    public void 시간이_있으면_앞에_붙이고_앞의_영은_뗀다() {
        assertEquals("9:30 강의", new Event("l", "강의", "2026-11-16", "09:30", null).label());
        assertEquals("14:00 강의", new Event("l", "강의", "2026-11-16", "14:00", null).label());
    }

    @Test
    public void 종일이면_제목만() {
        assertEquals("강의", new Event("l", "강의", "2026-11-16", null, null).label());
        assertEquals("강의", new Event("l", "강의", "2026-11-16", "", null).label());
    }

    @Test
    public void 강의와_사람별로_칩_색이_다르다() {
        int lecture = new Event("l", "강의", "2026-11-16", null, null).chipBackground();
        int mom = new Event("e", "병원", "2026-11-16", null, "mom").chipBackground();
        int baby = new Event("e", "접종", "2026-11-16", null, "baby").chipBackground();
        int other = new Event("e", "외식", "2026-11-16", null, "all").chipBackground();
        // 넷 다 서로 다른 색이어야 한 칸에서 구분이 된다
        assertEquals(4, new HashSet<>(Arrays.asList(lecture, mom, baby, other)).size());
        // 모르는 사람은 '가족' 색으로 떨어진다
        assertEquals(other, new Event("e", "뭔가", "2026-11-16", null, "zzz").chipBackground());
    }
}
