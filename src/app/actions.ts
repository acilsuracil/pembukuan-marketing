"use server";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { hashPassword, passwordProblem } from "@/lib/auth";
import { BUKTI_DIR, run, setSetting, tx as inTransaction } from "@/lib/db";
import { SLOT_COUNT } from "@/lib/palette";
import {
  canDecideRequests,
  canEditDirectly,
  canManageMaster,
  isLocked,
  lockError,
  logActivity,
} from "@/lib/policy";
import {
  attachmentsOf,
  brandUsage,
  categoryUsage,
  countActiveAdmins,
  getAttachment,
  getRequest,
  getTransaction,
  getUserById,
  pendingRequestFor,
} from "@/lib/queries";
import { getUser, touchSession, type SessionUser } from "@/lib/session";

export interface ActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

const DENIED: ActionState = { ok: false, error: "Sesi berakhir. Silakan login lagi." };
const NOT_ADMIN: ActionState = { ok: false, error: "Hanya admin yang bisa melakukan ini." };

/** Menerima "16250", "16.250", "16250,5" maupun "16250.5". */
function parseNum(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  let t = s.replace(/\s|Rp|USDT/gi, "");
  if (t.includes(",") && t.includes(".")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function refresh() {
  revalidatePath("/", "layout");
}

async function authed(): Promise<SessionUser | null> {
  return getUser();
}

/* ============================================================== transaksi */

interface TxValues {
  date: string;
  type: "in" | "out";
  amount: number;
  fee: number;
  rate: number | null;
  categoryId: number | null;
  brandId: number | null;
  description: string;
  counterparty: string;
  txHash: string;
}

function readTx(fd: FormData): { ok: false; error: string } | { ok: true; v: TxValues } {
  const date = str(fd, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { ok: false, error: "Tanggal belum diisi dengan benar." };

  const type = str(fd, "type");
  if (type !== "in" && type !== "out")
    return { ok: false, error: "Jenis transaksi tidak valid." };

  const amount = parseNum(fd.get("amount_usdt"));
  if (amount === null || amount <= 0)
    return { ok: false, error: "Nominal USDT harus lebih besar dari 0." };

  const fee = parseNum(fd.get("fee_usdt")) ?? 0;
  if (fee < 0) return { ok: false, error: "Biaya jaringan tidak boleh negatif." };
  if (type === "in" && fee >= amount)
    return { ok: false, error: "Biaya jaringan tidak boleh menghabiskan nominal pemasukan." };

  const rate = parseNum(fd.get("rate_idr"));
  if (type === "in" && (rate === null || rate <= 0))
    return { ok: false, error: "Kurs beli wajib diisi untuk uang masuk (Rp per 1 USDT)." };
  if (rate !== null && rate <= 0)
    return { ok: false, error: "Kurs harus lebih besar dari 0." };

  const catRaw = str(fd, "category_id");
  const categoryId = catRaw === "" ? null : Number(catRaw);
  if (categoryId !== null && !Number.isInteger(categoryId))
    return { ok: false, error: "Kategori tidak valid." };

  const brandRaw = str(fd, "brand_id");
  const brandId = brandRaw === "" ? null : Number(brandRaw);
  if (brandId !== null && !Number.isInteger(brandId))
    return { ok: false, error: "Brand tidak valid." };
  if (type === "out" && brandId === null)
    return { ok: false, error: "Pengeluaran harus ditandai brand-nya." };

  return {
    ok: true,
    v: {
      date,
      type,
      amount,
      fee,
      rate,
      categoryId,
      brandId,
      description: str(fd, "description"),
      counterparty: str(fd, "counterparty"),
      txHash: str(fd, "tx_hash"),
    },
  };
}

/* ------------------------------------------------------------------ bukti */

const MAX_BUKTI_BYTES = 5 * 1024 * 1024;
const MAX_BUKTI_PER_TX = 8;
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** Menyimpan berkas bukti ke disk + mencatat barisnya. Mengembalikan pesan galat kalau ada. */
async function saveBukti(
  txId: number,
  files: File[],
  user: SessionUser,
): Promise<string | null> {
  const usable = files.filter((f) => f && f.size > 0);
  if (usable.length === 0) return null;

  const existing = attachmentsOf(txId).length;
  if (existing + usable.length > MAX_BUKTI_PER_TX)
    return `Maksimal ${MAX_BUKTI_PER_TX} bukti per transaksi (sekarang sudah ${existing}).`;

  for (const f of usable) {
    if (!EXT_BY_MIME[f.type])
      return `"${f.name}" bukan gambar yang didukung (JPG, PNG, WEBP, atau GIF).`;
    if (f.size > MAX_BUKTI_BYTES)
      return `"${f.name}" lebih dari 5 MB.`;
  }

  await fs.mkdir(BUKTI_DIR, { recursive: true });
  const now = new Date().toISOString();
  for (const f of usable) {
    const stored = `${crypto.randomUUID()}${EXT_BY_MIME[f.type]}`;
    const buf = Buffer.from(await f.arrayBuffer());
    await fs.writeFile(path.join(BUKTI_DIR, stored), buf);
    run(
      `INSERT INTO attachments (id, tx_id, stored_name, orig_name, mime, size, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      txId,
      stored,
      f.name.slice(0, 160),
      f.type,
      f.size,
      user.id,
      now,
    );
  }
  return null;
}

async function removeBuktiFiles(txId: number) {
  for (const a of attachmentsOf(txId)) {
    try {
      await fs.unlink(path.join(BUKTI_DIR, a.stored_name));
    } catch {
      // berkas sudah tidak ada — biarkan
    }
  }
}

/* ------------------------------------------------------- catat & ubah tx */

export async function createTransaction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;

  const parsed = readTx(fd);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { v } = parsed;

  if (isLocked(v.date)) return { ok: false, error: lockError(v.date) };

  let newId: number;
  try {
    const now = new Date().toISOString();
    const res = run(
      `INSERT INTO transactions
         (date, type, amount_usdt, fee_usdt, rate_idr, category_id, brand_id,
          description, counterparty, tx_hash, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      v.date, v.type, v.amount, v.fee, v.rate, v.categoryId, v.brandId,
      v.description, v.counterparty, v.txHash, me.id, now,
    );
    newId = Number(res.lastInsertRowid);
  } catch (e) {
    return { ok: false, error: `Gagal menyimpan: ${(e as Error).message}` };
  }

  const buktiErr = await saveBukti(newId, fd.getAll("bukti") as File[], me);
  logActivity(
    me,
    "tambah-transaksi",
    `#${newId} ${v.type === "in" ? "masuk" : "keluar"} ${v.amount} USDT (${v.date})`,
  );
  await touchSession(me);
  refresh();

  return {
    ok: true,
    message: buktiErr
      ? `Transaksi tersimpan, tapi bukti gagal diunggah: ${buktiErr}`
      : `Transaksi ${v.type === "in" ? "masuk" : "keluar"} tersimpan.`,
  };
}

/**
 * Admin mengubah langsung. Staff tidak menulis apa pun — perubahannya
 * dicatat sebagai pengajuan yang menunggu keputusan admin.
 */
export async function updateTransaction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;

  const id = Number(str(fd, "id"));
  if (!Number.isInteger(id) || id <= 0)
    return { ok: false, error: "ID transaksi tidak valid." };

  const current = getTransaction(id);
  if (!current) return { ok: false, error: "Transaksi tidak ditemukan." };

  const parsed = readTx(fd);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { v } = parsed;

  if (isLocked(current.date)) return { ok: false, error: lockError(current.date) };
  if (isLocked(v.date)) return { ok: false, error: lockError(v.date) };

  if (!canEditDirectly(me)) {
    if (pendingRequestFor(id))
      return { ok: false, error: "Transaksi ini sudah punya pengajuan yang menunggu keputusan." };
    const reason = str(fd, "reason");
    if (reason.length < 4)
      return { ok: false, error: "Tulis alasan perubahan (minimal 4 karakter)." };

    run(
      `INSERT INTO requests (tx_id, type, payload, snapshot, reason, status, requested_by, requested_at)
       VALUES (?, 'edit', ?, ?, ?, 'pending', ?, ?)`,
      id,
      JSON.stringify(v),
      JSON.stringify(current),
      reason,
      me.id,
      new Date().toISOString(),
    );
    logActivity(me, "ajukan-edit", `#${id} — ${reason}`);
    await touchSession(me);
    refresh();
    return { ok: true, message: "Pengajuan perubahan dikirim ke admin." };
  }

  try {
    run(
      `UPDATE transactions SET
         date = ?, type = ?, amount_usdt = ?, fee_usdt = ?, rate_idr = ?,
         category_id = ?, brand_id = ?, description = ?, counterparty = ?,
         tx_hash = ?, updated_at = ?
       WHERE id = ?`,
      v.date, v.type, v.amount, v.fee, v.rate, v.categoryId, v.brandId,
      v.description, v.counterparty, v.txHash, new Date().toISOString(), id,
    );
  } catch (e) {
    return { ok: false, error: `Gagal memperbarui: ${(e as Error).message}` };
  }

  const buktiErr = await saveBukti(id, fd.getAll("bukti") as File[], me);
  logActivity(me, "ubah-transaksi", `#${id} (${v.date})`);
  await touchSession(me);
  refresh();
  return {
    ok: true,
    message: buktiErr ? `Perubahan tersimpan, bukti gagal: ${buktiErr}` : "Perubahan tersimpan.",
  };
}

export async function deleteTransaction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;

  const id = Number(str(fd, "id"));
  if (!Number.isInteger(id) || id <= 0)
    return { ok: false, error: "ID transaksi tidak valid." };

  const current = getTransaction(id);
  if (!current) return { ok: false, error: "Transaksi tidak ditemukan." };
  if (isLocked(current.date)) return { ok: false, error: lockError(current.date) };

  if (!canEditDirectly(me)) {
    if (pendingRequestFor(id))
      return { ok: false, error: "Transaksi ini sudah punya pengajuan yang menunggu keputusan." };
    const reason = str(fd, "reason");
    if (reason.length < 4)
      return { ok: false, error: "Tulis alasan penghapusan (minimal 4 karakter)." };

    run(
      `INSERT INTO requests (tx_id, type, payload, snapshot, reason, status, requested_by, requested_at)
       VALUES (?, 'delete', NULL, ?, ?, 'pending', ?, ?)`,
      id,
      JSON.stringify(current),
      reason,
      me.id,
      new Date().toISOString(),
    );
    logActivity(me, "ajukan-hapus", `#${id} — ${reason}`);
    await touchSession(me);
    refresh();
    return { ok: true, message: "Pengajuan penghapusan dikirim ke admin." };
  }

  await removeBuktiFiles(id);
  run(`DELETE FROM transactions WHERE id = ?`, id);
  logActivity(me, "hapus-transaksi", `#${id} ${current.date} ${current.flow_usdt} USDT`);
  await touchSession(me);
  refresh();
  return { ok: true, message: "Transaksi dihapus." };
}

/* -------------------------------------------------------- bukti terpisah */

export async function addBukti(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;

  const id = Number(str(fd, "tx_id"));
  const t = getTransaction(id);
  if (!t) return { ok: false, error: "Transaksi tidak ditemukan." };
  if (isLocked(t.date)) return { ok: false, error: lockError(t.date) };

  const err = await saveBukti(id, fd.getAll("bukti") as File[], me);
  if (err) return { ok: false, error: err };

  logActivity(me, "tambah-bukti", `#${id}`);
  await touchSession(me);
  refresh();
  return { ok: true, message: "Bukti ditambahkan." };
}

/** Menghapus bukti: admin, atau staff yang mengunggahnya sendiri. */
export async function deleteBukti(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;

  const att = getAttachment(str(fd, "id"));
  if (!att) return { ok: false, error: "Bukti tidak ditemukan." };

  const t = getTransaction(att.tx_id);
  if (t && isLocked(t.date)) return { ok: false, error: lockError(t.date) };
  if (!canEditDirectly(me) && att.uploaded_by !== me.id)
    return { ok: false, error: "Hanya admin atau pengunggahnya yang bisa menghapus bukti ini." };

  try {
    await fs.unlink(path.join(BUKTI_DIR, att.stored_name));
  } catch {
    // berkas sudah hilang — tetap bersihkan barisnya
  }
  run(`DELETE FROM attachments WHERE id = ?`, att.id);
  logActivity(me, "hapus-bukti", `#${att.tx_id} ${att.orig_name}`);
  await touchSession(me);
  refresh();
  return { ok: true, message: "Bukti dihapus." };
}

/* ============================================================= pengajuan */

export async function decideRequest(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!canDecideRequests(me)) return NOT_ADMIN;

  const id = Number(str(fd, "id"));
  const decision = str(fd, "decision");
  if (decision !== "approve" && decision !== "reject")
    return { ok: false, error: "Keputusan tidak valid." };

  const rq = getRequest(id);
  if (!rq) return { ok: false, error: "Pengajuan tidak ditemukan." };
  if (rq.status !== "pending")
    return { ok: false, error: "Pengajuan ini sudah diputuskan." };

  const note = str(fd, "note");
  const now = new Date().toISOString();

  if (decision === "reject") {
    run(
      `UPDATE requests SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ?
       WHERE id = ?`,
      me.id, now, note, id,
    );
    logActivity(me, "tolak-pengajuan", `#${id} (tx #${rq.tx_id})`);
    await touchSession(me);
    refresh();
    return { ok: true, message: "Pengajuan ditolak." };
  }

  const current = rq.tx_id ? getTransaction(rq.tx_id) : undefined;
  if (!current)
    return { ok: false, error: "Transaksinya sudah tidak ada. Tolak saja pengajuan ini." };
  // Kunci diperiksa ulang di sini: bisa saja periode baru dikunci setelah diajukan.
  if (isLocked(current.date)) return { ok: false, error: lockError(current.date) };

  try {
    if (rq.type === "delete") {
      await removeBuktiFiles(current.id);
      inTransaction(() => {
        run(`DELETE FROM transactions WHERE id = ?`, current.id);
        run(
          `UPDATE requests SET status = 'approved', decided_by = ?, decided_at = ?, decision_note = ?
           WHERE id = ?`,
          me.id, now, note, id,
        );
      });
    } else {
      const v = JSON.parse(rq.payload || "{}") as TxValues;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !(v.amount > 0))
        return { ok: false, error: "Isi pengajuan tidak valid, tidak bisa diterapkan." };
      if (isLocked(v.date)) return { ok: false, error: lockError(v.date) };

      inTransaction(() => {
        run(
          `UPDATE transactions SET
             date = ?, type = ?, amount_usdt = ?, fee_usdt = ?, rate_idr = ?,
             category_id = ?, brand_id = ?, description = ?, counterparty = ?,
             tx_hash = ?, updated_at = ?
           WHERE id = ?`,
          v.date, v.type, v.amount, v.fee, v.rate ?? null, v.categoryId ?? null,
          v.brandId ?? null, v.description ?? "", v.counterparty ?? "",
          v.txHash ?? "", now, current.id,
        );
        run(
          `UPDATE requests SET status = 'approved', decided_by = ?, decided_at = ?, decision_note = ?
           WHERE id = ?`,
          me.id, now, note, id,
        );
      });
    }
  } catch (e) {
    return { ok: false, error: `Gagal menerapkan: ${(e as Error).message}` };
  }

  logActivity(me, `setujui-${rq.type}`, `#${id} (tx #${rq.tx_id})`);
  await touchSession(me);
  refresh();
  return { ok: true, message: "Pengajuan disetujui dan diterapkan." };
}

/** Pengaju boleh menarik kembali pengajuannya selama belum diputuskan. */
export async function cancelRequest(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;

  const id = Number(str(fd, "id"));
  const rq = getRequest(id);
  if (!rq) return { ok: false, error: "Pengajuan tidak ditemukan." };
  if (rq.status !== "pending") return { ok: false, error: "Pengajuan sudah diputuskan." };
  if (rq.requested_by !== me.id && !canDecideRequests(me))
    return { ok: false, error: "Hanya pengaju atau admin yang bisa membatalkan." };

  run(`DELETE FROM requests WHERE id = ?`, id);
  logActivity(me, "batal-pengajuan", `#${id}`);
  await touchSession(me);
  refresh();
  return { ok: true, message: "Pengajuan dibatalkan." };
}

/* ================================================================= brand */

export async function saveBrand(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!canManageMaster(me)) return NOT_ADMIN;

  const idRaw = str(fd, "id");
  const id = idRaw === "" ? null : Number(idRaw);
  const name = str(fd, "name");
  if (name.length < 2) return { ok: false, error: "Nama brand minimal 2 karakter." };

  let slot = Number(str(fd, "color_slot"));
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) slot = 1;

  const budget = parseNum(fd.get("budget_usdt")) ?? 0;
  if (budget < 0) return { ok: false, error: "Budget tidak boleh negatif." };

  try {
    if (id) {
      run(
        `UPDATE brands SET name = ?, color_slot = ?, pic = ?, note = ?, budget_usdt = ? WHERE id = ?`,
        name, slot, str(fd, "pic"), str(fd, "note"), budget, id,
      );
    } else {
      run(
        `INSERT INTO brands (name, color_slot, pic, note, budget_usdt, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        name, slot, str(fd, "pic"), str(fd, "note"), budget, new Date().toISOString(),
      );
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("UNIQUE")) return { ok: false, error: `Brand "${name}" sudah ada.` };
    return { ok: false, error: `Gagal menyimpan: ${msg}` };
  }

  logActivity(me, id ? "ubah-brand" : "tambah-brand", name);
  await touchSession(me);
  refresh();
  return { ok: true, message: id ? "Brand diperbarui." : "Brand ditambahkan." };
}

export async function toggleArchiveBrand(fd: FormData): Promise<void> {
  const me = await authed();
  if (!me || !canManageMaster(me)) return;
  const id = Number(str(fd, "id"));
  if (Number.isInteger(id) && id > 0) {
    run(`UPDATE brands SET archived = 1 - archived WHERE id = ?`, id);
    logActivity(me, "arsip-brand", `#${id}`);
    refresh();
  }
}

export async function deleteBrand(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!canManageMaster(me)) return NOT_ADMIN;

  const id = Number(str(fd, "id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "ID brand tidak valid." };

  const used = brandUsage(id);
  if (used > 0)
    return {
      ok: false,
      error: `Brand dipakai ${used} transaksi. Arsipkan saja agar riwayat tetap utuh.`,
    };

  run(`DELETE FROM brands WHERE id = ?`, id);
  logActivity(me, "hapus-brand", `#${id}`);
  await touchSession(me);
  refresh();
  return { ok: true, message: "Brand dihapus." };
}

/* ============================================================== kategori */

export async function saveCategory(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!canManageMaster(me)) return NOT_ADMIN;

  const idRaw = str(fd, "id");
  const id = idRaw === "" ? null : Number(idRaw);
  const name = str(fd, "name");
  if (name.length < 2) return { ok: false, error: "Nama kategori minimal 2 karakter." };

  const kind = str(fd, "kind");
  if (kind !== "in" && kind !== "out")
    return { ok: false, error: "Jenis kategori tidak valid." };

  let slot = Number(str(fd, "color_slot"));
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) slot = 1;

  const budget = parseNum(fd.get("budget_usdt")) ?? 0;
  if (budget < 0) return { ok: false, error: "Budget tidak boleh negatif." };

  try {
    if (id) {
      run(
        `UPDATE categories SET name = ?, kind = ?, color_slot = ?, budget_usdt = ?, note = ?
         WHERE id = ?`,
        name, kind, slot, kind === "out" ? budget : 0, str(fd, "note"), id,
      );
    } else {
      run(
        `INSERT INTO categories (name, kind, color_slot, budget_usdt, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        name, kind, slot, kind === "out" ? budget : 0, str(fd, "note"),
        new Date().toISOString(),
      );
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("UNIQUE")) return { ok: false, error: `Kategori "${name}" sudah ada.` };
    return { ok: false, error: `Gagal menyimpan: ${msg}` };
  }

  logActivity(me, id ? "ubah-kategori" : "tambah-kategori", name);
  await touchSession(me);
  refresh();
  return { ok: true, message: id ? "Kategori diperbarui." : "Kategori ditambahkan." };
}

export async function toggleArchiveCategory(fd: FormData): Promise<void> {
  const me = await authed();
  if (!me || !canManageMaster(me)) return;
  const id = Number(str(fd, "id"));
  if (Number.isInteger(id) && id > 0) {
    run(`UPDATE categories SET archived = 1 - archived WHERE id = ?`, id);
    logActivity(me, "arsip-kategori", `#${id}`);
    refresh();
  }
}

export async function deleteCategory(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!canManageMaster(me)) return NOT_ADMIN;

  const id = Number(str(fd, "id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "ID kategori tidak valid." };

  const used = categoryUsage(id);
  if (used > 0)
    return {
      ok: false,
      error: `Kategori dipakai ${used} transaksi. Arsipkan saja agar riwayat tetap utuh.`,
    };

  run(`DELETE FROM categories WHERE id = ?`, id);
  logActivity(me, "hapus-kategori", `#${id}`);
  await touchSession(me);
  refresh();
  return { ok: true, message: "Kategori dihapus." };
}

/* ================================================= kunci periode & user */

export async function setLock(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await authed();
  if (!me) return DENIED;
  if (!canManageMaster(me)) return NOT_ADMIN;

  const value = str(fd, "lock_until");
  if (value !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(value))
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
  if (!canManageMaster(me)) return NOT_ADMIN;

  const username = str(fd, "username").toLowerCase();
  const role = str(fd, "role");
  const password = String(fd.get("password") ?? "");

  if (!/^[a-z0-9._-]{3,32}$/.test(username))
    return { ok: false, error: "Username 3–32 karakter: huruf kecil, angka, titik, garis bawah, strip." };
  if (role !== "admin" && role !== "staff")
    return { ok: false, error: "Peran tidak valid." };
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
    if (msg.includes("UNIQUE")) return { ok: false, error: `Username "${username}" sudah dipakai.` };
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
  if (!canManageMaster(me)) return NOT_ADMIN;

  const id = Number(str(fd, "id"));
  const target = getUserById(id);
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };

  const role = str(fd, "role");
  const active = str(fd, "active") === "1" ? 1 : 0;
  if (role !== "admin" && role !== "staff") return { ok: false, error: "Peran tidak valid." };

  // Jangan sampai admin aktif terakhir hilang — aplikasi jadi tak bisa dikelola.
  const losingAdmin = target.role === "admin" && (role !== "admin" || active === 0);
  if (losingAdmin && countActiveAdmins(target.id) === 0)
    return { ok: false, error: "Ini admin aktif terakhir. Angkat admin lain dulu." };
  if (target.id === me.id && active === 0)
    return { ok: false, error: "Tidak bisa menonaktifkan akun sendiri." };

  // Menonaktifkan akun harus langsung memutus sesinya yang sedang berjalan.
  const bump = active === 0 && target.active === 1 ? 1 : 0;
  run(
    `UPDATE users SET name = ?, role = ?, active = ?, session_epoch = session_epoch + ?
     WHERE id = ?`,
    str(fd, "name") || target.username, role, active, bump, id,
  );

  logActivity(me, "ubah-user", `${target.username} → ${role}${active ? "" : ", nonaktif"}`);
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
  if (!canManageMaster(me)) return NOT_ADMIN;

  const id = Number(str(fd, "id"));
  const target = getUserById(id);
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };

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
  if (!canManageMaster(me)) return NOT_ADMIN;

  const id = Number(str(fd, "id"));
  const target = getUserById(id);
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };
  if (target.id === me.id) return { ok: false, error: "Tidak bisa menghapus akun sendiri." };
  if (target.role === "admin" && countActiveAdmins(target.id) === 0)
    return { ok: false, error: "Ini admin aktif terakhir." };

  run(`DELETE FROM users WHERE id = ?`, id);
  logActivity(me, "hapus-user", target.username);
  await touchSession(me);
  refresh();
  return { ok: true, message: `Akun ${target.username} dihapus.` };
}
