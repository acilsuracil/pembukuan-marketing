"use client";

import { useState } from "react";
import { compact, fmtIdr, pct } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import type { GroupSpend } from "@/lib/types";
import { MAX_BAR, barPathRight, useMeasure } from "./chart-utils";

/**
 * Batang horizontal biaya per kelompok (divisi / platform / brand).
 *
 * Nilainya selalu ditulis sebagai teks di ujung batang — warna hanya penanda,
 * bukan pembawa informasi, supaya tetap terbaca di cetakan hitam-putih dan oleh
 * mata yang tidak membedakan warna.
 */
export default function GroupBars({
  data,
  title,
  subtitle,
  max: maxRows = 8,
  unit = "kelompok",
}: {
  data: GroupSpend[];
  title: string;
  subtitle?: string;
  max?: number;
  unit?: string;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  // Slot warna hanya ada 8 — sisanya dilipat jadi satu baris "Lainnya" supaya
  // tidak ada dua kelompok berbeda yang tampil dengan warna yang sama.
  const rows: GroupSpend[] =
    data.length > maxRows
      ? [
          ...data.slice(0, maxRows - 1),
          data.slice(maxRows - 1).reduce<GroupSpend>(
            (acc, d) => ({
              ...acc,
              biaya: acc.biaya + d.biaya,
              tx_count: acc.tx_count + d.tx_count,
            }),
            {
              id: null,
              name: `Lainnya (${data.length - maxRows + 1} ${unit})`,
              color_slot: 6,
              biaya: 0,
              budget_idr: 0,
              tx_count: 0,
            },
          ),
        ]
      : data;

  const total = rows.reduce((s, d) => s + d.biaya, 0);
  const max = Math.max(1, ...rows.map((d) => d.biaya));

  const LABEL_W = 140;
  const VALUE_W = 96;
  const ROW_H = 30;
  const W = Math.max(width, 320);
  const barMaxW = Math.max(40, W - LABEL_W - VALUE_W);
  const barH = Math.min(MAX_BAR - 8, ROW_H - 14);

  if (rows.length === 0) {
    return (
      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-6 mb-6 text-center text-xs text-[var(--text-muted)]">
          Belum ada biaya pada periode ini.
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
            aria-label={title}
            className="block"
          >
            {rows.map((d, i) => {
              const yTop = i * ROW_H + (ROW_H - barH) / 2;
              const end = LABEL_W + (Math.max(0, d.biaya) / max) * barMaxW;
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
                    {d.name.length > 19 ? `${d.name.slice(0, 18)}…` : d.name}
                  </text>
                  <path
                    d={barPathRight(LABEL_W, yTop, end, barH)}
                    fill={seriesVar(d.color_slot)}
                  />
                  <text
                    x={W}
                    y={i * ROW_H + ROW_H / 2 + 4}
                    textAnchor="end"
                    fontSize={12}
                    className="tnum"
                    fill="var(--text-primary)"
                  >
                    {compact(d.biaya)}
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
            className="pointer-events-none absolute z-10 min-w-[180px] rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-2.5 text-xs shadow-lg"
            style={{
              top: Math.max(0, hover * ROW_H - 8),
              left: Math.min(LABEL_W, Math.max(W - 190, 0)),
            }}
          >
            <div className="font-medium">{rows[hover].name}</div>
            <div className="tnum mt-1">{fmtIdr(rows[hover].biaya)}</div>
            <div className="mt-1 text-[var(--text-muted)]">
              {pct(rows[hover].biaya, total)} dari total · {rows[hover].tx_count} baris
            </div>
            {rows[hover].budget_idr > 0 && (
              <div className="tnum mt-1 text-[var(--text-muted)]">
                Budget {fmtIdr(rows[hover].budget_idr)} ·{" "}
                {pct(rows[hover].biaya, rows[hover].budget_idr, 0)} terpakai
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex justify-between border-t border-[var(--hairline)] pt-2 text-xs">
        <span className="text-[var(--text-secondary)]">Total</span>
        <span className="tnum font-medium">{fmtIdr(total)}</span>
      </div>
    </section>
  );
}
