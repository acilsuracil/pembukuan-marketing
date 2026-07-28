"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createTransaction,
  updateTransaction,
  type ActionState,
} from "@/app/actions";
import { fmtIdr, fmtRate, fmtUsdt, todayISO } from "@/lib/format";
import type { Brand, Category, TxRow } from "@/lib/types";
import BuktiInput from "./BuktiInput";

const EMPTY: ActionState = { ok: false };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Menyimpan…" : label}
    </button>
  );
}

export default function TxForm({
  categories,
  brands,
  inRates,
  initial,
  canEditDirectly,
}: {
  categories: Category[];
  brands: Brand[];
  /** Riwayat kurs pemasukan, terurut menaik — untuk pratinjau kurs warisan. */
  inRates: Array<{ date: string; rate: number }>;
  initial?: TxRow;
  /** Punya izin "edit"; kalau tidak, perubahan jadi pengajuan. */
  canEditDirectly: boolean;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const needsRequest = editing && !canEditDirectly;

  const [state, formAction] = useActionState(
    editing ? updateTransaction : createTransaction,
    EMPTY,
  );

  const [type, setType] = useState<"in" | "out">(initial?.type ?? "out");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [amount, setAmount] = useState(String(initial?.amount_usdt ?? ""));
  const [fee, setFee] = useState(String(initial?.fee_usdt ?? ""));
  const [feePct, setFeePct] = useState(
    initial?.fee_pct ? String(initial.fee_pct) : "",
  );
  const [rate, setRate] = useState(
    initial?.rate_idr != null ? String(initial.rate_idr) : "",
  );
  const [fileCount, setFileCount] = useState(0);

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
      {editing && <input type="hidden" name="id" value={initial!.id} />}

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
                onChange={() => setType(o.v)}
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
          <input
            id="date"
            name="date"
            type="date"
            required
            className="field"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

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

        <div>
          <label className="label" htmlFor="fee_usdt">
            Biaya jaringan (USDT){" "}
            <span className="font-normal text-[var(--text-muted)]">— opsional</span>
          </label>
          <input
            id="fee_usdt"
            name="fee_usdt"
            type="number"
            step="0.000001"
            min="0"
            inputMode="decimal"
            placeholder="0"
            className="field tnum"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
          <p className="hint">
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
          <BuktiInput id="bukti" onChange={setFileCount} />
          <p className="hint">
            JPG, PNG, WEBP, atau GIF. Maks 5 MB per berkas, 8 berkas per transaksi.
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
