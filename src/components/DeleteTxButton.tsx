"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { deleteTransaction, type ActionState } from "@/app/actions";
import { Alert, FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

export default function DeleteTxButton({
  txId,
  canDeleteDirectly,
  disabled,
  splitCount = 1,
}: {
  txId: number;
  /** Punya izin "delete"; kalau tidak, tombolnya jadi pengajuan. */
  canDeleteDirectly: boolean;
  disabled?: boolean;
  /** Jumlah porsi dalam grupnya — >1 berarti penghapusan mengenai semuanya. */
  splitCount?: number;
}) {
  const router = useRouter();
  const [state, action] = useActionState(deleteTransaction, EMPTY);
  const isStaff = !canDeleteDirectly;
  const [wantOpen, setWantOpen] = useState(false);
  // Panel ditutup dengan menurunkannya dari hasil aksi, bukan lewat setState
  // di dalam effect — supaya tidak memicu render bertingkat.
  const open = wantOpen && !state.ok;

  useEffect(() => {
    // Hanya jalur pengajuan yang ditangani di sini: transaksinya masih ada, dan
    // halaman perlu memperlihatkan bahwa sekarang ada pengajuan yang menunggu.
    //
    // Penghapusan sungguhan tidak diurus dari sini. `deleteTransaction`
    // mengembalikan redirect ke daftar transaksi, jadi navigasinya sudah terjadi
    // bersama respons aksinya — dan itu memang harus di server: mendorongnya
    // dari klien berarti halaman detail yang barisnya sudah hilang sempat
    // di-render lebih dulu, dan yang muncul 404.
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (disabled) {
    return (
      <button type="button" disabled className="btn btn-ghost text-xs" title="Periode terkunci">
        🔒 Terkunci
      </button>
    );
  }

  if (!isStaff) {
    return (
      <form action={action}>
        <input type="hidden" name="id" value={txId} />
        <FormButton
          className="btn btn-danger text-xs"
          confirm={
            splitCount > 1
              ? `Ini satu pembayaran yang dibagi ke ${splitCount} brand. ` +
                `Seluruh ${splitCount} porsinya akan terhapus permanen, bukan hanya yang ini. ` +
                `Bukti terlampir ikut terhapus. Lanjutkan?`
              : "Hapus transaksi ini permanen? Bukti terlampir ikut terhapus."
          }
        >
          Hapus
        </FormButton>
        {state.error && <Alert state={state} className="mt-2" />}
      </form>
    );
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setWantOpen(true)}
          className="btn btn-danger text-xs"
        >
          Ajukan hapus
        </button>
        {state.message && <Alert state={state} className="mt-2" />}
      </div>
    );
  }

  return (
    <form action={action} className="w-full max-w-sm space-y-2">
      <input type="hidden" name="id" value={txId} />
      {state.error && <Alert state={state} />}
      <label className="label" htmlFor={`reason-${txId}`}>
        Alasan penghapusan
      </label>
      <input
        id={`reason-${txId}`}
        name="reason"
        type="text"
        required
        minLength={4}
        autoFocus
        className="field"
        placeholder="mis. transaksi dobel dengan #12"
      />
      <div className="flex gap-2">
        <FormButton className="btn btn-danger text-xs" pendingLabel="Mengirim…">
          Kirim pengajuan
        </FormButton>
        <button
          type="button"
          onClick={() => setWantOpen(false)}
          className="btn btn-ghost text-xs"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
