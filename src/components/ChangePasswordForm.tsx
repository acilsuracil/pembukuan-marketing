"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { changeOwnPassword, type AuthState } from "@/app/auth-actions";

const EMPTY: AuthState = { ok: false };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Menyimpan…" : "Ganti password"}
    </button>
  );
}

export default function ChangePasswordForm() {
  const [state, action] = useActionState(changeOwnPassword, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);

  // Mengosongkan field password adalah pembaruan DOM, bukan state React.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {(state.error || state.message) && (
        <p
          role={state.error ? "alert" : "status"}
          className="rounded-lg px-3 py-2 text-xs"
          style={{
            color: state.error ? "var(--status-critical)" : "var(--success-text)",
            background: `color-mix(in srgb, ${
              state.error ? "var(--status-critical)" : "var(--success-text)"
            } 10%, transparent)`,
          }}
        >
          {state.error ?? state.message}
        </p>
      )}

      <div>
        <label className="label" htmlFor="current">
          Password saat ini
        </label>
        <input
          id="current"
          name="current"
          type="password"
          required
          autoComplete="current-password"
          className="field"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password baru
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="field"
        />
        <p className="hint">Minimal 8 karakter, harus memuat huruf dan angka.</p>
      </div>

      <div>
        <label className="label" htmlFor="confirm">
          Ulangi password baru
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="field"
        />
      </div>

      <Submit />
    </form>
  );
}
