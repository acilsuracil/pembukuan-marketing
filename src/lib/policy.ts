import { getSetting, run } from "./db";
import type { SessionUser } from "./session";

/* ------------------------------------------------------- kunci pembukuan */

/**
 * Tanggal terakhir yang sudah dikunci (YYYY-MM-DD). Semua transaksi pada
 * tanggal ini atau sebelumnya tidak bisa ditambah, diubah, atau dihapus —
 * termasuk oleh admin. Admin hanya bisa memundurkan/melepas kuncinya.
 */
export function getLockUntil(): string | null {
  const v = getSetting("lock_until");
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function isLocked(date: string | null | undefined): boolean {
  const lock = getLockUntil();
  if (!lock || !date) return false;
  return date <= lock;
}

export function lockError(date: string): string {
  return `Periode sampai ${getLockUntil()} sudah dikunci, transaksi tanggal ${date} tidak bisa diubah.`;
}

/* ----------------------------------------------------------- kewenangan */

/** Staff mencatat langsung, tapi perubahan & penghapusan lewat pengajuan. */
export function canEditDirectly(u: SessionUser): boolean {
  return u.role === "admin";
}
export function canManageMaster(u: SessionUser): boolean {
  return u.role === "admin";
}
export function canDecideRequests(u: SessionUser): boolean {
  return u.role === "admin";
}

/* -------------------------------------------------------- log aktivitas */

export function logActivity(
  user: Pick<SessionUser, "id" | "username" | "role">,
  action: string,
  detail = "",
) {
  try {
    run(
      `INSERT INTO activity_log (ts, user_id, username, role, action, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
      new Date().toISOString(),
      user.id,
      user.username,
      user.role,
      action,
      detail,
    );
  } catch {
    // pencatatan log tidak boleh menggagalkan aksi utamanya
  }
}
