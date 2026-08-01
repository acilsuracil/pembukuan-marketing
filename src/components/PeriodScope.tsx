"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { monthLabelLong } from "@/lib/format";
import { dashboardHref, periodHasData } from "@/lib/period";

/**
 * Pemilih periode dashboard: satu bulan, atau satu tahun penuh.
 *
 * Brand yang sedang dipilih diteruskan apa adanya lewat `dashboardHref`, supaya
 * mengganti periode tidak diam-diam mengembalikan tampilan ke semua brand.
 *
 * Periode yang belum ada transaksinya tetap bisa dipilih, tapi diberi tanda:
 * dashboard kosong yang tidak dijelaskan apa-apa terbaca seperti data yang
 * hilang, bukan seperti bulan yang memang belum ada isinya.
 */
export default function PeriodScope({
  months,
  years,
  filled,
  value,
  brand,
}: {
  months: string[];
  years: string[];
  /** Bulan-bulan yang punya transaksi, format "YYYY-MM". */
  filled: string[];
  value: string;
  brand: string;
}) {
  const router = useRouter();
  const has = useMemo(() => new Set(filled), [filled]);
  const mark = (key: string, label: string) =>
    periodHasData(key, has) ? label : `${label} — kosong`;
  return (
    <div>
      <label className="label" htmlFor="scope-period">
        Periode
      </label>
      <select
        id="scope-period"
        className="field w-[180px] py-1.5 text-xs"
        value={value}
        onChange={(e) => router.push(dashboardHref({ brand, periode: e.target.value }))}
      >
        <optgroup label="Bulanan">
          {months.map((m) => (
            <option key={m} value={m}>
              {mark(m, monthLabelLong(m))}
            </option>
          ))}
        </optgroup>
        <optgroup label="Tahunan">
          {years.map((y) => (
            <option key={y} value={y}>
              {mark(y, `Tahun ${y}`)}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
