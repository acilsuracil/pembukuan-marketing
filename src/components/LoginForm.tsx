"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { doLogin, type AuthState } from "@/app/auth-actions";

const EMPTY: AuthState = { ok: false };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Memeriksa…" : "Masuk"}
    </button>
  );
}

export function AuthError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg px-3 py-2 text-xs"
      style={{
        color: "var(--status-critical)",
        background: "color-mix(in srgb, var(--status-critical) 10%, transparent)",
      }}
    >
      {message}
    </p>
  );
}

export default function LoginForm() {
  const [state, action] = useActionState(doLogin, EMPTY);

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
          autoComplete="username"
          autoFocus
          spellCheck={false}
          className="field"
        />
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
          autoComplete="current-password"
          className="field"
        />
      </div>

      <div className="pt-1">
        <Submit />
      </div>
    </form>
  );
}
