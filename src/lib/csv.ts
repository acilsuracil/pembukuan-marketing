/**
 * Pembacaan CSV ekspor Google Spreadsheet.
 *
 * Modul ini polos — tanpa `"use server"`, tanpa sentuhan database — supaya
 * aturannya bisa diuji sendiri tanpa menyalakan aplikasi, dan supaya pratinjau
 * di layar memakai kode yang sama persis dengan yang menulis ke database.
 *
 * Sheet aslinya bukan tabel bersih: baris pertama judul bulan, blok ringkasan
 * budget menempel di kolom sebelah kanan, dan ada baris kosong penutup. Jadi
 * yang dicari bukan "baris kedua", melainkan baris yang benar-benar memuat
 * nama kolomnya.
 */

/** Pembaca CSV yang menghormati tanda kutip dan koma di dalamnya. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        // Dua kutip berturut-turut berarti satu kutip literal, bukan penutup.
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Nama kolom yang dikenali, dipetakan ke kunci internal. */
const KOLOM: Record<string, string> = {
  tanggal: "tanggal",
  platform: "platform",
  category: "platform",
  divisi: "divisi",
  "jenis pembayaran": "jenisBayar",
  rekening: "rekening",
  keterangan: "keterangan",
  nominal: "nominal",
};

export interface HeaderMap {
  /** Indeks kolom per kunci internal; -1 kalau kolomnya tidak ada. */
  idx: Record<string, number>;
  /** Nomor baris header (0-based) di dalam CSV. */
  baris: number;
}

/**
 * Cari baris header.
 *
 * Syaratnya memuat "Tanggal" **dan** "Nominal" — dua kolom yang tanpanya tidak
 * ada yang bisa diimpor. Mencari salah satu saja membuat judul blok ringkasan
 * ikut terbaca sebagai header.
 */
export function findHeader(rows: string[][]): HeaderMap | null {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const idx: Record<string, number> = {};
    rows[r].forEach((raw, c) => {
      const key = KOLOM[raw.trim().toLowerCase()];
      // Kolom pertama yang cocok yang dipakai: blok ringkasan di kanan kadang
      // memakai kata yang sama, dan yang kanan bukan tabel transaksinya.
      if (key && idx[key] === undefined) idx[key] = c;
    });
    if (idx.tanggal !== undefined && idx.nominal !== undefined)
      return { idx, baris: r };
  }
  return null;
}

/**
 * Tanggal sheet ke bentuk simpan `YYYY-MM-DD`.
 *
 * `01/09/2026` dibaca hari/bulan/tahun — urutan yang dipakai sheet ini dan
 * lazim di Indonesia. Menebaknya terbalik akan memindahkan transaksi ke bulan
 * yang salah tanpa satu pun galat yang kelihatan, jadi bentuk yang tidak jelas
 * ditolak, bukan dikira-kira.
 */
export function parseTanggal(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const [, d, b, y] = m;
  const hari = Number(d);
  const bulan = Number(b);
  if (bulan < 1 || bulan > 12 || hari < 1 || hari > 31) return null;

  const iso = `${y}-${String(bulan).padStart(2, "0")}-${String(hari).padStart(2, "0")}`;
  // Dibandingkan balik supaya 31 April tidak diam-diam jadi 1 Mei.
  const cek = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(cek.getTime()) || cek.getUTCDate() !== hari) return null;
  return iso;
}

export interface Rekening {
  bank: string;
  noRek: string;
  nama: string;
}

/**
 * Urai satu sel rekening jadi bank / nomor / nama.
 *
 * Sheet aslinya memakai empat gaya pemisah sekaligus:
 *
 * ```
 * DANA // 3901083139626976 // NUR AINA
 * DANA 3901085348361718 A/N MUHAMMAD ALIMIN
 * 901546535570 /SEABANK / RIKI WAHYU PRATAMA
 * SEA BANK 901274779493 A/N  Baso Muh. Nawwar
 * ```
 *
 * Yang paling bisa dipercaya dari keempatnya adalah nomor rekeningnya: deretan
 * angka panjang. Jadi nomornya dicabut lebih dulu, baru sisanya dipecah — bukan
 * sebaliknya. Urutan bank dan nama pun jadi tidak penting lagi.
 */
export function parseRekening(raw: string): Rekening {
  const asli = raw.trim();
  if (asli === "") return { bank: "", noRek: "", nama: "" };

  // "A/N" adalah pemisah, bukan bagian nama.
  const s = asli.replace(/\ba[./]?n\b/gi, "/");

  const m = s.match(/\d{6,}/);
  const noRek = m ? m[0] : "";
  const sisa = m ? s.replace(noRek, "/") : s;

  const bagian = sisa
    .split(/[/|]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (bagian.length === 0) return { bank: "", noRek, nama: asli };
  if (bagian.length === 1)
    // Satu potong saja: tanpa nomor rekening itu namanya, dengan nomor
    // rekening itu banknya dan namanya memang tidak ditulis.
    return noRek
      ? { bank: bagian[0], noRek, nama: "" }
      : { bank: "", noRek, nama: bagian[0] };

  return { bank: bagian[0], noRek, nama: bagian.slice(1).join(" ") };
}
