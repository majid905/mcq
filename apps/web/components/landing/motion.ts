'use client';

import { type RefObject, useEffect, useState } from 'react';

/** True when the user asked for reduced motion; loops then show their first state only. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    const id = setTimeout(on, 0);
    mq.addEventListener('change', on);
    return () => {
      clearTimeout(id);
      mq.removeEventListener('change', on);
    };
  }, []);
  return reduced;
}

/** Whether the element is on screen (`once`: stays true after the first time). */
export function useInView(
  ref: RefObject<Element | null>,
  { threshold = 0.3, once = false }: { threshold?: number; once?: boolean } = {},
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        setInView((prev) => (once && prev) || visible);
        if (visible && once) io.disconnect();
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold, once]);
  return inView;
}

/** Counts up once a `stepMs` while `running`, pausing while the tab is hidden. */
export function useTicker(running: boolean, stepMs: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, stepMs);
    return () => clearInterval(id);
  }, [running, stepMs]);
  return tick;
}
