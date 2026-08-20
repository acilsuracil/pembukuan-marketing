"use client";

import { useState } from "react";
import { fmtIdr } from "@/lib/format";
import { parseRupiah } from "@/lib/num";

/**
 * Kolom nominal rupiah dengan pratinjau hidup.
 *
 * `type="text"`, bukan `type="number"`: roda mouse menaik-turunkan nilai input
 * number selagi terfokus, jadi orang mengetik 2.500.000 lalu menggulir ke tombol
 * Simpan dan yang tersimpan 2.499.999 — selisih yang terlalu kecil untuk
 * terlihat salah. Kolom teks tidak berubah nilainya saat digulir.
 *
 * Pratinjaunya memakai `parseRupiah` yang sama dengan yang dipakai server, jadi
 * angka yang diperlihatkan di sini persis angka yang akan tersimpan.
 */
export default function MoneyField({
  name,
  id,
  label,
  defaultValue = "",
  placeholder = "0",
  required = false,
  hint,
  autoFocus = false,
  className = "",
  onTextChange,
}: {
  name: string;
  id?: string;
  label?: string;
  defaultValue?: string | number;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  autoFocus?: boolean;
  className?: string;
  /** Dipanggil tiap ketikan — untuk pemakai yang ikut menampilkan nilainya. */
  onTextChange?: (text: string) => void;
}) {
  const [text, setText] = useState(
    defaultValue === "" || defaultValue === 0 ? "" : String(defaultValue),
  );
  const inputId = id ?? `m-${name}`;
  const parsed = text.trim() === "" ? null : parseRupiah(text);
  const unreadable = text.trim() !== "" && parsed === null;

  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        required={required}
        className="field tnum"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onTextChange?.(e.target.value);
        }}
        aria-invalid={unreadable || undefined}
      />
      {unreadable ? (
        <p className="hint" style={{ color: "var(--status-critical)" }}>
          &quot;{text}&quot; belum terbaca sebagai angka rupiah.
        </p>
      ) : parsed !== null ? (
        <p className="hint tnum">{fmtIdr(parsed)}</p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  );
}
