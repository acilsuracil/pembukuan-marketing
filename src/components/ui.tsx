"use client";

import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

/*
 * `blurOnWheel` dulu ada di sini: roda mouse menaik-turunkan nilai
 * `<input type="number">` sebesar satu `step` selagi kolomnya terfokus, jadi
 * orang mengetik kurs 18.120 lalu menggulir ke tombol Simpan dan yang tersimpan
 * 18.119 — selisih satu step, terlalu kecil untuk terlihat salah, tanpa jejak
 * siapa mengubahnya.
 *
 * Seluruh kolom angka di aplikasi ini sekarang `type="text"` (alasannya ditulis
 * di kolom Nominal `TxForm`), dan kolom teks tidak berubah nilainya saat
 * digulir. Jadi penangkalnya tidak lagi punya yang perlu ditangkal, dan dibuang
 * daripada dibiarkan sebagai kode mati. Kalau nanti ada `type="number"` baru,
 * bahaya ini kembali dan penangkalnya perlu kembali juga.
 */

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
