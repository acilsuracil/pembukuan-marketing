"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  initialShares,
}: {
  brands: Brand[];
  /** Nominal transaksi yang sedang diisi — dasar seluruh porsi. */
  amount: number;
  /** Pengeluaran wajib punya brand; pemasukan tidak. */
  required: boolean;
  initialBrandId?: number | null;
  /**
   * Porsi yang sudah tercatat, dipakai saat mengubah pembayaran yang dibagi.
   *
   * Kehadirannya langsung menyalakan mode manual: angka-angka ini nilai yang
   * benar-benar tersimpan, jadi tidak boleh ditimpa pembagian rata hanya karena
   * formulirnya dibuka.
   */
  initialShares?: Array<{ brandId: number; amount: number }>;
}) {
  const seeded = initialShares && initialShares.length > 0 ? initialShares : null;

  const [chosen, setChosen] = useState<number[]>(
    seeded ? seeded.map((s) => s.brandId) : initialBrandId ? [initialBrandId] : [],
  );
  /** Porsi per brand dalam USDT, sebagai teks — kolom yang sedang diketik. */
  const [share, setShare] = useState<Record<number, string>>(() =>
    Object.fromEntries((seeded ?? []).map((s) => [s.brandId, String(s.amount)])),
  );
  /** Kolom persen ditulis terpisah supaya "33,33" tidak dibulatkan saat diketik. */
  const [pct, setPct] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      (seeded ?? []).map((s) => [
        s.brandId,
        amount > 0 && s.amount !== 0
          ? String(Math.round(sharePct(s.amount, amount) * 100) / 100)
          : "",
      ]),
    ),
  );
  /**
   * Sudah ada porsi yang diketik tangan?
   *
   * Selagi masih `false`, porsinya dibagi rata dan mengikuti nominal secara
   * langsung. Begitu satu kolom diketik, nominal berhenti menimpa susunannya —
   * pembagian yang sudah disusun orang tidak boleh hilang hanya karena
   * nominalnya dikoreksi sedikit.
   */
  const [manual, setManual] = useState(Boolean(seeded));
  /** Daftar brand disembunyikan sampai diminta — 17 brand yang terbentang terus memakan layar. */
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const multi = chosen.length > 1;

  /**
   * Brand arsip tidak ikut "pilih semua". Halaman catat baru memang hanya
   * mengirim brand aktif, tapi mengandalkan itu berarti tombol ini langsung jadi
   * salah begitu ada yang meneruskan daftar lengkap ke komponen ini.
   */
  const selectable = useMemo(() => brands.filter((b) => !b.archived), [brands]);

  /**
   * Pembagian rata adalah nilai **turunan**, bukan nilai tersimpan.
   *
   * Sebelumnya porsi rata dituliskan sekali ke state saat brand dicentang. Begitu
   * nominalnya diubah, angkanya tertinggal di pembagian nominal yang lama —
   * 17 × 14,882353 masih menjumlah 253 padahal nominalnya sudah 352 — dan
   * satu-satunya jalan keluar adalah menekan "Bagi rata" lagi.
   *
   * Dihitung ulang setiap render, jadi porsinya mengikuti nominal secara langsung
   * sambil diketik. State `share`/`pct` baru dipakai begitu ada yang diketik
   * tangan, dan sejak itu nominal tidak lagi menimpa susunannya.
   */
  const even = useMemo(
    () =>
      amount > 0 && chosen.length > 0
        ? evenShares(amount, chosen.length)
        : chosen.map(() => 0),
    [amount, chosen],
  );

  /**
   * Hasil bagi rata dikunci ke id brand, bukan ke nomor urut.
   *
   * `even` terurut mengikuti urutan pencentangan, sedangkan baris porsi terurut
   * mengikuti daftar brand. Mengindeks keduanya dengan nomor urut yang sama
   * berarti angka bisa mendarat di brand yang salah — pada pembagian rata
   * selisihnya cuma sepersejuta sehingga tidak akan terlihat, tapi begitu
   * angkanya dipindah ke state untuk diketik, yang tersimpan sudah tertukar.
   */
  const evenBy = useMemo(() => {
    const m = new Map<number, number>();
    chosen.forEach((id, i) => m.set(id, even[i] ?? 0));
    return m;
  }, [chosen, even]);

  const asPct = (usdt: number) =>
    amount > 0 && usdt !== 0
      ? String(Math.round(sharePct(usdt, amount) * 100) / 100)
      : "";

  /** Isi kolom yang tampil: hasil ketikan kalau sudah manual, kalau belum hasil bagi rata. */
  const shareText = (id: number) => {
    if (manual) return share[id] ?? "";
    const v = evenBy.get(id) ?? 0;
    return v > 0 ? String(v) : "";
  };
  const pctText = (id: number) =>
    manual ? (pct[id] ?? "") : asPct(evenBy.get(id) ?? 0);

  const shares = useMemo(
    () =>
      chosen.map((id) =>
        manual
          ? Number((share[id] ?? "").replace(",", ".")) || 0
          : (evenBy.get(id) ?? 0),
      ),
    [chosen, share, manual, evenBy],
  );
  const total = useMemo(() => shares.reduce((a, b) => a + b, 0), [shares]);
  const diff = fromMicro(toMicro(amount) - toMicro(total));

  /**
   * Brand yang dicentang tapi porsinya masih nol.
   *
   * Diperiksa terpisah dari jumlahnya, karena jumlah yang pas belum berarti sah:
   * 10/40/50% ke tiga brand sudah menghabiskan nominalnya, tapi kalau ada enam
   * brand dicentang maka tiga sisanya berporsi nol. Tanpa pemeriksaan ini
   * formulirnya menulis "✓ pas" untuk keadaan yang pasti ditolak server.
   */
  const kosong = useMemo(
    () => chosen.filter((id, i) => !(shares[i] > 0)),
    [chosen, shares],
  );

  const pas = multi && amount > 0 && sameUsdt(total, amount) && kosong.length === 0;

  /**
   * Total porsi sebagai persen, untuk dilaporkan dalam satuan yang sama dengan
   * yang diketik. Selisih yang hanya disebut dalam USDT ("lebih 500 USDT")
   * menuntut orang menghitung sendiri berapa persen kelebihannya, padahal yang
   * salah ketik justru kolom persennya.
   */
  const totalPct = sharePct(total, amount);
  const lebih = amount > 0 && toMicro(total) > toMicro(amount);

  /**
   * Angka rata yang sedang tampil dipindahkan ke state sebelum ketikan pertama
   * diterapkan. Tanpa ini, mengetik satu kolom akan mengosongkan semua kolom lain
   * — karena `share` masih kosong dan tampilannya berhenti memakai nilai rata.
   */
  function seed(): { s: Record<number, string>; p: Record<number, string> } {
    if (manual) return { s: { ...share }, p: { ...pct } };
    const s: Record<number, string> = {};
    const p: Record<number, string> = {};
    for (const id of chosen) {
      const v = evenBy.get(id) ?? 0;
      s[id] = v > 0 ? String(v) : "";
      p[id] = asPct(v);
    }
    return { s, p };
  }

  function editShare(id: number, v: string) {
    const { s, p } = seed();
    const n = Number(v.replace(",", ".")) || 0;
    setShare({ ...s, [id]: v });
    setPct({ ...p, [id]: asPct(n) });
    setManual(true);
  }

  function editPct(id: number, v: string) {
    const { s, p } = seed();
    const usdt = pctToShare(Number(v.replace(",", ".")) || 0, amount);
    setPct({ ...p, [id]: v });
    setShare({ ...s, [id]: usdt === 0 ? "" : String(usdt) });
    setManual(true);
  }

  /** Kembali ke pembagian rata yang mengikuti nominal. */
  function backToEven() {
    setManual(false);
    setShare({});
    setPct({});
  }

  function replaceChosen(next: number[]) {
    setChosen(next);
    // Turun ke satu brand berarti tidak ada porsi lagi yang perlu diatur, jadi
    // susunan manualnya dibuang — kalau tidak, angka lama itu akan muncul kembali
    // begitu brand kedua dicentang lagi.
    if (next.length <= 1) backToEven();
  }

  function toggle(id: number) {
    replaceChosen(
      chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id],
    );
  }

  /** Sisa yang belum terbagi dilimpahkan ke satu brand — jalan keluar tercepat dari persen yang tidak genap. */
  function absorb(id: number) {
    const i = chosen.indexOf(id);
    const now = shares[i] ?? 0;
    editShare(id, String(fromMicro(toMicro(now) + toMicro(diff))));
  }

  const allOn = selectable.length > 0 && chosen.length === selectable.length;
  const last = chosen[chosen.length - 1];
  /** Baris porsi mengikuti urutan daftar, bukan urutan pencentangan — supaya tidak berpindah-pindah. */
  const chosenBrands = brands.filter((b) => chosen.includes(b.id));

  /** Ringkasan di tombol: nama-namanya, dipangkas kalau kebanyakan. */
  const SHOWN = 3;
  const summary =
    chosen.length === 0
      ? required
        ? "— Pilih brand —"
        : "— Tanpa brand —"
      : chosenBrands
          .slice(0, SHOWN)
          .map((b) => b.name)
          .join(", ") +
        (chosen.length > SHOWN ? ` +${chosen.length - SHOWN} lagi` : "");

  // Ditutup saat mengklik di luar atau menekan Esc. Tanpa ini panelnya menutupi
  // kolom-kolom di bawahnya dan tidak ada cara jelas untuk membereskannya.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
          {chosen.length > 0 && ` · ${chosen.length} dipilih`}
        </span>
      </span>

      <div ref={boxRef} className="relative mt-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="field flex items-center justify-between gap-2 text-left"
        >
          <span
            className="truncate"
            style={chosen.length === 0 ? { color: "var(--text-muted)" } : undefined}
          >
            {summary}
          </span>
          <span aria-hidden className="shrink-0 text-[10px] text-[var(--text-muted)]">
            ▾
          </span>
        </button>

        {/*
          Panelnya disembunyikan lewat `hidden`, bukan dilepas dari DOM.
          Checkbox inilah yang menyusun `brand_id` di FormData; melepasnya saat
          panel tertutup berarti formulir terkirim tanpa brand sama sekali —
          padahal di layar pilihannya masih tertulis. Input ber-`display:none`
          tetap ikut terkirim, jadi menyembunyikannya aman.
        */}
        <div
          role="group"
          aria-label="Pilih brand"
          className={
            open
              ? "absolute left-0 right-0 z-20 mt-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-2 shadow-lg"
              : "hidden"
          }
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-[var(--hairline)] pb-1.5">
            <button
              type="button"
              onClick={() => replaceChosen(allOn ? [] : selectable.map((b) => b.id))}
              disabled={selectable.length === 0}
              className="btn btn-ghost text-[11px]"
            >
              {allOn ? "Kosongkan semua" : `Pilih semua (${selectable.length})`}
            </button>
            <div className="flex items-center gap-1">
              {chosen.length > 0 && !allOn && (
                <button
                  type="button"
                  onClick={() => replaceChosen([])}
                  className="btn btn-ghost text-[11px]"
                >
                  Kosongkan
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-ghost text-[11px]"
              >
                Selesai
              </button>
            </div>
          </div>

          {brands.length === 0 ? (
            <p className="px-1 py-2 text-xs text-[var(--text-muted)]">
              Belum ada brand. Tambahkan dulu di halaman Brand.
            </p>
          ) : (
            <div className="grid max-h-72 grid-cols-2 gap-x-4 gap-y-0.5 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
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
      </div>

      {multi && (
        <div className="mt-3 rounded-lg border border-[var(--hairline)] p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Porsi {chosen.length} brand
              <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                {manual
                  ? "· diatur manual"
                  : "· dibagi rata, ikut berubah saat nominal diubah"}
              </span>
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={backToEven}
                disabled={!manual}
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

          {/* Lebar kolom datang dari grid, bukan dari kelas lebar di input-nya.
              `.field` di globals.css menetapkan `width: 100%` sebagai CSS tanpa
              layer, dan di Tailwind v4 CSS tanpa layer selalu menang atas
              `@layer utilities` — jadi `w-28`/`w-16` diabaikan tanpa suara,
              kedua input melebar penuh, dan nama brand-nya terdorong jadi nol
              piksel. Yang tersisa di layar cuma titik warna tanpa nama, dan
              tidak ada cara tahu baris mana milik brand mana.

              Satu brand per baris, bukan dua kolom: kolom angka yang berdampingan
              membuat nama brand-nya terlalu sempit untuk dibaca begitu namanya
              agak panjang. */}
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_7rem_5.5rem] items-center gap-x-2 gap-y-1">
            <div className="text-[10px] text-[var(--text-muted)]">Brand</div>
            <div className="text-[10px] text-[var(--text-muted)]">Porsi (USDT)</div>
            <div className="text-[10px] text-[var(--text-muted)]">
              Persen dari nominal
            </div>

            {chosenBrands.map((b) => (
              <Fragment key={b.id}>
                <span className="flex min-w-0 items-center gap-1.5 text-sm">
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
                  className="field tnum py-1 text-xs"
                  value={shareText(b.id)}
                  onChange={(e) => editShare(b.id, e.target.value)}
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    onWheel={blurOnWheel}
                    step="0.01"
                    min="0"
                    max="100"
                    inputMode="decimal"
                    aria-label={`Porsi ${b.name} dalam persen dari nominal`}
                    placeholder="0"
                    className="field tnum py-1 text-xs"
                    value={pctText(b.id)}
                    onChange={(e) => editPct(b.id, e.target.value)}
                  />
                  <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                    %
                  </span>
                </div>
              </Fragment>
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
              <> ✓ pas — 100%</>
            ) : Math.abs(diff) > 0 ? (
              <>
                {" "}
                — {diff > 0 ? "kurang" : "lebih"}{" "}
                <strong className="tnum">{fmtUsdt(Math.abs(diff))}</strong>, total{" "}
                <strong className="tnum">
                  {totalPct.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%
                </strong>{" "}
                dari 100%.
              </>
            ) : (
              <> — jumlahnya pas, tapi belum semua brand dapat porsi.</>
            )}
          </p>

          {/* Kelebihan diberitahukan dalam persen, bukan hanya USDT: yang salah
              ketik biasanya kolom persennya, dan "seharusnya tepat 100%" adalah
              satu-satunya kalimat yang langsung menunjukkan apa yang keliru. */}
          {lebih && (
            <p
              role="alert"
              className="mt-1.5 rounded-lg px-2.5 py-2 text-xs"
              style={{
                color: "var(--status-critical)",
                background:
                  "color-mix(in srgb, var(--status-critical) 10%, transparent)",
              }}
            >
              <strong>
                Porsinya melebihi nominal — total{" "}
                {totalPct.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%,
                seharusnya tepat 100%.
              </strong>{" "}
              Kelebihannya {fmtUsdt(Math.abs(diff))}. Kurangi salah satu porsinya
              sampai totalnya {fmtUsdt(amount)}, atau tekan Bagi rata untuk
              menyusun ulang dari awal.
            </p>
          )}

          {/* Jumlah yang pas dengan sebagian brand berporsi nol adalah keadaan
              yang paling mudah dibuat tanpa sadar: persen habis di beberapa brand
              pertama, dan sisanya tertinggal. Disebutkan namanya, bukan cuma
              jumlahnya, supaya tidak perlu diperiksa satu-satu. */}
          {amount > 0 && kosong.length > 0 && (
            <p className="mt-1 text-xs text-[var(--status-critical)]">
              {kosong.length} brand belum dapat porsi:{" "}
              <strong>
                {kosong.map((id) => brands.find((b) => b.id === id)?.name).join(", ")}
              </strong>
              . Beri porsinya, buang centangnya, atau tekan Bagi rata — transaksi
              berporsi 0 akan ditolak saat disimpan.
            </p>
          )}

          <p className="hint mt-1">
            Persen di sini adalah <strong>bagian brand itu dari nominal transaksi</strong>{" "}
            — 10% dari {fmtUsdt(amount > 0 ? amount : 0)} berarti{" "}
            {fmtUsdt(amount > 0 ? amount / 10 : 0)}. Jumlah seluruh persennya harus
            100%. Bukan fee, dan tidak ada kaitannya dengan Fee agency (%) di bawah.
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
