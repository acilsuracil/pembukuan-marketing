"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createTransaction,
  updateSplitGroup,
  updateTransaction,
  type ActionState,
} from "@/app/actions";
import { fmtIdr, fmtRate, fmtUsdt, todayISO } from "@/lib/format";
import { fromMicro, toMicro } from "@/lib/split";
import type { Brand, Category, TxRow } from "@/lib/types";
import BrandSplit from "./BrandSplit";
import BuktiInput from "./BuktiInput";
import DateField from "./DateField";
import { blurOnWheel } from "./ui";

const EMPTY: ActionState = { ok: false };

/**
 * Biaya jaringan bawaan untuk uang keluar. Sengaja teks, bukan angka, karena
 * kolomnya dikemudikan sebagai teks — "1.5" dan 1.5 tidak sama bagi input.
 */
const DEFAULT_FEE_OUT = "1.5";

function SubmitButton({ label, busy }: { label: string; busy?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending || busy}>
      {pending ? "Menyimpan…" : busy ? "Menyiapkan bukti…" : label}
    </button>
  );
}

export default function TxForm({
  categories,
  brands,
  inRates,
  initial,
  canEditDirectly,
  groupMembers,
}: {
  categories: Category[];
  brands: Brand[];
  /** Riwayat kurs pemasukan, terurut menaik — untuk pratinjau kurs warisan. */
  inRates: Array<{ date: string; rate: number }>;
  initial?: TxRow;
  /** Punya izin "edit"; kalau tidak, perubahan jadi pengajuan. */
  canEditDirectly: boolean;
  /**
   * Seluruh porsi dari pembayaran yang dibagi, terurut. Kehadirannya mengubah
   * formulir jadi mengubah **satu grup sekaligus**, bukan satu porsi.
   */
  groupMembers?: TxRow[];
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const needsRequest = editing && !canEditDirectly;

  /**
   * Ubah-grup hanya untuk pemegang izin ubah langsung. Payload pengajuan berisi
   * satu brand, jadi perubahan seluruh grup tidak bisa diwakili olehnya —
   * pemegang izin terbatas tetap mengajukan per porsi seperti sebelumnya.
   */
  const group =
    editing && canEditDirectly && groupMembers && groupMembers.length > 1
      ? groupMembers
      : null;

  const [state, formAction] = useActionState(
    group ? updateSplitGroup : editing ? updateTransaction : createTransaction,
    EMPTY,
  );

  /**
   * Saat mengubah grup, kolom Nominal berisi **total pembayarannya**, bukan
   * nominal satu porsi — porsinya diatur di blok brand di bawahnya.
   *
   * Dijumlahkan lewat satuan terkecil, bukan penjumlahan float biasa: 150,29 +
   * 253,21 bisa menghasilkan 403,49999999999994, dan angka itu akan muncul apa
   * adanya di kolom nominal begitu formulirnya dibuka.
   */
  const groupSum = group
    ? {
        amount: fromMicro(
          group.reduce((n, m) => n + toMicro(m.amount_usdt), 0),
        ),
        fee: fromMicro(group.reduce((n, m) => n + toMicro(m.fee_usdt), 0)),
      }
    : null;

  const [type, setType] = useState<"in" | "out">(initial?.type ?? "out");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [amount, setAmount] = useState(
    groupSum ? String(groupSum.amount) : String(initial?.amount_usdt ?? ""),
  );

  /**
   * Biaya jaringan pengeluaran hampir selalu sebesar ini, jadi kolomnya
   * terisi sendiri. Mengetik angka yang sama puluhan kali sehari adalah kerja
   * yang tidak perlu — dan yang diketik berulang justru paling mudah salah.
   */
  const [fee, setFee] = useState(
    // Saat mengubah transaksi lama, yang tampil harus nilai tersimpannya apa
    // adanya. Menaruh nilai bawaan di sini akan diam-diam menimpa biaya yang
    // sudah benar begitu formulirnya dibuka.
    groupSum
      ? String(groupSum.fee)
      : editing
        ? String(initial!.fee_usdt ?? "")
        : DEFAULT_FEE_OUT,
  );
  /**
   * Sudah disentuh orangnya? Selagi belum, kolomnya mengikuti jenis transaksi:
   * terisi untuk uang keluar, kosong untuk uang masuk. Begitu diketik — termasuk
   * dikosongkan — kolomnya berhenti berubah sendiri, jadi menghapus biaya lalu
   * berganti jenis tidak membuat angkanya muncul lagi.
   */
  const [feeTouched, setFeeTouched] = useState(false);
  const [feePct, setFeePct] = useState(
    initial?.fee_pct ? String(initial.fee_pct) : "",
  );
  const [rate, setRate] = useState(
    initial?.rate_idr != null ? String(initial.rate_idr) : "",
  );
  const [fileCount, setFileCount] = useState(0);
  const [buktiBusy, setBuktiBusy] = useState(false);

  useEffect(() => {
    if (!state.ok) return;
    // Saat mengubah, formulirnya menumpang di halaman detail: cukup lepas query
    // `?ubah` supaya formulir menutup dan halaman kembali ke tampilan bacanya.
    router.push(editing ? `/transaksi/${initial!.id}` : "/transaksi");
    router.refresh();
  }, [state.ok, router, editing, initial]);

  /** Kurs pemasukan terakhir pada atau sebelum tanggal yang dipilih. */
  const inheritedRate = useMemo(() => {
    let found: number | null = null;
    for (const r of inRates) {
      if (r.date <= date) found = r.rate;
      else break;
    }
    return found;
  }, [inRates, date]);

  /**
   * Biaya jaringan bawaan hanya berlaku untuk uang keluar.
   *
   * Pada uang masuk, biaya justru DIPOTONG dari nominal — mengisinya 1,5 diam-diam
   * akan mengurangi jumlah yang tercatat masuk, dan itu jenis kesalahan yang tidak
   * terlihat sampai saldonya tidak cocok berbulan-bulan kemudian.
   */
  function changeType(next: "in" | "out") {
    setType(next);
    if (!editing && !feeTouched) setFee(next === "out" ? DEFAULT_FEE_OUT : "");
  }

  const catOptions = categories.filter((c) => c.kind === type);
  const amountNum = Number(amount.replace(",", ".")) || 0;
  const feeNum = Number(fee.replace(",", ".")) || 0;
  const feePctNum = Number(feePct.replace(",", ".")) || 0;
  // Dibulatkan sama seperti tx_view, supaya pratinjau di sini tidak pernah
  // berbeda sesen pun dari angka yang nanti tersimpan.
  const feePctUsdt = Math.round((amountNum * feePctNum) / 100 * 100) / 100;
  const feeTotal = feeNum + feePctUsdt;
  const flow = type === "in" ? amountNum - feeTotal : amountNum + feeTotal;
  const manualRate = Number(rate.replace(/\./g, "").replace(",", ".")) || 0;
  const effRate =
    type === "in" ? manualRate : manualRate > 0 ? manualRate : inheritedRate;

  return (
    <form action={formAction} className="space-y-5">
      {group ? (
        <input type="hidden" name="split_group" value={group[0].split_group ?? ""} />
      ) : (
        editing && <input type="hidden" name="id" value={initial!.id} />
      )}

      {state.error && (
        <p
          role="alert"
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            color: "var(--status-critical)",
            background: "color-mix(in srgb, var(--status-critical) 10%, transparent)",
          }}
        >
          {state.error}
        </p>
      )}

      {needsRequest && (
        <p
          className="rounded-lg px-3 py-2 text-xs leading-relaxed"
          style={{
            color: "var(--text-secondary)",
            background: "color-mix(in srgb, var(--status-warning) 12%, transparent)",
          }}
        >
          <strong className="font-medium">Perubahan kamu akan diajukan.</strong>{" "}
          Akunmu tidak punya izin mengubah langsung, jadi ubahan ini tidak
          menimpa data sampai disetujui.
        </p>
      )}

      <fieldset>
        <legend className="label">Jenis transaksi</legend>
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          {(
            [
              {
                v: "in" as const,
                title: "Uang masuk",
                desc: "Top-up / pendapatan — isi kurs belinya",
                color: "var(--flow-in)",
              },
              {
                v: "out" as const,
                title: "Uang keluar",
                desc: "Pengeluaran — kurs ikut pemasukan terakhir",
                color: "var(--flow-out)",
              },
            ]
          ).map((o) => (
            <label
              key={o.v}
              className="cursor-pointer rounded-lg border p-3 transition"
              style={{
                borderColor: type === o.v ? o.color : "var(--hairline)",
                background:
                  type === o.v
                    ? `color-mix(in srgb, ${o.color} 8%, transparent)`
                    : "transparent",
              }}
            >
              <input
                type="radio"
                name="type"
                value={o.v}
                checked={type === o.v}
                onChange={() => changeType(o.v)}
                className="sr-only"
              />
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span aria-hidden style={{ color: o.color }}>
                  {o.v === "in" ? "↓" : "↑"}
                </span>
                {o.title}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                {o.desc}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="date">
            Tanggal
          </label>
          <DateField
            id="date"
            name="date"
            required
            width="w-full"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Pembagian ke beberapa brand hanya ditawarkan saat mencatat baru.
            Mengubah pecahan yang sudah ada berarti menyusun ulang seluruh
            grupnya — termasuk baris-baris yang tidak sedang dibuka — dan itu
            tidak bisa diwakili oleh satu pengajuan perubahan. Ubahan di sini
            berlaku untuk satu porsi saja; lihat catatan di halaman detail. */}
        {group ? null : editing ? (
          <div>
            <label className="label" htmlFor="brand_id">
              Brand{" "}
              {type === "out" ? (
                <span className="text-[var(--status-critical)]">*</span>
              ) : (
                <span className="font-normal text-[var(--text-muted)]">— opsional</span>
              )}
            </label>
            <select
              id="brand_id"
              name="brand_id"
              className="field"
              required={type === "out"}
              defaultValue={initial?.brand_id ?? ""}
            >
              <option value="">
                {type === "out" ? "— Pilih brand —" : "— Tanpa brand —"}
              </option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <p className="hint">
              {type === "out"
                ? "Menentukan pemakaian USDT ini masuk ke brand mana."
                : "Top-up biasanya masuk kolam bersama — isi hanya kalau memang titipan brand tertentu."}
            </p>
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="category_id">
            Kategori
          </label>
          <select
            id="category_id"
            name="category_id"
            className="field"
            defaultValue={initial?.category_id ?? ""}
            key={type}
          >
            <option value="">— Tanpa kategori —</option>
            {catOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="hint">
            Jenis pengeluarannya — iklan, server, gaji, dan seterusnya.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="amount_usdt">
            Nominal (USDT)
          </label>
          <input
            id="amount_usdt"
            name="amount_usdt"
            type="number"
            onWheel={blurOnWheel}
            step="0.000001"
            min="0"
            required
            inputMode="decimal"
            placeholder="0.00"
            className="field tnum"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {/* Diletakkan SETELAH Nominal, bukan sebelumnya. Porsi tiap brand
            dihitung dari nominal transaksinya, jadi menaruhnya lebih dulu
            berarti orang menemui kolom porsi yang terkunci 0,00 beserta
            peringatan merah sebelum ada apa pun untuk dibagi. */}
        {/* Blok yang sama dipakai saat mencatat baru maupun saat mengubah
            seluruh grup. Bedanya cuma porsi awalnya: yang sudah tercatat dimuat
            apa adanya, jadi membuka formulir tidak mengubah angka apa pun sampai
            benar-benar disunting. */}
        {(!editing || group) && (
          <div className="sm:col-span-2">
            <BrandSplit
              brands={brands}
              amount={amountNum}
              required={type === "out"}
              initialShares={group?.map((m) => ({
                brandId: m.brand_id as number,
                amount: m.amount_usdt,
              }))}
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="fee_usdt">
            Biaya jaringan (USDT){" "}
            <span className="font-normal text-[var(--text-muted)]">— opsional</span>
          </label>
          <input
            id="fee_usdt"
            name="fee_usdt"
            type="number"
            onWheel={blurOnWheel}
            step="0.000001"
            min="0"
            inputMode="decimal"
            placeholder="0"
            className="field tnum"
            value={fee}
            onChange={(e) => {
              setFee(e.target.value);
              setFeeTouched(true);
            }}
          />
          <p className="hint">
            {!editing && !feeTouched && type === "out" && (
              <>
                Terisi {DEFAULT_FEE_OUT} karena kebanyakan transfer segitu — hapus
                kalau transaksi ini memang tanpa biaya.{" "}
              </>
            )}
            {type === "in"
              ? "Dipotong dari nominal — yang dicatat masuk adalah nominal dikurangi fee."
              : "Ditambahkan ke nominal — total yang keluar dari dompet."}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="fee_pct">
            Fee agency (%){" "}
            <span className="font-normal text-[var(--text-muted)]">— opsional</span>
          </label>
          <input
            id="fee_pct"
            name="fee_pct"
            type="number"
            onWheel={blurOnWheel}
            step="0.01"
            min="0"
            max="100"
            inputMode="decimal"
            placeholder="0"
            className="field tnum"
            value={feePct}
            onChange={(e) => setFeePct(e.target.value)}
          />
          <p className="hint">
            Dihitung dari nominal, lalu diperlakukan seperti biaya jaringan.
            {feePctNum > 0 && amountNum > 0 && (
              <>
                {" "}
                {feePctNum}% × {fmtUsdt(amountNum)} ={" "}
                <strong>{fmtUsdt(feePctUsdt)}</strong>.
              </>
            )}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="rate_idr">
            {type === "in"
              ? "Kurs beli (Rp per 1 USDT)"
              : "Kurs (Rp per 1 USDT) — opsional, override"}
          </label>
          <input
            id="rate_idr"
            name="rate_idr"
            type="number"
            onWheel={blurOnWheel}
            step="1"
            min="0"
            required={type === "in"}
            inputMode="numeric"
            placeholder={
              type === "in"
                ? "16250"
                : inheritedRate
                  ? `${inheritedRate} (warisan)`
                  : "Belum ada pemasukan sebelum tanggal ini"
            }
            className="field tnum"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <p className="hint">
            {type === "in" ? (
              <>Nilai ini yang diwariskan ke pengeluaran-pengeluaran berikutnya.</>
            ) : inheritedRate ? (
              <>
                Kosongkan untuk memakai kurs pemasukan terakhir sebelum {date}:{" "}
                <strong>{fmtRate(inheritedRate)}</strong>.
              </>
            ) : (
              <>Belum ada pemasukan sebelum tanggal ini — isi kurs manual.</>
            )}
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">
            Keterangan
          </label>
          <input
            id="description"
            name="description"
            type="text"
            className="field"
            placeholder={
              type === "in" ? "Top-up dari Indodax" : "Iklan Meta minggu ke-3"
            }
            defaultValue={initial?.description ?? ""}
          />
        </div>

        <div>
          <label className="label" htmlFor="counterparty">
            Pihak terkait{" "}
            <span className="font-normal text-[var(--text-muted)]">— opsional</span>
          </label>
          <input
            id="counterparty"
            name="counterparty"
            type="text"
            className="field"
            placeholder={type === "in" ? "Nama exchange / klien" : "Nama penerima"}
            defaultValue={initial?.counterparty ?? ""}
          />
        </div>

        <div>
          <label className="label" htmlFor="tx_hash">
            Tx hash{" "}
            <span className="font-normal text-[var(--text-muted)]">— opsional</span>
          </label>
          <input
            id="tx_hash"
            name="tx_hash"
            type="text"
            className="field"
            placeholder="0x… / T…"
            defaultValue={initial?.tx_hash ?? ""}
          />
        </div>
      </div>

      {/* Hanya saat mencatat baru. Formulir ubah menumpang di halaman detail,
          yang panel buktinya sudah berdiri sendiri tepat di bawah ini —
          menampilkan dua tempat unggah sekaligus hanya membingungkan. */}
      {!editing && (
        <div>
          <label className="label" htmlFor="bukti">
            Bukti transfer{" "}
            <span className="font-normal text-[var(--text-muted)]">— opsional</span>
          </label>
          <BuktiInput id="bukti" onChange={setFileCount} onBusy={setBuktiBusy} />
          <p className="hint">
            JPG, PNG, WEBP, atau GIF. Maks 8 berkas per transaksi — gambar besar
            dikecilkan sendiri sebelum dikirim.
            {fileCount > 0 && (
              <>
                {" "}
                <strong>{fileCount} berkas dipilih.</strong>
              </>
            )}
          </p>
        </div>
      )}

      {needsRequest && (
        <div>
          <label className="label" htmlFor="reason">
            Alasan perubahan <span className="text-[var(--status-critical)]">*</span>
          </label>
          <input
            id="reason"
            name="reason"
            type="text"
            required
            minLength={4}
            className="field"
            placeholder="mis. salah input nominal, seharusnya 250 bukan 2500"
          />
          <p className="hint">Ditampilkan ke admin saat menimbang pengajuanmu.</p>
        </div>
      )}

      <div className="card p-4">
        <div className="text-xs font-medium text-[var(--text-secondary)]">
          Pratinjau pencatatan
        </div>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Perubahan saldo</dt>
            <dd className="tnum mt-0.5 font-medium">
              {amountNum <= 0
                ? "–"
                : `${type === "in" ? "+" : "−"}${flow.toLocaleString("id-ID", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  })} USDT`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Kurs dipakai</dt>
            <dd className="tnum mt-0.5 font-medium">
              {effRate ? fmtRate(effRate) : "–"}
              {type === "out" && manualRate <= 0 && inheritedRate && (
                <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">
                  (warisan)
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Nilai rupiah</dt>
            <dd className="tnum mt-0.5 font-medium">
              {effRate && amountNum > 0 ? fmtIdr(flow * effRate) : "–"}
            </dd>
          </div>
        </dl>

        {/* Rincian ditulis terbuka begitu ada fee — angka arus kas yang sudah
            digabung sulit dipercaya kalau asal-usulnya tidak kelihatan. */}
        {amountNum > 0 && feeTotal > 0 && (
          <p className="hint mt-3">
            {fmtUsdt(amountNum)}
            {feePctNum > 0 && (
              <>
                {" "}
                {type === "in" ? "−" : "+"} {fmtUsdt(feePctUsdt)} fee agency (
                {feePctNum}%)
              </>
            )}
            {feeNum > 0 && (
              <>
                {" "}
                {type === "in" ? "−" : "+"} {fmtUsdt(feeNum)} biaya jaringan
              </>
            )}{" "}
            = <strong>{fmtUsdt(flow)}</strong>{" "}
            {type === "in" ? "masuk ke dompet" : "keluar dari dompet"}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <SubmitButton
          busy={buktiBusy}
          label={
            needsRequest
              ? "Ajukan perubahan"
              : editing
                ? "Simpan perubahan"
                : "Simpan transaksi"
          }
        />
        <Link
          href={editing ? `/transaksi/${initial!.id}` : "/transaksi"}
          scroll={!editing}
          className="btn btn-ghost"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}
