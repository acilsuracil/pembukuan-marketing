"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { JENIS_LABEL } from "@/lib/format";
import { JENIS_SEMUA } from "@/lib/jenis";
import type { TxOpt } from "./TxForm";

// Transfer ikut bisa difilter walau tidak bisa dibuat dari formulir satuan —
// riwayat pindahan tetap perlu bisa ditelusuri di sini.
const JENIS_ORDER = JENIS_SEMUA;

export interface TxFilterValues {
  from: string;
  to: string;
  jenis: string;
  divisi: string;
  platform: string;
  brand: string;
  dompet: string;
  q: string;
}

/** Filter daftar transaksi. Semua nilainya hidup di URL, jadi bisa di-bookmark. */
export default function TxFilters({
  value,
  divisi,
  platform,
  brand,
  dompet,
  exportHref,
  keep,
}: {
  value: TxFilterValues;
  divisi: TxOpt[];
  platform: TxOpt[];
  brand: TxOpt[];
  dompet: TxOpt[];
  exportHref?: string;
  /** Parameter di luar filter yang harus bertahan, mis. jumlah baris per halaman. */
  keep?: Record<string, string>;
}) {
  const router = useRouter();
  const [v, setV] = useState(value);

  function apply(next: TxFilterValues) {
    setV(next);
    // Nomor halaman sengaja tidak dibawa: filter baru mulai dari halaman 1.
    const u = new URLSearchParams();
    for (const [k, val] of Object.entries({ ...next, ...keep })) if (val) u.set(k, val);
    const s = u.toString();
    router.push(s ? `/belanja?${s}` : "/belanja");
  }

  const set = (part: Partial<TxFilterValues>) => apply({ ...v, ...part });

  return (
    <section className="card space-y-3 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="f-from">
            Dari
          </label>
          <input
            id="f-from"
            type="date"
            className="field tnum py-1.5 text-xs"
            value={v.from}
            onChange={(e) => set({ from: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="f-to">
            Sampai
          </label>
          <input
            id="f-to"
            type="date"
            className="field tnum py-1.5 text-xs"
            value={v.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="f-jenis">
            Jenis
          </label>
          <select
            id="f-jenis"
            className="field w-[150px] py-1.5 text-xs"
            value={v.jenis}
            onChange={(e) => set({ jenis: e.target.value })}
          >
            <option value="">Semua jenis</option>
            {JENIS_ORDER.map((j) => (
              <option key={j} value={j}>
                {JENIS_LABEL[j]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-divisi">
            Divisi
          </label>
          <select
            id="f-divisi"
            className="field w-[140px] py-1.5 text-xs"
            value={v.divisi}
            onChange={(e) => set({ divisi: e.target.value })}
          >
            <option value="">Semua divisi</option>
            {divisi.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="label" id="f-platform-label">
            Category
          </span>
          <MultiPilih
            labelId="f-platform-label"
            semua="Semua category"
            satuan="category"
            options={platform}
            value={v.platform}
            onChange={(platform) => set({ platform })}
          />
        </div>
        <div>
          <label className="label" htmlFor="f-brand">
            Brand
          </label>
          <select
            id="f-brand"
            className="field w-[140px] py-1.5 text-xs"
            value={v.brand}
            onChange={(e) => set({ brand: e.target.value })}
          >
            <option value="">Semua brand</option>
            {brand.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-dompet">
            Dompet
          </label>
          <select
            id="f-dompet"
            className="field w-[140px] py-1.5 text-xs"
            value={v.dompet}
            onChange={(e) => set({ dompet: e.target.value })}
          >
            <option value="">Semua dompet</option>
            {dompet.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply(v);
          }}
        >
          <div>
            <label className="label" htmlFor="f-q">
              Cari
            </label>
            <input
              id="f-q"
              type="search"
              className="field w-[240px] py-1.5 text-xs"
              placeholder="keterangan, no. referensi, penerima…"
              value={v.q}
              onChange={(e) => setV({ ...v, q: e.target.value })}
            />
          </div>
          <button type="submit" className="btn btn-ghost px-2.5 py-1.5 text-xs">
            Terapkan
          </button>
        </form>

        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-ghost px-2.5 py-1.5 text-xs"
            onClick={() =>
              apply({
                from: "",
                to: "",
                jenis: "",
                divisi: "",
                platform: "",
                brand: "",
                dompet: "",
                q: "",
              })
            }
          >
            Reset
          </button>
          {exportHref && (
            <a href={exportHref} className="btn btn-ghost px-2.5 py-1.5 text-xs">
              Ekspor CSV
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Pilihan ganda berbentuk dropdown berisi kotak centang. Nilainya id berpisah
 * koma ("3,5,8") supaya tetap satu parameter URL seperti filter lain; kosong =
 * semua. Setiap centang langsung diterapkan, sama dengan select di sebelahnya.
 */
function MultiPilih({
  labelId,
  semua,
  satuan,
  options,
  value,
  onChange,
}: {
  labelId: string;
  semua: string;
  satuan: string;
  options: TxOpt[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const terpilih = value.split(",").filter(Boolean);

  // Tutup saat klik di luar atau tekan Escape — seperti select biasa.
  useEffect(() => {
    if (!buka) return;
    const klik = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setBuka(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setBuka(false);
    document.addEventListener("mousedown", klik);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", klik);
      document.removeEventListener("keydown", esc);
    };
  }, [buka]);

  const ringkas =
    terpilih.length === 0
      ? semua
      : terpilih.length === 1
        ? (options.find((o) => String(o.id) === terpilih[0])?.label ?? `1 ${satuan}`)
        : `${terpilih.length} ${satuan}`;

  const toggle = (id: string) =>
    onChange(
      (terpilih.includes(id) ? terpilih.filter((x) => x !== id) : [...terpilih, id]).join(","),
    );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={buka}
        className="field flex w-[170px] items-center justify-between gap-2 py-1.5 text-left text-xs"
        onClick={() => setBuka((b) => !b)}
      >
        <span className="truncate">{ringkas}</span>
        <span aria-hidden className="text-[var(--text-muted)]">
          ▾
        </span>
      </button>
      {buka && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-labelledby={labelId}
          className="card absolute z-20 mt-1 max-h-72 w-[230px] overflow-y-auto p-1 shadow-lg"
        >
          <button
            type="button"
            className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--wash)]"
            onClick={() => onChange("")}
          >
            {terpilih.length === 0 ? "✓ " : ""}
            {semua}
          </button>
          <div className="my-1 border-t border-[var(--hairline)]" />
          {options.map((o) => {
            const id = String(o.id);
            return (
              <label
                key={o.id}
                role="option"
                aria-selected={terpilih.includes(id)}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-[var(--wash)]"
              >
                <input
                  type="checkbox"
                  checked={terpilih.includes(id)}
                  onChange={() => toggle(id)}
                />
                {o.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
