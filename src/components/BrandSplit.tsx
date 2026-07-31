"use client";

import { useMemo, useState } from "react";
import { fmtUsdt } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import {
  evenShares,
  fromMicro,
  pctToShare,
  sameUsdt,
  sharePct,
  toMicro,
} from "@/lib/split";
import type { Brand } from "@/lib/types";
import { blurOnWheel } from "./ui";

/**
 * Pemilih brand yang menerima lebih dari satu brand sekaligus, beserta porsi
 * masing-masing.
 *
 * Satu brand terpilih = transaksi biasa, tidak ada porsi yang perlu diisi.
 * Dua atau lebih = pembayarannya dipecah jadi satu baris per brand saat
 * disimpan, masing-masing sebesar porsinya.
 *
 * Porsi bisa diketik sebagai **nominal USDT maupun persen** — keduanya kolom
 * hidup yang saling mengejar, karena di praktiknya kesepakatan kadang berbunyi
 * "600 USDT untuk A" dan kadang "60% untuk A".
 *
 * Yang dikirim ke server selalu nominalnya (`share_<id>`), bukan persennya:
 * 33,33% × 3 tidak pernah berjumlah 100%, jadi persen yang disimpan berarti
 * pembagian yang jumlahnya tidak pas.
 *
 * Daftar brand disusun sebagai kisi, bukan satu per baris, dan kolom porsinya
 * dipindah ke bagian terpisah di bawahnya. Belasan brand yang ditumpuk vertikal
 * mendorong seluruh formulir — termasuk tombol Simpan — jauh ke bawah layar, dan
 * kolom porsi yang menyelip di antara baris centang membuat daftarnya meregang
 * tidak rata setiap kali satu brand dicentang.
 */
export default function BrandSplit({
  brands,
  amount,
  required,
  initialBrandId,
}: {
  brands: Brand[];
  /** Nominal transaksi yang sedang diisi — dasar seluruh porsi. */
  amount: number;
  /** Pengeluaran wajib punya brand; pemasukan tidak. */
  required: boolean;
  initialBrandId?: number | null;
}) {
  const [chosen, setChosen] = useState<number[]>(
    initialBrandId ? [initialBrandId] : [],
  );
  /** Porsi per brand dalam USDT, sebagai teks — kolom yang sedang diketik. */
  const [share, setShare] = useState<Record<number, string>>({});
  /** Kolom persen ditulis terpisah supaya "33,33" tidak dibulatkan saat diketik. */
  const [pct, setPct] = useState<Record<number, string>>({});

  const multi = chosen.length > 1;

  /**
   * Brand arsip tidak ikut "pilih semua". Halaman catat baru memang hanya
   * mengirim brand aktif, tapi mengandalkan itu berarti tombol ini langsung jadi
   * salah begitu ada yang meneruskan daftar lengkap ke komponen ini.
   */
  const selectable = useMemo(() => brands.filter((b) => !b.archived), [brands]);

  const shares = useMemo(
    () => chosen.map((id) => Number((share[id] ?? "").replace(",", ".")) || 0),
    [chosen, share],
  );
  const total = useMemo(() => shares.reduce((a, b) => a + b, 0), [shares]);
  const diff = fromMicro(toMicro(amount) - toMicro(total));
  const pas = multi && amount > 0 && sameUsdt(total, amount);

  /** Menulis ulang kedua kolom sekaligus, supaya nominal dan persen tidak pernah berselisih. */
  function put(id: number, usdt: number) {
    setShare((s) => ({ ...s, [id]: usdt === 0 ? "" : String(usdt) }));
    setPct((p) => ({
      ...p,
      [id]:
        amount > 0 && usdt !== 0
          ? String(Math.round(sharePct(usdt, amount) * 100) / 100)
          : "",
    }));
  }

  function spreadEvenly(ids: number[] = chosen) {
    if (ids.length === 0 || !(amount > 0)) return;
    const even = evenShares(amount, ids.length);
    ids.forEach((id, i) => put(id, even[i]));
  }

  function replaceChosen(next: number[]) {
    setChosen(next);
    // Begitu brand kedua masuk, porsi langsung terisi rata — itu tebakan yang
    // paling sering benar, dan kalau salah cuma perlu ditimpa. Membiarkannya
    // kosong berarti setiap pembagian dimulai dari formulir yang belum sah.
    if (next.length > 1) spreadEvenly(next);
    else {
      setShare({});
      setPct({});
    }
  }

  function toggle(id: number) {
    replaceChosen(
      chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id],
    );
  }

  /** Sisa yang belum terbagi dilimpahkan ke satu brand — jalan keluar tercepat dari persen yang tidak genap. */
  function absorb(id: number) {
    const now = Number((share[id] ?? "").replace(",", ".")) || 0;
    put(id, fromMicro(toMicro(now) + toMicro(diff)));
  }

  const allOn = selectable.length > 0 && chosen.length === selectable.length;
  const last = chosen[chosen.length - 1];
  /** Baris porsi mengikuti urutan daftar, bukan urutan pencentangan — supaya tidak berpindah-pindah. */
  const chosenBrands = brands.filter((b) => chosen.includes(b.id));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="label">
          Brand{" "}
          {required ? (
            <span className="text-[var(--status-critical)]">*</span>
          ) : (
            <span className="font-normal text-[var(--text-muted)]">— opsional</span>
          )}
          <span className="font-normal text-[var(--text-muted)]">
            {" "}
            · bisa pilih lebih dari satu
            {chosen.length > 0 && ` · ${chosen.length} dipilih`}
          </span>
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => replaceChosen(allOn ? [] : selectable.map((b) => b.id))}
            disabled={selectable.length === 0}
            className="btn btn-ghost text-[11px]"
          >
            {allOn ? "Kosongkan semua" : `Pilih semua (${selectable.length})`}
          </button>
          {chosen.length > 0 && !allOn && (
            <button
              type="button"
              onClick={() => replaceChosen([])}
              className="btn btn-ghost text-[11px]"
            >
              Kosongkan
            </button>
          )}
        </div>
      </div>

      <div className="mt-1 rounded-lg border border-[var(--hairline)] p-2">
        {brands.length === 0 ? (
          <p className="px-1 py-2 text-xs text-[var(--text-muted)]">
            Belum ada brand. Tambahkan dulu di halaman Brand.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4">
            {brands.map((b) => (
              <label
                key={b.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[var(--wash)]"
              >
                <input
                  type="checkbox"
                  name="brand_id"
                  value={b.id}
                  checked={chosen.includes(b.id)}
                  onChange={() => toggle(b.id)}
                  className="h-4 w-4 shrink-0 accent-[var(--series-1)]"
                />
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ background: seriesVar(b.color_slot) }}
                />
                <span className="truncate" title={b.name}>
                  {b.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {multi && (
        <div className="mt-3 rounded-lg border border-[var(--hairline)] p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Porsi {chosen.length} brand
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => spreadEvenly()}
                disabled={!(amount > 0)}
                className="btn btn-ghost text-[11px]"
              >
                Bagi rata
              </button>
              {!pas && amount > 0 && Math.abs(diff) > 0 && last !== undefined && (
                <button
                  type="button"
                  onClick={() => absorb(last)}
                  className="btn btn-ghost text-[11px]"
                >
                  Limpahkan sisa ke {brands.find((b) => b.id === last)?.name}
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 grid gap-1.5 lg:grid-cols-2">
            {chosenBrands.map((b) => (
              <div key={b.id} className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ background: seriesVar(b.color_slot) }}
                  />
                  <span className="truncate" title={b.name}>
                    {b.name}
                  </span>
                </span>
                <input
                  type="number"
                  onWheel={blurOnWheel}
                  name={`share_${b.id}`}
                  step="0.000001"
                  min="0"
                  inputMode="decimal"
                  aria-label={`Porsi ${b.name} dalam USDT`}
                  placeholder="0.00"
                  className="field tnum w-28 shrink-0 py-1 text-xs"
                  value={share[b.id] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setShare((s) => ({ ...s, [b.id]: v }));
                    const n = Number(v.replace(",", ".")) || 0;
                    setPct((p) => ({
                      ...p,
                      [b.id]:
                        amount > 0 && n !== 0
                          ? String(Math.round(sharePct(n, amount) * 100) / 100)
                          : "",
                    }));
                  }}
                />
                <input
                  type="number"
                  onWheel={blurOnWheel}
                  step="0.01"
                  min="0"
                  max="100"
                  inputMode="decimal"
                  aria-label={`Porsi ${b.name} dalam persen`}
                  placeholder="0"
                  className="field tnum w-16 shrink-0 py-1 text-xs"
                  value={pct[b.id] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPct((p) => ({ ...p, [b.id]: v }));
                    const n = Number(v.replace(",", ".")) || 0;
                    const usdt = pctToShare(n, amount);
                    setShare((s) => ({
                      ...s,
                      [b.id]: usdt === 0 ? "" : String(usdt),
                    }));
                  }}
                />
                <span className="shrink-0 text-[10px] text-[var(--text-muted)]">%</span>
              </div>
            ))}
          </div>

          <p
            className="mt-2 text-xs"
            style={{
              color: pas ? "var(--text-secondary)" : "var(--status-critical)",
            }}
          >
            Total porsi <strong className="tnum">{fmtUsdt(total)}</strong> dari{" "}
            <strong className="tnum">{fmtUsdt(amount)}</strong>
            {amount <= 0 ? (
              <> — isi nominal transaksinya dulu.</>
            ) : pas ? (
              <> ✓ pas</>
            ) : (
              <>
                {" "}
                — {diff > 0 ? "kurang" : "lebih"}{" "}
                <strong className="tnum">{fmtUsdt(Math.abs(diff))}</strong>.
              </>
            )}
          </p>

          <p className="hint mt-1">
            Disimpan sebagai {chosen.length} transaksi terpisah, satu per brand.
            Biaya jaringan ikut dibagi mengikuti perbandingan porsinya; fee agency
            tetap persen yang sama di tiap pecahan.
          </p>
        </div>
      )}

      {!multi &&
        (required && chosen.length === 0 ? (
          // Checkbox tidak bisa memakai `required` untuk memaksa "minimal satu" —
          // atribut itu menuntut kotak itu sendiri dicentang. Jadi pemberitahuannya
          // ditulis di sini, sementara yang menolak simpan tetap servernya.
          <p className="mt-1.5 text-xs text-[var(--status-critical)]">
            Pengeluaran harus ditandai brand-nya — centang minimal satu.
          </p>
        ) : (
          <p className="hint mt-1.5">
            {required
              ? "Menentukan pemakaian USDT ini masuk ke brand mana. Centang beberapa brand kalau satu pembayaran dipakai bersama — panel akan membaginya otomatis."
              : "Top-up biasanya masuk kolam bersama — centang hanya kalau memang titipan brand tertentu."}
          </p>
        ))}
    </div>
  );
}
