import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.LEDGER_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "ledger.db");
export const BUKTI_DIR = path.join(DATA_DIR, "bukti");

// Dev hot-reload keeps re-evaluating this module; hold the handle on globalThis
// so we don't leak a new connection per reload.
const g = globalThis as unknown as { __ledgerDb?: DatabaseSync };

/** ALTER TABLE ADD COLUMN yang aman dijalankan berulang. */
function addColumn(db: DatabaseSync, table: string, col: string, def: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (cols.some((c) => c.name === col)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

function migrate(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      kind        TEXT    NOT NULL CHECK (kind IN ('in','out')) DEFAULT 'out',
      color_slot  INTEGER NOT NULL DEFAULT 1,
      budget_usdt REAL    NOT NULL DEFAULT 0,
      note        TEXT    NOT NULL DEFAULT '',
      archived    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brands (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      color_slot  INTEGER NOT NULL DEFAULT 1,
      pic         TEXT    NOT NULL DEFAULT '',
      note        TEXT    NOT NULL DEFAULT '',
      budget_usdt REAL    NOT NULL DEFAULT 0,
      archived    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      pass_hash       TEXT    NOT NULL,
      name            TEXT    NOT NULL DEFAULT '',
      role            TEXT    NOT NULL CHECK (role IN ('admin','staff')) DEFAULT 'staff',
      active          INTEGER NOT NULL DEFAULT 1,
      -- Dinaikkan saat password diganti / akun dinonaktifkan; token lama otomatis mati.
      session_epoch   INTEGER NOT NULL DEFAULT 1,
      pass_changed_at TEXT,
      last_seen_at    TEXT,
      created_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         TEXT    NOT NULL,
      type         TEXT    NOT NULL CHECK (type IN ('in','out')),
      amount_usdt  REAL    NOT NULL CHECK (amount_usdt > 0),
      fee_usdt     REAL    NOT NULL DEFAULT 0 CHECK (fee_usdt >= 0),
      -- Wajib diisi untuk 'in' (kurs beli USDT). NULL untuk 'out' berarti
      -- "ikut kurs pemasukan terakhir"; diisi = override manual.
      rate_idr     REAL,
      category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      description  TEXT    NOT NULL DEFAULT '',
      counterparty TEXT    NOT NULL DEFAULT '',
      tx_hash      TEXT    NOT NULL DEFAULT '',
      created_at   TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id           TEXT    PRIMARY KEY,
      tx_id        INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      stored_name  TEXT    NOT NULL,
      orig_name    TEXT    NOT NULL DEFAULT '',
      mime         TEXT    NOT NULL,
      size         INTEGER NOT NULL DEFAULT 0,
      uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requests (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_id         INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
      type          TEXT    NOT NULL CHECK (type IN ('edit','delete')),
      -- Untuk 'edit': JSON berisi nilai usulan. Untuk 'delete': null.
      payload       TEXT,
      -- Rekaman nilai transaksi saat diajukan, supaya riwayat tetap terbaca
      -- walau transaksinya sudah berubah/terhapus.
      snapshot      TEXT    NOT NULL DEFAULT '{}',
      reason        TEXT    NOT NULL DEFAULT '',
      status        TEXT    NOT NULL CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
      requested_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      requested_at  TEXT    NOT NULL,
      decided_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      decided_at    TEXT,
      decision_note TEXT    NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      ts       TEXT    NOT NULL,
      user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username TEXT    NOT NULL DEFAULT '',
      role     TEXT    NOT NULL DEFAULT '',
      action   TEXT    NOT NULL,
      detail   TEXT    NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_tx_date  ON transactions (date DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_tx_type  ON transactions (type, date DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_tx_cat   ON transactions (category_id);
    CREATE INDEX IF NOT EXISTS idx_att_tx   ON attachments (tx_id);
    CREATE INDEX IF NOT EXISTS idx_req_stat ON requests (status, requested_at DESC);
    CREATE INDEX IF NOT EXISTS idx_log_ts   ON activity_log (ts DESC);
  `);

  // Kolom yang menyusul setelah rilis awal.
  addColumn(db, "transactions", "brand_id", "INTEGER REFERENCES brands(id) ON DELETE SET NULL");
  addColumn(db, "transactions", "created_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL");
  addColumn(db, "transactions", "updated_at", "TEXT");
  // Backend penyimpanan bukti per baris, supaya berkas lama di disk tetap
  // terbaca setelah pindah ke Supabase Storage.
  addColumn(db, "attachments", "storage", "TEXT NOT NULL DEFAULT 'local'");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tx_brand ON transactions (brand_id)`);

  db.exec(`
    -- Aturan kurs: pemasukan memakai kurs belinya sendiri; pengeluaran mewarisi
    -- kurs dari pemasukan terakhir yang terjadi pada atau sebelum tanggal itu.
    DROP VIEW IF EXISTS tx_view;
    CREATE VIEW tx_view AS
    SELECT
      t.id, t.date, t.type, t.amount_usdt, t.fee_usdt, t.rate_idr,
      t.category_id, t.brand_id, t.description, t.counterparty, t.tx_hash,
      t.created_by, t.created_at, t.updated_at,
      c.name       AS category_name,
      c.color_slot AS color_slot,
      b.name       AS brand_name,
      b.color_slot AS brand_slot,
      u.username   AS created_by_name,
      COALESCE(t.rate_idr, (
        SELECT i.rate_idr
        FROM transactions i
        WHERE i.type = 'in'
          AND i.rate_idr IS NOT NULL
          AND (i.date < t.date OR (i.date = t.date AND i.id <= t.id))
        ORDER BY i.date DESC, i.id DESC
        LIMIT 1
      )) AS eff_rate,
      CASE WHEN t.rate_idr IS NULL THEN 'warisan' ELSE 'manual' END AS rate_source,
      CASE WHEN t.type = 'in'
           THEN t.amount_usdt - t.fee_usdt
           ELSE -(t.amount_usdt + t.fee_usdt)
      END AS delta_usdt,
      CASE WHEN t.type = 'in'
           THEN t.amount_usdt - t.fee_usdt
           ELSE t.amount_usdt + t.fee_usdt
      END AS flow_usdt,
      substr(t.date, 1, 7) AS month,
      (SELECT COUNT(*) FROM attachments a WHERE a.tx_id = t.id) AS bukti_count,
      (SELECT COUNT(*) FROM requests r WHERE r.tx_id = t.id AND r.status = 'pending') AS pending_count
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN brands     b ON b.id = t.brand_id
    LEFT JOIN users      u ON u.id = t.created_by;
  `);
}

const SEED_CATEGORIES: Array<[string, "in" | "out", number]> = [
  ["Top-up USDT", "in", 1],
  ["Pendapatan Klien", "in", 3],
  ["Iklan & Marketing", "out", 5],
  ["Operasional", "out", 2],
  ["Gaji & Fee Tim", "out", 4],
  ["Server & Tools", "out", 7],
  ["Withdraw Pribadi", "out", 8],
  ["Lain-lain", "out", 6],
];

function seed(db: DatabaseSync) {
  const n = (
    db.prepare(`SELECT COUNT(*) AS n FROM categories`).get() as { n: number }
  ).n;
  if (n > 0) return;
  const now = new Date().toISOString();
  const ins = db.prepare(
    `INSERT INTO categories (name, kind, color_slot, created_at) VALUES (?, ?, ?, ?)`,
  );
  for (const [name, kind, slot] of SEED_CATEGORIES) ins.run(name, kind, slot, now);
}

export function getDb(): DatabaseSync {
  if (g.__ledgerDb) return g.__ledgerDb;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BUKTI_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  migrate(db);
  seed(db);
  g.__ledgerDb = db;
  return db;
}

// node:sqlite mengembalikan baris ber-prototype null; React menolak
// meneruskannya ke Client Component, jadi disalin jadi objek biasa di sini.
function plain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

export function all<T>(sql: string, ...params: unknown[]): T[] {
  return getDb()
    .prepare(sql)
    .all(...(params as never[]))
    .map((r) => plain<T>(r));
}

export function one<T>(sql: string, ...params: unknown[]): T | undefined {
  const row = getDb()
    .prepare(sql)
    .get(...(params as never[]));
  return row === undefined ? undefined : plain<T>(row);
}

export function run(sql: string, ...params: unknown[]) {
  return getDb()
    .prepare(sql)
    .run(...(params as never[]));
}

export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // transaksi sudah tergulung sendiri
    }
    throw e;
  }
}

/* ------------------------------------------------------------- pengaturan */

export function getSetting(key: string): string | null {
  return one<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, key)
    ?.value ?? null;
}

export function setSetting(key: string, value: string) {
  run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export { DB_PATH };
