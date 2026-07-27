import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DB_PATH, closeDb, getDb } from "./db";
import {
  activeBackend,
  deleteObject,
  getObject,
  listObjects,
  putObject,
  type StorageBackend,
} from "./storage";

export const BACKUP_FOLDER = "backup";
const PREFIX = "ledger-";
const SUFFIX = ".db";

/** Nama berkas membawa waktunya sendiri, jadi retensi tidak bergantung database. */
function nameFor(at: Date): string {
  return `${PREFIX}${at.toISOString().replace(/[:.]/g, "-").slice(0, 19)}Z${SUFFIX}`;
}

export function timeOf(name: string): Date | null {
  const m = name.match(/^ledger-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.db$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const t = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  return Number.isNaN(t) ? null : new Date(t);
}

export interface BackupFile {
  name: string;
  size: number;
  at: Date;
}

export async function listBackups(): Promise<BackupFile[]> {
  const objs = await listObjects(BACKUP_FOLDER);
  return objs
    .map((o) => ({ name: o.name, size: o.size, at: timeOf(o.name) }))
    .filter((o): o is BackupFile => o.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

/* ------------------------------------------------------------- membuat */

const TMP_DIR = path.join(path.dirname(DB_PATH), "tmp");

/**
 * Memotret database yang sedang dipakai.
 *
 * `VACUUM INTO` menghasilkan salinan yang konsisten walau ada penulisan
 * berjalan dan WAL belum ter-checkpoint — menyalin berkasnya begitu saja
 * bisa menghasilkan database rusak.
 */
async function snapshotToBuffer(): Promise<Buffer> {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const tmp = path.join(TMP_DIR, `snap-${crypto.randomUUID()}.db`);
  try {
    // Path disisipkan sebagai literal SQL; nama dibuat sendiri dari UUID.
    getDb().exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    return await fs.readFile(tmp);
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

export interface BackupResult {
  name: string;
  size: number;
  backend: StorageBackend;
  pruned: number;
}

export async function createBackup(at = new Date()): Promise<BackupResult> {
  const body = await snapshotToBuffer();
  const name = nameFor(at);
  const backend = await putObject(name, body, "application/x-sqlite3", BACKUP_FOLDER);
  const pruned = await pruneBackups();
  return { name, size: body.length, backend, pruned };
}

/* ------------------------------------------------------------- retensi */

const KEEP_DAILY_DAYS = 14;
const KEEP_WEEKS = 8;
const KEEP_MONTHS = 12;

const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** Kunci minggu ISO, supaya "satu per minggu" tidak melompat di pergantian tahun. */
function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Retensi bertingkat: harian 14 hari, lalu satu per minggu selama 8 minggu,
 * lalu satu per bulan selama 12 bulan. Jangkauannya setahun dengan jumlah
 * berkas yang tetap kecil.
 */
export function planRetention(
  files: BackupFile[],
  now = new Date(),
): { keep: BackupFile[]; drop: BackupFile[] } {
  const sorted = [...files].sort((a, b) => b.at.getTime() - a.at.getTime());
  const keep = new Set<string>();
  const seenWeek = new Set<string>();
  const seenMonth = new Set<string>();
  const days = (f: BackupFile) => (now.getTime() - f.at.getTime()) / 86400000;

  for (const f of sorted) {
    const age = days(f);
    if (age <= KEEP_DAILY_DAYS) {
      keep.add(f.name);
      seenWeek.add(weekKey(f.at));
      seenMonth.add(monthKey(f.at));
      continue;
    }
    if (age <= KEEP_WEEKS * 7) {
      const k = weekKey(f.at);
      if (!seenWeek.has(k)) {
        seenWeek.add(k);
        seenMonth.add(monthKey(f.at));
        keep.add(f.name);
      }
      continue;
    }
    if (age <= KEEP_MONTHS * 31) {
      const k = monthKey(f.at);
      if (!seenMonth.has(k)) {
        seenMonth.add(k);
        keep.add(f.name);
      }
    }
  }

  // Snapshot terbaru selalu dipertahankan, seberapa pun tuanya.
  if (sorted.length > 0) keep.add(sorted[0].name);

  return {
    keep: sorted.filter((f) => keep.has(f.name)),
    drop: sorted.filter((f) => !keep.has(f.name)),
  };
}

export async function pruneBackups(now = new Date()): Promise<number> {
  const { drop } = planRetention(await listBackups(), now);
  for (const f of drop) await deleteObject(f.name, activeBackend(), BACKUP_FOLDER);
  return drop.length;
}

/* --------------------------------------------------------------- unduh */

export async function readBackup(name: string): Promise<Buffer | null> {
  if (!timeOf(name)) return null;
  const obj = await getObject(name, activeBackend(), BACKUP_FOLDER);
  return obj?.body ?? null;
}

export async function removeBackup(name: string): Promise<boolean> {
  if (!timeOf(name)) return false;
  await deleteObject(name, activeBackend(), BACKUP_FOLDER);
  return true;
}

/* ------------------------------------------------------------- restore */

/** Snapshot harus benar-benar database aplikasi ini, bukan berkas sembarang. */
async function validateSnapshot(file: string): Promise<string | null> {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of ["users", "transactions", "brands", "categories"])
      if (!tables.includes(t)) return `Berkas ini bukan backup aplikasi (tabel ${t} tidak ada).`;
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
    if (n < 1) return "Backup ini tidak punya satu pun akun — menolak memulihkan.";
    return null;
  } catch (e) {
    return `Berkas tidak terbaca sebagai database: ${(e as Error).message}`;
  } finally {
    db?.close();
  }
}

export interface RestoreResult {
  ok: boolean;
  error?: string;
  safetyBackup?: string;
}

/**
 * Menimpa database berjalan dengan isi sebuah snapshot.
 *
 * Urutannya: potret dulu kondisi sekarang (supaya keputusan ini bisa dibatalkan),
 * validasi calon penggantinya, baru tutup koneksi dan tukar berkasnya. Berkas
 * -wal dan -shm ikut dibuang; kalau tidak, sisa WAL lama akan diterapkan di atas
 * database baru dan merusaknya.
 */
export async function restoreBackup(name: string): Promise<RestoreResult> {
  if (!timeOf(name)) return { ok: false, error: "Nama backup tidak valid." };

  const body = await readBackup(name);
  if (!body) return { ok: false, error: "Backup tidak ditemukan di penyimpanan." };

  await fs.mkdir(TMP_DIR, { recursive: true });
  const staged = path.join(TMP_DIR, `restore-${crypto.randomUUID()}.db`);
  await fs.writeFile(staged, body);

  try {
    const problem = await validateSnapshot(staged);
    if (problem) return { ok: false, error: problem };

    let safety: string | undefined;
    try {
      safety = (await createBackup()).name;
    } catch (e) {
      return {
        ok: false,
        error: `Gagal membuat snapshot pengaman sebelum memulihkan: ${(e as Error).message}`,
      };
    }

    closeDb();
    await fs.copyFile(staged, DB_PATH);
    await fs.unlink(`${DB_PATH}-wal`).catch(() => {});
    await fs.unlink(`${DB_PATH}-shm`).catch(() => {});
    getDb(); // buka ulang + jalankan migrasi pada isi yang baru

    return { ok: true, safetyBackup: safety };
  } finally {
    await fs.unlink(staged).catch(() => {});
  }
}

/* ------------------------------------------------------------ ringkasan */

export interface BackupOverview {
  rows: Array<{
    name: string;
    size: number;
    when: Date;
    tier: "harian" | "mingguan" | "bulanan" | "akan dibuang";
    isLatest: boolean;
  }>;
  count: number;
  totalBytes: number;
  /** Jam sejak snapshot terakhir; null kalau belum ada satu pun. */
  staleHours: number | null;
}

/**
 * Menyiapkan seluruh angka untuk halaman Backup di sini, bukan di komponen —
 * React melarang pemanggilan fungsi tak-murni seperti Date.now() saat render.
 */
export async function backupOverview(): Promise<BackupOverview> {
  const files = await listBackups();
  const now = Date.now();
  const kept = new Set(planRetention(files, new Date(now)).keep.map((f) => f.name));

  return {
    rows: files.map((f, i) => {
      const ageDays = (now - f.at.getTime()) / 86400000;
      return {
        name: f.name,
        size: f.size,
        when: f.at,
        tier:
          ageDays <= KEEP_DAILY_DAYS
            ? ("harian" as const)
            : ageDays <= KEEP_WEEKS * 7
              ? ("mingguan" as const)
              : kept.has(f.name)
                ? ("bulanan" as const)
                : ("akan dibuang" as const),
        isLatest: i === 0,
      };
    }),
    count: files.length,
    totalBytes: files.reduce((t, f) => t + f.size, 0),
    staleHours: files[0] ? (now - files[0].at.getTime()) / 3600000 : null,
  };
}
