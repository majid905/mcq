'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Fixed sample answer sheet: 70 answered, 5 marked for review, 25 left, shuffled with a seeded
 * generator so server and client agree.
 */
const SHEET = (() => {
  let seed = 20251;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const order = Array.from({ length: 100 }, (_, i) => i);
  for (let i = 99; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const out: number[] = Array.from({ length: 100 }, () => 0.4);
  order.forEach((k, n) => {
    if (n < 70) out[k] = 0.95;
    else if (n < 75) out[k] = 0.55;
  });
  return out;
})();

const GAP = 7;

/**
 * 100 answer bubbles that fill the card: like the prototype it picks the column count (8–25)
 * giving the largest bubble for the available width and height. Below 768 px it is a plain
 * 10-column grid.
 */
export function OmrSheet({ label }: { label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ cols: number; size: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (window.innerWidth < 768 || !w || !h) return setFit(null);
      let best = { size: 0, cols: 10 };
      for (let c = 8; c <= 25; c++) {
        const r = Math.ceil(100 / c);
        const s = Math.min((w - GAP * (c - 1)) / c, (h - GAP * (r - 1)) / r);
        if (s > best.size) best = { size: s, cols: c };
      }
      setFit({ cols: best.cols, size: Math.max(8, Math.floor(Math.min(best.size, 44))) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className="relative flex-1 md:min-h-[150px]">
      <div
        role="img"
        aria-label={label}
        className={fit ? 'absolute inset-0 grid content-between justify-between' : 'grid gap-1.5'}
        style={
          fit
            ? { gridTemplateColumns: `repeat(${fit.cols}, ${fit.size}px)`, gap: GAP }
            : { gridTemplateColumns: 'repeat(10, minmax(0, 1fr))' }
        }
      >
        {SHEET.map((opacity, i) => (
          <span
            key={i}
            className="aspect-square rounded-pill border-[1.5px] border-current"
            style={{ opacity, background: opacity > 0.5 ? 'currentColor' : 'transparent' }}
          />
        ))}
      </div>
    </div>
  );
}
