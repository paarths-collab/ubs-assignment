"use client";

import { useEffect, useRef } from "react";
import styles from "./home-motion.module.css";

/** Progressive enhancement: the page remains visible when JavaScript is unavailable. */
export function HomeMotion() {
  const progress = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("main[data-home]");
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(
      "[data-reveal], #example-workflows > div:first-child, #workflow > div:first-child, #workflow article, #resources",
    ));
    const charts = Array.from(root.querySelectorAll<HTMLElement>("[data-scroll-chart]"));
    const drifts = Array.from(root.querySelectorAll<HTMLElement>("[data-scroll-drift]"));
    const depths = Array.from(root.querySelectorAll<HTMLElement>("[data-scroll-depth]"));
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    let frame = 0;
    root.classList.add(styles.motionRoot);

    const show = (target: HTMLElement) => {
      target.dataset.revealState = "visible";
      observer?.unobserve(target);
    };

    const updateMotion = () => {
      if (root.dataset.homeMotionReady !== "true") return;
      observer?.disconnect();
      const reduced = preference.matches || root.dataset.homeMotion === "reduced";
      if (!reduced && "IntersectionObserver" in window) {
        observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) show(entry.target as HTMLElement);
          });
        }, { threshold: 0.06, rootMargin: "0px 0px -32px 0px" });
      }
      targets.forEach((target) => {
        const delay = Math.min(180, Math.max(0, Number(target.dataset.revealDelay) || 0));
        target.style.setProperty("--reveal-delay", `${delay}ms`);
        if (reduced || !observer || target.dataset.revealState === "visible" || target.getBoundingClientRect().top < window.innerHeight - 24) {
          show(target);
        } else {
          target.dataset.revealState = "pending";
          observer.observe(target);
        }
      });
      scheduleProgress();
    };

    const updateProgress = () => {
      frame = 0;
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      const value = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0;
      if (progress.current) progress.current.style.transform = `scaleX(${value})`;
      root.dataset.homeScrolled = window.scrollY > 12 ? "true" : "false";
      const animateCharts = root.dataset.homeMotionReady === "true" && root.dataset.homeMotion !== "reduced" && !preference.matches;
      // Read geometry together, then write styles to avoid repeated layout work.
      const chartProgress = charts.map(chart => {
        if (!animateCharts || chart.contains(document.activeElement)) return 1;
        const bounds = chart.getBoundingClientRect();
        const distance = Math.min(bounds.height + 90, window.innerHeight * .52);
        return Math.min(1, Math.max(0, (window.innerHeight * .94 - bounds.top) / Math.max(1, distance)));
      });
      const driftOffsets = drifts.map(element => {
        if (!animateCharts || element.contains(document.activeElement)) return 0;
        const bounds = element.getBoundingClientRect();
        if (bounds.bottom < -60 || bounds.top > window.innerHeight + 60) return 0;
        const progress = (window.innerHeight / 2 - bounds.top - bounds.height / 2) / window.innerHeight;
        const strength = Math.min(24, Math.max(0, Number(element.dataset.scrollDrift) || 0));
        return Math.max(-1, Math.min(1, progress)) * strength;
      });
      const depthValues = depths.map(element => {
        if (!animateCharts || element.contains(document.activeElement)) return null;
        const bounds = (element.parentElement ?? element).getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, (window.innerHeight * .85 - bounds.top) / (window.innerHeight * .7 + bounds.height)));
        return { x: 8 - progress * 5, y: -4 + progress * 5, lift: -progress * 16 };
      });
      charts.forEach((chart, index) => chart.style.setProperty("--chart-progress", chartProgress[index].toFixed(4)));
      drifts.forEach((element, index) => element.style.setProperty("--scroll-drift", `${driftOffsets[index].toFixed(2)}px`));
      depths.forEach((element, index) => {
        const value = depthValues[index];
        if (!value) {
          if (!animateCharts) {
            element.style.removeProperty("--preview-x");
            element.style.removeProperty("--preview-y");
            element.style.removeProperty("--preview-lift");
          }
          return;
        }
        element.style.setProperty("--preview-x", `${value.x.toFixed(2)}deg`);
        element.style.setProperty("--preview-y", `${value.y.toFixed(2)}deg`);
        element.style.setProperty("--preview-lift", `${value.lift.toFixed(2)}px`);
      });
    };
    const scheduleProgress = () => {
      if (!frame) frame = window.requestAnimationFrame(updateProgress);
    };
    // Keyboard navigation must never land inside a visually concealed card.
    const revealFocusedContent = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      targets.forEach((target) => {
        if (target.contains(event.target as Node)) show(target);
      });
      scheduleProgress();
    };
    const closeNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      const menu = anchor?.closest<HTMLDetailsElement>("header details[open]");
      if (menu) menu.open = false;
    };
    const settingsObserver = new MutationObserver(updateMotion);
    settingsObserver.observe(root, { attributes: true, attributeFilter: ["data-home-motion", "data-home-motion-ready"] });
    const resizeObserver = new ResizeObserver(scheduleProgress);
    resizeObserver.observe(root);
    preference.addEventListener("change", updateMotion);
    root.addEventListener("focusin", revealFocusedContent);
    root.addEventListener("focusout", scheduleProgress);
    root.addEventListener("click", closeNavigation);
    window.addEventListener("scroll", scheduleProgress, { passive: true });
    window.addEventListener("resize", scheduleProgress);
    updateMotion();
    updateProgress();

    return () => {
      observer?.disconnect();
      settingsObserver.disconnect();
      resizeObserver.disconnect();
      preference.removeEventListener("change", updateMotion);
      root.removeEventListener("focusin", revealFocusedContent);
      root.removeEventListener("focusout", scheduleProgress);
      root.removeEventListener("click", closeNavigation);
      window.removeEventListener("scroll", scheduleProgress);
      window.removeEventListener("resize", scheduleProgress);
      if (frame) window.cancelAnimationFrame(frame);
      root.classList.remove(styles.motionRoot);
      delete root.dataset.homeScrolled;
      targets.forEach((target) => {
        delete target.dataset.revealState;
        target.style.removeProperty("--reveal-delay");
      });
      charts.forEach(chart => chart.style.removeProperty("--chart-progress"));
      drifts.forEach(element => element.style.removeProperty("--scroll-drift"));
      depths.forEach(element => {
        element.style.removeProperty("--preview-x");
        element.style.removeProperty("--preview-y");
        element.style.removeProperty("--preview-lift");
      });
    };
  }, []);

  return <div className={styles.progress} aria-hidden="true"><span ref={progress} /></div>;
}
