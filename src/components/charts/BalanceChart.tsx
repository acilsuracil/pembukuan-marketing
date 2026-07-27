"use client";

import { useState } from "react";
import { compact, fmtIdr, fmtUsdt, monthLabel } from "@/lib/format";
import { niceTicks, useMeasure } from "./chart-utils";

export interface BalancePoint {
  month: string;
  balance: number;
}

export default function BalanceChart({
  data,
  rate,
}: {
  data: BalancePoint[];
  rate: number | null;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const H = 200;
  const PAD = { t: 16, r: 52, b: 28, l: 56 };
  const W = Math.max(width, 320);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const yBase = PAD.t + plotH;

  const maxV = Math.max(1, ...data.map((d) => d.balance));
  const ticks = niceTicks(maxV);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => yBase - (Math.max(0, v) / top) * plotH;
  const x = (i: number) =>
    data.length <= 1 ? PAD.l + plotW / 2 : PAD.l + (plotW * i) / (data.length - 1);

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.balance)}`).join(" ");
  const area =
    data.length > 0
      ? `${line} L ${x(data.length - 1)} ${yBase} L ${x(0)} ${yBase} Z`
      : "";

  const last = data[data.length - 1];
  const hovered = hover !== null ? data[hover] : null;

  return (
    <section className="card p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold">Saldo dompet akhir bulan</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Sisa USDT setelah seluruh pemasukan dan pengeluaran
        </p>
      </div>

      <div ref={ref} className="relative mt-2">
        {width > 0 && (
          <svg
            width={W}
            height={H}
            role="img"
            aria-label="Grafik garis saldo dompet USDT di akhir tiap bulan"
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
                  fontSize={11}
                  className="tnum"
                  fill="var(--text-muted)"
                >
                  {compact(t)}
                </text>
              </g>
            ))}

            <path d={area} fill="var(--series-1)" fillOpacity={0.1} />
            <path
              d={line}
              fill="none"
              stroke="var(--series-1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {data.map((d, i) => (
              <text
                key={d.month}
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                fontSize={11}
                fill="var(--text-muted)"
              >
                {/* Dihitung dari ujung kanan agar bulan terakhir selalu berlabel. */}
                {(data.length - 1 - i) % (data.length > 8 ? 2 : 1) === 0
                  ? monthLabel(d.month)
                  : ""}
              </text>
            ))}

            {hovered && (
              <line
                x1={x(hover!)}
                x2={x(hover!)}
                y1={PAD.t}
                y2={yBase}
                stroke="var(--axis)"
                strokeWidth={1}
              />
            )}

            {/* Penanda ujung: cincin permukaan 2px supaya tetap terbaca. */}
            {last && (
              <>
                <circle cx={x(data.length - 1)} cy={y(last.balance)} r={6} fill="var(--surface-1)" />
                <circle cx={x(data.length - 1)} cy={y(last.balance)} r={4} fill="var(--series-1)" />
                <text
                  x={x(data.length - 1) + 10}
                  y={y(last.balance) + 4}
                  fontSize={11}
                  className="tnum"
                  fill="var(--text-secondary)"
                >
                  {compact(last.balance)}
                </text>
              </>
            )}

            {hovered && (
              <>
                <circle cx={x(hover!)} cy={y(hovered.balance)} r={6} fill="var(--surface-1)" />
                <circle cx={x(hover!)} cy={y(hovered.balance)} r={4} fill="var(--series-1)" />
              </>
            )}

            {data.map((d, i) => (
              <rect
                key={`hit-${d.month}`}
                x={x(i) - plotW / Math.max(1, data.length) / 2}
                y={PAD.t}
                width={plotW / Math.max(1, data.length)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </svg>
        )}

        {hovered && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-2.5 text-xs shadow-lg"
            style={{
              left: Math.min(Math.max(x(hover!) - 75, 0), Math.max(W - 158, 0)),
            }}
          >
            <div className="font-medium">{monthLabel(hovered.month)}</div>
            <div className="tnum mt-1">{fmtUsdt(hovered.balance)}</div>
            {rate !== null && (
              <div className="tnum text-[var(--text-muted)]">
                ≈ {fmtIdr(hovered.balance * rate)}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
