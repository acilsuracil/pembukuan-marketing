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
    "approveBayar",
    "Persetujuan pembayaran",
    "Menyetujui pengajuan yang sudah lolos leader, sebelum Finance melakukan pembayaran.",
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

/** Peran yang izinnya diatur lewat default peran. Owner selalu boleh segalanya. */
export const ROLE_PERM_ROLES = ["staff", "admin", "finance"] as const;

export type RolePermRole = (typeof ROLE_PERM_ROLES)[number];

/**
 * Default bawaan. Owner (Penyetuju) tidak ada di sini — owner selalu boleh
 * segalanya. Pembayaran bukan izin: itu tugas peran Finance (lihat bisaBayar).
 */
export const DEFAULT_ROLE_PERMS: Record<RolePermRole, Record<PermKey, boolean>> = {
  // Leader divisi: menyetujui pengajuan divisinya dan mengelola data harian.
  admin: {
    addPengajuan: true,
    editPengajuan: true,
    approveBayar: false,
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
  // harian, tapi tidak mengubah baris yang sudah ada.
  staff: {
    addPengajuan: true,
    editPengajuan: false,
    approveBayar: false,
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
  // Finance membayar pengajuan yang sudah disetujui dan merapikan buku besar,
  // tapi tidak mengubah pengajuan maupun data master.
  finance: {
    addPengajuan: true,
    editPengajuan: false,
    approveBayar: false,
    addBelanja: true,
    editBelanja: true,
    deleteBelanja: true,
    manageDompet: true,
    manageMaster: false,
    lockPeriod: true,
    manageUsers: false,
    viewActivity: true,
    exportData: true,
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

function parseRoleSetting(raw: string | null): Record<RolePermRole, PermMap> {
  const out: Record<RolePermRole, PermMap> = { admin: {}, staff: {}, finance: {} };
  if (!raw) return out;
  try {
    const o = JSON.parse(raw);
    for (const r of ROLE_PERM_ROLES) out[r] = parsePerms(JSON.stringify(o?.[r] ?? {}));
    return out;
  } catch {
    return out;
  }
}

/** Izin default tiap peran, bisa diubah owner. */
export function getRolePerms(): Record<RolePermRole, Record<PermKey, boolean>> {
  const stored = parseRoleSetting(getSetting("role_perms"));
  return {
    admin: { ...DEFAULT_ROLE_PERMS.admin, ...stored.admin },
    staff: { ...DEFAULT_ROLE_PERMS.staff, ...stored.staff },
    finance: { ...DEFAULT_ROLE_PERMS.finance, ...stored.finance },
  };
}

export function setRolePerms(next: Record<RolePermRole, PermMap>) {
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
  const byRole = getRolePerms()[user.role as RolePermRole];
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
