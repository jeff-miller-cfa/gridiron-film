"use client";

import { useEffect, useState } from "react";

export function useSiteHeaderOffsetPx(): number {
  const [offset, setOffset] = useState(64);

  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-site-header]");
    if (!header) return;

    const landscapeMobile = window.matchMedia(
      "(max-width: 1023px) and (orientation: landscape)",
    );

    const sync = () => {
      if (landscapeMobile.matches) {
        setOffset(0);
        return;
      }

      setOffset(Math.ceil(header.getBoundingClientRect().height));
    };

    sync();

    const observer = new ResizeObserver(sync);
    observer.observe(header);
    landscapeMobile.addEventListener("change", sync);
    window.addEventListener("resize", sync);

    return () => {
      observer.disconnect();
      landscapeMobile.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return offset;
}
