"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  createUser,
  deleteUser,
  resetUserPassword,
  setLock,
  updateUser,
  type ActionState,
} from "@/app/actions";
import type { User } from "@/lib/types";
import { Alert, FormButton } from "./ui";

const EMPTY: ActionState = { ok: false };

/* ----------------------------------------------------------- kunci periode */

export function LockForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [state, action] = useActionState(setLock, EMPTY);
  const [value, setValue] = useState(current ?? "");

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

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
      <div className="flex gap-2">
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

/* --------------------------------------------------------------- buat user */

export function CreateUserForm() {
  const router = useRouter();
  const [state, action] = useActionState(createUser, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset(); // pembaruan DOM, bukan state React
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
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
            <option value="staff">
              Staff — mencatat langsung, ubah/hapus lewat pengajuan
            </option>
            <option value="admin">Admin — akses penuh</option>
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
  );
}

/* ------------------------------------------------------------- kelola user */

function ResetPassword({ user }: { user: User }) {
  const router = useRouter();
  const [state, action] = useActionState(resetUserPassword, EMPTY);
  const [wantOpen, setWantOpen] = useState(false);
  // Ditutup dengan menurunkan dari hasil aksi, bukan setState di dalam effect.
  const open = wantOpen && !state.ok;

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setWantOpen(true)}
        className="btn btn-ghost px-2 py-1 text-xs"
      >
        Reset password
      </button>
    );

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={user.id} />
      <input
        name="password"
        type="text"
        required
        minLength={8}
        autoFocus
        className="field w-44 py-1 text-xs"
        placeholder="Password baru"
        autoComplete="off"
      />
      <FormButton className="btn btn-primary px-2 py-1 text-xs">Simpan</FormButton>
      <button
        type="button"
        onClick={() => setWantOpen(false)}
        className="btn btn-ghost px-2 py-1 text-xs"
      >
        Batal
      </button>
      {state.error && (
        <span className="text-[11px]" style={{ color: "var(--status-critical)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

export function UserRow({
  user,
  isSelf,
  online,
}: {
  user: User;
  isSelf: boolean;
  /** Dihitung di server — Date.now() tidak boleh dipanggil saat render. */
  online: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState(updateUser, EMPTY);
  const [del, delAction] = useActionState(deleteUser, EMPTY);

  useEffect(() => {
    if (state.ok || del.ok) router.refresh();
  }, [state.ok, del.ok, router]);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          aria-hidden
          title={online ? "Aktif < 5 menit lalu" : "Sedang tidak aktif"}
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            background: online ? "var(--status-good)" : "var(--text-muted)",
          }}
        />
        <div className="min-w-[140px] flex-1">
          <div className="text-sm font-medium">
            {user.username}
            {isSelf && (
              <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">
                (kamu)
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {user.name || "—"}
            {user.pass_changed_at
              ? ` · pw diubah ${user.pass_changed_at.slice(0, 10)}`
              : " · password belum pernah diganti"}
          </div>
        </div>

        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={user.id} />
          <input type="hidden" name="name" value={user.name} />
          <select
            name="role"
            defaultValue={user.role}
            className="field w-[104px] py-1 text-xs"
            aria-label={`Peran ${user.username}`}
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
          <select
            name="active"
            defaultValue={user.active ? "1" : "0"}
            className="field w-[112px] py-1 text-xs"
            aria-label={`Status ${user.username}`}
          >
            <option value="1">Aktif</option>
            <option value="0">Nonaktif</option>
          </select>
          <FormButton className="btn btn-ghost px-2 py-1 text-xs">Simpan</FormButton>
        </form>

        <ResetPassword user={user} />

        {!isSelf && (
          <form action={delAction}>
            <input type="hidden" name="id" value={user.id} />
            <FormButton
              className="btn btn-danger px-2 py-1 text-xs"
              confirm={`Hapus akun ${user.username}? Transaksi yang pernah dia catat tetap ada.`}
            >
              Hapus
            </FormButton>
          </form>
        )}
      </div>

      {(state.error || del.error || state.message) && (
        <div className="mt-2">
          <Alert state={state.error || state.message ? state : del} />
        </div>
      )}
    </li>
  );
}
