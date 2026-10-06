"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  cancelPembayaran,
  deletePengajuan,
  putuskanPengajuan,
  setPengajuanStatus,
  type ActionState,
} from "@/app/actions";
import type { Tahap } from "@/lib/persetujuan";
import type { PengajuanStatus, Tujuan } from "@/lib/types";
import BuktiInput from "./BuktiInput";
import MoneyField from "./MoneyField";
import { Alert, FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

export default function PengajuanActions({
  id,
  status,
  tujuan,
  nominal,
  dompetName,
  today,
  canEdit,
  canMarkPaid,
  canCancelPay,
  tahap,
  canLeader,
  tolakBayar,
}: {
  id: number;
  status: PengajuanStatus;
  tahap: Tahap;
  /** Boleh memutuskan tahap leader (leader divisinya, atau owner). */
  canLeader: boolean;
  /** null = boleh memutuskan tahap pembayaran; selain itu alasan kenapa tidak. */
  tolakBayar: string | null;
  tujuan: Tujuan;
  nominal: number;
  dompetName: string | null;
  today: string;
  canEdit: boolean;
  canMarkPaid: boolean;
  /** Boleh membatalkan pembayaran: Finance, atau owner untuk membetulkan salah catat. */
  canCancelPay: boolean;
}) {
  const router = useRouter();
  const [statusState, doStatus] = useActionState(setPengajuanStatus, EMPTY);
  const [putusState, doPutus] = useActionState(putuskanPengajuan, EMPTY);
  /** Bukti berupa link — boleh lebih dari satu, boleh tanpa gambar. */
  const [buktiLink, setBuktiLink] = useState<string[]>([""]);
  const adaLink = buktiLink.some((l) => l.trim() !== "");
  const [cancelState, doCancel] = useActionState(cancelPembayaran, EMPTY);
  const [delState, doDelete] = useActionState(deletePengajuan, EMPTY);

  /** Jumlah bukti yang sudah terpasang, dan status pengecilan gambarnya. */
  const [bukti, setBukti] = useState(0);
  const [siapkanBukti, setSiapkanBukti] = useState(false);

  useEffect(() => {
    if (delState.ok) router.push("/pengajuan");
  }, [delState.ok, router]);

  // Finance hanya membayar yang sudah lolos leader dan penyetuju pembayaran.
  const showPay = canMarkPaid && tahap === "siap";
  const putus = tahap === "leader" ? (canLeader ? "leader" : null) : tahap === "bayar" && tolakBayar === null ? "bayar" : null;

  return (
    <div className="space-y-4">
      <Alert state={statusState} />
      <Alert state={cancelState} />
      <Alert state={delState} />

      <Alert state={putusState} />

      {status === "draft" && (
        <form action={doStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="diajukan" />
          <FormButton className="btn btn-primary w-full">Ajukan ke leader</FormButton>
        </form>
      )}

      {putus && (
        <div className="space-y-2 rounded-lg border border-[var(--hairline)] p-3">
          <p className="text-sm font-medium">
            {putus === "leader" ? "Keputusan leader" : "Persetujuan pembayaran"}
          </p>
          <form action={doPutus}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="tahap" value={putus} />
            <input type="hidden" name="setuju" value="1" />
            <FormButton className="btn btn-primary w-full">
              {putus === "leader" ? "✅ Setujui & kirim ke pembayaran" : "✅ Setujui pembayaran"}
            </FormButton>
          </form>
          <form action={doPutus} className="space-y-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="tahap" value={putus} />
            <input type="hidden" name="setuju" value="0" />
            <input
              name="alasan"
              type="text"
              required
              minLength={3}
              className="field"
              placeholder="Alasan menolak — wajib, dibaca staff"
              aria-label="Alasan menolak"
            />
            <FormButton className="btn btn-danger w-full" confirm="Tolak pengajuan ini?">
              ❌ Tolak
            </FormButton>
          </form>
        </div>
      )}

      {tahap === "bayar" && tolakBayar && (
        <p className="text-xs text-[var(--text-muted)]">{tolakBayar}</p>
      )}

      {showPay && (
        <form
          action={doStatus}
          className="space-y-3 rounded-lg border border-[var(--hairline)] p-3"
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="dibayar" />
          <p className="text-sm font-medium">Pembayaran</p>
          <p className="text-xs text-[var(--text-muted)]">
            {tujuan === "dompet"
              ? `Akan dicatat sebagai top-up ke ${dompetName ?? "dompet"} — menambah saldo, belum jadi biaya.`
              : "Akan dicatat sebagai pengeluaran — langsung masuk Total Biaya Marketing."}
          </p>

          <div>
            <label className="label" htmlFor="pay-tanggal">
              Tanggal cair
            </label>
            <input
              id="pay-tanggal"
              name="tanggal_bayar"
              type="date"
              required
              className="field tnum"
              defaultValue={today}
            />
          </div>

          <MoneyField
            name="nominal_cair"
            label="Nominal yang benar-benar cair"
            hint={`Kosongkan kalau cair penuh sesuai pengajuan.`}
            placeholder={String(nominal)}
          />

          <div>
            <label className="label" htmlFor="pay-ref">
              No. referensi transfer
            </label>
            <input
              id="pay-ref"
              name="no_ref"
              type="text"
              className="field"
              placeholder="opsional — memudahkan cocokkan mutasi bank"
            />
          </div>

          <div>
            <span className="label">Bukti berupa link</span>
            <div className="space-y-2">
              {buktiLink.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    name="bukti_link"
                    type="text"
                    inputMode="url"
                    className="field"
                    placeholder="opsional — mis. link Google Drive"
                    aria-label={`Link bukti ${i + 1}`}
                    value={l}
                    onChange={(e) =>
                      setBuktiLink((ls) => ls.map((x, j) => (j === i ? e.target.value : x)))
                    }
                  />
                  {buktiLink.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost px-2.5"
                      aria-label={`Buang link bukti ${i + 1}`}
                      onClick={() => setBuktiLink((ls) => ls.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost mt-1.5 px-2.5 py-1 text-xs"
              onClick={() => setBuktiLink((ls) => [...ls, ""])}
            >
              + Tambah link
            </button>
          </div>

          <div>
            <label className="label" htmlFor="pay-bukti">
              Bukti transfer (gambar){" "}
              <span className="text-[var(--text-muted)]">— gambar atau link, minimal satu</span>
            </label>
            <BuktiInput id="pay-bukti" onChange={setBukti} onBusy={setSiapkanBukti} />
            <p className="hint">
              Tangkapan layar mutasi bisa langsung ditempel Ctrl/⌘ + V — tidak
              perlu disimpan jadi berkas dulu.
            </p>
          </div>

          {/*
            Tombolnya mati selagi gambar dikecilkan: berkasnya belum masuk ke
            input file, jadi formulir yang terkirim di sela itu akan berangkat
            tanpa bukti dan ditolak server — kelihatannya seperti bug.
          */}
          <FormButton
            className="btn btn-primary w-full"
            disabled={(bukti === 0 && !adaLink) || siapkanBukti}
            pendingLabel="Mencatat…"
          >
            {siapkanBukti
              ? "Menyiapkan bukti…"
              : bukti === 0 && !adaLink
                ? "Lampirkan bukti dulu"
                : "Catat pembayaran"}
          </FormButton>
        </form>
      )}

      {status === "dibayar" && canCancelPay && (
        <form action={doCancel}>
          <input type="hidden" name="id" value={id} />
          <FormButton
            className="btn btn-danger w-full"
            confirm="Batalkan pembayaran? Baris buku besar yang lahir dari pengajuan ini akan dihapus."
          >
            Batalkan pembayaran
          </FormButton>
        </form>
      )}

      {canEdit && status !== "dibayar" && (
        <form action={doDelete} className="border-t border-[var(--hairline)] pt-3">
          <input type="hidden" name="id" value={id} />
          <FormButton
            className="btn btn-danger px-2.5 py-1 text-xs"
            confirm="Hapus pengajuan ini?"
          >
            Hapus pengajuan
          </FormButton>
        </form>
      )}
    </div>
  );
}
