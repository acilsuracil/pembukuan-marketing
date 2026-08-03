"use client";

import type { ComponentProps } from "react";

/**
 * Kolom tanggal/bulan yang tidak bisa berubah karena roda mouse, dan cukup lebar
 * untuk menampilkan formatnya utuh.
 *
 * Dibuat jadi komponen, bukan sekadar atribut yang ditempel di tiap `<input>`,
 * karena cara itu sudah terbukti gagal: penjaga roda dipasang di semua kolom
 * angka tapi kolom tanggal terlewat seluruhnya — delapan buah — dan gejalanya
 * ("tanggalnya terpilih sendiri") baru muncul di tangan pemakai.
 *
 * Dua hal yang ditangani:
 *
 * 1. **Roda mouse.** Chrome dan Firefox menaik-turunkan segmen tanggal yang
 *    terfokus setiap kali digulir. Orang menggulir halaman, dan tanggal filternya
 *    bergeser sehari tanpa disentuh. Fokusnya dilepas, bukan event-nya dibatalkan
 *    — `preventDefault` akan menghentikan gulir halamannya juga.
 *
 * 2. **Lebar.** `.field` di globals.css menetapkan `width: 100%`, `padding`, dan
 *    `font-size` sebagai CSS tanpa layer, dan di Tailwind v4 CSS tanpa layer
 *    selalu menang atas `@layer utilities`. Jadi `w-[152px]`, `py-1.5`, dan
 *    `text-xs` yang ditempel langsung ke input **tidak pernah berlaku**: fontnya
 *    tetap 14px dan padding-nya tetap 12px, sehingga "dd/mm/yyyy" beserta ikon
 *    kalendernya tidak muat dan segmen bulannya terpotong jadi "dd-----yyyy".
 *
 *    Lebarnya karena itu dipasang di pembungkusnya, lalu `width: 100%` milik
 *    `.field` mengisi pembungkus itu — bekerja bersama urutan cascade-nya,
 *    bukan melawannya.
 */
export default function DateField({
  kind = "date",
  width = "w-44",
  ...rest
}: {
  kind?: "date" | "month";
  /** Kelas lebar untuk pembungkusnya, mis. "w-44" atau "w-full". */
  width?: string;
} & Omit<ComponentProps<"input">, "type" | "className">) {
  return (
    <div className={width}>
      <input
        {...rest}
        type={kind}
        onWheel={(e) => e.currentTarget.blur()}
        className="field tnum"
      />
    </div>
  );
}
