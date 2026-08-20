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
