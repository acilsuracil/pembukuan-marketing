"use client";

import type { WheelEvent } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

/**
 * Roda mouse tidak boleh mengubah angka. Dipasang di **setiap**
 * `<input type="number">` di aplikasi ini.
 *
 * Chrome dan Firefox menaik-turunkan nilai input number sebesar satu `step`
 * setiap kali digulir selagi kolomnya terfokus. Orang mengetik kurs, lalu
 * menggulir halaman untuk mencapai tombol Simpan — dan yang tersimpan 18.119
 * padahal yang diketik 18.120. Pada kolom ber-`step="0.000001"` gejalanya jadi
 * 1,5 berubah menjadi 1,499999.
 *
 * Justru itu yang membuatnya berbahaya di pembukuan: selisihnya tepat satu step,
 * jadi terlalu kecil untuk terlihat salah saat diperiksa sekilas, tapi cukup
 * untuk membuat angka rupiah dan saldo tidak pernah benar-benar cocok — dan
 * tidak ada satu pun jejak yang menunjukkan siapa mengubahnya.
 *
 * Yang dilepas fokusnya, bukan event-nya yang dibatalkan. `preventDefault` akan
 * menghentikan gulir halamannya juga, dan React memasang `onWheel` sebagai
 * passive listener yang memang tidak boleh membatalkan. Melepas fokus membuat
 * kenaikan nilainya tidak berlaku — browser hanya melakukannya pada kolom yang
 * terfokus — sementara halamannya tetap tergulir seperti yang diminta.
 */
export function blurOnWheel(e: WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

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
