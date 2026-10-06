/** Bentuk searchParams Next: nilainya bisa tunggal, ganda, atau tidak ada. */
export type SP = Record<string, string | string[] | undefined>;

/** Nilai pertama sebuah parameter, selalu string ("" kalau tidak ada). */
export function first(sp: SP, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Angka positif dari parameter, atau undefined kalau bukan angka yang sah. */
export function num(sp: SP, key: string): number | undefined {
  const raw = first(sp, key);
  if (raw === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Daftar id dari satu parameter berpisah koma ("3,5,8"), untuk filter yang
 * boleh memilih lebih dari satu. Yang bukan angka sah dibuang; kosong = undefined.
 */
export function ids(sp: SP, key: string): number[] | undefined {
  const out = [
    ...new Set(
      first(sp, key)
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
  return out.length > 0 ? out : undefined;
}

/** Menyusun query string dari nilai yang ada isinya saja. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}
