"use client";

import { useState } from "react";
import { fmtIdr, fmtUsdt } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import type { CategorySpend } from "@/lib/types";
import { MAX_BAR, barPathRight, useMeasure } from "./chart-utils";

export default function CategoryBars({
  data,
  title = "Pengeluaran per kategori",
  subtitle,
  max: maxRows = 8,
}: {
  data: CategorySpend[];
  title?: string;
  subtitle?: string;
  max?: number;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  // Slot 9 ke atas tidak pernah jadi warna baru — dilipat jadi "Lainnya".
  const rows: CategorySpend[] =
    data.length > maxRows
      ? [
          ...data.slice(0, maxRows - 1),
          data.slice(maxRows - 1).reduce<CategorySpend>(
            (acc, d) => ({
              ...acc,
              usdt: acc.usdt + d.usdt,
              idr: acc.idr + d.idr,
            }),
            {
              id: null,
              name: `Lainnya (${data.length - maxRows + 1} kategori)`,
              color_slot: 6,
              usdt: 0,
              idr: 0,
              budget_usdt: 0,
            },
          ),
        ]
      : data;

  const total = rows.reduce((s, d) => s + d.usdt, 0);
  const max = Math.max(1, ...rows.map((d) => d.usdt));

  const LABEL_W = 148;
  const VALUE_W = 104;
  const ROW_H = 30;
  const W = Math.max(width, 320);
  const barMaxW = Math.max(40, W - LABEL_W - VALUE_W);
  const barH = Math.min(MAX_BAR - 8, ROW_H - 14);

  if (rows.length === 0) {
    return (
      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-6 mb-6 text-center text-xs text-[var(--text-muted)]">
          Belum ada pengeluaran pada periode ini.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
        )}
      </div>

      <div ref={ref} className="relative mt-3">
        {width > 0 && (
          <svg
            width={W}
            height={rows.length * ROW_H + 4}
            role="img"
            aria-label="Grafik batang pengeluaran per kategori"
            className="block"
          >
            {rows.map((d, i) => {
              const yTop = i * ROW_H + (ROW_H - barH) / 2;
              const end = LABEL_W + (d.usdt / max) * barMaxW;
              return (
                <g key={`${d.id ?? "x"}-${d.name}`}>
                  {hover === i && (
                    <rect
                      x={0}
                      y={i * ROW_H}
                      width={W}
                      height={ROW_H}
                      rx={6}
                      fill="var(--wash)"
                    />
                  )}
                  <text
                    x={0}
                    y={i * ROW_H + ROW_H / 2 + 4}
                    fontSize={12}
                    fill="var(--text-secondary)"
                  >
                    {d.name.length > 20 ? `${d.name.slice(0, 19)}…` : d.name}
                  </text>
                  <path
                    d={barPathRight(LABEL_W, yTop, end, barH)}
                    fill={seriesVar(d.color_slot)}
                  />
                  {/* Nilai selalu terlihat sebagai teks — bukan hanya lewat warna. */}
                  <text
                    x={W}
                    y={i * ROW_H + ROW_H / 2 + 4}
                    textAnchor="end"
                    fontSize={12}
                    className="tnum"
                    fill="var(--text-primary)"
                  >
                    {d.usdt.toLocaleString("id-ID", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </text>
                  <rect
                    x={0}
                    y={i * ROW_H}
                    width={W}
                    height={ROW_H}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {hover !== null && rows[hover] && (
          <div
            className="pointer-events-none absolute z-10 min-w-[170px] rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-2.5 text-xs shadow-lg"
            style={{
              top: Math.max(0, hover * ROW_H - 8),
              left: Math.min(LABEL_W, Math.max(W - 180, 0)),
            }}
          >
            <div className="font-medium">{rows[hover].name}</div>
            <div className="tnum mt-1">{fmtUsdt(rows[hover].usdt)}</div>
            <div className="tnum text-[var(--text-muted)]">
              {fmtIdr(rows[hover].idr)}
            </div>
            <div className="mt-1 text-[var(--text-muted)]">
              {total > 0
                ? `${((rows[hover].usdt / total) * 100).toFixed(1)}% dari total`
                : ""}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex justify-between border-t border-[var(--hairline)] pt-2 text-xs">
        <span className="text-[var(--text-secondary)]">Total pengeluaran</span>
        <span className="tnum font-medium">{fmtUsdt(total)}</span>
      </div>
    </section>
  );
}
