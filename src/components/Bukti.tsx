"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { addBukti, deleteBukti, type ActionState } from "@/app/actions";
import type { Attachment } from "@/lib/types";
import { Alert, FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

function DeleteBukti({ id }: { id: string }) {
  const router = useRouter();
  const [state, action] = useActionState(deleteBukti, EMPTY);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <FormButton
        className="btn btn-danger px-2 py-1 text-[11px]"
        confirm="Hapus bukti ini?"
      >
        Hapus
      </FormButton>
    </form>
  );
}

export default function Bukti({
  txId,
  items,
  canUpload,
  isAdmin,
  currentUserId,
}: {
  txId: number;
  items: Attachment[];
  canUpload: boolean;
  /**
   * Kewenangan dikirim sebagai data, bukan fungsi — Server Component tidak
   * boleh meneruskan fungsi ke Client Component.
   */
  isAdmin: boolean;
  currentUserId: number;
}) {
  const canDelete = (a: Attachment) => isAdmin || a.uploaded_by === currentUserId;
  const router = useRouter();
  const [state, action] = useActionState(addBukti, EMPTY);
  const [picked, setPicked] = useState(0);
  // Setelah unggahan berhasil, input file sudah di-reset React — jadi hitungannya
  // diturunkan dari hasil aksi, bukan di-set ulang dari dalam effect.
  const count = state.ok ? 0 : picked;

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Bukti transfer</h2>
        <span className="text-xs text-[var(--text-muted)]">
          {items.length} berkas
        </span>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Belum ada bukti yang dilampirkan.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((a) => (
            <li key={a.id} className="group">
              <a
                href={`/api/bukti/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg border border-[var(--hairline)]"
                title={`Buka ${a.orig_name}`}
              >
                {/* Bukti disajikan lewat route ber-auth, bukan folder publik. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/bukti/${a.id}`}
                  alt={a.orig_name || "Bukti transfer"}
                  className="aspect-[4/3] w-full bg-[var(--wash)] object-cover"
                  loading="lazy"
                />
              </a>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span
                  className="truncate text-[11px] text-[var(--text-muted)]"
                  title={a.orig_name}
                >
                  {a.orig_name || "bukti"}
                </span>
                {canDelete(a) && <DeleteBukti id={a.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <form action={action} className="mt-4 space-y-2 border-t border-[var(--hairline)] pt-4">
          <input type="hidden" name="tx_id" value={txId} />
          <Alert state={state} />
          <label className="label" htmlFor={`bukti-${txId}`}>
            Tambah bukti
          </label>
          <input
            id={`bukti-${txId}`}
            name="bukti"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            required
            className="field cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-[var(--wash)] file:px-2.5 file:py-1 file:text-xs file:text-[var(--text-primary)]"
            onChange={(e) => setPicked(e.target.files?.length ?? 0)}
          />
          <div className="flex items-center gap-3">
            <FormButton className="btn btn-primary text-xs" pendingLabel="Mengunggah…">
              Unggah{count > 0 ? ` ${count} berkas` : ""}
            </FormButton>
            <span className="text-[11px] text-[var(--text-muted)]">
              JPG, PNG, WEBP, GIF · maks 5 MB per berkas
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
