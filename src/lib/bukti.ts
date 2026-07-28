/**
 * Aturan bukti transfer — dipakai bersama oleh server (validasi saat menyimpan)
 * dan klien (pratinjau + pesan galat). Satu sumber supaya batas yang ditolak
 * server tidak pernah berbeda dari batas yang dijanjikan formulir.
 */

export const MAX_BUKTI_BYTES = 5 * 1024 * 1024;
export const MAX_BUKTI_PER_TX = 8;

export const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** Nilai atribut `accept` untuk input berkas. */
export const BUKTI_ACCEPT = Object.keys(EXT_BY_MIME).join(",");

/** Alasan sebuah berkas ditolak, atau null kalau lolos. */
export function buktiProblem(f: File): string | null {
  if (!EXT_BY_MIME[f.type])
    return `"${f.name}" bukan gambar yang didukung (JPG, PNG, WEBP, atau GIF).`;
  if (f.size > MAX_BUKTI_BYTES) return `"${f.name}" lebih dari 5 MB.`;
  return null;
}
