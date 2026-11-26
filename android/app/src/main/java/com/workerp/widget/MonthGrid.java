package com.workerp.widget;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * 달력 칸 계산 (안드로이드 API 를 쓰지 않는 순수 계산 — JVM 테스트 가능).
 * 일요일로 시작하는 주 단위, 앞뒤 빈칸은 null.
 */
public final class MonthGrid {
    private MonthGrid() {}

    /** 한 주는 7칸, 보통 5~6주 */
    public static LocalDate[][] of(int year, int month) {
        YearMonth ym = YearMonth.of(year, month);
        LocalDate first = ym.atDay(1);
        // DayOfWeek: 월=1 … 일=7 → 일요일 시작으로 바꾸면 일=0
        int lead = first.getDayOfWeek().getValue() % 7;
        int days = ym.lengthOfMonth();
        int weeks = (int) Math.ceil((lead + days) / 7.0);
        LocalDate[][] out = new LocalDate[weeks][7];
        for (int i = 0; i < weeks * 7; i++) {
            int d = i - lead + 1;
            if (d >= 1 && d <= days) out[i / 7][i % 7] = ym.atDay(d);
        }
        return out;
    }

    /** 달 더하기 (1월에서 -1 이면 전해 12월) */
    public static YearMonth shift(int year, int month, int delta) {
        return YearMonth.of(year, month).plusMonths(delta);
    }
}
