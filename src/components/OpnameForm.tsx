"use client";

import { useActionState } from "react";
import { saveOpname, type ActionState } from "@/app/actions";
import MoneyField from "./MoneyField";
import { Alert, FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

/**
 * Mencatat saldo riil dari mutasi bank.
 *
 * Ini bukan koreksi — angka pembukuan tidak berubah. Gunanya memperlihatkan
 * selisihnya, supaya jelas ada mutasi yang belum tercatat sebelum diputuskan
 * mau diapakan.
 */
export default function OpnameForm({
  dompetId,
  today,
  saldoTercatat,
}: {
  dompetId: number;
  today: string;
  saldoTercatat: number;
}) {
  const [state, action] = useActionState(saveOpname, EMPTY);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="dompet_id" value={dompetId} />
      <Alert state={state} />

      <div>
        <label className="label" htmlFor="op-tanggal">
          Tanggal cek
        </label>
        <input
          id="op-tanggal"
          name="tanggal"
          type="date"
          required
          className="field tnum"
          defaultValue={today}
        />
      </div>

      <MoneyField
        name="saldo_aktual"
        label="Saldo asli di mobile banking"
        required
        hint={`Saldo tercatat panel sekarang ${saldoTercatat.toLocaleString("id-ID")}.`}
      />

      <div>
        <label className="label" htmlFor="op-catatan">
          Catatan
        </label>
        <input
          id="op-catatan"
          name="catatan"
          type="text"
          className="field"
          placeholder="opsional"
        />
      </div>

      <FormButton className="btn btn-ghost w-full" pendingLabel="Menyimpan…">
        Catat hasil cek
      </FormButton>
    </form>
  );
}
