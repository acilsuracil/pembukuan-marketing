"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { addBukti, deleteBukti, type ActionState } from "@/app/actions";
import type { Attachment } from "@/lib/types";
import BuktiInput from "./BuktiInput";
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
  canDeleteAny,
  currentUserId,
  links = [],
}: {
  txId: number;
  items: Attachment[];
  /** Bukti berupa link (mis. Google Drive) — dari pembayaran pengajuan. */
  links?: string[];
  canUpload: boolean;
  /**
   * Kewenangan dikirim sebagai data, bukan fungsi — Server Component tidak
   * boleh meneruskan fungsi ke Client Component.
   */
  canDeleteAny: boolean;
  currentUserId: number;
}) {
  const canDelete = (a: Attachment) => canDeleteAny || a.uploaded_by === currentUserId;
  const router = useRouter();
  const [state, action] = useActionState(addBukti, EMPTY);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);

  // Disegarkan pada tiap hasil aksi, bukan hanya yang berhasil: unggahan yang
  // gagal di tengah antrean tetap menyisakan berkas yang sudah tersimpan, dan
  // itu harus langsung terlihat di daftar.
  useEffect(() => {
    if (state !== EMPTY) router.refresh();
  }, [state, router]);

  // Pemilih dikosongkan begitu aksi selesai dengan sukses — bukan menunggu
  // router.refresh() membawa daftar baru. Di sela itu tombol akan hidup lagi
  // dengan berkas yang sama masih terpasang, dan klik kedua mengunggah bukti
  // yang persis sama untuk kedua kalinya. Aksi yang gagal tidak mengosongkan
  // apa pun, jadi berkasnya tetap aman untuk dicoba ulang.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) {
      setCount(0);
      setRound((n) => n + 1);
    }
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Bukti transfer</h2>
        <span className="text-xs text-[var(--text-muted)]">
          {items.length} berkas{links.length > 0 ? ` · ${links.length} link` : ""}
        </span>
      </div>

      {links.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {links.map((l) => (
            <li key={l} className="truncate">
              {/* Hanya http/https yang lolos saat disimpan, jadi aman dijadikan href. */}
              🔗{" "}
              <a href={l} target="_blank" rel="noopener noreferrer" className="underline">
                {l.replace(/^https?:\/\//, "")}
              </a>
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 ? (
        links.length === 0 &&
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
          {/* Kunci berganti tiap unggahan berhasil, jadi pemilih dipasang ulang
              dan pratinjau yang sudah tersimpan tidak tertinggal di formulir. */}
          <BuktiInput
            key={round}
            id={`bukti-${txId}`}
            taken={items.length}
            onChange={setCount}
            onBusy={setBusy}
          />
          <div className="flex items-center gap-3">
            <FormButton
              className="btn btn-primary text-xs"
              pendingLabel="Mengunggah…"
              disabled={count === 0 || busy}
            >
              {busy ? "Menyiapkan…" : `Unggah${count > 0 ? ` ${count} berkas` : ""}`}
            </FormButton>
            <span className="text-[11px] text-[var(--text-muted)]">
              JPG, PNG, WEBP, GIF · gambar besar dikecilkan sendiri
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
