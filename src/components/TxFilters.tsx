"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { addMonths, currentMonth, todayISO } from "@/lib/format";
import type { Brand, Category } from "@/lib/types";

function shift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

const PRESETS: Array<{ label: string; from: () => string; to: () => string }> = [
  { label: "Semua", from: () => "", to: () => "" },
  { label: "Hari ini", from: () => todayISO(), to: () => todayISO() },
  { label: "Kemarin", from: () => shift(-1), to: () => shift(-1) },
  { label: "7 hari", from: () => shift(-6), to: () => todayISO() },
  { label: "30 hari", from: () => shift(-29), to: () => todayISO() },
  { label: "Bulan ini", from: () => `${currentMonth()}-01`, to: () => todayISO() },
  {
    label: "Bulan lalu",
    from: () => `${addMonths(currentMonth(), -1)}-01`,
    to: () => lastDayOfMonth(addMonths(currentMonth(), -1)),
  },
];

export default function TxFilters({
  categories,
  brands,
}: {
  categories: Category[];
  brands: Brand[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.push(`/transaksi?${params.toString()}`);
  }

  const from = get("from");
  const to = get("to");
  const anyFilter =
    from || to || get("type") || get("cat") || get("brand") || get("q");

  return (
    <section className="card space-y-3 p-3">
      {/* Rentang tanggal bebas — bisa satu hari tertentu, bukan cuma preset. */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="f-from">
            Dari tanggal
          </label>
          <input
            id="f-from"
            type="date"
            className="field tnum w-[152px] py-1.5 text-xs"
            value={from}
            max={to || undefined}
            onChange={(e) => apply({ from: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="f-to">
            Sampai tanggal
          </label>
          <input
            id="f-to"
            type="date"
            className="field tnum w-[152px] py-1.5 text-xs"
            value={to}
            min={from || undefined}
            onChange={(e) => apply({ to: e.target.value })}
          />
        </div>

        <div className="flex flex-wrap gap-1 pb-0.5">
          {PRESETS.map((p) => {
            const pf = p.from();
            const pt = p.to();
            const active = from === pf && to === pt;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => apply({ from: pf, to: pt })}
                aria-pressed={active}
                className="btn btn-ghost px-2.5 py-1 text-xs"
                style={
                  active
                    ? { background: "var(--wash)", color: "var(--text-primary)" }
                    : undefined
                }
              >
                {active && <span aria-hidden>✓</span>}
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-[var(--hairline)] pt-3">
        <div>
          <label className="label" htmlFor="f-brand">
            Brand
          </label>
          <select
            id="f-brand"
            className="field w-[168px] py-1.5 text-xs"
            value={get("brand")}
            onChange={(e) => apply({ brand: e.target.value })}
          >
            <option value="">Semua brand</option>
            <option value="none">(Tanpa brand)</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.archived ? " (arsip)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="f-cat">
            Kategori
          </label>
          <select
            id="f-cat"
            className="field w-[168px] py-1.5 text-xs"
            value={get("cat")}
            onChange={(e) => apply({ cat: e.target.value })}
          >
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? " (arsip)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="f-type">
            Jenis
          </label>
          <select
            id="f-type"
            className="field w-[128px] py-1.5 text-xs"
            value={get("type")}
            onChange={(e) => apply({ type: e.target.value })}
          >
            <option value="">Semua</option>
            <option value="in">Uang masuk</option>
            <option value="out">Uang keluar</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="f-sort">
            Urutkan
          </label>
          <select
            id="f-sort"
            className="field w-[184px] py-1.5 text-xs"
            value={`${get("sort") || "date"}:${get("dir") || "desc"}`}
            onChange={(e) => {
              const [sort, dir] = e.target.value.split(":");
              apply({ sort, dir });
            }}
          >
            <option value="date:desc">Tanggal — terbaru</option>
            <option value="date:asc">Tanggal — terlama</option>
            <option value="amount:desc">Nominal USDT — terbesar</option>
            <option value="amount:asc">Nominal USDT — terkecil</option>
            <option value="idr:desc">Nilai rupiah — terbesar</option>
            <option value="idr:asc">Nilai rupiah — terkecil</option>
            <option value="brand:asc">Brand — A ke Z</option>
            <option value="brand:desc">Brand — Z ke A</option>
            <option value="category:asc">Kategori — A ke Z</option>
            <option value="type:asc">Jenis transaksi</option>
          </select>
        </div>

        <div className="ml-auto flex items-end gap-2">
          <div>
            <label className="label" htmlFor="f-q">
              Cari
            </label>
            <input
              id="f-q"
              type="search"
              placeholder="Keterangan, pihak, hash…"
              defaultValue={get("q")}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply({ q: e.currentTarget.value });
              }}
              className="field w-52 py-1.5 text-xs"
            />
          </div>
          {anyFilter && (
            <button
              type="button"
              onClick={() =>
                apply({ from: "", to: "", type: "", cat: "", brand: "", q: "" })
              }
              className="btn btn-ghost px-2.5 py-1 text-xs"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
