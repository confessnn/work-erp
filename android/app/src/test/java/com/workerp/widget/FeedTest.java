package com.workerp.widget;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FeedTest {

    @Test
    public void 올바른_주소만_받는다() {
        assertTrue(Feed.looksValid("https://work-erp-one.vercel.app/api/widget/" + "a".repeat(48)));
    }

    @Test
    public void http_나_다른_경로는_막는다() {
        assertFalse(Feed.looksValid("http://work-erp-one.vercel.app/api/widget/abc"));  // https 아님
        assertFalse(Feed.looksValid("https://work-erp-one.vercel.app/lectures"));       // 경로 아님
        assertFalse(Feed.looksValid("https://work-erp-one.vercel.app/api/widget/"));    // 토큰 없음
        assertFalse(Feed.looksValid(""));
        assertFalse(Feed.looksValid(null));
    }

    @Test
    public void 너무_긴_주소는_막는다() {
        assertFalse(Feed.looksValid("https://example.com/api/widget/" + "a".repeat(400)));
    }
}
