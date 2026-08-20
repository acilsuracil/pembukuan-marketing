"use client";

import { useState } from "react";

/**
 * Blok teks siap tempel dengan tombol salin.
 *
 * Teksnya tetap terlihat utuh dan bisa diseleksi manual — clipboard API menolak
 * bekerja tanpa konteks aman (http di jaringan lokal, misalnya), dan tombol yang
 * gagal diam-diam lebih buruk daripada teks yang bisa disalin sendiri.
 */
export default function CopyBox({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "ok" | "gagal">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("ok");
    } catch {
      setState("gagal");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <div>
      <pre className="tnum overflow-x-auto rounded-lg border border-[var(--hairline)] bg-[var(--wash)] p-3 text-xs leading-relaxed whitespace-pre-wrap">
        {text}
      </pre>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={copy} className="btn btn-ghost px-2.5 py-1 text-xs">
          Salin
        </button>
        {state === "ok" && (
          <span className="text-xs" style={{ color: "var(--success-text)" }}>
            Tersalin.
          </span>
        )}
        {state === "gagal" && (
          <span className="text-xs text-[var(--text-muted)]">
            Browser menolak menyalin — seleksi teksnya manual.
          </span>
        )}
      </div>
    </div>
  );
}
