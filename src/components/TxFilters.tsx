"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { JENIS_LABEL } from "@/lib/format";
import type { Jenis } from "@/lib/types";
import type { TxOpt } from "./TxForm";

const JENIS_ORDER: Jenis[] = ["belanja", "topup", "refund", "biaya_dompet", "koreksi"];

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
}: {
  value: TxFilterValues;
  divisi: TxOpt[];
  platform: TxOpt[];
  brand: TxOpt[];
  dompet: TxOpt[];
  exportHref?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(value);

  function apply(next: TxFilterValues) {
    setV(next);
    const u = new URLSearchParams();
    for (const [k, val] of Object.entries(next)) if (val) u.set(k, val);
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
          <label className="label" htmlFor="f-platform">
            Platform
          </label>
          <select
            id="f-platform"
            className="field w-[150px] py-1.5 text-xs"
            value={v.platform}
            onChange={(e) => set({ platform: e.target.value })}
          >
            <option value="">Semua platform</option>
            {platform.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
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
