"use client";

import { useRouter } from "next/navigation";
import { dashboardHref } from "@/lib/period";
import type { Brand } from "@/lib/types";

/**
 * Pemilih brand untuk mempersempit tampilan dashboard.
 *
 * Periode yang sedang dipilih diteruskan apa adanya lewat `dashboardHref`.
 * Sebelum ada pemilih periode, komponen ini menulis ulang seluruh URL — dan itu
 * akan membuang periodenya tanpa terlihat: ganti brand saat sedang melihat Juni,
 * lalu tiba-tiba kembali ke bulan berjalan tanpa penjelasan.
 */
export default function BrandScope({
  brands,
  value,
  periode,
}: {
  brands: Brand[];
  value: string;
  periode: string;
}) {
  const router = useRouter();
  return (
    <div>
      <label className="label" htmlFor="scope-brand">
        Tampilkan brand
      </label>
      <select
        id="scope-brand"
        className="field w-[200px] py-1.5 text-xs"
        value={value}
        onChange={(e) => router.push(dashboardHref({ brand: e.target.value, periode }))}
      >
        <option value="">Semua brand</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
