"use client";

import { useActionState } from "react";
import { saveGrupBayar, type ActionState } from "@/app/actions";
import { Alert, FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

/** ID grup Telegram pembayaran — satu untuk semua divisi. */
export default function GrupBayarForm({ value }: { value: number | null }) {
  const [state, action] = useActionState(saveGrupBayar, EMPTY);
  return (
    <form action={action} className="mt-5 space-y-2 border-t border-[var(--hairline)] pt-4">
      <h3 className="text-sm font-semibold">Grup pembayaran (Telegram)</h3>
      <Alert state={state} />
      <input
        name="telegram_grup_bayar"
        type="text"
        inputMode="numeric"
        className="field tnum"
        defaultValue={value ?? ""}
        placeholder="mis. -1001234567890"
        aria-label="ID grup pembayaran"
      />
      <p className="hint">
        Pengajuan yang sudah disetujui leader diposting ke sini untuk penyetuju
        pembayaran, lalu finance membayar dari sini. Atau ketik /grupbayar di
        grupnya.
      </p>
      <FormButton className="btn btn-ghost" pendingLabel="Menyimpan…">
        Simpan grup pembayaran
      </FormButton>
    </form>
  );
}
