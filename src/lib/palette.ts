/**
 * Slot warna kategorikal (1–8), urutan tetap — jangan diputar/di-generate.
 * Nilai hex-nya hidup di globals.css sebagai --series-N (light + dark),
 * jadi komponen cukup memakai `seriesVar(slot)`.
 */
export const SLOT_COUNT = 8;

export const SLOT_NAMES = [
  "Biru", "Oranye", "Toska", "Kuning",
  "Magenta", "Hijau", "Ungu", "Merah",
];

/** Hex mode terang — hanya untuk pratinjau swatch di form kategori. */
export const SLOT_HEX_LIGHT = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100",
  "#e87ba4", "#008300", "#4a3aa7", "#e34948",
];

export function seriesVar(slot: number | null | undefined): string {
  const s = slot && slot >= 1 && slot <= SLOT_COUNT ? slot : 1;
  return `var(--series-${s})`;
}
