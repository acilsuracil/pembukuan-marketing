"use client";

import { useRouter } from "next/navigation";
import type { Brand } from "@/lib/types";

/** Pemilih brand untuk mempersempit tampilan dashboard. */
export default function BrandScope({
  brands,
  value,
}: {
  brands: Brand[];
  value: string;
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
        onChange={(e) =>
          router.push(e.target.value ? `/?brand=${e.target.value}` : "/")
        }
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
