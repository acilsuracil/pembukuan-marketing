"use client";

import { useActionState } from "react";
import { deleteBrand, deleteCategory, type ActionState } from "@/app/actions";
import { FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

/** Tombol hapus untuk data master (brand / kategori) yang belum pernah dipakai. */
export default function DeleteMasterButton({
  kind,
  id,
  name,
}: {
  kind: "brand" | "category";
  id: number;
  name: string;
}) {
  const [state, action] = useActionState(
    kind === "brand" ? deleteBrand : deleteCategory,
    EMPTY,
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <FormButton
        className="btn btn-danger px-2 py-1 text-xs"
        confirm={`Hapus ${kind === "brand" ? "brand" : "kategori"} "${name}"?`}
      >
        Hapus
      </FormButton>
      {state.error && (
        <span className="text-[11px]" style={{ color: "var(--status-critical)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
