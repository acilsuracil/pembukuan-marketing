"use client";

import { useState } from "react";
import { compact, fmtIdr, fmtUsdt, monthLabel } from "@/lib/format";
import type { MonthFlow } from "@/lib/types";
import { GAP, MAX_BAR, barPathUp, niceTicks, useMeasure } from "./chart-utils";

type Unit = "usdt" | "idr";

export default function CashflowChart({
  data,
  periodLabel = "12 bulan terakhir",
}: {
  data: MonthFlow[];
  periodLabel?: string;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [unit, setUnit] = useState<Unit>("usdt");
  const [hover, setHover] = useState<number | null>(null);

  const val = (d: MonthFlow, k: "in" | "out") =>
    unit === "usdt" ? (k === "in" ? d.in_usdt : d.out_usdt) : k === "in" ? d.in_idr : d.out_idr;
  const fmt = (v: number) => (unit === "usdt" ? fmtUsdt(v) : fmtIdr(v));

  const H = 260;
  const PAD = { t: 12, r: 8, b: 30, l: 56 };
  const W = Math.max(width, 320);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const yBase = PAD.t + plotH;

  const max = Math.max(1, ...data.flatMap((d) => [val(d, "in"), val(d, "out")]));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => yBase - (v / top) * plotH;

  const slot = plotW / Math.max(1, data.length);
  const barW = Math.min(MAX_BAR, Math.max(3, (slot - GAP) / 2 - 6));

  // Label langsung hanya pada puncak tiap seri — bukan di setiap batang.
  const peakIn = data.reduce(
    (b, d, i) => (val(d, "in") > val(data[b], "in") ? i : b),
    0,
  );
  const peakOut = data.reduce(
    (b, d, i) => (val(d, "out") > val(data[b], "out") ? i : b),
    0,
  );

  const hovered = hover !== null ? data[hover] : null;

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Arus kas per bulan</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {periodLabel} · rupiah dinilai pada kurs yang berlaku tiap transaksi
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-[var(--hairline)] p-0.5">
            {(["usdt", "idr"] as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                aria-pressed={unit === u}
                className={`rounded-[6px] px-2.5 py-1 text-xs font-medium transition ${
                  unit === u
                    ? "bg-[var(--wash)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {u === "usdt" ? "USDT" : "IDR"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legenda — identitas seri tidak pernah bergantung pada warna saja. */}
      <ul className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[2px] bg-[var(--flow-in)]"
          />
          Uang masuk
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[2px] bg-[var(--flow-out)]"
          />
          Uang keluar
        </li>
      </ul>

      <div ref={ref} className="relative mt-2">
        {width > 0 && (
          <svg
            width={W}
            height={H}
            role="img"
            aria-label="Grafik batang arus kas masuk dan keluar per bulan"
            className="block"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.l}
                  x2={W - PAD.r}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? "var(--axis)" : "var(--grid)"}
                  strokeWidth={1}
                />
                <text
                  x={PAD.l - 8}
                  y={y(t) + 4}
                  textAnchor="end"
                  className="tnum"
                  fontSize={11}
                  fill="var(--text-muted)"
                >
                  {compact(t)}
                </text>
              </g>
            ))}

            {data.map((d, i) => {
              const cx = PAD.l + slot * i + slot / 2;
              const xIn = cx - barW - GAP / 2;
              const xOut = cx + GAP / 2;
              const vi = val(d, "in");
              const vo = val(d, "out");
              return (
                <g key={d.month}>
                  {hover === i && (
                    <rect
                      x={PAD.l + slot * i}
                      y={PAD.t}
                      width={slot}
                      height={plotH}
                      fill="var(--wash)"
                    />
                  )}
                  <path d={barPathUp(xIn, y(vi), barW, yBase)} fill="var(--flow-in)" />
                  <path d={barPathUp(xOut, y(vo), barW, yBase)} fill="var(--flow-out)" />

                  {/* Label puncak diletakkan di atas batang tertinggi grup dan
                      menjorok ke luar, supaya tidak menabrak batang tetangga. */}
                  {i === peakIn && vi > 0 && (
                    <text
                      x={xIn + barW}
                      y={y(Math.max(vi, vo)) - 6}
                      textAnchor="end"
                      fontSize={11}
                      className="tnum"
                      fill="var(--text-secondary)"
                    >
                      {compact(vi)}
                    </text>
                  )}
                  {i === peakOut && vo > 0 && (
                    <text
                      x={xOut}
                      y={y(Math.max(vi, vo)) - 6}
                      textAnchor="start"
                      fontSize={11}
                      className="tnum"
                      fill="var(--text-secondary)"
                    >
                      {compact(vo)}
                    </text>
                  )}

                  <text
                    x={cx}
                    y={H - 10}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--text-muted)"
                  >
                    {monthLabel(d.month)}
                  </text>

                  {/* Target hover selebar slot, jauh lebih besar dari batangnya. */}
                  <rect
                    x={PAD.l + slot * i}
                    y={PAD.t}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {hovered && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[168px] rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-2.5 text-xs shadow-lg"
            style={{
              left: Math.min(
                Math.max(PAD.l + slot * (hover ?? 0) + slot / 2 - 84, 0),
                Math.max(W - 176, 0),
              ),
            }}
          >
            <div className="font-medium">{monthLabel(hovered.month)}</div>
            <dl className="mt-1.5 space-y-1">
              <div className="flex items-center justify-between gap-4">
                <dt className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-[2px] bg-[var(--flow-in)]"
                  />
                  Masuk
                </dt>
                <dd className="tnum">{fmt(val(hovered, "in"))}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-[2px] bg-[var(--flow-out)]"
                  />
                  Keluar
                </dt>
                <dd className="tnum">{fmt(val(hovered, "out"))}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-[var(--hairline)] pt-1">
                <dt className="text-[var(--text-secondary)]">Bersih</dt>
                <dd className="tnum font-medium">
                  {fmt(val(hovered, "in") - val(hovered, "out"))}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          Lihat sebagai tabel
        </summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-[var(--text-muted)]">
            <tr>
              <th className="py-1 font-medium">Bulan</th>
              <th className="py-1 text-right font-medium">Masuk</th>
              <th className="py-1 text-right font-medium">Keluar</th>
              <th className="py-1 text-right font-medium">Bersih</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {data.map((d) => (
              <tr key={d.month} className="border-t border-[var(--hairline)]">
                <td className="py-1">{monthLabel(d.month)}</td>
                <td className="py-1 text-right">{fmt(val(d, "in"))}</td>
                <td className="py-1 text-right">{fmt(val(d, "out"))}</td>
                <td className="py-1 text-right">
                  {fmt(val(d, "in") - val(d, "out"))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
