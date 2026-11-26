package com.workerp.widget;

/**
 * 위젯에 그릴 일정 한 건.
 *
 * 금액 필드가 없다 — 서버의 피드(/api/widget/<token>)가 애초에 금액을 주지 않는다
 * (DB 함수 get_widget_schedule 의 반환 컬럼에 강의료·세금·수령이 없음).
 */
public final class Event {
    /** "l" = 강의, "e" = 가족 일정 */
    public final String kind;
    public final String title;
    /** YYYY-MM-DD */
    public final String date;
    /** HH:MM, 종일이면 null */
    public final String start;
    /** 가족 일정의 사람 (dad/mom/baby/all), 강의면 null */
    public final String person;

    public Event(String kind, String title, String date, String start, String person) {
        this.kind = kind;
        this.title = title;
        this.date = date;
        this.start = start;
        this.person = person;
    }

    /** 달력 칸에 쓰는 글자: 시간이 있으면 "9:30 제목", 없으면 "제목" */
    public String label() {
        if (start == null || start.isEmpty()) return title;
        String t = start.startsWith("0") ? start.substring(1) : start;
        return t + " " + title;
    }

    /** 칩 배경 리소스 */
    public int chipBackground() {
        if (!"e".equals(kind)) return R.drawable.chip_lecture;
        if ("dad".equals(person)) return R.drawable.chip_dad;
        if ("mom".equals(person)) return R.drawable.chip_mom;
        if ("baby".equals(person)) return R.drawable.chip_baby;
        return R.drawable.chip_all;
    }
}
