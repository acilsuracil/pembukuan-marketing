"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createUser, type ActionState } from "@/app/actions";
import { Alert, FormButton } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/format";

const EMPTY: ActionState = { ok: false };

export default function CreateUserForm({ allowOwner }: { allowOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createUser, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Mengosongkan form lewat DOM, bukan setState — aman dari lint
    // set-state-in-effect.
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Tambah akun</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Staff mencatat langsung; perubahan &amp; penghapusan lewat
            pengajuan. Izinnya bisa disetel per akun setelah dibuat.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Tutup" : "+ Akun baru"}
        </button>
      </div>

      {open && (
        <form
          ref={formRef}
          action={action}
          className="mt-4 space-y-3 border-t border-[var(--hairline)] pt-4"
        >
          <Alert state={state} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="u-username">
                Username
              </label>
              <input
                id="u-username"
                name="username"
                type="text"
                required
                pattern="[a-zA-Z0-9._\-]{3,32}"
                spellCheck={false}
                className="field"
                placeholder="budi"
              />
              <p className="hint">3–32 karakter: huruf, angka, titik, strip.</p>
            </div>
            <div>
              <label className="label" htmlFor="u-name">
                Nama tampilan
              </label>
              <input id="u-name" name="name" type="text" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="u-role">
                Peran
              </label>
              <select id="u-role" name="role" className="field" defaultValue="staff">
                <option value="staff">{ROLE_LABEL.staff} — membuat pengajuan</option>
                <option value="admin">
                  {ROLE_LABEL.admin} — menyetujui pengajuan divisinya
                </option>
                <option value="finance">
                  {ROLE_LABEL.finance} — membayar pengajuan yang sudah disetujui
                </option>
                {allowOwner && (
                  <option value="owner">
                    {ROLE_LABEL.owner} — menyetujui pembayaran, mengelola aplikasi
                  </option>
                )}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="u-pass">
                Password awal
              </label>
              <input
                id="u-pass"
                name="password"
                type="text"
                required
                minLength={8}
                className="field"
                autoComplete="off"
              />
              <p className="hint">Min. 8 karakter, ada huruf dan angka.</p>
            </div>
          </div>
          <FormButton pendingLabel="Membuat…">Buat akun</FormButton>
        </form>
      )}
    </section>
  );
}
