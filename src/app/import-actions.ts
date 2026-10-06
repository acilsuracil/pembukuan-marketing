"use server";

import { revalidatePath } from "next/cache";
import { findHeader, parseCsv, parseRekening, parseTanggal } from "@/lib/csv";
import { one, run, tx as inTransaction } from "@/lib/db";
import { parseRupiahInt } from "@/lib/num";
import { hasPerm, logActivity } from "@/lib/policy";
import { getUser, touchSession } from "@/lib/session";

/** Satu baris hasil pembacaan, siap ditampilkan sebagai pratinjau. */
export interface ImportRow {
  /** Nomor baris di berkas aslinya — supaya yang bermasalah bisa dicari. */
  baris: number;
  tanggal: string;
  platform: string;
  jenisBayar: string;
  divisi: string;
  rekening: string;
  keterangan: string;
  nominal: number;
  /** Kalau terisi, baris ini tidak akan disimpan. */
  error?: string;
}

export interface ImportState {
  ok: boolean;
  error?: string;
  message?: string;
  /** Terisi setelah pratinjau berhasil dibaca. */
  rows?: ImportRow[];
  /** Nama master yang belum ada dan akan dibuat kalau disimpan. */
  baru?: { platform: string[]; jenisBayar: string[]; divisi: string[]; penerima: string[] };
  /** Sudah tersimpan? Dipakai layar untuk berhenti menawarkan tombol simpan. */
  tersimpan?: number;
}

const DENIED: ImportState = { ok: false, error: "Sesi berakhir. Masuk lagi." };
const NO_ACCESS: ImportState = { ok: false, error: "Akses ditolak." };

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Cari master berdasar nama (tanpa peduli besar-kecil huruf). */
function findByName(table: string, name: string): number | null {
  const r = one<{ id: number }>(
    `SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE`,
    name,
  );
  return r?.id ?? null;
}

/**
 * Baca CSV jadi baris-baris siap simpan.
 *
 * Tidak menyentuh database sama sekali: pratinjau dan penyimpanan memakai
 * fungsi yang sama persis, jadi yang dilihat di layar tidak mungkin berbeda
 * dari yang tersimpan.
 */
function bacaCsv(teks: string, divisiDefault: string): { error: string } | { rows: ImportRow[] } {
  const rows = parseCsv(teks);
  const head = findHeader(rows);
  if (!head)
    return {
      error:
        "Kolom Tanggal dan Nominal tidak ketemu. Pastikan yang disalin memuat baris judul kolomnya.",
    };

  const { idx } = head;
  const col = (r: string[], key: string) =>
    idx[key] === undefined ? "" : (r[idx[key]] ?? "").trim();

  const out: ImportRow[] = [];
  for (let i = head.baris + 1; i < rows.length; i++) {
    const r = rows[i];
    const tanggalRaw = col(r, "tanggal");
    const nominalRaw = col(r, "nominal");

    // Baris kosong dan baris pemanis di bawah tabel dilewati diam-diam; yang
    // ditandai galat hanya baris yang jelas bermaksud jadi transaksi.
    if (tanggalRaw === "" && nominalRaw === "") continue;

    const baris = i + 1;
    const divisi = col(r, "divisi") || divisiDefault;
    const dasar = {
      baris,
      tanggal: tanggalRaw,
      platform: col(r, "platform"),
      jenisBayar: col(r, "jenisBayar"),
      divisi,
      rekening: col(r, "rekening"),
      keterangan: col(r, "keterangan"),
      nominal: 0,
    };

    const tanggal = parseTanggal(tanggalRaw);
    if (!tanggal) {
      out.push({ ...dasar, error: `Tanggal "${tanggalRaw}" tidak terbaca.` });
      continue;
    }
    const nominal = parseRupiahInt(nominalRaw);
    if (nominal === null) {
      out.push({ ...dasar, tanggal, error: `Nominal "${nominalRaw}" tidak terbaca.` });
      continue;
    }
    if (nominal <= 0) {
      out.push({ ...dasar, tanggal, error: "Nominal harus lebih besar dari 0." });
      continue;
    }
    if (!dasar.platform) {
      out.push({ ...dasar, tanggal, nominal, error: "Category kosong." });
      continue;
    }
    if (!divisi) {
      out.push({ ...dasar, tanggal, nominal, error: "Divisi kosong." });
      continue;
    }

    out.push({ ...dasar, tanggal, nominal });
  }

  if (out.length === 0) return { error: "Tidak ada baris transaksi yang terbaca." };
  return { rows: out };
}

/** Nama master yang dipakai baris-baris ini tapi belum ada di database. */
function masterBaru(rows: ImportRow[]) {
  const kumpul = (ambil: (r: ImportRow) => string, table: string) => {
    const nama = [...new Set(rows.filter((r) => !r.error).map(ambil).filter(Boolean))];
    return nama.filter((n) => findByName(table, n) === null);
  };
  return {
    platform: kumpul((r) => r.platform, "platform"),
    jenisBayar: kumpul((r) => r.jenisBayar, "jenis_bayar"),
    divisi: kumpul((r) => r.divisi, "divisi"),
    penerima: [
      ...new Set(
        rows
          .filter((r) => !r.error && r.rekening)
          .map((r) => {
            const { bank, noRek, nama } = parseRekening(r.rekening);
            return [bank, noRek, nama].filter(Boolean).join(" ");
          }),
      ),
    ].filter((label) => {
      const noRek = label.match(/\d{6,}/)?.[0] ?? "";
      if (!noRek) return true;
      return (
        one<{ id: number }>(`SELECT id FROM penerima WHERE no_rek = ?`, noRek) ===
        undefined
      );
    }),
  };
}

export async function importCsv(
  _prev: ImportState,
  fd: FormData,
): Promise<ImportState> {
  const me = await getUser();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageMaster") || !hasPerm(me, "addBelanja")) return NO_ACCESS;

  const berkas = fd.get("file");
  const teks =
    berkas instanceof File && berkas.size > 0 ? await berkas.text() : str(fd, "csv");
  if (teks.trim() === "")
    return { ok: false, error: "Belum ada isi CSV — tempel teksnya atau pilih berkasnya." };

  const brandId = Number(str(fd, "brand_id"));
  if (!Number.isInteger(brandId) || brandId <= 0)
    return { ok: false, error: "Brand belum dipilih. Satu tab sheet = satu brand." };
  const brand = one<{ name: string }>(`SELECT name FROM brand WHERE id = ?`, brandId);
  if (!brand) return { ok: false, error: "Brand tidak ditemukan." };

  const divisiDefault = str(fd, "divisi_default");

  const hasil = bacaCsv(teks, divisiDefault);
  if ("error" in hasil) return { ok: false, error: hasil.error };
  const rows = hasil.rows;

  const simpan = str(fd, "mode") === "simpan";
  if (!simpan) {
    const baik = rows.filter((r) => !r.error).length;
    return {
      ok: true,
      rows,
      baru: masterBaru(rows),
      message: `${baik} baris siap disimpan dari ${rows.length} baris terbaca.`,
    };
  }

  const siap = rows.filter((r) => !r.error);
  if (siap.length === 0)
    return { ok: false, rows, error: "Tidak ada baris yang bisa disimpan." };

  const now = new Date().toISOString();

  /** Ambil id master; buat kalau belum ada. */
  function pastikan(table: string, name: string): number {
    const ada = findByName(table, name);
    if (ada !== null) return ada;
    const r = run(
      `INSERT INTO ${table} (name, color_slot, note, created_at) VALUES (?, 1, '', ?)`,
      name, now,
    );
    return Number(r.lastInsertRowid);
  }

  function pastikanPenerima(rekening: string): number | null {
    if (!rekening) return null;
    const { bank, noRek, nama } = parseRekening(rekening);
    const namaFinal = nama || rekening;

    // Nomor rekening lebih dipercaya daripada ejaan nama: sheet menulis orang
    // yang sama dengan spasi dan huruf besar yang berbeda-beda, dan mencocokkan
    // lewat nama akan melahirkan penerima kembar untuk satu rekening.
    if (noRek) {
      const ada = one<{ id: number }>(`SELECT id FROM penerima WHERE no_rek = ?`, noRek);
      if (ada) return ada.id;
    } else {
      // Tanpa nomor rekening, kunci uniknya (nama, bank, no_rek) — dicek lebih
      // dulu supaya baris kedua dengan nama sama tidak menabrak UNIQUE.
      const ada = one<{ id: number }>(
        `SELECT id FROM penerima WHERE nama = ? COLLATE NOCASE AND bank = ? AND no_rek = ''`,
        namaFinal, bank,
      );
      if (ada) return ada.id;
    }

    const r = run(
      `INSERT INTO penerima (nama, bank, no_rek, note, created_at) VALUES (?, ?, ?, ?, ?)`,
      namaFinal, bank, noRek, "", now,
    );
    return Number(r.lastInsertRowid);
  }

  let tersimpan = 0;
  try {
    inTransaction(() => {
      for (const r of siap) {
        const platformId = pastikan("platform", r.platform);
        const divisiId = pastikan("divisi", r.divisi);
        const jenisBayarId = r.jenisBayar ? pastikan("jenis_bayar", r.jenisBayar) : null;
        const penerimaId = pastikanPenerima(r.rekening);

        run(
          `INSERT INTO transaksi (tanggal, jenis, nominal, arah, sumber, dompet_id,
                                  divisi_id, platform_id, brand_id, akun_iklan_id,
                                  penerima_id, jenis_bayar_id, keterangan, no_ref,
                                  created_by, created_at)
           VALUES (?, 'belanja', ?, 1, 'finance', NULL, ?, ?, ?, NULL, ?, ?, ?, '', ?, ?)`,
          r.tanggal, r.nominal, divisiId, platformId, brandId, penerimaId,
          jenisBayarId, r.keterangan, me.id, now,
        );
        tersimpan++;
      }
    });
  } catch (e) {
    return { ok: false, rows, error: `Gagal menyimpan: ${(e as Error).message}` };
  }

  logActivity(me, "impor-csv", `${tersimpan} baris ke brand ${brand.name}`);
  await touchSession(me);
  revalidatePath("/", "layout");
  return {
    ok: true,
    tersimpan,
    message: `${tersimpan} baris tersimpan sebagai pengeluaran brand ${brand.name}.`,
  };
}
