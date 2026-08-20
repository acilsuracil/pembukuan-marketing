/**
 * Aturan bukti transfer — dipakai bersama oleh server (validasi saat menyimpan)
 * dan klien (pratinjau + pesan galat). Satu sumber supaya batas yang ditolak
 * server tidak pernah berbeda dari batas yang dijanjikan formulir.
 */

export const MAX_BUKTI_BYTES = 5 * 1024 * 1024;
export const MAX_BUKTI_PER_TX = 8;

/**
 * Batas gabungan seluruh bukti dalam satu kali kirim.
 *
 * Batas per berkas saja tidak cukup: seluruh bukti menumpang pada **satu** POST
 * server action yang sama dengan transaksinya, jadi 8 berkas berukuran pas-pasan
 * tetap menghasilkan body puluhan MB. Body sebesar itu bisa diputus proxy atau
 * menghabiskan memori container sebelum action-nya dipanggil — dan gejalanya
 * menipu: halaman gagal dimuat dan transaksinya **tidak tersimpan sama sekali**,
 * karena Next mem-parse body lebih dulu sebelum menjalankan action, sehingga
 * INSERT transaksinya belum pernah dieksekusi.
 *
 * Klien mengecilkan gambar sebelum mengirim (lihat `lib/shrink`), jadi batas ini
 * praktis hanya tersentuh oleh GIF, yang tidak bisa dikecilkan tanpa membuang
 * animasinya.
 */
export const MAX_BUKTI_TOTAL_BYTES = 12 * 1024 * 1024;

export const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** Nilai atribut `accept` untuk input berkas. */
export const BUKTI_ACCEPT = Object.keys(EXT_BY_MIME).join(",");

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toLocaleString("id-ID", {
    maximumFractionDigits: 1,
  });
}

/**
 * Jenis berkasnya didukung? Dipisah dari `buktiProblem` karena klien memeriksa
 * ini **sebelum** mengecilkan gambar — tidak ada gunanya men-decode berkas yang
 * jenisnya memang tidak akan diterima, dan batas ukurannya baru relevan setelah
 * hasil kompresinya diketahui.
 */
export function buktiMimeProblem(f: File): string | null {
  if (!EXT_BY_MIME[f.type])
    return `"${f.name}" bukan gambar yang didukung (JPG, PNG, WEBP, atau GIF).`;
  return null;
}

/** Alasan sebuah berkas ditolak, atau null kalau lolos. */
export function buktiProblem(f: File): string | null {
  const mime = buktiMimeProblem(f);
  if (mime) return mime;
  if (f.size > MAX_BUKTI_BYTES) return `"${f.name}" lebih dari 5 MB.`;
  return null;
}

/** Alasan sekumpulan berkas ditolak sebagai satu kiriman, atau null kalau lolos. */
export function buktiTotalProblem(files: File[]): string | null {
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_BUKTI_TOTAL_BYTES)
    return `Total bukti ${mb(total)} MB — maksimal ${mb(
      MAX_BUKTI_TOTAL_BYTES,
    )} MB sekali kirim. Buang beberapa berkas, lalu unggah sisanya terpisah.`;
  return null;
}
