import { getSetting, run, setSetting } from "./db";
import type { Role } from "./types";

/* ------------------------------------------------------- kunci pembukuan */

/**
 * Tanggal terakhir yang sudah dikunci (YYYY-MM-DD). Semua transaksi pada
 * tanggal ini atau sebelumnya tidak bisa ditambah, diubah, atau dihapus —
 * termasuk oleh owner. Hanya kuncinya sendiri yang bisa dimundurkan.
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

/* ------------------------------------------------------------------ izin */

export const PERM_LIST = [
  ["addPengajuan", "Buat pengajuan dana", "Menyusun permintaan dana ke finance."],
  ["editPengajuan", "Ubah & hapus pengajuan", "Termasuk mengubah status jadi diajukan/disetujui/ditolak."],
  [
    "markPaid",
    "Tandai dana cair",
    "Menandai pengajuan sudah dibayar — dari sinilah baris buku besar lahir.",
  ],
  ["addBelanja", "Catat belanja & mutasi dompet", "Termasuk input harian dari dompet."],
  ["editBelanja", "Ubah transaksi", "Memperbaiki baris buku besar yang sudah tercatat."],
  ["deleteBelanja", "Hapus transaksi", "Membuang baris buku besar."],
  ["manageDompet", "Kelola dompet", "Menambah dompet, mengubah saldo awal, mencatat opname."],
  [
    "manageMaster",
    "Kelola data master",
    "Divisi, category, akun iklan, brand, dan rekening penerima.",
  ],
  ["lockPeriod", "Kunci periode", "Membekukan transaksi sampai tanggal tertentu."],
  ["manageUsers", "Kelola akun", "Membuat akun, mengubah peran, dan me-reset password."],
  ["viewActivity", "Lihat log aktivitas", "Menelusuri jejak semua perubahan."],
  ["exportData", "Ekspor CSV", "Mengunduh transaksi pada filter aktif."],
] as const;

export type PermKey = (typeof PERM_LIST)[number][0];

export const PERM_KEYS = PERM_LIST.map(([k]) => k) as readonly PermKey[];

export type PermMap = Partial<Record<PermKey, boolean>>;

/** Default bawaan. Owner tidak ada di sini — owner selalu boleh segalanya. */
export const DEFAULT_ROLE_PERMS: Record<"admin" | "staff", Record<PermKey, boolean>> = {
  admin: {
    addPengajuan: true,
    editPengajuan: true,
    markPaid: true,
    addBelanja: true,
    editBelanja: true,
    deleteBelanja: true,
    manageDompet: true,
    manageMaster: true,
    lockPeriod: true,
    manageUsers: false,
    viewActivity: true,
    exportData: true,
  },
  // Staff mencatat, tidak memutuskan: dia boleh mengisi pengajuan dan belanja
  // harian, tapi tidak menandai dana cair maupun mengubah baris yang sudah ada.
  staff: {
    addPengajuan: true,
    editPengajuan: false,
    markPaid: false,
    addBelanja: true,
    editBelanja: false,
    deleteBelanja: false,
    manageDompet: false,
    manageMaster: false,
    lockPeriod: false,
    manageUsers: false,
    viewActivity: false,
    exportData: false,
  },
};

function parsePerms(raw: string | null | undefined): PermMap {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return {};
    const out: PermMap = {};
    for (const k of PERM_KEYS) if (typeof o[k] === "boolean") out[k] = o[k];
    return out;
  } catch {
    return {};
  }
}

function parseRoleSetting(raw: string | null): { admin: PermMap; staff: PermMap } {
  if (!raw) return { admin: {}, staff: {} };
  try {
    const o = JSON.parse(raw);
    return {
      admin: parsePerms(JSON.stringify(o?.admin ?? {})),
      staff: parsePerms(JSON.stringify(o?.staff ?? {})),
    };
  } catch {
    return { admin: {}, staff: {} };
  }
}

/** Izin default tiap peran, bisa diubah owner. */
export function getRolePerms(): Record<"admin" | "staff", Record<PermKey, boolean>> {
  const stored = parseRoleSetting(getSetting("role_perms"));
  return {
    admin: { ...DEFAULT_ROLE_PERMS.admin, ...stored.admin },
    staff: { ...DEFAULT_ROLE_PERMS.staff, ...stored.staff },
  };
}

export function setRolePerms(next: Record<"admin" | "staff", PermMap>) {
  setSetting("role_perms", JSON.stringify(next));
}

export interface Principal {
  id: number;
  username: string;
  role: Role;
  /** Override per user; kunci yang tidak ada berarti ikut default peran. */
  perms?: string | null;
}

/**
 * Sumber kebenaran hak akses. Urutannya: owner selalu boleh → override per
 * user → default peran. Dipanggil di server pada setiap aksi, bukan hanya
 * dipakai untuk menyembunyikan tombol.
 */
export function hasPerm(user: Principal | null, key: PermKey): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  const own = parsePerms(user.perms);
  if (Object.prototype.hasOwnProperty.call(own, key)) return Boolean(own[key]);
  const byRole = getRolePerms()[user.role as "admin" | "staff"];
  return Boolean(byRole?.[key]);
}

/** Seluruh izin efektif seorang user — dipakai UI untuk menyembunyikan menu. */
export function effectivePerms(user: Principal | null): Record<PermKey, boolean> {
  const out = {} as Record<PermKey, boolean>;
  for (const k of PERM_KEYS) out[k] = hasPerm(user, k);
  return out;
}

/** Boleh membuka bagian Admin kalau punya salah satu izin pengelolaan. */
export const ADMIN_SECTION_PERMS: PermKey[] = [
  "manageUsers",
  "lockPeriod",
  "viewActivity",
];

export function canOpenAdmin(user: Principal | null): boolean {
  return ADMIN_SECTION_PERMS.some((k) => hasPerm(user, k));
}

export const isOwner = (u: Principal | null) => !!u && u.role === "owner";

/* -------------------------------------------------------- log aktivitas */

export function logActivity(
  user: Pick<Principal, "id" | "username" | "role">,
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
