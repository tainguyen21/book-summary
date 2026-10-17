"use client";

import { useEffect } from "react";

/**
 * Adds `is-visible` to every `.lp-reveal` element as it scrolls into view.
 * Without JavaScript or with reduced motion, CSS shows the content directly.
 */
export function RevealOnScroll() {
  useEffect(() => {
    // Without IntersectionObserver the content simply stays visible.
    if (!("IntersectionObserver" in window)) {
      return;
    }

    const root = document.documentElement;
    root.classList.add("lp-motion");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 },
    );

    document
      .querySelectorAll(".lp-reveal")
      .forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      root.classList.remove("lp-motion");
    };
  }, []);

  return null;
}
