"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  cancelPembayaran,
  deletePengajuan,
  setPengajuanStatus,
  type ActionState,
} from "@/app/actions";
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
}: {
  id: number;
  status: PengajuanStatus;
  tujuan: Tujuan;
  nominal: number;
  dompetName: string | null;
  today: string;
  canEdit: boolean;
  canMarkPaid: boolean;
}) {
  const router = useRouter();
  const [statusState, doStatus] = useActionState(setPengajuanStatus, EMPTY);
  const [cancelState, doCancel] = useActionState(cancelPembayaran, EMPTY);
  const [delState, doDelete] = useActionState(deletePengajuan, EMPTY);

  /** Jumlah bukti yang sudah terpasang, dan status pengecilan gambarnya. */
  const [bukti, setBukti] = useState(0);
  const [siapkanBukti, setSiapkanBukti] = useState(false);

  useEffect(() => {
    if (delState.ok) router.push("/pengajuan");
  }, [delState.ok, router]);

  const showPay = canMarkPaid && (status === "diajukan" || status === "disetujui");

  return (
    <div className="space-y-4">
      <Alert state={statusState} />
      <Alert state={cancelState} />
      <Alert state={delState} />

      {canEdit && status === "draft" && (
        <form action={doStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="diajukan" />
          <FormButton className="btn btn-primary w-full">
            Tandai sudah dikirim ke finance
          </FormButton>
        </form>
      )}

      {canEdit && status === "diajukan" && (
        <div className="flex gap-2">
          <form action={doStatus} className="flex-1">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value="disetujui" />
            <FormButton className="btn btn-ghost w-full">Disetujui finance</FormButton>
          </form>
          <form action={doStatus} className="flex-1">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value="ditolak" />
            <FormButton
              className="btn btn-danger w-full"
              confirm="Tandai pengajuan ini ditolak finance?"
            >
              Ditolak
            </FormButton>
          </form>
        </div>
      )}

      {showPay && (
        <form
          action={doStatus}
          className="space-y-3 rounded-lg border border-[var(--hairline)] p-3"
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="dibayar" />
          <p className="text-sm font-medium">Dana sudah cair</p>
          <p className="text-xs text-[var(--text-muted)]">
            {tujuan === "dompet"
              ? `Akan dicatat sebagai top-up ke ${dompetName ?? "dompet"} — menambah saldo, belum jadi biaya.`
              : "Akan dicatat sebagai belanja — langsung masuk Total Biaya Marketing."}
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
            <label className="label" htmlFor="pay-bukti">
              Bukti transfer{" "}
              <span style={{ color: "var(--status-critical)" }}>wajib</span>
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
            disabled={bukti === 0 || siapkanBukti}
            pendingLabel="Mencatat…"
          >
            {siapkanBukti
              ? "Menyiapkan bukti…"
              : bukti === 0
                ? "Lampirkan bukti dulu"
                : `Catat pembayaran + ${bukti} bukti`}
          </FormButton>
        </form>
      )}

      {status === "dibayar" && canMarkPaid && (
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
