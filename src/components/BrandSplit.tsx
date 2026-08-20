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

  function toggle(id: number) {
    const next = chosen.includes(id)
      ? chosen.filter((x) => x !== id)
      : [...chosen, id];
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

  /** Sisa yang belum terbagi dilimpahkan ke satu brand — jalan keluar tercepat dari persen yang tidak genap. */
  function absorb(id: number) {
    const now = Number((share[id] ?? "").replace(",", ".")) || 0;
    put(id, fromMicro(toMicro(now) + toMicro(diff)));
  }

  const last = chosen[chosen.length - 1];

  return (
    <div>
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
        </span>
      </span>

      <div className="mt-1 space-y-1.5 rounded-lg border border-[var(--hairline)] p-2">
        {brands.length === 0 && (
          <p className="px-1 py-2 text-xs text-[var(--text-muted)]">
            Belum ada brand. Tambahkan dulu di halaman Brand.
          </p>
        )}

        {brands.map((b) => {
          const on = chosen.includes(b.id);
          return (
            <div key={b.id} className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="brand_id"
                  value={b.id}
                  checked={on}
                  onChange={() => toggle(b.id)}
                  className="h-4 w-4 shrink-0 accent-[var(--series-1)]"
                />
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ background: seriesVar(b.color_slot) }}
                />
                <span className="truncate">{b.name}</span>
              </label>

              {on && multi && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    onWheel={blurOnWheel}
                    name={`share_${b.id}`}
                    step="0.000001"
                    min="0"
                    inputMode="decimal"
                    aria-label={`Porsi ${b.name} dalam USDT`}
                    placeholder="0.00"
                    className="field tnum w-28 py-1 text-xs"
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
                  <span className="text-[10px] text-[var(--text-muted)]">USDT</span>
                  <input
                    type="number"
                    onWheel={blurOnWheel}
                    step="0.01"
                    min="0"
                    max="100"
                    inputMode="decimal"
                    aria-label={`Porsi ${b.name} dalam persen`}
                    placeholder="0"
                    className="field tnum w-20 py-1 text-xs"
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
                  <span className="text-[10px] text-[var(--text-muted)]">%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {multi ? (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => spreadEvenly()}
              disabled={!(amount > 0)}
              className="btn btn-ghost text-[11px]"
            >
              Bagi rata {chosen.length} brand
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

          <p
            className="text-xs"
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

          <p className="hint">
            Disimpan sebagai {chosen.length} transaksi terpisah, satu per brand.
            Biaya jaringan ikut dibagi mengikuti perbandingan porsinya; fee agency
            tetap persen yang sama di tiap pecahan.
          </p>
        </div>
      ) : required && chosen.length === 0 ? (
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
      )}
    </div>
  );
}
