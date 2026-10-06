import crypto from "node:crypto";
import {
  buktiProblem,
  buktiTotalProblem,
  EXT_BY_MIME,
  MAX_BUKTI_PER_TX,
} from "./bukti";
import { one, run, tx as inTransaction } from "./db";
import { fmtIdr, todayISO } from "./format";
import { isLocked, lockError, logActivity, type Principal } from "./policy";
import { attachmentsOf, brandPengajuan } from "./queries";
import { skalakan } from "./split";
import { putObject } from "./storage";
import type { PengajuanRow } from "./types";

/**
 * Pencatatan dana cair, dipakai bersama oleh tombol di aplikasi dan tombol 💸
 * di Telegram. Satu jalur, supaya aturan bukti, pembagian brand, dan rollback
 * tidak pernah berbeda tergantung dari mana orang menekan tombolnya.
 */

/** Siapa yang mencatat — akun aplikasi, entah dari sesi browser atau dari Telegram. */
export type Pelaku = Pick<Principal, "id" | "username" | "role">;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Alasan sekumpulan bukti ditolak sebelum apa pun ditulis, atau null. */
export function buktiRejection(files: File[], sudahAda = 0): string | null {
  if (sudahAda + files.length > MAX_BUKTI_PER_TX)
    return `Maksimal ${MAX_BUKTI_PER_TX} bukti per transaksi (sekarang sudah ${sudahAda}).`;
  for (const f of files) {
    const problem = buktiProblem(f);
    if (problem) return problem;
  }
  return buktiTotalProblem(files);
}

/**
 * Menyimpan berkas bukti + mencatat barisnya. Mengembalikan pesan galat, atau
 * null kalau semuanya tersimpan.
 *
 * Diunggah serentak: tiap berkas satu round-trip ke penyimpanan dan tidak saling
 * bergantung, jadi mengunggahnya berurutan cuma membuat orang menunggu
 * penjumlahan seluruh latensinya. Batas gabungan yang sudah diperiksa di
 * `buktiRejection` sekaligus jadi pagar memorinya.
 */
export async function saveBukti(
  txId: number,
  files: File[],
  user: Pick<Principal, "id">,
): Promise<string | null> {
  if (files.length === 0) return null;
  const now = new Date().toISOString();

  const uploads = await Promise.all(
    files.map(async (f) => {
      const stored = `${crypto.randomUUID()}${EXT_BY_MIME[f.type]}`;
      try {
        const buf = Buffer.from(await f.arrayBuffer());
        return {
          ok: true as const,
          f,
          stored,
          backend: await putObject(stored, buf, f.type),
        };
      } catch (e) {
        return { ok: false as const, f, message: (e as Error).message };
      }
    }),
  );

  // Baris hanya dicatat untuk berkas yang benar-benar tersimpan, supaya tidak
  // ada bukti yatim yang tampil di UI tapi tidak bisa dibuka. Ditulis dalam
  // urutan berkas aslinya, bukan urutan siapa yang selesai lebih dulu.
  for (const u of uploads) {
    if (!u.ok) continue;
    run(
      `INSERT INTO attachments
         (id, tx_id, stored_name, orig_name, mime, size, uploaded_by, created_at, storage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(), txId, u.stored, u.f.name.slice(0, 160), u.f.type,
      u.f.size, user.id, now, u.backend,
    );
  }

  const failed = uploads.flatMap((u) => (u.ok ? [] : [u]));
  if (failed.length === 0) return null;
  return (
    `${failed.length} dari ${uploads.length} bukti gagal diunggah — ` +
    failed.map((u) => `"${u.f.name}"`).join(", ") +
    `. (${failed[0].message})`
  );
}

export interface InputBayar {
  /** YYYY-MM-DD; kosong = hari ini. */
  tanggal?: string;
  /** Yang benar-benar cair. 0/null = penuh sesuai pengajuan. */
  nominalCair?: number | null;
  noRef?: string;
  catatan?: string;
  files: File[];
  /** Bukti berupa link (mis. Google Drive). Sudah divalidasi http/https. */
  links: string[];
}

export type HasilBayar =
  | { ok: true; message: string; txId: number; nominal: number }
  | { ok: false; error: string };

/**
 * Menandai pengajuan dibayar dan melahirkan baris buku besarnya.
 *
 * Inilah satu-satunya tempat dana finance masuk pembukuan, dan bentuk barisnya
 * ditentukan rutenya: rute langsung jadi **belanja** (biaya langsung tercatat),
 * rute dompet jadi **top-up** (saldo naik, belum jadi biaya). Kalau rute dompet
 * ikut dicatat sebagai belanja, setiap iklan yang dibayar dari dompet akan
 * terhitung dua kali.
 */
export async function catatPembayaran(
  g: PengajuanRow,
  me: Pelaku,
  input: InputBayar,
): Promise<HasilBayar> {
  if (g.status === "dibayar") return { ok: false, error: "Pengajuan ini sudah dibayar." };
  // Finance hanya membayar yang sudah lolos leader dan penyetuju pembayaran.
  if (g.status !== "disetujui")
    return {
      ok: false,
      error: "Pengajuan ini belum disetujui penyetuju pembayaran, jadi belum boleh dibayar.",
    };
  if (g.tx_count > 0)
    return {
      ok: false,
      error: `Pengajuan ini sudah punya ${g.tx_count} baris buku besar. Periksa dulu di daftar transaksi.`,
    };
  if (
    one(
      `SELECT 1 FROM pengajuan_persetujuan
       WHERE pengajuan_id = ? AND tahap = 'bayar' AND setuju = 1 AND user_id = ?`,
      g.id, me.id,
    )
  )
    return {
      ok: false,
      error: "Penyetuju pembayaran tidak bisa sekaligus membayar pengajuan yang ia setujui.",
    };

  const tanggalBayar = input.tanggal || todayISO();
  if (!ISO_DATE.test(tanggalBayar))
    return { ok: false, error: "Tanggal cair belum diisi dengan benar." };
  if (isLocked(tanggalBayar)) return { ok: false, error: lockError(tanggalBayar) };

  const cair = input.nominalCair ?? 0;
  const nominal = cair > 0 ? cair : g.nominal;

  if (g.tujuan === "langsung" && !g.divisi_id)
    return {
      ok: false,
      error: "Isi divisinya dulu di pengajuan — tanpa itu pengeluarannya tidak masuk laporan mana pun.",
    };

  /*
   * Bukti transfer wajib, dan diperiksa **sebelum** apa pun ditulis — berupa
   * gambar, link, atau keduanya.
   *
   * Dana cair adalah satu-satunya titik di alur ini yang tidak bisa diperiksa
   * ulang dari data lain: pengajuan hanya menyatakan permintaan, dan begitu
   * ditandai dibayar seluruh laporan mempercayainya. Bukti transfer inilah
   * satu-satunya penambat ke kenyataan — jadi urutannya validasi dulu, tulis
   * kemudian, supaya tidak pernah ada baris buku besar yang lahir tanpa bukti.
   */
  const { files, links } = input;
  if (files.length === 0 && links.length === 0)
    return {
      ok: false,
      error:
        "Lampirkan bukti transfernya dulu — gambar atau link. Tangkapan layar mutasi bisa langsung ditempel dengan Ctrl/⌘ + V.",
    };
  const rejection = buktiRejection(files);
  if (rejection) return { ok: false, error: rejection };

  /*
   * Pembagian ke beberapa brand melahirkan **satu baris per brand**, bukan satu
   * baris dengan daftar brand. Dengan begitu setiap baris tetap punya tepat satu
   * brand, sehingga laporan per brand, matriks, filter, dan ekspor CSV tetap
   * benar tanpa diubah sama sekali — dan jumlah pecahannya sama persis dengan
   * uang yang cair.
   *
   * Kalau yang cair berbeda dari yang diminta, porsinya diskalakan dengan
   * perbandingan yang sama; jumlahnya tetap dijamin pas oleh `skalakan`.
   */
  const porsiTersimpan = brandPengajuan(g.id);
  const bagian =
    porsiTersimpan.length > 0
      ? skalakan(
          porsiTersimpan.map((p) => p.nominal),
          nominal,
        ).map((n, i) => ({ brandId: porsiTersimpan[i].brand_id, nominal: n }))
      : [{ brandId: g.brand_id, nominal }];
  const grup = bagian.length > 1 ? crypto.randomUUID() : null;
  const noRef = input.noRef ?? "";

  const now = new Date().toISOString();
  let txId: number;
  try {
    txId = inTransaction(() => {
      let head = 0;
      for (const b of bagian) {
        const res =
          g.tujuan === "dompet"
            ? run(
                `INSERT INTO transaksi (tanggal, jenis, nominal, dompet_id, brand_id,
                                        pengajuan_id, keterangan, no_ref, split_group,
                                        created_by, created_at)
                 VALUES (?, 'topup', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                tanggalBayar, b.nominal, g.dompet_id, b.brandId, g.id,
                g.keterangan, noRef, grup, me.id, now,
              )
            : run(
                `INSERT INTO transaksi (tanggal, jenis, nominal, sumber, divisi_id, platform_id,
                                        brand_id, penerima_id, pengajuan_id, keterangan, no_ref,
                                        split_group, created_by, created_at)
                 VALUES (?, 'belanja', ?, 'finance', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                tanggalBayar, b.nominal, g.divisi_id, g.platform_id, b.brandId,
                g.penerima_id, g.id, g.keterangan, noRef, grup, me.id, now,
              );
        // Bukti menempel pada pecahan pertama: buktinya milik pembayarannya,
        // bukan milik salah satu porsi.
        if (head === 0) head = Number(res.lastInsertRowid);
      }
      run(
        `UPDATE pengajuan SET status = 'dibayar', tanggal_bayar = ?, nominal_cair = ?,
                bukti_links = ?, catatan = ?, updated_at = ? WHERE id = ?`,
        tanggalBayar,
        cair > 0 && cair !== g.nominal ? cair : null,
        links.join("\n"),
        input.catatan || g.catatan,
        now,
        g.id,
      );
      return head;
    });
  } catch (e) {
    return { ok: false, error: `Gagal mencatat pembayaran: ${(e as Error).message}` };
  }

  /*
   * Bukti disimpan setelah barisnya ada — ia butuh tx_id. Kalau buktinya cuma
   * gambar dan tidak ada satu pun yang berhasil tersimpan, pencatatannya
   * dibatalkan seluruhnya: lebih baik orang mengulang daripada meninggalkan
   * dana cair tanpa bukti, karena keadaan itulah yang justru dicegah aturan ini.
   */
  const masalahBukti = await saveBukti(txId, files, me);
  if (files.length > 0 && links.length === 0 && attachmentsOf(txId).length === 0) {
    inTransaction(() => {
      // Seluruh pecahannya, bukan cuma yang memegang bukti: pembagian yang
      // tersisa separuh akan menjumlah lebih kecil dari uang yang cair.
      run(`DELETE FROM transaksi WHERE pengajuan_id = ?`, g.id);
      run(
        `UPDATE pengajuan SET status = ?, tanggal_bayar = NULL, nominal_cair = NULL,
                bukti_links = '', updated_at = ? WHERE id = ?`,
        g.status, new Date().toISOString(), g.id,
      );
    });
    return {
      ok: false,
      error: `Pembayaran dibatalkan karena buktinya gagal diunggah. ${masalahBukti ?? ""}`.trim(),
    };
  }

  logActivity(
    me,
    "bayar-pengajuan",
    `#${g.id} ${fmtIdr(nominal)} → ${g.tujuan === "dompet" ? `top-up ${g.dompet_name}` : "pengeluaran"}` +
      (bagian.length > 1 ? `, dibagi ke ${bagian.length} brand` : ""),
  );
  const jumlahBukti = attachmentsOf(txId).length + links.length;
  return {
    ok: true,
    txId,
    nominal,
    message:
      (g.tujuan === "dompet"
        ? `Dana ${fmtIdr(nominal)} masuk ${g.dompet_name}. Pengeluarannya dicatat menyusul dari input harian.`
        : `Pengeluaran ${fmtIdr(nominal)} tercatat.`) +
      (bagian.length > 1
        ? ` Dibagi jadi ${bagian.length} baris: ${bagian
            .map((b, i) => `${porsiTersimpan[i].brand_name} ${fmtIdr(b.nominal)}`)
            .join(", ")}.`
        : "") +
      ` ${jumlahBukti} bukti terlampir.` +
      // Sebagian bukti gagal bukan alasan menggagalkan pencatatannya, tapi harus
      // dikatakan — yang gagal perlu diunggah ulang dari halaman detail.
      (masalahBukti ? ` ${masalahBukti}` : ""),
  };
}
