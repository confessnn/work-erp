package com.workerp.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import org.junit.Test;

import java.time.LocalDate;
import java.time.YearMonth;

public class MonthGridTest {

    @Test
    public void 일요일로_시작하고_앞은_빈칸이다() {
        // 2026-11-01 은 일요일 → 앞 빈칸 없음
        LocalDate[][] g = MonthGrid.of(2026, 11);
        assertEquals(LocalDate.of(2026, 11, 1), g[0][0]);
        assertEquals(5, g.length);
    }

    @Test
    public void 달_첫날이_수요일이면_앞에_빈칸_세_개() {
        // 2026-07-01 은 수요일
        LocalDate[][] g = MonthGrid.of(2026, 7);
        assertNull(g[0][0]);
        assertNull(g[0][1]);
        assertNull(g[0][2]);
        assertEquals(LocalDate.of(2026, 7, 1), g[0][3]);
    }

    @Test
    public void 모든_날짜가_정확히_한_번씩_들어간다() {
        for (int m = 1; m <= 12; m++) {
            LocalDate[][] g = MonthGrid.of(2028, m); // 2028 은 윤년
            int count = 0;
            for (LocalDate[] week : g) {
                assertEquals(7, week.length);
                for (LocalDate d : week) {
                    if (d == null) continue;
                    count++;
                    assertEquals(m, d.getMonthValue());
                }
            }
            assertEquals(YearMonth.of(2028, m).lengthOfMonth(), count);
        }
    }

    @Test
    public void 윤년_이월은_이십구일까지() {
        LocalDate[][] g = MonthGrid.of(2028, 2);
        LocalDate last = null;
        for (LocalDate[] w : g) for (LocalDate d : w) if (d != null) last = d;
        assertNotNull(last);
        assertEquals(29, last.getDayOfMonth());
    }

    @Test
    public void 달_넘기기는_해를_넘어도_맞다() {
        assertEquals(YearMonth.of(2025, 12), MonthGrid.shift(2026, 1, -1));
        assertEquals(YearMonth.of(2027, 1), MonthGrid.shift(2026, 12, 1));
        assertEquals(YearMonth.of(2026, 11), MonthGrid.shift(2026, 11, 0));
    }
}
