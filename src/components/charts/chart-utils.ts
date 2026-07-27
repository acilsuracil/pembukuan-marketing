"use client";

import { useEffect, useRef, useState } from "react";

/** Lebar container sebenarnya, supaya teks SVG tidak ikut ter-scale. */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

/** Batang dengan ujung-data membulat 4px, siku di garis dasar. */
export function barPathUp(
  x: number,
  yTop: number,
  w: number,
  yBase: number,
  r = 4,
): string {
  const h = Math.max(0, yBase - yTop);
  const rr = Math.min(r, w / 2, h);
  if (h <= 0.5) return "";
  return [
    `M ${x} ${yBase}`,
    `L ${x} ${yTop + rr}`,
    `Q ${x} ${yTop} ${x + rr} ${yTop}`,
    `L ${x + w - rr} ${yTop}`,
    `Q ${x + w} ${yTop} ${x + w} ${yTop + rr}`,
    `L ${x + w} ${yBase}`,
    "Z",
  ].join(" ");
}

/** Batang horizontal, ujung-data membulat di kanan. */
export function barPathRight(
  xBase: number,
  y: number,
  xEnd: number,
  h: number,
  r = 4,
): string {
  const w = Math.max(0, xEnd - xBase);
  const rr = Math.min(r, h / 2, w);
  if (w <= 0.5) return "";
  return [
    `M ${xBase} ${y}`,
    `L ${xEnd - rr} ${y}`,
    `Q ${xEnd} ${y} ${xEnd} ${y + rr}`,
    `L ${xEnd} ${y + h - rr}`,
    `Q ${xEnd} ${y + h} ${xEnd - rr} ${y + h}`,
    `L ${xBase} ${y + h}`,
    "Z",
  ].join(" ");
}

/** Tick sumbu-y pada angka bulat (1 / 2 / 5 × 10^n). */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  // Tick teratas harus >= max, kalau tidak batang/garis tertinggi keluar plot.
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let i = 0; i * step <= top + step * 1e-9; i++) ticks.push(i * step);
  if (ticks.length === 1) ticks.push(step);
  return ticks;
}

export const GAP = 2; // celah permukaan antar batang bersebelahan
export const MAX_BAR = 24;
