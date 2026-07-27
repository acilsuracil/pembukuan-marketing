"use client";

import { useActionState, useState } from "react";
import { setLock, type ActionState } from "@/app/actions";
import { Alert, FormButton } from "@/components/ui";

const EMPTY: ActionState = { ok: false };

export default function LockForm({ current }: { current: string | null }) {
  const [state, action] = useActionState(setLock, EMPTY);
  const [value, setValue] = useState(current ?? "");

  return (
    <form action={action} className="space-y-3">
      <Alert state={state} />
      <div>
        <label className="label" htmlFor="lock_until">
          Kunci transaksi sampai tanggal
        </label>
        <input
          id="lock_until"
          name="lock_until"
          type="date"
          className="field tnum sm:max-w-[200px]"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="hint">
          Semua transaksi pada tanggal ini dan sebelumnya tidak bisa ditambah,
          diubah, atau dihapus — termasuk oleh admin. Kosongkan untuk melepas
          kunci.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <FormButton pendingLabel="Menyimpan…">Terapkan kunci</FormButton>
        {current && (
          <button
            type="submit"
            className="btn btn-ghost"
            onClick={() => setValue("")}
            formNoValidate
          >
            Lepas kunci
          </button>
        )}
      </div>
    </form>
  );
}
