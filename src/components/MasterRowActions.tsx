"use client";

import Link from "next/link";
import { useActionState } from "react";
import { deleteMaster, toggleArchiveMaster, type ActionState } from "@/app/actions";
import { FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

export type MasterKind =
  | "divisi"
  | "platform"
  | "brand"
  | "penerima"
  | "dompet"
  | "akun_iklan";

/**
 * Tombol per baris data master: ubah, arsipkan, hapus.
 *
 * Hapus hanya ditawarkan untuk master yang belum pernah dipakai — sisanya
 * diarsipkan, supaya laporan periode yang sudah selesai tidak berubah di
 * belakang hari.
 */
export default function MasterRowActions({
  kind,
  id,
  name,
  archived,
  used,
  editHref,
}: {
  kind: MasterKind;
  id: number;
  name: string;
  archived: boolean;
  used: number;
  editHref?: string;
}) {
  const [state, del] = useActionState(deleteMaster, EMPTY);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {editHref && (
        <Link href={editHref} className="btn btn-ghost px-2 py-1 text-xs">
          Ubah
        </Link>
      )}

      <form action={toggleArchiveMaster}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="btn btn-ghost px-2 py-1 text-xs">
          {archived ? "Aktifkan" : "Arsipkan"}
        </button>
      </form>

      {used === 0 && (
        <form action={del}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <FormButton
            className="btn btn-danger px-2 py-1 text-xs"
            confirm={`Hapus "${name}"? Belum dipakai baris mana pun.`}
          >
            Hapus
          </FormButton>
        </form>
      )}

      {state.error && (
        <span className="text-[11px]" style={{ color: "var(--status-critical)" }}>
          {state.error}
        </span>
      )}
    </div>
  );
}
