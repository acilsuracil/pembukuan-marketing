/**
 * Menerjemahkan teks angka yang diketik orang jadi rupiah.
 *
 * Modul ini sengaja polos — tanpa `"use server"`, tanpa impor apa pun — supaya
 * **server dan klien memakai kode yang sama persis**. Itu syaratnya, bukan
 * kerapian: kolom nominal punya pratinjau hidup di formulir, dan kalau
 * pratinjaunya memakai aturan sendiri, angka yang diperlihatkan tidak sama
 * dengan angka yang tersimpan.
 *
 * Aturannya satu: **titik dan spasi adalah pemisah ribuan, koma adalah
 * desimal.** `2.500.000` berarti dua setengah juta, bukan 2,5. Ini kebalikan
 * dari pembukuan USDT — di sana titik tunggal dibaca desimal karena nominalnya
 * memang pecahan. Di sini tidak ada orang yang memaksudkan Rp 2,5 saat menulis
 * "2.500".
 *
 * Yang tidak terbaca dikembalikan `null`, tidak pernah 0. Nol adalah angka yang
 * sah, dan diam-diam menggantikan ketikan yang salah dengannya berarti menyimpan
 * pembukuan yang tidak pernah diketik siapa pun.
 */

/** Satu-tiga angka, lalu kelompok tiga angka: `1`, `234`, `1.234.567`. */
const HEAD = /^\d{1,3}$/;
const GROUP = /^\d{3}$/;

/** Bentuk akhir yang sah setelah dinormalkan — inilah yang boleh masuk `Number()`. */
const CANONICAL = /^\d+(\.\d+)?$/;

/**
 * Titik-titiknya benar-benar pemisah ribuan yang sah?
 *
 * `1.234.567` ya. `2.50` tidak — dan penolakan itu penting: pembacaan longgar
 * menggabungkannya jadi 250, salah baca yang tidak menyisakan jejak.
 */
function grouped(groups: string[]): boolean {
  return (
    groups.length > 1 &&
    HEAD.test(groups[0]) &&
    groups.slice(1).every((g) => GROUP.test(g))
  );
}

/**
 * Nilai rupiah dari ketikan bebas. Pecahannya dipertahankan apa adanya —
 * pembulatan ke rupiah utuh dilakukan {@link parseRupiahInt}.
 *
 * ```
 * "2.500.000"   => 2500000
 * "2500000"     => 2500000
 * "Rp 2.500.000"=> 2500000
 * "2 500 000"   => 2500000
 * "1.250,50"    => 1250.5
 * "2.50"        => null      titiknya tidak membentuk kelompok ribuan yang sah
 * "12x"         => null
 * ```
 */
export function parseRupiah(
  raw: FormDataEntryValue | string | null | undefined,
): number | null {
  if (raw === null || raw === undefined) return null;

  // "Rp" dan spasi (termasuk spasi tak-terputus hasil tempel dari spreadsheet)
  // ikut dibuang — orang menempel "Rp 2.500.000" apa adanya, dan menolaknya
  // cuma memaksa mereka merapikan yang sudah jelas.
  const cleaned = String(raw).trim().replace(/\s|Rp/gi, "");
  if (cleaned === "") return null;

  const neg = cleaned.startsWith("-");
  let t = neg || cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

  // Pemisah menggantung dirapikan dulu: `2.500.` dibaca 2500, `,5` dibaca 0,5.
  // Bukan soal kelonggaran — kolom ini punya pratinjau hidup, dan tanpa ini
  // "2.500" yang diketik pelan sempat melewati keadaan "2." dan memunculkan
  // peringatan "belum terbaca" di tengah orang mengetik.
  if (t.endsWith(".") || t.endsWith(",")) t = t.slice(0, -1);
  if (t.startsWith(".") || t.startsWith(",")) t = `0${t}`;

  const comma = t.indexOf(",");
  if (comma !== -1) {
    // Koma selalu desimal, tanpa kecuali. Jadi titik yang mendahuluinya sudah
    // pasti pemisah ribuan — `1.234.567,89` tidak punya bacaan lain.
    if (t.indexOf(",", comma + 1) !== -1) return null;
    const groups = t.slice(0, comma).split(".");
    if (groups.length > 1 && !grouped(groups)) return null;
    t = `${groups.join("")}.${t.slice(comma + 1)}`;
  } else {
    const groups = t.split(".");
    if (groups.length > 1) {
      if (!grouped(groups)) return null;
      t = groups.join("");
    }
  }

  if (!CANONICAL.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/**
 * Rupiah utuh. Pecahan sen dibulatkan di sini, satu kali, di pintu masuk —
 * setelah ini seluruh aplikasi hanya berurusan dengan bilangan bulat, jadi
 * tidak ada total yang meleset sesen karena penjumlahan pecahan biner.
 */
export function parseRupiahInt(
  raw: FormDataEntryValue | string | null | undefined,
): number | null {
  const n = parseRupiah(raw);
  return n === null ? null : Math.round(n);
}
