"use client";

import { useRouter } from "next/navigation";
import { monthLabelLong } from "@/lib/format";
import { dashboardHref } from "@/lib/period";

/**
 * Pemilih periode dashboard: satu bulan, atau satu tahun penuh.
 *
 * Brand yang sedang dipilih diteruskan apa adanya lewat `dashboardHref`, supaya
 * mengganti periode tidak diam-diam mengembalikan tampilan ke semua brand.
 */
export default function PeriodScope({
  months,
  years,
  value,
  brand,
}: {
  months: string[];
  years: string[];
  value: string;
  brand: string;
}) {
  const router = useRouter();
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
              {monthLabelLong(m)}
            </option>
          ))}
        </optgroup>
        <optgroup label="Tahunan">
          {years.map((y) => (
            <option key={y} value={y}>
              Tahun {y}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
