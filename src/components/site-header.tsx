"use client";

import { useEffect, useState } from "react";

/** 상단 바. 포트폴리오(vibe-4)처럼 스크롤을 내리면 그림자가 생기고 높이가 조금 줄어든다 */
export function SiteHeader({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-10 border-b bg-bg/90 backdrop-blur transition-[box-shadow,border-color] duration-300 ${
        scrolled ? "border-transparent shadow-[0_4px_16px_rgba(0,0,0,0.1)]" : "border-line"
      }`}
    >
      <div
        className={`mx-auto flex max-w-5xl items-center gap-4 px-4 transition-[min-height,padding] duration-300 ${
          scrolled ? "min-h-14 py-2" : "min-h-16 py-3"
        }`}
      >
        {children}
      </div>
    </header>
  );
}
