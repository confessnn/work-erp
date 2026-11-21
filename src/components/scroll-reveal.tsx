"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * 포트폴리오(vibe-4)의 스크롤 등장 효과.
 * <main> 의 각 영역이 화면 아래쪽 10% 선을 넘어 들어오면 아래에서 떠오르며 나타난다.
 * data-stagger 를 붙인 목록은 안의 항목이 0.1초 간격으로 차례로 나타난다.
 * 한 번 나타난 영역은 다시 숨기지 않는다 (업무 화면이라 위아래로 오갈 때마다 깜빡이지 않게).
 * 움직임 줄이기 설정을 켠 기기에서는 아무것도 하지 않는다.
 */
export function ScrollReveal() {
  const path = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const main = document.querySelector("main");
    if (!main) return;

    const done = (el: HTMLElement) => {
      // 등장이 끝나면 표시를 지워서, 마우스를 올렸을 때 효과(.lift)와 겹치지 않게 한다
      el.removeAttribute("data-ani");
      el.removeAttribute("data-show");
      el.style.transitionDelay = "";
    };
    const show = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.setAttribute("data-show", "");
          el.addEventListener("transitionend", () => done(el), { once: true });
          show.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    const seen = new WeakSet<Element>();
    const add = (el: Element, delay = 0) => {
      if (seen.has(el)) return;
      seen.add(el);
      el.setAttribute("data-ani", "");
      if (delay) (el as HTMLElement).style.transitionDelay = `${delay}ms`;
      show.observe(el);
    };
    const scan = () => {
      for (const el of Array.from(main.children)) add(el);
      main.querySelectorAll("[data-stagger]").forEach((group) =>
        Array.from(group.children).forEach((c, i) => add(c, Math.min(i, 6) * 100)),
      );
    };

    scan();
    // 늦게 채워지는 영역(Suspense)도 들어오는 대로 효과를 붙인다
    const mo = new MutationObserver(scan);
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      show.disconnect();
    };
  }, [path]);

  return null;
}
