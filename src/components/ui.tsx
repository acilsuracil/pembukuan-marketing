"use client";

import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

export function FormButton({
  children,
  pendingLabel = "…",
  className = "btn btn-primary",
  confirm,
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  confirm?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={className}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function Alert({
  state,
  className = "",
}: {
  state: ActionState;
  className?: string;
}) {
  if (!state.error && !state.message) return null;
  const bad = Boolean(state.error);
  const color = bad ? "var(--status-critical)" : "var(--success-text)";
  return (
    <p
      role={bad ? "alert" : "status"}
      className={`rounded-lg px-3 py-2 text-xs ${className}`}
      style={{
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {state.error ?? state.message}
    </p>
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "good" | "warning" | "serious" | "critical";
}) {
  const color =
    tone === "muted" ? "var(--text-muted)" : `var(--status-${tone})`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        color,
        background:
          tone === "muted"
            ? "transparent"
            : `color-mix(in srgb, ${color} 12%, transparent)`,
        border: tone === "muted" ? "1px solid var(--hairline)" : "none",
      }}
    >
      {children}
    </span>
  );
}
