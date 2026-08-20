"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { doSetup, type AuthState } from "@/app/auth-actions";
import { AuthError } from "./LoginForm";

const EMPTY: AuthState = { ok: false };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Membuat…" : "Buat akun owner"}
    </button>
  );
}

export default function SetupForm() {
  const [state, action] = useActionState(doSetup, EMPTY);

  return (
    <form action={action} className="mt-5 space-y-3">
      {state.error && <AuthError message={state.error} />}

      <div>
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoFocus
          autoComplete="username"
          spellCheck={false}
          pattern="[a-zA-Z0-9._\-]{3,32}"
          className="field"
          placeholder="admin"
        />
        <p className="hint">3–32 karakter: huruf, angka, titik, garis bawah, strip.</p>
      </div>

      <div>
        <label className="label" htmlFor="name">
          Nama tampilan{" "}
          <span className="font-normal text-[var(--text-muted)]">— opsional</span>
        </label>
        <input id="name" name="name" type="text" className="field" />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
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
          Ulangi password
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

      <div className="pt-1">
        <Submit />
      </div>
    </form>
  );
}
