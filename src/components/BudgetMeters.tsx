import Link from "next/link";
import { fmtUsdt } from "@/lib/format";
import type { BudgetRow } from "@/lib/queries";

/** Warna status + ikon + label — status tidak pernah dibawa warna saja. */
function severity(pct: number) {
  if (pct > 100)
    return { color: "var(--status-critical)", icon: "✕", label: "Lewat budget" };
  if (pct >= 85)
    return { color: "var(--status-serious)", icon: "!", label: "Hampir habis" };
  if (pct >= 60)
    return { color: "var(--status-warning)", icon: "•", label: "Perlu dipantau" };
  return { color: "var(--status-good)", icon: "✓", label: "Aman" };
}

export default function BudgetMeters({
  rows,
  periodLabel,
  title = "Budget bulan berjalan",
  manageHref,
}: {
  rows: BudgetRow[];
  periodLabel: string;
  title?: string;
  manageHref?: string;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{periodLabel}</p>
        </div>
        {manageHref && (
          <Link
            href={manageHref}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Atur budget →
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 mb-4 text-center text-xs text-[var(--text-muted)]">
          Belum ada budget yang dipasang.
          {manageHref && (
            <>
              {" "}
              <Link href={manageHref} className="underline">
                Set budget bulanan
              </Link>{" "}
              untuk memantau pengeluaran.
            </>
          )}
        </p>
      ) : (
        <ul className="mt-4 space-y-3.5">
          {rows.map((r) => {
            const s = severity(r.pct);
            const filled = Math.min(100, r.pct);
            return (
              <li key={`${r.id}-${r.name}`}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="tnum shrink-0 text-[var(--text-secondary)]">
                    {fmtUsdt(r.usdt)}{" "}
                    <span className="text-[var(--text-muted)]">
                      / {fmtUsdt(r.budget_usdt)}
                    </span>
                  </span>
                </div>
                <div
                  className="mt-1.5 h-2 w-full overflow-hidden rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${s.color} 18%, var(--surface-1))`,
                  }}
                  role="meter"
                  aria-valuenow={Math.round(r.pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Realisasi budget ${r.name}`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${filled}%`, background: s.color }}
                  />
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <span aria-hidden style={{ color: s.color }}>
                    {s.icon}
                  </span>
                  <span>
                    {s.label} · {r.pct.toFixed(0)}%
                    {r.pct > 100
                      ? ` · lebih ${fmtUsdt(r.usdt - r.budget_usdt)}`
                      : ` · sisa ${fmtUsdt(r.budget_usdt - r.usdt)}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
