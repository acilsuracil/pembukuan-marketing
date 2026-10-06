"use client";

import { useActionState } from "react";
import { importCsv, type ImportState } from "@/app/import-actions";
import { fmtDate, fmtIdr } from "@/lib/format";
import { Alert, Badge } from "./ui";

const EMPTY: ImportState = { ok: false };

/** Tampilkan paling banyak sekian baris; sisanya cukup dihitung. */
const TAMPIL = 200;

export default function ImportForm({
  brand,
  divisi,
}: {
  brand: Array<{ id: number; label: string }>;
  divisi: Array<{ id: number; label: string }>;
}) {
  const [state, action, pending] = useActionState(importCsv, EMPTY);

  const rows = state.rows ?? [];
  const salah = rows.filter((r) => r.error);
  const baik = rows.filter((r) => !r.error);
  const totalBaik = baik.reduce((s, r) => s + r.nominal, 0);
  const baru = state.baru;
  const adaBaru =
    baru &&
    baru.platform.length + baru.jenisBayar.length + baru.divisi.length + baru.penerima.length >
      0;

  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />

      <section className="card space-y-4 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="i-brand">
              Brand
            </label>
            <select id="i-brand" name="brand_id" className="field" required>
              <option value="">— pilih brand —</option>
              {brand.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            <p className="hint">
              Satu tab sheet = satu brand. Seluruh baris dalam berkas ini akan
              dicatat atas nama brand tersebut.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="i-divisi">
              Divisi bawaan
            </label>
            <input
              id="i-divisi"
              name="divisi_default"
              className="field"
              list="daftar-divisi"
              placeholder="mis. Endorse"
            />
            <datalist id="daftar-divisi">
              {divisi.map((d) => (
                <option key={d.id} value={d.label} />
              ))}
            </datalist>
            <p className="hint">
              Dipakai untuk baris yang tidak punya kolom Divisi di sheet-nya.
              Kalau sheet sudah punya kolom itu, isinya yang menang.
            </p>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="i-file">
            Berkas CSV
          </label>
          <input
            id="i-file"
            type="file"
            name="file"
            accept=".csv,text/csv,text/plain"
            className="field"
          />
          <p className="hint">
            Dari Google Sheet: File → Download → Comma-separated values. Atau
            tempel langsung isinya di kotak bawah.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="i-csv">
            Atau tempel isi CSV
          </label>
          <textarea
            id="i-csv"
            name="csv"
            rows={5}
            className="field font-mono text-xs"
            placeholder="Tanggal,Category,Jenis Pembayaran,Rekening,Keterangan,Nominal"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="mode"
            value="pratinjau"
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? "…" : "Pratinjau"}
          </button>
          {baik.length > 0 && state.tersimpan === undefined && (
            <button
              type="submit"
              name="mode"
              value="simpan"
              disabled={pending}
              className="btn"
              onClick={(e) => {
                if (
                  !confirm(
                    `Simpan ${baik.length} baris senilai ${fmtIdr(totalBaik)}? Ini menambah transaksi sungguhan.`,
                  )
                )
                  e.preventDefault();
              }}
            >
              Simpan {baik.length} baris
            </button>
          )}
        </div>
      </section>

      {rows.length > 0 && (
        <section className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span>
              <strong className="tnum">{baik.length}</strong> baris siap
            </span>
            <span className="tnum text-[var(--text-secondary)]">{fmtIdr(totalBaik)}</span>
            {salah.length > 0 && (
              <span style={{ color: "var(--status-critical)" }}>
                {salah.length} baris bermasalah — dilewati
              </span>
            )}
          </div>

          {adaBaru && (
            <div className="mt-3 rounded-lg border border-[var(--hairline)] p-3 text-xs">
              <p className="font-medium">Data master yang akan dibuat:</p>
              <ul className="mt-1 space-y-0.5 text-[var(--text-secondary)]">
                {baru.divisi.length > 0 && <li>Divisi: {baru.divisi.join(", ")}</li>}
                {baru.platform.length > 0 && <li>Category: {baru.platform.join(", ")}</li>}
                {baru.jenisBayar.length > 0 && (
                  <li>Jenis pembayaran: {baru.jenisBayar.join(", ")}</li>
                )}
                {baru.penerima.length > 0 && (
                  <li>Penerima: {baru.penerima.length} rekening baru</li>
                )}
              </ul>
              <p className="mt-2 text-[var(--text-muted)]">
                Periksa ejaannya dulu — &quot;Meta Ads&quot; dan &quot;meta ads&quot;
                yang berbeda spasi akan jadi dua master terpisah.
              </p>
            </div>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-2 py-2 font-medium">Baris</th>
                  <th className="px-2 py-2 font-medium">Tanggal</th>
                  <th className="px-2 py-2 font-medium">Category</th>
                  <th className="px-2 py-2 font-medium">Jenis</th>
                  <th className="px-2 py-2 font-medium">Keterangan</th>
                  <th className="px-2 py-2 text-right font-medium">Nominal</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, TAMPIL).map((r) => (
                  <tr
                    key={r.baris}
                    className="border-b border-[var(--hairline)] last:border-0"
                  >
                    <td className="tnum px-2 py-1.5 text-xs text-[var(--text-muted)]">
                      {r.baris}
                    </td>
                    <td className="tnum px-2 py-1.5 text-xs">
                      {r.error ? r.tanggal : fmtDate(r.tanggal)}
                    </td>
                    <td className="px-2 py-1.5 text-xs">{r.platform || "–"}</td>
                    <td className="px-2 py-1.5 text-xs">{r.jenisBayar || "–"}</td>
                    <td className="px-2 py-1.5 text-xs">
                      <span className="line-clamp-1">{r.keterangan || "–"}</span>
                      {r.error && (
                        <span className="mt-0.5 block">
                          <Badge tone="critical">{r.error}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="tnum px-2 py-1.5 text-right text-xs">
                      {r.error ? "–" : fmtIdr(r.nominal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > TAMPIL && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Menampilkan {TAMPIL} baris pertama dari {rows.length}. Semuanya
                tetap ikut tersimpan.
              </p>
            )}
          </div>
        </section>
      )}
    </form>
  );
}
