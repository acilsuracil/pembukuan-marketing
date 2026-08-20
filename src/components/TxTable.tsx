import Link from "next/link";
import { fmtDate, fmtIdr, fmtRate, fmtUsdt } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import type { SortDir, SortKey } from "@/lib/queries";
import type { TxRow } from "@/lib/types";

function TypeBadge({ type }: { type: "in" | "out" }) {
  const isIn = type === "in";
  const color = isIn ? "var(--flow-in)" : "var(--flow-out)";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span aria-hidden>{isIn ? "↓" : "↑"}</span>
      {isIn ? "Masuk" : "Keluar"}
    </span>
  );
}

function Dot({ slot }: { slot: number | null }) {
  return (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-[2px]"
      style={{ background: seriesVar(slot) }}
    />
  );
}

/** Header kolom yang bisa diklik untuk mengurutkan. */
function SortTh({
  label,
  col,
  sort,
  dir,
  params,
  align = "left",
}: {
  label: string;
  col?: SortKey;
  sort: SortKey;
  dir: SortDir;
  params: string;
  align?: "left" | "right";
}) {
  const cls = `px-4 py-2.5 font-medium ${align === "right" ? "text-right" : ""}`;
  if (!col) return <th className={cls}>{label}</th>;

  const active = sort === col;
  const nextDir: SortDir = active && dir === "desc" ? "asc" : "desc";
  const qs = new URLSearchParams(params);
  qs.set("sort", col);
  qs.set("dir", nextDir);

  return (
    <th className={cls} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link
        href={`/transaksi?${qs.toString()}`}
        className={`inline-flex items-center gap-1 hover:text-[var(--text-primary)] ${
          active ? "text-[var(--text-primary)]" : ""
        }`}
      >
        {label}
        <span aria-hidden className={active ? "" : "opacity-30"}>
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </Link>
    </th>
  );
}

export default function TxTable({
  rows,
  compactView = false,
  sort = "date",
  dir = "desc",
  params = "",
}: {
  rows: TxRow[];
  compactView?: boolean;
  sort?: SortKey;
  dir?: SortDir;
  /** Query string filter aktif, dipakai untuk menyusun tautan pengurutan. */
  params?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
        Belum ada transaksi yang cocok.
      </p>
    );
  }

  const sortable = !compactView;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="text-xs text-[var(--text-muted)]">
          <tr className="border-b border-[var(--hairline)]">
            <SortTh label="Tanggal" col={sortable ? "date" : undefined} {...{ sort, dir, params }} />
            <SortTh label="Jenis" col={sortable ? "type" : undefined} {...{ sort, dir, params }} />
            <SortTh label="Brand" col={sortable ? "brand" : undefined} {...{ sort, dir, params }} />
            <SortTh label="Kategori" col={sortable ? "category" : undefined} {...{ sort, dir, params }} />
            <SortTh label="Keterangan" {...{ sort, dir, params }} />
            <SortTh label="USDT" col={sortable ? "amount" : undefined} align="right" {...{ sort, dir, params }} />
            <SortTh label="Kurs" align="right" {...{ sort, dir, params }} />
            <SortTh label="Rupiah" col={sortable ? "idr" : undefined} align="right" {...{ sort, dir, params }} />
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.id}
              className="border-b border-[var(--hairline)] last:border-0 hover:bg-[var(--wash)]"
            >
              <td className="tnum px-4 py-2.5 whitespace-nowrap">{fmtDate(t.date)}</td>
              <td className="px-4 py-2.5">
                <TypeBadge type={t.type} />
              </td>
              <td className="px-4 py-2.5">
                {t.brand_name ? (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Dot slot={t.brand_slot} />
                    {t.brand_name}
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)]">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {t.category_name ? (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Dot slot={t.color_slot} />
                    {t.category_name}
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)]">—</span>
                )}
              </td>
              <td className="max-w-[220px] px-4 py-2.5">
                <div className="truncate">
                  {t.description || <span className="text-[var(--text-muted)]">—</span>}
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  {t.counterparty && <span className="truncate">{t.counterparty}</span>}
                  {t.bukti_count > 0 && (
                    <span title={`${t.bukti_count} bukti`}>📎 {t.bukti_count}</span>
                  )}
                  {/* Tanpa penanda ini, tiga baris beruntun dengan nominal
                      berbeda-beda terbaca seperti tiga pembayaran terpisah —
                      dan totalnya akan disangka kelebihan hitung. */}
                  {t.split_count > 1 && (
                    <span
                      title={`Porsi ${t.split_index} dari ${t.split_count} — satu pembayaran yang dibagi antar brand`}
                    >
                      ⧉ {t.split_index}/{t.split_count}
                    </span>
                  )}
                  {t.pending_count > 0 && (
                    <span style={{ color: "var(--status-serious)" }}>● pengajuan</span>
                  )}
                </div>
              </td>
              <td className="tnum px-4 py-2.5 text-right whitespace-nowrap">
                {t.type === "in" ? "+" : "−"}
                {fmtUsdt(t.flow_usdt).replace(" USDT", "")}
                {/* Fee agency disebut dengan persentasenya — itu bentuk yang
                    dikenali saat mencocokkan dengan tagihan agency. */}
                {(t.fee_usdt > 0 || t.fee_pct > 0) && (
                  <div className="text-[11px] text-[var(--text-muted)]">
                    inc.{" "}
                    {[
                      t.fee_pct > 0 && `fee ${t.fee_pct}% = ${t.fee_pct_usdt}`,
                      t.fee_usdt > 0 && `jaringan ${t.fee_usdt}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </td>
              <td className="tnum px-4 py-2.5 text-right whitespace-nowrap">
                {fmtRate(t.eff_rate)}
                <div className="text-[11px] text-[var(--text-muted)]">
                  {t.type === "in"
                    ? "kurs beli"
                    : t.rate_source === "warisan"
                      ? "warisan"
                      : "override"}
                </div>
              </td>
              <td className="tnum px-4 py-2.5 text-right whitespace-nowrap">
                {t.eff_rate === null ? "–" : fmtIdr(t.flow_usdt * t.eff_rate)}
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                <Link
                  href={`/transaksi/${t.id}`}
                  className="btn btn-ghost px-2 py-1 text-xs"
                >
                  Detail
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
