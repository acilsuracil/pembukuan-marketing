"use client";

import { useRouter } from "next/navigation";
import { addMonths, currentMonth } from "@/lib/format";

export default function PeriodPicker({
  from,
  to,
  min,
  max,
}: {
  from: string;
  to: string;
  min: string;
  max: string;
}) {
  const router = useRouter();

  function go(nextFrom: string, nextTo: string) {
    router.push(`/laporan?from=${nextFrom}&to=${nextTo}`);
  }

  const now = currentMonth();
  const presets = [
    { label: "Bulan ini", from: now, to: now },
    { label: "3 bulan", from: addMonths(now, -2), to: now },
    { label: "6 bulan", from: addMonths(now, -5), to: now },
    { label: "12 bulan", from: addMonths(now, -11), to: now },
    { label: `Tahun ${now.slice(0, 4)}`, from: `${now.slice(0, 4)}-01`, to: now },
  ];

  return (
    <section className="card flex flex-wrap items-end gap-3 p-3">
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => go(p.from, p.to)}
              aria-pressed={active}
              className="btn btn-ghost px-2.5 py-1 text-xs"
              style={
                active
                  ? {
                      background: "var(--wash)",
                      color: "var(--text-primary)",
                    }
                  : undefined
              }
            >
              {active && <span aria-hidden>✓</span>}
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="p-from">
            Dari bulan
          </label>
          <input
            id="p-from"
            type="month"
            className="field py-1.5 text-xs"
            value={from}
            min={min}
            max={max}
            onChange={(e) => go(e.target.value, to)}
          />
        </div>
        <div>
          <label className="label" htmlFor="p-to">
            Sampai bulan
          </label>
          <input
            id="p-to"
            type="month"
            className="field py-1.5 text-xs"
            value={to}
            min={min}
            max={max}
            onChange={(e) => go(from, e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
