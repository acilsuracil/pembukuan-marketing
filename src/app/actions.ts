"use server";

import { revalidatePath } from "next/cache";
import { hashPassword, passwordProblem } from "@/lib/auth";
import { createBackup, removeBackup, restoreBackup } from "@/lib/backup";
import { run, setSetting, tx as inTransaction } from "@/lib/db";
import { fmtIdr, todayISO } from "@/lib/format";
import { JENIS_MANUAL } from "@/lib/jenis";
import { parseRupiahInt } from "@/lib/num";
import { SLOT_COUNT } from "@/lib/palette";
import {
  hasPerm,
  isLocked,
  isOwner,
  lockError,
  logActivity,
  PERM_KEYS,
  setRolePerms,
  type PermMap,
} from "@/lib/policy";
import {
  countActiveOwners,
  getDompet,
  getPengajuan,
  getSaldoDompet,
  getTransaksi,
  getUserById,
  masterUsage,
} from "@/lib/queries";
import { getUser, touchSession, type SessionUser } from "@/lib/session";
import type { Jenis, PengajuanStatus, Sumber, Tujuan } from "@/lib/types";

export interface ActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

const DENIED: ActionState = { ok: false, error: "Sesi berakhir. Silakan login lagi." };
const NO_ACCESS: ActionState = {
  ok: false,
  error: "Akun kamu tidak punya izin untuk melakukan ini.",
};
const OWNER_ONLY: ActionState = {
  ok: false,
  error: "Hanya owner yang bisa melakukan ini.",
};

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function refresh() {
  revalidatePath("/", "layout");
}

async function authed(): Promise<SessionUser | null> {
  return getUser();
}

/**
 * Membaca satu kolom nominal.
 *
 * Tiga keadaannya dibedakan karena kolom nominal bukan `type="number"`: browser
 * tidak menyaring ketikan yang bukan angka, jadi "2jt" benar-benar sampai ke
 * sini. Membacanya sebagai 0 berarti menyimpan biaya nol untuk ketikan yang
 * jelas bermaksud lain, tanpa memberi tahu siapa pun.
 */
type NumRead =
  | { kind: "empty" }
  | { kind: "ok"; n: number }
  | { kind: "bad"; text: string };

function readMoney(fd: FormData, key: string): NumRead {
  const text = str(fd, key);
  if (text === "") return { kind: "empty" };
  const n = parseRupiahInt(text);
  return n === null ? { kind: "bad", text } : { kind: "ok", n };
}

const notANumber = (label: string, text: string) =>
  `${label} "${text}" tidak terbaca sebagai angka rupiah.`;

/** Kolom wajib: kosong pun galat. */
function requiredMoney(
  fd: FormData,
  key: string,
  label: string,
): { ok: false; error: string } | { ok: true; n: number } {
  const r = readMoney(fd, key);
  if (r.kind === "bad") return { ok: false, error: notANumber(label, r.text) };
  if (r.kind === "empty") return { ok: false, error: `${label} belum diisi.` };
  if (r.n <= 0) return { ok: false, error: `${label} harus lebih besar dari 0.` };
  return { ok: true, n: r.n };
}

/** Kolom opsional: kosong berarti 0, tapi ketikan yang tak terbaca tetap galat. */
function optionalMoney(
  fd: FormData,
  key: string,
  label: string,
): { ok: false; error: string } | { ok: true; n: number } {
  const r = readMoney(fd, key);
  if (r.kind === "bad") return { ok: false, error: notANumber(label, r.text) };
  if (r.kind === "ok" && r.n < 0) return { ok: false, error: `${label} tidak boleh negatif.` };
  return { ok: true, n: r.kind === "empty" ? 0 : r.n };
}

/** Kolom pilihan (select) yang boleh kosong. */
function optionalId(
  fd: FormData,
  key: string,
  label: string,
): { ok: false; error: string } | { ok: true; id: number | null } {
  const raw = str(fd, key);
  if (raw === "") return { ok: true, id: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return { ok: false, error: `${label} tidak valid.` };
  return { ok: true, id: n };
}

function readSlot(fd: FormData): number {
  const slot = Number(str(fd, "color_slot"));
  return Number.isInteger(slot) && slot >= 1 && slot <= SLOT_COUNT ? slot : 1;
}

function uniqueError(e: unknown, what: string, name: string): ActionState {
  const msg = (e as Error).message;
  if (msg.includes("UNIQUE")) return { ok: false, error: `${what} "${name}" sudah ada.` };
  return { ok: false, error: `Gagal menyimpan: ${msg}` };
}

/* ============================================================ data master */

export async function saveDivisi(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageMaster")) return NO_ACCESS;

  const idRead = optionalId(fd, "id", "Divisi");
  if (!idRead.ok) return { ok: false, error: idRead.error };
  const name = str(fd, "name");
  if (name.length < 2) return { ok: false, error: "Nama divisi minimal 2 karakter." };

  const budget = optionalMoney(fd, "budget_idr", "Budget bulanan");
  if (!budget.ok) return { ok: false, error: budget.error };

  try {
    if (idRead.id) {
      run(
        `UPDATE divisi SET name = ?, color_slot = ?, budget_idr = ?, note = ? WHERE id = ?`,
        name, readSlot(fd), budget.n, str(fd, "note"), idRead.id,
      );
    } else {
      run(
        `INSERT INTO divisi (name, color_slot, budget_idr, note, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        name, readSlot(fd), budget.n, str(fd, "note"), new Date().toISOString(),
      );
    }
  } catch (e) {
    return uniqueError(e, "Divisi", name);
  }

  logActivity(me, idRead.id ? "ubah-divisi" : "tambah-divisi", name);
  await touchSession(me);
  refresh();
  return { ok: true, message: idRead.id ? "Divisi diperbarui." : "Divisi ditambahkan." };
}

export async function saveBrand(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageMaster")) return NO_ACCESS;

  const idRead = optionalId(fd, "id", "Brand");
  if (!idRead.ok) return { ok: false, error: idRead.error };
  const name = str(fd, "name");
  if (name.length < 2) return { ok: false, error: "Nama brand minimal 2 karakter." };

  const budget = optionalMoney(fd, "budget_idr", "Budget bulanan");
  if (!budget.ok) return { ok: false, error: budget.error };

  try {
    if (idRead.id) {
      run(
        `UPDATE brand SET name = ?, pic = ?, color_slot = ?, budget_idr = ?, note = ?
         WHERE id = ?`,
        name, str(fd, "pic"), readSlot(fd), budget.n, str(fd, "note"), idRead.id,
      );
    } else {
      run(
        `INSERT INTO brand (name, pic, color_slot, budget_idr, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        name, str(fd, "pic"), readSlot(fd), budget.n, str(fd, "note"),
        new Date().toISOString(),
      );
    }
  } catch (e) {
    return uniqueError(e, "Brand", name);
  }

  logActivity(me, idRead.id ? "ubah-brand" : "tambah-brand", name);
  await touchSession(me);
  refresh();
  return { ok: true, message: idRead.id ? "Brand diperbarui." : "Brand ditambahkan." };
}

export async function savePlatform(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageMaster")) return NO_ACCESS;

  const idRead = optionalId(fd, "id", "Platform");
  if (!idRead.ok) return { ok: false, error: idRead.error };
  const name = str(fd, "name");
  if (name.length < 2) return { ok: false, error: "Nama platform minimal 2 karakter." };

  const divisi = optionalId(fd, "divisi_id", "Divisi");
  if (!divisi.ok) return { ok: false, error: divisi.error };
  const dompet = optionalId(fd, "dompet_id", "Dompet");
  if (!dompet.ok) return { ok: false, error: dompet.error };

  try {
    if (idRead.id) {
      run(
        `UPDATE platform SET name = ?, divisi_id = ?, dompet_id = ?, color_slot = ?, note = ?
         WHERE id = ?`,
        name, divisi.id, dompet.id, readSlot(fd), str(fd, "note"), idRead.id,
      );
    } else {
      run(
        `INSERT INTO platform (name, divisi_id, dompet_id, color_slot, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        name, divisi.id, dompet.id, readSlot(fd), str(fd, "note"),
        new Date().toISOString(),
      );
    }
  } catch (e) {
    return uniqueError(e, "Platform", name);
  }

  logActivity(me, idRead.id ? "ubah-platform" : "tambah-platform", name);
  await touchSession(me);
  refresh();
  return {
    ok: true,
    message: idRead.id ? "Platform diperbarui." : "Platform ditambahkan.",
  };
}

export async function saveAkunIklan(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageMaster")) return NO_ACCESS;

  const idRead = optionalId(fd, "id", "Akun iklan");
  if (!idRead.ok) return { ok: false, error: idRead.error };
  const platform = optionalId(fd, "platform_id", "Platform");
  if (!platform.ok) return { ok: false, error: platform.error };
  if (!platform.id) return { ok: false, error: "Akun iklan harus menyebut platformnya." };

  const name = str(fd, "name");
  if (name.length < 2) return { ok: false, error: "Nama akun iklan minimal 2 karakter." };

  const brand = optionalId(fd, "brand_id", "Brand");
  if (!brand.ok) return { ok: false, error: brand.error };
  const dompet = optionalId(fd, "dompet_id", "Dompet");
  if (!dompet.ok) return { ok: false, error: dompet.error };

  try {
    if (idRead.id) {
      run(
        `UPDATE akun_iklan SET platform_id = ?, name = ?, brand_id = ?, dompet_id = ?, note = ?
         WHERE id = ?`,
        platform.id, name, brand.id, dompet.id, str(fd, "note"), idRead.id,
      );
    } else {
      run(
        `INSERT INTO akun_iklan (platform_id, name, brand_id, dompet_id, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        platform.id, name, brand.id, dompet.id, str(fd, "note"),
        new Date().toISOString(),
      );
    }
  } catch (e) {
    return uniqueError(e, "Akun iklan", name);
  }

  logActivity(me, idRead.id ? "ubah-akun-iklan" : "tambah-akun-iklan", name);
  await touchSession(me);
  refresh();
  return { ok: true, message: idRead.id ? "Akun iklan diperbarui." : "Akun iklan ditambahkan." };
}

export async function savePenerima(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageMaster")) return NO_ACCESS;

  const idRead = optionalId(fd, "id", "Penerima");
  if (!idRead.ok) return { ok: false, error: idRead.error };
  const nama = str(fd, "nama");
  if (nama.length < 2) return { ok: false, error: "Nama penerima minimal 2 karakter." };

  const bank = str(fd, "bank");
  const noRek = str(fd, "no_rek");
  if (noRek !== "" && !/^[0-9 .-]{4,32}$/.test(noRek))
    return { ok: false, error: "Nomor rekening hanya angka, spasi, titik, atau strip." };

  try {
    if (idRead.id) {
      run(
        `UPDATE penerima SET nama = ?, bank = ?, no_rek = ?, note = ? WHERE id = ?`,
        nama, bank, noRek, str(fd, "note"), idRead.id,
      );
    } else {
      run(
        `INSERT INTO penerima (nama, bank, no_rek, note, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        nama, bank, noRek, str(fd, "note"), new Date().toISOString(),
      );
    }
  } catch (e) {
    return uniqueError(e, "Rekening penerima", nama);
  }

  logActivity(me, idRead.id ? "ubah-penerima" : "tambah-penerima", `${nama} ${bank} ${noRek}`);
  await touchSession(me);
  refresh();
  return { ok: true, message: idRead.id ? "Penerima diperbarui." : "Penerima ditambahkan." };
}

export async function saveDompet(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageDompet")) return NO_ACCESS;

  const idRead = optionalId(fd, "id", "Dompet");
  if (!idRead.ok) return { ok: false, error: idRead.error };
  const name = str(fd, "name");
  if (name.length < 2) return { ok: false, error: "Nama dompet minimal 2 karakter." };

  const jenis = str(fd, "jenis");
  if (jenis !== "bank" && jenis !== "ewallet" && jenis !== "lain")
    return { ok: false, error: "Jenis dompet tidak valid." };

  const tanggalAwal = str(fd, "tanggal_awal");
  if (!ISO_DATE.test(tanggalAwal))
    return { ok: false, error: "Tanggal saldo awal belum diisi dengan benar." };

  const saldoAwal = optionalMoney(fd, "saldo_awal", "Saldo awal");
  if (!saldoAwal.ok) return { ok: false, error: saldoAwal.error };
  const minSaldo = optionalMoney(fd, "min_saldo", "Batas saldo minimum");
  if (!minSaldo.ok) return { ok: false, error: minSaldo.error };

  try {
    if (idRead.id) {
      run(
        `UPDATE dompet SET name = ?, jenis = ?, bank = ?, no_rek = ?, pemilik = ?,
                           saldo_awal = ?, tanggal_awal = ?, min_saldo = ?, note = ?
         WHERE id = ?`,
        name, jenis, str(fd, "bank"), str(fd, "no_rek"), str(fd, "pemilik"),
        saldoAwal.n, tanggalAwal, minSaldo.n, str(fd, "note"), idRead.id,
      );
    } else {
      run(
        `INSERT INTO dompet (name, jenis, bank, no_rek, pemilik, saldo_awal,
                             tanggal_awal, min_saldo, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        name, jenis, str(fd, "bank"), str(fd, "no_rek"), str(fd, "pemilik"),
        saldoAwal.n, tanggalAwal, minSaldo.n, str(fd, "note"),
        new Date().toISOString(),
      );
    }
  } catch (e) {
    return uniqueError(e, "Dompet", name);
  }

  // Saldo awal ikut tercatat di log: mengubahnya menggeser seluruh saldo
  // berjalan dompet ini, dan itu harus punya jejak siapa dan kapan.
  logActivity(
    me,
    idRead.id ? "ubah-dompet" : "tambah-dompet",
    `${name} — saldo awal ${fmtIdr(saldoAwal.n)} per ${tanggalAwal}`,
  );
  await touchSession(me);
  refresh();
  return { ok: true, message: idRead.id ? "Dompet diperbarui." : "Dompet ditambahkan." };
}

/* --------------------------------------------------- arsip & hapus master */

type MasterKind = "divisi" | "platform" | "brand" | "penerima" | "dompet" | "akun_iklan";

const MASTER: Record<MasterKind, { table: string; label: string; perm: "manageMaster" | "manageDompet" }> = {
  divisi: { table: "divisi", label: "Divisi", perm: "manageMaster" },
  platform: { table: "platform", label: "Platform", perm: "manageMaster" },
  brand: { table: "brand", label: "Brand", perm: "manageMaster" },
  penerima: { table: "penerima", label: "Penerima", perm: "manageMaster" },
  akun_iklan: { table: "akun_iklan", label: "Akun iklan", perm: "manageMaster" },
  dompet: { table: "dompet", label: "Dompet", perm: "manageDompet" },
};

function readKind(fd: FormData): MasterKind | null {
  const k = str(fd, "kind");
  return Object.prototype.hasOwnProperty.call(MASTER, k) ? (k as MasterKind) : null;
}

export async function toggleArchiveMaster(fd: FormData): Promise<void> {
  const me = await authed();
  if (!me) return;
  const kind = readKind(fd);
  if (!kind || !hasPerm(me, MASTER[kind].perm)) return;
  const id = Number(str(fd, "id"));
  if (!Number.isInteger(id) || id <= 0) return;

  run(`UPDATE ${MASTER[kind].table} SET archived = 1 - archived WHERE id = ?`, id);
  logActivity(me, `arsip-${kind}`, `#${id}`);
  refresh();
}

export async function deleteMaster(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  const kind = readKind(fd);
  if (!kind) return { ok: false, error: "Jenis data tidak valid." };
  if (!hasPerm(me, MASTER[kind].perm)) return NO_ACCESS;

  const id = Number(str(fd, "id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "ID tidak valid." };

  // Master yang sudah terpakai hanya boleh diarsipkan: menghapusnya melepas
  // tautan baris-baris lama dan mengubah laporan periode yang sudah selesai.
  const used = masterUsage(kind, id);
  if (used > 0)
    return {
      ok: false,
      error: `${MASTER[kind].label} ini dipakai ${used} baris. Arsipkan saja supaya riwayatnya tetap utuh.`,
    };

  run(`DELETE FROM ${MASTER[kind].table} WHERE id = ?`, id);
  logActivity(me, `hapus-${kind}`, `#${id}`);
  await touchSession(me);
  refresh();
  return { ok: true, message: `${MASTER[kind].label} dihapus.` };
}

/* ============================================================== pengajuan */

interface PengajuanValues {
  tanggal: string;
  keterangan: string;
  nominal: number;
  tujuan: Tujuan;
  penerimaId: number | null;
  dompetId: number | null;
  brandId: number | null;
  platformId: number | null;
  divisiId: number | null;
  catatan: string;
}

function readPengajuan(
  fd: FormData,
): { ok: false; error: string } | { ok: true; v: PengajuanValues } {
  const tanggal = str(fd, "tanggal");
  if (!ISO_DATE.test(tanggal))
    return { ok: false, error: "Tanggal belum diisi dengan benar." };

  const keterangan = str(fd, "keterangan");
  if (keterangan.length < 3)
    return { ok: false, error: "Keterangan minimal 3 karakter — ini yang dibaca finance." };

  const nominal = requiredMoney(fd, "nominal", "Nominal");
  if (!nominal.ok) return { ok: false, error: nominal.error };

  const tujuan = str(fd, "tujuan");
  if (tujuan !== "langsung" && tujuan !== "dompet")
    return { ok: false, error: "Tujuan dana tidak valid." };

  const penerima = optionalId(fd, "penerima_id", "Penerima");
  if (!penerima.ok) return { ok: false, error: penerima.error };
  const dompet = optionalId(fd, "dompet_id", "Dompet");
  if (!dompet.ok) return { ok: false, error: dompet.error };
  const brand = optionalId(fd, "brand_id", "Brand");
  if (!brand.ok) return { ok: false, error: brand.error };
  const platform = optionalId(fd, "platform_id", "Platform");
  if (!platform.ok) return { ok: false, error: platform.error };
  const divisi = optionalId(fd, "divisi_id", "Divisi");
  if (!divisi.ok) return { ok: false, error: divisi.error };

  if (tujuan === "dompet" && !dompet.id)
    return {
      ok: false,
      error: "Rute dompet harus menyebut dompet tujuannya, kalau tidak dana cair tidak punya tempat mendarat.",
    };
  if (tujuan === "langsung" && !penerima.id)
    return {
      ok: false,
      error: "Rute langsung harus menyebut rekening penerimanya — itu yang dikirim ke finance.",
    };
  if (!divisi.id) return { ok: false, error: "Divisi wajib diisi." };

  return {
    ok: true,
    v: {
      tanggal,
      keterangan,
      nominal: nominal.n,
      tujuan,
      penerimaId: tujuan === "langsung" ? penerima.id : null,
      dompetId: tujuan === "dompet" ? dompet.id : null,
      brandId: brand.id,
      platformId: platform.id,
      divisiId: divisi.id,
      catatan: str(fd, "catatan"),
    },
  };
}

export async function savePengajuan(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;

  const idRead = optionalId(fd, "id", "Pengajuan");
  if (!idRead.ok) return { ok: false, error: idRead.error };
  const editing = idRead.id !== null;
  if (!hasPerm(me, editing ? "editPengajuan" : "addPengajuan")) return NO_ACCESS;

  const parsed = readPengajuan(fd);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { v } = parsed;

  if (editing) {
    const before = getPengajuan(idRead.id!);
    if (!before) return { ok: false, error: "Pengajuan tidak ditemukan." };
    // Yang dananya sudah cair tidak boleh diubah lewat pintu ini: baris buku
    // besarnya sudah lahir dari angka lama, dan mengubahnya di sini akan
    // membuat pengajuan dan pembukuan bercerita dua hal berbeda.
    if (before.status === "dibayar")
      return {
        ok: false,
        error: "Pengajuan yang sudah dibayar tidak bisa diubah. Batalkan pembayarannya dulu.",
      };
    run(
      `UPDATE pengajuan SET tanggal = ?, keterangan = ?, nominal = ?, tujuan = ?,
              penerima_id = ?, dompet_id = ?, brand_id = ?, platform_id = ?,
              divisi_id = ?, catatan = ?, updated_at = ?
       WHERE id = ?`,
      v.tanggal, v.keterangan, v.nominal, v.tujuan, v.penerimaId, v.dompetId,
      v.brandId, v.platformId, v.divisiId, v.catatan, new Date().toISOString(),
      idRead.id,
    );
    logActivity(me, "ubah-pengajuan", `#${idRead.id} ${fmtIdr(v.nominal)}`);
  } else {
    const status = str(fd, "status") === "diajukan" ? "diajukan" : "draft";
    run(
      `INSERT INTO pengajuan (tanggal, keterangan, nominal, tujuan, penerima_id,
                              dompet_id, brand_id, platform_id, divisi_id, status,
                              catatan, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      v.tanggal, v.keterangan, v.nominal, v.tujuan, v.penerimaId, v.dompetId,
      v.brandId, v.platformId, v.divisiId, status, v.catatan, me.id,
      new Date().toISOString(),
    );
    logActivity(me, "tambah-pengajuan", `${fmtIdr(v.nominal)} — ${v.keterangan}`);
  }

  await touchSession(me);
  refresh();
  return {
    ok: true,
    message: editing ? "Pengajuan diperbarui." : "Pengajuan tersimpan.",
  };
}

const STATUS_FLOW: PengajuanStatus[] = [
  "draft",
  "diajukan",
  "disetujui",
  "ditolak",
  "dibayar",
];

/**
 * Mengubah status pengajuan — dan, khusus untuk `dibayar`, melahirkan baris
 * buku besarnya.
 *
 * Inilah satu-satunya tempat dana finance masuk pembukuan, dan bentuk barisnya
 * ditentukan rutenya: rute langsung jadi **belanja** (biaya langsung tercatat),
 * rute dompet jadi **top-up** (saldo naik, belum jadi biaya). Kalau rute dompet
 * ikut dicatat sebagai belanja, setiap iklan yang dibayar dari dompet akan
 * terhitung dua kali.
 */
export async function setPengajuanStatus(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;

  const id = Number(str(fd, "id"));
  const g = getPengajuan(id);
  if (!g) return { ok: false, error: "Pengajuan tidak ditemukan." };

  const status = str(fd, "status") as PengajuanStatus;
  if (!STATUS_FLOW.includes(status))
    return { ok: false, error: "Status tidak valid." };

  const needPerm = status === "dibayar" ? "markPaid" : "editPengajuan";
  if (!hasPerm(me, needPerm)) return NO_ACCESS;

  if (g.status === "dibayar" && status !== "dibayar")
    return {
      ok: false,
      error: "Pengajuan ini sudah dibayar. Pakai tombol Batalkan pembayaran supaya baris buku besarnya ikut dibereskan.",
    };

  if (status !== "dibayar") {
    run(
      `UPDATE pengajuan SET status = ?, catatan = ?, updated_at = ? WHERE id = ?`,
      status, str(fd, "catatan") || g.catatan, new Date().toISOString(), id,
    );
    logActivity(me, "status-pengajuan", `#${id} → ${status}`);
    await touchSession(me);
    refresh();
    return { ok: true, message: `Status jadi ${status}.` };
  }

  /* ---------------------------------------------------- menandai dibayar */

  if (g.status === "dibayar") return { ok: false, error: "Pengajuan ini sudah dibayar." };
  if (g.status === "ditolak")
    return { ok: false, error: "Pengajuan yang ditolak tidak bisa ditandai dibayar." };
  if (g.tx_count > 0)
    return {
      ok: false,
      error: `Pengajuan ini sudah punya ${g.tx_count} baris buku besar. Periksa dulu di daftar transaksi.`,
    };

  const tanggalBayar = str(fd, "tanggal_bayar") || todayISO();
  if (!ISO_DATE.test(tanggalBayar))
    return { ok: false, error: "Tanggal cair belum diisi dengan benar." };
  if (isLocked(tanggalBayar)) return { ok: false, error: lockError(tanggalBayar) };

  const cairRead = optionalMoney(fd, "nominal_cair", "Nominal cair");
  if (!cairRead.ok) return { ok: false, error: cairRead.error };
  const nominal = cairRead.n > 0 ? cairRead.n : g.nominal;

  if (g.tujuan === "langsung" && !g.divisi_id)
    return {
      ok: false,
      error: "Isi divisinya dulu di pengajuan — tanpa itu belanjanya tidak masuk laporan mana pun.",
    };

  const now = new Date().toISOString();
  try {
    inTransaction(() => {
      if (g.tujuan === "dompet") {
        run(
          `INSERT INTO transaksi (tanggal, jenis, nominal, dompet_id, pengajuan_id,
                                  keterangan, no_ref, created_by, created_at)
           VALUES (?, 'topup', ?, ?, ?, ?, ?, ?, ?)`,
          tanggalBayar, nominal, g.dompet_id, g.id,
          g.keterangan, str(fd, "no_ref"), me.id, now,
        );
      } else {
        run(
          `INSERT INTO transaksi (tanggal, jenis, nominal, sumber, divisi_id, platform_id,
                                  brand_id, penerima_id, pengajuan_id, keterangan, no_ref,
                                  created_by, created_at)
           VALUES (?, 'belanja', ?, 'finance', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          tanggalBayar, nominal, g.divisi_id, g.platform_id, g.brand_id,
          g.penerima_id, g.id, g.keterangan, str(fd, "no_ref"), me.id, now,
        );
      }
      run(
        `UPDATE pengajuan SET status = 'dibayar', tanggal_bayar = ?, nominal_cair = ?,
                catatan = ?, updated_at = ? WHERE id = ?`,
        tanggalBayar,
        cairRead.n > 0 && cairRead.n !== g.nominal ? cairRead.n : null,
        str(fd, "catatan") || g.catatan,
        now,
        id,
      );
    });
  } catch (e) {
    return { ok: false, error: `Gagal mencatat pembayaran: ${(e as Error).message}` };
  }

  logActivity(
    me,
    "bayar-pengajuan",
    `#${id} ${fmtIdr(nominal)} → ${g.tujuan === "dompet" ? `top-up ${g.dompet_name}` : "belanja"}`,
  );
  await touchSession(me);
  refresh();
  return {
    ok: true,
    message:
      g.tujuan === "dompet"
        ? `Dana ${fmtIdr(nominal)} masuk ${g.dompet_name}. Belanjanya dicatat menyusul dari input harian.`
        : `Belanja ${fmtIdr(nominal)} tercatat.`,
  };
}

/** Mengembalikan pengajuan yang salah ditandai dibayar, beserta barisnya. */
export async function cancelPembayaran(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "markPaid")) return NO_ACCESS;

  const id = Number(str(fd, "id"));
  const g = getPengajuan(id);
  if (!g) return { ok: false, error: "Pengajuan tidak ditemukan." };
  if (g.status !== "dibayar")
    return { ok: false, error: "Pengajuan ini tidak sedang berstatus dibayar." };
  if (g.tanggal_bayar && isLocked(g.tanggal_bayar))
    return { ok: false, error: lockError(g.tanggal_bayar) };

  try {
    inTransaction(() => {
      run(`DELETE FROM transaksi WHERE pengajuan_id = ?`, id);
      run(
        `UPDATE pengajuan SET status = 'disetujui', tanggal_bayar = NULL,
                nominal_cair = NULL, updated_at = ? WHERE id = ?`,
        new Date().toISOString(),
        id,
      );
    });
  } catch (e) {
    return { ok: false, error: `Gagal membatalkan: ${(e as Error).message}` };
  }

  logActivity(me, "batal-bayar-pengajuan", `#${id} — ${g.tx_count} baris dihapus`);
  await touchSession(me);
  refresh();
  return {
    ok: true,
    message: "Pembayaran dibatalkan dan baris buku besarnya dihapus.",
  };
}

export async function deletePengajuan(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "editPengajuan")) return NO_ACCESS;

  const id = Number(str(fd, "id"));
  const g = getPengajuan(id);
  if (!g) return { ok: false, error: "Pengajuan tidak ditemukan." };
  if (g.status === "dibayar" || g.tx_count > 0)
    return {
      ok: false,
      error: "Pengajuan yang dananya sudah cair tidak bisa dihapus. Batalkan pembayarannya dulu.",
    };

  run(`DELETE FROM pengajuan WHERE id = ?`, id);
  logActivity(me, "hapus-pengajuan", `#${id} ${fmtIdr(g.nominal)}`);
  await touchSession(me);
  refresh();
  return { ok: true, message: "Pengajuan dihapus." };
}

/* ============================================================= buku besar */

interface TxValues {
  tanggal: string;
  jenis: Jenis;
  nominal: number;
  arah: number;
  sumber: Sumber | null;
  dompetId: number | null;
  divisiId: number | null;
  platformId: number | null;
  brandId: number | null;
  akunIklanId: number | null;
  penerimaId: number | null;
  keterangan: string;
  noRef: string;
}



function readTx(fd: FormData): { ok: false; error: string } | { ok: true; v: TxValues } {
  const tanggal = str(fd, "tanggal");
  if (!ISO_DATE.test(tanggal))
    return { ok: false, error: "Tanggal belum diisi dengan benar." };

  const jenis = str(fd, "jenis") as Jenis;
  if (!JENIS_MANUAL.includes(jenis)) return { ok: false, error: "Jenis transaksi tidak valid." };

  const nominal = requiredMoney(fd, "nominal", "Nominal");
  if (!nominal.ok) return { ok: false, error: nominal.error };

  const dompet = optionalId(fd, "dompet_id", "Dompet");
  if (!dompet.ok) return { ok: false, error: dompet.error };
  const divisi = optionalId(fd, "divisi_id", "Divisi");
  if (!divisi.ok) return { ok: false, error: divisi.error };
  const platform = optionalId(fd, "platform_id", "Platform");
  if (!platform.ok) return { ok: false, error: platform.error };
  const brand = optionalId(fd, "brand_id", "Brand");
  if (!brand.ok) return { ok: false, error: brand.error };
  const akun = optionalId(fd, "akun_iklan_id", "Akun iklan");
  if (!akun.ok) return { ok: false, error: akun.error };
  const penerima = optionalId(fd, "penerima_id", "Penerima");
  if (!penerima.ok) return { ok: false, error: penerima.error };

  let sumber: Sumber | null = null;
  if (jenis === "belanja") {
    const s = str(fd, "sumber");
    if (s !== "finance" && s !== "dompet")
      return { ok: false, error: "Belanja harus menyebut sumber dananya." };
    sumber = s;
    if (s === "dompet" && !dompet.id)
      return { ok: false, error: "Belanja dari dompet harus menyebut dompetnya." };
  }

  // Divisi & platform wajib untuk baris yang mempengaruhi biaya kelompok.
  // Tanpa keduanya, angkanya masuk total tapi tidak muncul di laporan mana pun —
  // dan selisih yang tidak kelihatan asalnya adalah cacat yang paling mahal di
  // pembukuan seperti ini.
  if ((jenis === "belanja" || jenis === "refund") && !divisi.id)
    return { ok: false, error: "Divisi wajib diisi." };
  if ((jenis === "belanja" || jenis === "refund") && !platform.id)
    return { ok: false, error: "Platform wajib diisi." };

  if ((jenis === "topup" || jenis === "biaya_dompet" || jenis === "koreksi") && !dompet.id)
    return { ok: false, error: `${jenis === "topup" ? "Top-up" : "Baris ini"} harus menyebut dompetnya.` };

  let arah = 1;
  if (jenis === "koreksi") {
    arah = str(fd, "arah") === "-1" ? -1 : 1;
  }

  return {
    ok: true,
    v: {
      tanggal,
      jenis,
      nominal: nominal.n,
      arah,
      sumber,
      dompetId: jenis === "belanja" && sumber === "finance" ? null : dompet.id,
      divisiId: jenis === "belanja" || jenis === "refund" ? divisi.id : null,
      platformId: jenis === "belanja" || jenis === "refund" ? platform.id : null,
      brandId: jenis === "belanja" || jenis === "refund" ? brand.id : null,
      akunIklanId: jenis === "belanja" ? akun.id : null,
      penerimaId: jenis === "belanja" ? penerima.id : null,
      keterangan: str(fd, "keterangan"),
      noRef: str(fd, "no_ref"),
    },
  };
}

export async function saveTransaksi(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;

  const idRead = optionalId(fd, "id", "Transaksi");
  if (!idRead.ok) return { ok: false, error: idRead.error };
  const editing = idRead.id !== null;
  if (!hasPerm(me, editing ? "editBelanja" : "addBelanja")) return NO_ACCESS;

  const parsed = readTx(fd);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { v } = parsed;

  if (isLocked(v.tanggal)) return { ok: false, error: lockError(v.tanggal) };

  if (editing) {
    const before = getTransaksi(idRead.id!);
    if (!before) return { ok: false, error: "Transaksi tidak ditemukan." };
    if (isLocked(before.tanggal)) return { ok: false, error: lockError(before.tanggal) };
    // Satu sisi transfer tidak boleh diubah sendirian: nominalnya akan berbeda
    // dari sisi lainnya, dan uang akan tampak lahir atau hilang di antara dua
    // dompet. Hapus transfernya, lalu catat ulang.
    if (before.pasangan_id)
      return {
        ok: false,
        error:
          "Ini satu sisi dari pindah saldo antar-dompet. Hapus transfernya (kedua sisinya ikut terhapus), lalu catat ulang dengan angka yang benar.",
      };
    // Baris yang lahir dari pengajuan tetap boleh diperbaiki, tapi tautannya
    // dipertahankan supaya jejak "dana ini dari pengajuan mana" tidak hilang.
    run(
      `UPDATE transaksi SET tanggal = ?, jenis = ?, nominal = ?, arah = ?, sumber = ?,
              dompet_id = ?, divisi_id = ?, platform_id = ?, brand_id = ?,
              akun_iklan_id = ?, penerima_id = ?, keterangan = ?, no_ref = ?,
              updated_at = ?
       WHERE id = ?`,
      v.tanggal, v.jenis, v.nominal, v.arah, v.sumber, v.dompetId, v.divisiId,
      v.platformId, v.brandId, v.akunIklanId, v.penerimaId, v.keterangan, v.noRef,
      new Date().toISOString(), idRead.id,
    );
    logActivity(me, "ubah-transaksi", `#${idRead.id} ${v.jenis} ${fmtIdr(v.nominal)}`);
  } else {
    try {
      run(
        `INSERT INTO transaksi (tanggal, jenis, nominal, arah, sumber, dompet_id,
                                divisi_id, platform_id, brand_id, akun_iklan_id,
                                penerima_id, keterangan, no_ref, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        v.tanggal, v.jenis, v.nominal, v.arah, v.sumber, v.dompetId, v.divisiId,
        v.platformId, v.brandId, v.akunIklanId, v.penerimaId, v.keterangan, v.noRef,
        me.id, new Date().toISOString(),
      );
    } catch (e) {
      return { ok: false, error: `Gagal menyimpan: ${(e as Error).message}` };
    }
    logActivity(me, "tambah-transaksi", `${v.jenis} ${fmtIdr(v.nominal)}`);
  }

  await touchSession(me);
  refresh();

  // Saldo hasilnya ikut dilaporkan: yang paling sering ingin diketahui setelah
  // mencatat belanja dompet adalah "sisa berapa", bukan "tersimpan".
  const sisa = v.dompetId ? getSaldoDompet(v.dompetId)?.sisa : undefined;
  return {
    ok: true,
    message:
      (editing ? "Transaksi diperbarui." : "Transaksi tersimpan.") +
      (sisa === undefined ? "" : ` Sisa saldo ${fmtIdr(sisa)}.`),
  };
}

export async function deleteTransaksi(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "deleteBelanja")) return NO_ACCESS;

  const id = Number(str(fd, "id"));
  const t = getTransaksi(id);
  if (!t) return { ok: false, error: "Transaksi tidak ditemukan." };
  if (isLocked(t.tanggal)) return { ok: false, error: lockError(t.tanggal) };
  if (t.pengajuan_id)
    return {
      ok: false,
      error: "Baris ini lahir dari pengajuan. Batalkan pembayaran pengajuannya supaya keduanya tetap sinkron.",
    };

  // Transfer dihapus sebagai satu kesatuan. Menyisakan satu sisinya berarti
  // saldo salah satu dompet naik atau turun tanpa lawan — dan karena transfer
  // tidak menyentuh total biaya, tidak ada angka lain yang akan menunjukkan itu.
  if (t.pasangan_id) {
    const pasangan = getTransaksi(t.pasangan_id);
    if (pasangan && isLocked(pasangan.tanggal))
      return { ok: false, error: lockError(pasangan.tanggal) };
    try {
      inTransaction(() => {
        run(`DELETE FROM transaksi WHERE id = ? OR id = ?`, id, t.pasangan_id);
      });
    } catch (e) {
      return { ok: false, error: `Gagal menghapus: ${(e as Error).message}` };
    }
    logActivity(
      me,
      "hapus-transfer",
      `#${id} + #${t.pasangan_id} ${fmtIdr(t.nominal)}`,
    );
    await touchSession(me);
    refresh();
    return {
      ok: true,
      message: "Pindah saldo dihapus — kedua sisinya sekaligus.",
    };
  }

  run(`DELETE FROM transaksi WHERE id = ?`, id);
  logActivity(me, "hapus-transaksi", `#${id} ${t.jenis} ${fmtIdr(t.nominal)}`);
  await touchSession(me);
  refresh();
  return { ok: true, message: "Transaksi dihapus." };
}

/**
 * Pindah saldo antar-dompet: mis. Bank Jago → Jenius.
 *
 * Dicatat sebagai **dua baris berpasangan**, bukan satu baris yang menyentuh dua
 * dompet. Dengan begitu setiap baris tetap milik tepat satu dompet, sehingga
 * saldo, mutasi, dan opname tiap dompet dihitung dengan rumus yang sama seperti
 * sebelum fitur ini ada — tidak ada satu pun query yang perlu tahu soal transfer.
 *
 * Keduanya `delta_biaya = 0`: uangnya belum dipakai, hanya berganti tempat.
 */
export async function saveTransfer(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "addBelanja")) return NO_ACCESS;

  const tanggal = str(fd, "tanggal");
  if (!ISO_DATE.test(tanggal))
    return { ok: false, error: "Tanggal belum diisi dengan benar." };
  if (isLocked(tanggal)) return { ok: false, error: lockError(tanggal) };

  const asalRead = optionalId(fd, "dompet_asal_id", "Dompet asal");
  if (!asalRead.ok) return { ok: false, error: asalRead.error };
  const tujuanRead = optionalId(fd, "dompet_tujuan_id", "Dompet tujuan");
  if (!tujuanRead.ok) return { ok: false, error: tujuanRead.error };
  if (!asalRead.id) return { ok: false, error: "Pilih dompet asalnya." };
  if (!tujuanRead.id) return { ok: false, error: "Pilih dompet tujuannya." };
  if (asalRead.id === tujuanRead.id)
    return { ok: false, error: "Dompet asal dan tujuan tidak boleh sama." };

  const asal = getDompet(asalRead.id);
  const tujuan = getDompet(tujuanRead.id);
  if (!asal || !tujuan) return { ok: false, error: "Dompet tidak ditemukan." };
  if (tanggal < asal.tanggal_awal)
    return {
      ok: false,
      error: `Tanggal ini lebih awal dari saldo awal ${asal.name} (${asal.tanggal_awal}).`,
    };
  if (tanggal < tujuan.tanggal_awal)
    return {
      ok: false,
      error: `Tanggal ini lebih awal dari saldo awal ${tujuan.name} (${tujuan.tanggal_awal}).`,
    };

  const nominal = requiredMoney(fd, "nominal", "Nominal");
  if (!nominal.ok) return { ok: false, error: nominal.error };

  // Biaya transfer antar-bank dicatat terpisah sebagai biaya bank pada dompet
  // asal — ia memang biaya, sementara pindahannya sendiri bukan.
  const biaya = optionalMoney(fd, "biaya_admin", "Biaya transfer");
  if (!biaya.ok) return { ok: false, error: biaya.error };

  const catatan = str(fd, "keterangan");
  const noRef = str(fd, "no_ref");
  const now = new Date().toISOString();

  try {
    inTransaction(() => {
      const ins = (jenis: Jenis, dompetId: number, keterangan: string) =>
        Number(
          run(
            `INSERT INTO transaksi (tanggal, jenis, nominal, dompet_id, keterangan,
                                    no_ref, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            tanggal, jenis, nominal.n, dompetId, keterangan, noRef, me.id, now,
          ).lastInsertRowid,
        );

      const suffix = catatan ? ` — ${catatan}` : "";
      const keluar = ins(
        "transfer_keluar",
        asal.id,
        `Pindah saldo ke ${tujuan.name}${suffix}`,
      );
      const masuk = ins(
        "transfer_masuk",
        tujuan.id,
        `Pindah saldo dari ${asal.name}${suffix}`,
      );

      // Saling menunjuk, jadi dari sisi mana pun pasangannya bisa ditemukan —
      // termasuk saat menghapus.
      run(`UPDATE transaksi SET pasangan_id = ? WHERE id = ?`, masuk, keluar);
      run(`UPDATE transaksi SET pasangan_id = ? WHERE id = ?`, keluar, masuk);

      if (biaya.n > 0) {
        run(
          `INSERT INTO transaksi (tanggal, jenis, nominal, dompet_id, keterangan,
                                  no_ref, created_by, created_at)
           VALUES (?, 'biaya_dompet', ?, ?, ?, ?, ?, ?)`,
          tanggal, biaya.n, asal.id,
          `Biaya transfer ke ${tujuan.name}`, noRef, me.id, now,
        );
      }
    });
  } catch (e) {
    return { ok: false, error: `Gagal mencatat pindah saldo: ${(e as Error).message}` };
  }

  logActivity(
    me,
    "pindah-saldo",
    `${asal.name} → ${tujuan.name} ${fmtIdr(nominal.n)}${biaya.n > 0 ? ` + biaya ${fmtIdr(biaya.n)}` : ""}`,
  );
  await touchSession(me);
  refresh();

  const sisaAsal = getSaldoDompet(asal.id)?.sisa ?? 0;
  const sisaTujuan = getSaldoDompet(tujuan.id)?.sisa ?? 0;
  return {
    ok: true,
    message:
      `${fmtIdr(nominal.n)} dipindah dari ${asal.name} ke ${tujuan.name}. ` +
      `Sisa ${asal.name} ${fmtIdr(sisaAsal)}, ${tujuan.name} ${fmtIdr(sisaTujuan)}.` +
      (sisaAsal < 0 ? ` Saldo ${asal.name} jadi minus — periksa top-up yang belum tercatat.` : ""),
  };
}

/**
 * Input harian dari mutasi dompet: satu tanggal, satu dompet, banyak baris.
 *
 * Ditulis dalam satu transaksi DB — separuh baris yang tersimpan lebih buruk
 * daripada tidak tersimpan sama sekali, karena saldo yang tampil akan tampak
 * masuk akal padahal tidak lengkap.
 */
export async function saveBelanjaHarian(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "addBelanja")) return NO_ACCESS;

  const tanggal = str(fd, "tanggal");
  if (!ISO_DATE.test(tanggal))
    return { ok: false, error: "Tanggal belum diisi dengan benar." };
  if (isLocked(tanggal)) return { ok: false, error: lockError(tanggal) };

  const dompetId = Number(str(fd, "dompet_id"));
  if (!Number.isInteger(dompetId) || dompetId <= 0)
    return { ok: false, error: "Pilih dompet yang membayar." };
  const dompet = getDompet(dompetId);
  if (!dompet) return { ok: false, error: "Dompet tidak ditemukan." };
  if (tanggal < dompet.tanggal_awal)
    return {
      ok: false,
      error: `Tanggal ini lebih awal dari saldo awal ${dompet.name} (${dompet.tanggal_awal}).`,
    };

  const nominals = fd.getAll("row_nominal").map((x) => String(x));
  const divisis = fd.getAll("row_divisi").map((x) => String(x));
  const platforms = fd.getAll("row_platform").map((x) => String(x));
  const brands = fd.getAll("row_brand").map((x) => String(x));
  const akuns = fd.getAll("row_akun").map((x) => String(x));
  const kets = fd.getAll("row_ket").map((x) => String(x));

  interface Row {
    nominal: number;
    divisiId: number;
    platformId: number;
    brandId: number | null;
    akunId: number | null;
    keterangan: string;
  }
  const rows: Row[] = [];

  for (let i = 0; i < nominals.length; i++) {
    const raw = (nominals[i] ?? "").trim();
    if (raw === "") continue; // baris kosong memang bukan baris
    const n = parseRupiahInt(raw);
    if (n === null)
      return { ok: false, error: `Baris ${i + 1}: nominal "${raw}" tidak terbaca.` };
    if (n <= 0)
      return { ok: false, error: `Baris ${i + 1}: nominal harus lebih besar dari 0.` };

    const divisiId = Number(divisis[i] ?? "");
    const platformId = Number(platforms[i] ?? "");
    if (!Number.isInteger(platformId) || platformId <= 0)
      return { ok: false, error: `Baris ${i + 1}: platform belum dipilih.` };
    if (!Number.isInteger(divisiId) || divisiId <= 0)
      return { ok: false, error: `Baris ${i + 1}: divisi belum dipilih.` };

    const brandRaw = (brands[i] ?? "").trim();
    const akunRaw = (akuns[i] ?? "").trim();
    rows.push({
      nominal: n,
      divisiId,
      platformId,
      brandId: brandRaw === "" ? null : Number(brandRaw),
      akunId: akunRaw === "" ? null : Number(akunRaw),
      keterangan: (kets[i] ?? "").trim(),
    });
  }

  if (rows.length === 0)
    return { ok: false, error: "Belum ada satu pun baris yang diisi nominalnya." };

  const now = new Date().toISOString();
  try {
    inTransaction(() => {
      for (const r of rows) {
        run(
          `INSERT INTO transaksi (tanggal, jenis, nominal, sumber, dompet_id, divisi_id,
                                  platform_id, brand_id, akun_iklan_id, keterangan,
                                  created_by, created_at)
           VALUES (?, 'belanja', ?, 'dompet', ?, ?, ?, ?, ?, ?, ?, ?)`,
          tanggal, r.nominal, dompetId, r.divisiId, r.platformId, r.brandId,
          r.akunId, r.keterangan, me.id, now,
        );
      }
    });
  } catch (e) {
    return { ok: false, error: `Gagal menyimpan: ${(e as Error).message}` };
  }

  const total = rows.reduce((s, r) => s + r.nominal, 0);
  logActivity(
    me,
    "input-harian",
    `${dompet.name} ${tanggal}: ${rows.length} baris, ${fmtIdr(total)}`,
  );
  await touchSession(me);
  refresh();

  const sisa = getSaldoDompet(dompetId)?.sisa ?? 0;
  return {
    ok: true,
    message:
      `${rows.length} baris tersimpan, total ${fmtIdr(total)}. Sisa saldo ${dompet.name} ${fmtIdr(sisa)}.` +
      (sisa < 0
        ? " Saldonya minus — periksa top-up yang belum tercatat."
        : sisa < dompet.min_saldo
          ? " Sudah di bawah batas minimum."
          : ""),
  };
}

export async function saveOpname(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageDompet")) return NO_ACCESS;

  const dompetId = Number(str(fd, "dompet_id"));
  const dompet = getDompet(dompetId);
  if (!dompet) return { ok: false, error: "Dompet tidak ditemukan." };

  const tanggal = str(fd, "tanggal");
  if (!ISO_DATE.test(tanggal))
    return { ok: false, error: "Tanggal belum diisi dengan benar." };

  // Saldo aktual boleh nol — rekening yang benar-benar kosong adalah keadaan
  // yang sah, jadi ini satu-satunya kolom nominal yang menerima 0.
  const read = readMoney(fd, "saldo_aktual");
  if (read.kind === "bad")
    return { ok: false, error: notANumber("Saldo aktual", read.text) };
  if (read.kind === "empty") return { ok: false, error: "Saldo aktual belum diisi." };

  run(
    `INSERT INTO dompet_opname (dompet_id, tanggal, saldo_aktual, catatan, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    dompetId, tanggal, read.n, str(fd, "catatan"), me.id, new Date().toISOString(),
  );

  logActivity(me, "opname-dompet", `${dompet.name} ${tanggal}: ${fmtIdr(read.n)}`);
  await touchSession(me);
  refresh();
  return { ok: true, message: "Hasil cek saldo tercatat." };
}

/* ================================================= kunci periode & user */

export async function setLock(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "lockPeriod")) return NO_ACCESS;

  const value = str(fd, "lock_until");
  if (value !== "" && !ISO_DATE.test(value))
    return { ok: false, error: "Tanggal kunci tidak valid." };

  setSetting("lock_until", value);
  logActivity(me, "kunci-periode", value ? `Dikunci s/d ${value}` : "Kunci dilepas");
  await touchSession(me);
  refresh();
  return {
    ok: true,
    message: value
      ? `Transaksi sampai ${value} dikunci.`
      : "Kunci dilepas — semua periode bisa diubah lagi.",
  };
}

export async function createUser(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageUsers")) return NO_ACCESS;

  const username = str(fd, "username").toLowerCase();
  const role = str(fd, "role");
  const password = String(fd.get("password") ?? "");

  if (!/^[a-z0-9._-]{3,32}$/.test(username))
    return {
      ok: false,
      error: "Username 3–32 karakter: huruf kecil, angka, titik, garis bawah, strip.",
    };
  if (role !== "owner" && role !== "admin" && role !== "staff")
    return { ok: false, error: "Peran tidak valid." };
  // Hanya owner yang boleh mencetak owner baru — kalau tidak, admin dengan izin
  // kelola akun bisa mengangkat dirinya sendiri jadi owner.
  if (role === "owner" && !isOwner(me)) return OWNER_ONLY;
  const pwErr = passwordProblem(password);
  if (pwErr) return { ok: false, error: pwErr };

  const now = new Date().toISOString();
  try {
    run(
      `INSERT INTO users (username, pass_hash, name, role, active, pass_changed_at, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      username, await hashPassword(password), str(fd, "name") || username, role, now, now,
    );
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("UNIQUE"))
      return { ok: false, error: `Username "${username}" sudah dipakai.` };
    return { ok: false, error: `Gagal membuat akun: ${msg}` };
  }

  logActivity(me, "tambah-user", `${username} (${role})`);
  await touchSession(me);
  refresh();
  return { ok: true, message: `Akun ${username} dibuat.` };
}

export async function updateUser(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageUsers")) return NO_ACCESS;

  const id = Number(str(fd, "id"));
  const target = getUserById(id);
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };

  const role = str(fd, "role");
  const active = str(fd, "active") === "1" ? 1 : 0;
  if (role !== "owner" && role !== "admin" && role !== "staff")
    return { ok: false, error: "Peran tidak valid." };

  // Akun owner hanya boleh disentuh owner, dan hanya owner yang bisa mengangkat
  // owner baru.
  if (target.role === "owner" && !isOwner(me)) return OWNER_ONLY;
  if (role === "owner" && !isOwner(me)) return OWNER_ONLY;

  // Jangan sampai owner aktif terakhir hilang — aplikasi jadi tak bisa dikelola.
  const losingOwner = target.role === "owner" && (role !== "owner" || active === 0);
  if (losingOwner && countActiveOwners(target.id) === 0)
    return { ok: false, error: "Ini owner aktif terakhir. Angkat owner lain dulu." };
  if (target.id === me.id && active === 0)
    return { ok: false, error: "Tidak bisa menonaktifkan akun sendiri." };

  // Menonaktifkan akun harus langsung memutus sesinya yang sedang berjalan.
  const bump = active === 0 && target.active === 1 ? 1 : 0;
  run(
    `UPDATE users SET name = ?, role = ?, active = ?, session_epoch = session_epoch + ?
     WHERE id = ?`,
    str(fd, "name") || target.username, role, active, bump, id,
  );

  logActivity(
    me,
    "ubah-user",
    `${target.username} → ${role}${active ? "" : ", nonaktif"}`,
  );
  await touchSession(me);
  refresh();
  return { ok: true, message: `Akun ${target.username} diperbarui.` };
}

export async function resetUserPassword(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageUsers")) return NO_ACCESS;

  const id = Number(str(fd, "id"));
  const target = getUserById(id);
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };
  if (target.role === "owner" && !isOwner(me)) return OWNER_ONLY;

  const password = String(fd.get("password") ?? "");
  const pwErr = passwordProblem(password);
  if (pwErr) return { ok: false, error: pwErr };

  const now = new Date().toISOString();
  run(
    `UPDATE users SET pass_hash = ?, pass_changed_at = ?, session_epoch = session_epoch + 1
     WHERE id = ?`,
    await hashPassword(password), now, id,
  );

  logActivity(me, "reset-password", target.username);
  await touchSession(me);
  refresh();
  return {
    ok: true,
    message: `Password ${target.username} direset. Sesi lamanya langsung diputus.`,
  };
}

export async function deleteUser(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageUsers")) return NO_ACCESS;

  const id = Number(str(fd, "id"));
  const target = getUserById(id);
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };
  if (target.id === me.id)
    return { ok: false, error: "Tidak bisa menghapus akun sendiri." };
  if (target.role === "owner" && !isOwner(me)) return OWNER_ONLY;
  if (target.role === "owner" && countActiveOwners(target.id) === 0)
    return { ok: false, error: "Ini owner aktif terakhir." };

  run(`DELETE FROM users WHERE id = ?`, id);
  logActivity(me, "hapus-user", target.username);
  await touchSession(me);
  refresh();
  return { ok: true, message: `Akun ${target.username} dihapus.` };
}

/* ================================================================== izin */

/** Membaca centang izin dari form; kunci yang tak dicentang berarti dimatikan. */
function readPerms(fd: FormData, prefix: string): PermMap {
  const out: PermMap = {};
  for (const k of PERM_KEYS) out[k] = fd.get(`${prefix}${k}`) === "on";
  return out;
}

/** Override izin satu akun. Kosongkan untuk mengembalikannya ke default peran. */
export async function setUserPerms(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!hasPerm(me, "manageUsers")) return NO_ACCESS;

  const id = Number(str(fd, "id"));
  const target = getUserById(id);
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };
  if (target.role === "owner")
    return {
      ok: false,
      error: "Owner selalu punya seluruh izin — tidak bisa dibatasi.",
    };
  if (!isOwner(me) && target.id === me.id)
    return { ok: false, error: "Tidak bisa mengubah izin akun sendiri." };

  const mode = str(fd, "mode");
  if (mode === "reset") {
    run(`UPDATE users SET perms = NULL WHERE id = ?`, id);
    logActivity(me, "reset-izin", `${target.username} kembali ke default peran`);
  } else {
    run(
      `UPDATE users SET perms = ? WHERE id = ?`,
      JSON.stringify(readPerms(fd, "p_")),
      id,
    );
    logActivity(me, "ubah-izin", target.username);
  }

  await touchSession(me);
  refresh();
  return {
    ok: true,
    message:
      mode === "reset"
        ? `Izin ${target.username} dikembalikan ke default perannya.`
        : `Izin ${target.username} disimpan.`,
  };
}

/** Izin default tiap peran — hanya owner. */
export async function saveRolePerms(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!isOwner(me)) return OWNER_ONLY;

  setRolePerms({ admin: readPerms(fd, "admin_"), staff: readPerms(fd, "staff_") });
  logActivity(me, "ubah-izin-peran", "Mengubah izin default admin/staff");
  await touchSession(me);
  refresh();
  return {
    ok: true,
    message: "Izin default disimpan. Akun dengan izin khusus tidak ikut berubah.",
  };
}

/* ================================================================ backup */

/**
 * Backup memuat seluruh isi database — termasuk hash password semua akun —
 * jadi seluruh operasinya owner-only, tidak diserahkan ke sistem izin.
 */
export async function createBackupNow(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!isOwner(me)) return OWNER_ONLY;

  const note = str(fd, "note").slice(0, 120);
  try {
    const r = await createBackup();
    logActivity(
      me,
      "backup-manual",
      `${r.name} (${r.size} byte)${note ? ` — ${note}` : ""}`,
    );
    await touchSession(me);
    refresh();
    return {
      ok: true,
      message:
        `Backup ${r.name} dibuat.` +
        (r.pruned ? ` ${r.pruned} snapshot lama dibuang sesuai retensi.` : ""),
    };
  } catch (e) {
    return { ok: false, error: `Gagal membuat backup: ${(e as Error).message}` };
  }
}

export async function deleteBackupFile(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!isOwner(me)) return OWNER_ONLY;

  const name = str(fd, "name");
  if (!(await removeBackup(name)))
    return { ok: false, error: "Nama backup tidak valid." };

  logActivity(me, "hapus-backup", name);
  await touchSession(me);
  refresh();
  return { ok: true, message: `Backup ${name} dihapus.` };
}

export async function restoreFromBackup(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!isOwner(me)) return OWNER_ONLY;

  // Ketikan konfirmasi: memulihkan menimpa seluruh data yang ada sekarang.
  if (str(fd, "confirm") !== "PULIHKAN")
    return { ok: false, error: "Ketik PULIHKAN untuk menegaskan pemulihan." };

  const name = str(fd, "name");
  const r = await restoreBackup(name);
  if (!r.ok) return { ok: false, error: r.error ?? "Pemulihan gagal." };

  // Dicatat setelah database ditukar, jadi jejaknya ada di data yang baru.
  logActivity(me, "pulihkan-backup", `dari ${name}`);
  refresh();
  return {
    ok: true,
    message:
      `Data dipulihkan dari ${name}.` +
      (r.safetyBackup
        ? ` Kondisi sebelumnya disimpan sebagai ${r.safetyBackup} kalau ternyata salah pilih.`
        : ""),
  };
}
