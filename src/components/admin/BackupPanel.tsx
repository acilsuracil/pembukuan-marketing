"use client";

import { useActionState, useState } from "react";
import {
  createBackupNow,
  deleteBackupFile,
  restoreFromBackup,
  type ActionState,
} from "@/app/actions";
import { Alert, FormButton } from "@/components/ui";

const EMPTY: ActionState = { ok: false };

export interface BackupRow {
  name: string;
  size: string;
  when: string;
  tier: string;
  isLatest: boolean;
}

export function CreateBackupButton() {
  const [state, action] = useActionState(createBackupNow, EMPTY);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <FormButton pendingLabel="Memotret…">Backup sekarang</FormButton>
      <Alert state={state} />
    </form>
  );
}

function DeleteBackup({ name }: { name: string }) {
  const [state, action] = useActionState(deleteBackupFile, EMPTY);
  return (
    <form action={action}>
      <input type="hidden" name="name" value={name} />
      <FormButton
        className="btn btn-danger px-2 py-1 text-xs"
        confirm={`Hapus backup ${name}? Tidak bisa dikembalikan.`}
      >
        Hapus
      </FormButton>
      {state.error && (
        <span className="ml-2 text-[11px]" style={{ color: "var(--status-critical)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

function RestoreBackup({ name }: { name: string }) {
  const [state, action] = useActionState(restoreFromBackup, EMPTY);
  const [wantOpen, setWantOpen] = useState(false);
  const open = wantOpen && !state.ok;

  if (!open)
    return (
      <div>
        <button
          type="button"
          onClick={() => setWantOpen(true)}
          className="btn btn-ghost px-2 py-1 text-xs"
        >
          Pulihkan
        </button>
        {state.ok && <Alert state={state} className="mt-2" />}
      </div>
    );

  return (
    <form action={action} className="w-full space-y-2">
      <input type="hidden" name="name" value={name} />
      <Alert state={state} />
      <p
        className="rounded-lg px-3 py-2 text-xs leading-relaxed"
        style={{
          color: "var(--text-secondary)",
          background: "color-mix(in srgb, var(--status-critical) 10%, transparent)",
        }}
      >
        Seluruh data sekarang akan <strong>ditimpa</strong> oleh isi{" "}
        <code>{name}</code> — termasuk transaksi, akun, dan izin. Kondisi
        sekarang dipotret dulu secara otomatis, jadi masih bisa dibalik.
      </p>
      <label className="label" htmlFor={`c-${name}`}>
        Ketik <strong>PULIHKAN</strong> untuk menegaskan
      </label>
      <input
        id={`c-${name}`}
        name="confirm"
        type="text"
        required
        autoFocus
        autoComplete="off"
        placeholder="PULIHKAN"
        className="field w-48 py-1.5 text-xs"
      />
      <div className="flex gap-2">
        <FormButton className="btn btn-danger text-xs" pendingLabel="Memulihkan…">
          Pulihkan sekarang
        </FormButton>
        <button
          type="button"
          onClick={() => setWantOpen(false)}
          className="btn btn-ghost text-xs"
        >
          Batal
        </button>
      </div>
    </form>
  );
}

export function BackupList({ rows }: { rows: BackupRow[] }) {
  if (rows.length === 0)
    return (
      <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
        Belum ada snapshot. Yang pertama dibuat otomatis dalam beberapa saat,
        atau tekan “Backup sekarang”.
      </p>
    );

  return (
    <ul className="divide-y divide-[var(--hairline)]">
      {rows.map((r) => (
        <li key={r.name} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-[190px] flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {r.when}
                {r.isLatest && (
                  <span
                    className="rounded-full px-1.5 py-px text-[10px] font-medium"
                    style={{
                      color: "var(--success-text)",
                      background:
                        "color-mix(in srgb, var(--success-text) 12%, transparent)",
                    }}
                  >
                    terbaru
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {r.size} · {r.tier}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <a
                href={`/api/backup/${encodeURIComponent(r.name)}`}
                download
                className="btn btn-ghost px-2 py-1 text-xs"
              >
                Unduh
              </a>
              <RestoreBackup name={r.name} />
              {!r.isLatest && <DeleteBackup name={r.name} />}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
