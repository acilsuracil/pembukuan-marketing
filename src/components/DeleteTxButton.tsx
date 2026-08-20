"use client";

import { useActionState } from "react";
import { deleteTransaksi, type ActionState } from "@/app/actions";
import { FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

export default function DeleteTxButton({
  id,
  label,
}: {
  id: number;
  label: string;
}) {
  const [state, action] = useActionState(deleteTransaksi, EMPTY);

  return (
    <form action={action} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <FormButton
        className="btn btn-danger px-2 py-1 text-xs"
        confirm={`Hapus ${label}?`}
      >
        Hapus
      </FormButton>
      {state.error && (
        <span
          className="max-w-[240px] text-[11px]"
          style={{ color: "var(--status-critical)" }}
        >
          {state.error}
        </span>
      )}
    </form>
  );
}
