/**
 * Pengecil gambar di browser, dijalankan sebelum bukti transfer dikirim.
 *
 * Alasannya bukan hemat tempat, tapi keandalan: seluruh bukti menumpang pada
 * satu POST server action bersama transaksinya, dan body puluhan MB bisa
 * diputus proxy atau menghabiskan memori container **sebelum** action-nya
 * dipanggil — hasilnya transaksinya tidak tersimpan sama sekali. Tangkapan layar
 * mutasi 4 MB turun ke ratusan KB tanpa kehilangan keterbacaan nominal, jadi
 * seluruh kelas kegagalan itu tidak pernah sempat terjadi.
 *
 * Hanya untuk klien — memakai `document` dan `createImageBitmap`.
 */

/** Sisi terpanjang setelah dikecilkan. Nominal dan hash masih terbaca jelas. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;
const TARGET_MIME = "image/jpeg";

/** Di bawah ini tidak diapa-apakan — encode ulang hanya menambah kerja dan artefak. */
const SKIP_BELOW_BYTES = 400 * 1024;

function withJpgExt(name: string): string {
  const base = name.replace(/\.[^.\\/]+$/, "");
  return `${base || "bukti"}.jpg`;
}

/**
 * Mengembalikan versi kecil dari `file`, atau **berkas aslinya** kalau
 * mengecilkan tidak mungkin atau tidak menguntungkan. Sengaja tidak pernah
 * melempar: gagal mengecilkan bukan alasan menolak bukti, dan validasi ukuran
 * yang sesungguhnya tetap dipegang `buktiProblem` di pemanggilnya.
 */
export async function shrinkBukti(file: File): Promise<File> {
  // GIF bisa beranimasi, dan canvas hanya menyalin satu frame — mengecilkannya
  // berarti diam-diam membuang isi buktinya.
  if (file.type === "image/gif") return file;
  if (typeof createImageBitmap !== "function") return file;
  if (file.size <= SKIP_BELOW_BYTES && file.type === TARGET_MIME) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // tidak bisa didekode di sini — biarkan server yang menilai
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // Tangkapan layar sering PNG dengan latar transparan. JPEG tidak punya alfa,
    // dan tanpa dasar putih transparansinya jadi hitam — bukti pun tidak terbaca.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, TARGET_MIME, QUALITY),
    );
    // PNG datar kecil bisa membengkak sebagai JPEG. Yang dipakai selalu yang
    // lebih ringan, jadi mengecilkan tidak pernah memperburuk keadaan.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], withJpgExt(file.name), {
      type: TARGET_MIME,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
