import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR_EXPLICIT = Boolean(
  process.env.MARKETING_DATA_DIR ?? process.env.LEDGER_DATA_DIR,
);
// `turbopackIgnore` menahan penelusur berkas Turbopack: letak folder data baru
// diketahui saat runtime, dan tanpa penanda ini ia menyeret seluruh folder
// proyek ke dalam trace keluaran build.
export const DATA_DIR =
  process.env.MARKETING_DATA_DIR ??
  process.env.LEDGER_DATA_DIR ??
  path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "marketing.db");
export const BUKTI_DIR = path.join(DATA_DIR, "bukti");

/** Nama env var yang dibaca — dipakai teks peringatan supaya tidak salah sebut. */
export const DATA_DIR_ENV = "MARKETING_DATA_DIR";

/**
 * Deteksi database yang berumur sependek deployment.
 *
 * Di platform seperti Railway, filesystem aplikasi dibuang setiap deploy. Kalau
 * database mendarat di dalam folder aplikasi, seluruh pembukuan ikut terhapus
 * tiap kali kode diperbarui — dan gejalanya menipu: aplikasi tetap jalan, hanya
 * datanya kosong lagi. Ini dipakai untuk memperingatkan sebelum data asli masuk.
 */
export function dataDirHealth() {
  const insideApp = path
    .resolve(DATA_DIR)
    .startsWith(path.resolve(/*turbopackIgnore: true*/ process.cwd()) + path.sep);
  let dbCreatedAt: string | null = null;
  let sizeBytes = 0;
  try {
    const st = fs.statSync(DB_PATH);
    dbCreatedAt = st.birthtime.toISOString();
    sizeBytes = st.size;
  } catch {
    // database belum terbentuk
  }
  return {
    dir: DATA_DIR,
    explicit: DATA_DIR_EXPLICIT,
    insideApp,
    /** Benar = data hampir pasti hilang setiap redeploy. */
    ephemeralRisk: !DATA_DIR_EXPLICIT || insideApp,
    dbCreatedAt,
    sizeBytes,
  };
}

// Dev hot-reload terus mengevaluasi ulang modul ini; pegangannya disimpan di
// globalThis supaya tidak lahir koneksi baru setiap reload.
const g = globalThis as unknown as { __mktDb?: DatabaseSync };

/** ALTER TABLE ADD COLUMN yang aman dijalankan berulang. */
function addColumn(db: DatabaseSync, table: string, col: string, def: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (cols.some((c) => c.name === col)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

/** Instalasi lama tidak punya owner — akun paling awal yang diangkat. */
function promoteFirstOwner(db: DatabaseSync) {
  const owners = (
    db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'owner'`).get() as {
      n: number;
    }
  ).n;
  if (owners > 0) return;
  const first = db.prepare(`SELECT id FROM users ORDER BY id LIMIT 1`).get() as
    | { id: number }
    | undefined;
  if (first) db.prepare(`UPDATE users SET role = 'owner' WHERE id = ?`).run(first.id);
}

/**
 * Menambah jenis `transfer_keluar` / `transfer_masuk` pada pembukuan yang sudah
 * berjalan.
 *
 * CHECK constraint tidak bisa diubah lewat ALTER TABLE di SQLite, jadi tabelnya
 * dibangun ulang. Yang penting dijaga di sini: `attachments` mengacu ke tabel
 * `transaksi` **berdasarkan nama**, sehingga tautannya utuh kembali setelah
 * rename — dan indeks ikut terbuang bersama tabel lama, jadi dibuat ulang.
 */
function upgradeTransaksiJenis(db: DatabaseSync) {
  const ddl = (
    db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='transaksi'`)
      .get() as { sql?: string } | undefined
  )?.sql;
  if (!ddl || ddl.includes("transfer_keluar")) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`
      -- View mengacu ke transaksi; selama masih ada, tabelnya tidak bisa
      -- dibuang. Keduanya dibuat ulang tepat setelah migrasi, di migrate().
      DROP VIEW IF EXISTS v_saldo_dompet;
      DROP VIEW IF EXISTS v_transaksi;

      CREATE TABLE transaksi_migrated (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        tanggal       TEXT    NOT NULL,
        jenis         TEXT    NOT NULL
                      CHECK (jenis IN ('topup','belanja','refund','biaya_dompet','koreksi',
                                       'transfer_keluar','transfer_masuk')),
        nominal       INTEGER NOT NULL CHECK (nominal > 0),
        arah          INTEGER NOT NULL DEFAULT 1 CHECK (arah IN (-1, 1)),
        sumber        TEXT CHECK (sumber IS NULL OR sumber IN ('finance','dompet')),
        dompet_id     INTEGER REFERENCES dompet(id)     ON DELETE SET NULL,
        divisi_id     INTEGER REFERENCES divisi(id)     ON DELETE SET NULL,
        platform_id   INTEGER REFERENCES platform(id)   ON DELETE SET NULL,
        brand_id      INTEGER REFERENCES brand(id)      ON DELETE SET NULL,
        akun_iklan_id INTEGER REFERENCES akun_iklan(id) ON DELETE SET NULL,
        penerima_id   INTEGER REFERENCES penerima(id)   ON DELETE SET NULL,
        pengajuan_id  INTEGER REFERENCES pengajuan(id)  ON DELETE SET NULL,
        keterangan    TEXT    NOT NULL DEFAULT '',
        no_ref        TEXT    NOT NULL DEFAULT '',
        split_group   TEXT,
        pasangan_id   INTEGER REFERENCES transaksi(id)  ON DELETE SET NULL,
        created_by    INTEGER REFERENCES users(id)      ON DELETE SET NULL,
        created_at    TEXT    NOT NULL,
        updated_at    TEXT,

        CHECK (jenis <> 'belanja'
               OR (sumber IS NOT NULL AND sumber IN ('finance','dompet'))),
        CHECK (jenis =  'belanja' OR sumber IS NULL),
        CHECK (NOT (jenis = 'belanja' AND sumber = 'dompet' AND dompet_id IS NULL)),
        CHECK (jenis <> 'topup'           OR dompet_id IS NOT NULL),
        CHECK (jenis <> 'biaya_dompet'    OR dompet_id IS NOT NULL),
        CHECK (jenis <> 'koreksi'         OR dompet_id IS NOT NULL),
        CHECK (jenis <> 'transfer_keluar' OR dompet_id IS NOT NULL),
        CHECK (jenis <> 'transfer_masuk'  OR dompet_id IS NOT NULL)
      );

      INSERT INTO transaksi_migrated
        (id, tanggal, jenis, nominal, arah, sumber, dompet_id, divisi_id,
         platform_id, brand_id, akun_iklan_id, penerima_id, pengajuan_id,
         keterangan, no_ref, split_group, created_by, created_at, updated_at)
      SELECT
         id, tanggal, jenis, nominal, arah, sumber, dompet_id, divisi_id,
         platform_id, brand_id, akun_iklan_id, penerima_id, pengajuan_id,
         keterangan, no_ref, split_group, created_by, created_at, updated_at
      FROM transaksi;

      DROP TABLE transaksi;
      ALTER TABLE transaksi_migrated RENAME TO transaksi;

      CREATE INDEX IF NOT EXISTS idx_tr_tanggal  ON transaksi (tanggal DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_tr_jenis    ON transaksi (jenis, tanggal DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_tr_divisi   ON transaksi (divisi_id);
      CREATE INDEX IF NOT EXISTS idx_tr_platform ON transaksi (platform_id);
      CREATE INDEX IF NOT EXISTS idx_tr_brand    ON transaksi (brand_id);
      CREATE INDEX IF NOT EXISTS idx_tr_dompet   ON transaksi (dompet_id, tanggal, id);
      CREATE INDEX IF NOT EXISTS idx_tr_pengaju  ON transaksi (pengajuan_id);
      CREATE INDEX IF NOT EXISTS idx_tr_pasangan ON transaksi (pasangan_id);
    `);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

/*
 * Seluruh nominal disimpan INTEGER rupiah utuh, tanpa sen.
 *
 * Bukan penyederhanaan: REAL membuat penjumlahan meleset pecahan sen yang tidak
 * pernah kelihatan di satu baris tapi menumpuk di total, dan pembukuan yang
 * totalnya tidak persis sama dengan jumlah barisnya tidak bisa dipakai
 * mencocokkan mutasi bank. Rupiah memang tidak punya pecahan yang dipakai.
 */
function migrate(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    /* ------------------------------------------------------ data master */

    CREATE TABLE IF NOT EXISTS divisi (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      color_slot INTEGER NOT NULL DEFAULT 1,
      budget_idr INTEGER NOT NULL DEFAULT 0,
      note       TEXT    NOT NULL DEFAULT '',
      archived   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brand (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      pic        TEXT    NOT NULL DEFAULT '',
      color_slot INTEGER NOT NULL DEFAULT 1,
      budget_idr INTEGER NOT NULL DEFAULT 0,
      note       TEXT    NOT NULL DEFAULT '',
      archived   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL
    );

    -- Jenis pembayaran: Perpanjang, Pembayaran, Gajian, Pelunasan, Kontrak Baru.
    --
    -- Ini BUKAN kolom 'jenis' di transaksi. Kolom itu menyatakan arah uang
    -- (topup/belanja/refund) dan ikut menentukan saldo, jadi daftarnya ditutup
    -- di CHECK dan tidak boleh bertambah tanpa mengubah rumusnya. Yang ini
    -- sebutan kerja sehari-hari untuk pengeluaran yang sama — tidak
    -- mempengaruhi angka mana pun, dan memang perlu bebas ditambah sendiri.
    CREATE TABLE IF NOT EXISTS jenis_bayar (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      color_slot INTEGER NOT NULL DEFAULT 1,
      budget_idr INTEGER NOT NULL DEFAULT 0,
      note       TEXT    NOT NULL DEFAULT '',
      archived   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL
    );

    -- Dompet yang kita pegang sendiri (Bank Jago, Jenius). saldo_awal +
    -- tanggal_awal adalah titik nol pembukuannya.
    CREATE TABLE IF NOT EXISTS dompet (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      jenis        TEXT    NOT NULL CHECK (jenis IN ('bank','ewallet','lain')) DEFAULT 'bank',
      bank         TEXT    NOT NULL DEFAULT '',
      no_rek       TEXT    NOT NULL DEFAULT '',
      pemilik      TEXT    NOT NULL DEFAULT '',
      saldo_awal   INTEGER NOT NULL DEFAULT 0,
      tanggal_awal TEXT    NOT NULL,
      min_saldo    INTEGER NOT NULL DEFAULT 0,
      note         TEXT    NOT NULL DEFAULT '',
      archived     INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL
    );

    -- Platform tidak terikat satu divisi. divisi_id di sini hanya usulan yang
    -- mengisi formulir; divisi yang mengikat laporan adalah kolom di transaksi,
    -- jadi TikTok bisa dipakai divisi Ads maupun Endorse tanpa dibuat dua kali.
    CREATE TABLE IF NOT EXISTS platform (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      divisi_id  INTEGER REFERENCES divisi(id) ON DELETE SET NULL,
      dompet_id  INTEGER REFERENCES dompet(id) ON DELETE SET NULL,
      color_slot INTEGER NOT NULL DEFAULT 1,
      note       TEXT    NOT NULL DEFAULT '',
      archived   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS akun_iklan (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_id INTEGER NOT NULL REFERENCES platform(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      brand_id    INTEGER REFERENCES brand(id)  ON DELETE SET NULL,
      dompet_id   INTEGER REFERENCES dompet(id) ON DELETE SET NULL,
      note        TEXT    NOT NULL DEFAULT '',
      archived    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL,
      UNIQUE (platform_id, name)
    );

    -- Rekening tujuan transfer: endorser, agency, vendor SEO. Disimpan supaya
    -- format pengajuan ke finance tidak perlu diketik ulang tiap kali.
    CREATE TABLE IF NOT EXISTS penerima (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nama       TEXT    NOT NULL,
      bank       TEXT    NOT NULL DEFAULT '',
      no_rek     TEXT    NOT NULL DEFAULT '',
      note       TEXT    NOT NULL DEFAULT '',
      archived   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL,
      UNIQUE (nama, bank, no_rek)
    );

    /* -------------------------------------------------------- pengguna */

    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      pass_hash       TEXT    NOT NULL,
      name            TEXT    NOT NULL DEFAULT '',
      role            TEXT    NOT NULL CHECK (role IN ('owner','admin','staff')) DEFAULT 'staff',
      active          INTEGER NOT NULL DEFAULT 1,
      -- Override izin per user (JSON). NULL = ikut default perannya.
      perms           TEXT,
      -- Dinaikkan saat password diganti / akun dinonaktifkan; token lama mati.
      session_epoch   INTEGER NOT NULL DEFAULT 1,
      pass_changed_at TEXT,
      last_seen_at    TEXT,
      created_at      TEXT    NOT NULL
    );

    /* ------------------------------------------ pengajuan dana ke finance */

    CREATE TABLE IF NOT EXISTS pengajuan (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal       TEXT    NOT NULL,
      keterangan    TEXT    NOT NULL DEFAULT '',
      nominal       INTEGER NOT NULL CHECK (nominal > 0),
      -- 'langsung' = finance transfer ke rekening penerima.
      -- 'dompet'   = finance mengisi dompet kita, belanjanya dicatat menyusul.
      tujuan        TEXT    NOT NULL CHECK (tujuan IN ('langsung','dompet')),
      penerima_id   INTEGER REFERENCES penerima(id) ON DELETE SET NULL,
      dompet_id     INTEGER REFERENCES dompet(id)   ON DELETE SET NULL,
      brand_id      INTEGER REFERENCES brand(id)    ON DELETE SET NULL,
      platform_id   INTEGER REFERENCES platform(id) ON DELETE SET NULL,
      divisi_id     INTEGER REFERENCES divisi(id)   ON DELETE SET NULL,
      status        TEXT    NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','diajukan','disetujui','ditolak','dibayar')),
      tanggal_bayar TEXT,
      -- Diisi hanya kalau yang cair beda dari yang diminta.
      nominal_cair  INTEGER CHECK (nominal_cair IS NULL OR nominal_cair > 0),
      catatan       TEXT    NOT NULL DEFAULT '',
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT,
      -- Rute 'dompet' harus menyebut dompetnya; tanpa itu dana cair tidak punya
      -- tempat mendarat dan saldo tidak akan pernah cocok.
      CHECK (tujuan <> 'dompet' OR dompet_id IS NOT NULL)
    );

    -- Satu permintaan dana yang dipakai beberapa brand: porsinya ditulis di sini,
    -- satu baris per brand, dalam rupiah — bukan persen.
    --
    -- Persen tidak pernah berjumlah pas: 33,33% × 3 kurang sepeser dari nominal,
    -- dan pecahan itu akan muncul lagi sebagai selisih di laporan. Porsi rupiah
    -- bisa diperiksa sama-persis dengan nominalnya, dan itu yang ditegakkan.
    --
    -- Dipakai hanya kalau brand-nya lebih dari satu; satu brand tetap memakai
    -- kolom brand_id di pengajuan, jadi pengajuan lama tidak berubah artinya.
    CREATE TABLE IF NOT EXISTS pengajuan_brand (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      pengajuan_id INTEGER NOT NULL REFERENCES pengajuan(id) ON DELETE CASCADE,
      -- RESTRICT, bukan CASCADE: menghapus brand yang punya porsi akan membuat
      -- jumlah porsi tidak lagi sama dengan nominalnya, diam-diam.
      brand_id     INTEGER NOT NULL REFERENCES brand(id) ON DELETE RESTRICT,
      nominal      INTEGER NOT NULL CHECK (nominal > 0),
      UNIQUE (pengajuan_id, brand_id)
    );

    /* ------------------------------------------------------- buku besar */

    CREATE TABLE IF NOT EXISTS transaksi (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal       TEXT    NOT NULL,
      jenis         TEXT    NOT NULL
                    CHECK (jenis IN ('topup','belanja','refund','biaya_dompet','koreksi',
                                     'transfer_keluar','transfer_masuk')),
      nominal       INTEGER NOT NULL CHECK (nominal > 0),
      -- Hanya dipakai 'koreksi': +1 menambah saldo, -1 menguranginya.
      arah          INTEGER NOT NULL DEFAULT 1 CHECK (arah IN (-1, 1)),
      -- Dari mana uang belanja ini berasal. Wajib untuk 'belanja', kosong untuk
      -- jenis lain — jenis lain sudah menyatakan asalnya lewat dompet_id.
      sumber        TEXT CHECK (sumber IS NULL OR sumber IN ('finance','dompet')),
      dompet_id     INTEGER REFERENCES dompet(id)     ON DELETE SET NULL,
      divisi_id     INTEGER REFERENCES divisi(id)     ON DELETE SET NULL,
      platform_id   INTEGER REFERENCES platform(id)   ON DELETE SET NULL,
      brand_id      INTEGER REFERENCES brand(id)      ON DELETE SET NULL,
      akun_iklan_id INTEGER REFERENCES akun_iklan(id) ON DELETE SET NULL,
      penerima_id   INTEGER REFERENCES penerima(id)   ON DELETE SET NULL,
      pengajuan_id  INTEGER REFERENCES pengajuan(id)  ON DELETE SET NULL,
      keterangan    TEXT    NOT NULL DEFAULT '',
      no_ref        TEXT    NOT NULL DEFAULT '',
      -- Satu pembayaran yang dipakai beberapa brand dicatat sebagai beberapa
      -- baris; kolom ini yang mengikat pecahannya. NULL = transaksi biasa.
      split_group   TEXT,
      -- Sisi lain dari sebuah pindah saldo antar-dompet.
      --
      -- Pindah saldo dicatat sebagai DUA baris — keluar dari dompet asal, masuk
      -- ke dompet tujuan — bukan satu baris yang menyentuh dua dompet. Alasannya
      -- sama dengan yang membuat saldo bisa dipercaya: setiap baris milik tepat
      -- satu dompet, jadi seluruh perhitungan saldo, mutasi, dan opname tetap
      -- benar tanpa diubah sedikit pun. NULL = bukan bagian dari transfer.
      pasangan_id   INTEGER REFERENCES transaksi(id) ON DELETE SET NULL,
      jenis_bayar_id INTEGER REFERENCES jenis_bayar(id) ON DELETE SET NULL,
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT,

      -- Bentuk baris ditegakkan database, bukan hanya formulir: satu baris yang
      -- lolos dengan kolom kosong akan membuat saldo dompet atau total biaya
      -- meleset tanpa jejak siapa pun.
      -- sumber IS NOT NULL AND … sengaja ditulis panjang: di SQL NULL IN (…)
      -- bernilai NULL, dan CHECK yang bernilai NULL dianggap **lolos** oleh SQLite.
      -- Bentuk ringkasnya justru meloloskan belanja tanpa sumber dana — baris yang
      -- tidak akan pernah cocok dengan saldo dompet mana pun.
      CHECK (jenis <> 'belanja'
             OR (sumber IS NOT NULL AND sumber IN ('finance','dompet'))),
      CHECK (jenis =  'belanja' OR sumber IS NULL),
      CHECK (NOT (jenis = 'belanja' AND sumber = 'dompet' AND dompet_id IS NULL)),
      CHECK (jenis <> 'topup'           OR dompet_id IS NOT NULL),
      CHECK (jenis <> 'biaya_dompet'    OR dompet_id IS NOT NULL),
      CHECK (jenis <> 'koreksi'         OR dompet_id IS NOT NULL),
      CHECK (jenis <> 'transfer_keluar' OR dompet_id IS NOT NULL),
      CHECK (jenis <> 'transfer_masuk'  OR dompet_id IS NOT NULL)
    );

    CREATE TABLE IF NOT EXISTS dompet_opname (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      dompet_id    INTEGER NOT NULL REFERENCES dompet(id) ON DELETE CASCADE,
      tanggal      TEXT    NOT NULL,
      saldo_aktual INTEGER NOT NULL,
      catatan      TEXT    NOT NULL DEFAULT '',
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id          TEXT    PRIMARY KEY,
      tx_id       INTEGER NOT NULL REFERENCES transaksi(id) ON DELETE CASCADE,
      stored_name TEXT    NOT NULL,
      orig_name   TEXT    NOT NULL DEFAULT '',
      mime        TEXT    NOT NULL,
      size        INTEGER NOT NULL DEFAULT 0,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TEXT    NOT NULL,
      storage     TEXT    NOT NULL DEFAULT 'local'
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

    CREATE INDEX IF NOT EXISTS idx_tr_tanggal  ON transaksi (tanggal DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_tr_jenis    ON transaksi (jenis, tanggal DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_tr_divisi   ON transaksi (divisi_id);
    CREATE INDEX IF NOT EXISTS idx_tr_platform ON transaksi (platform_id);
    CREATE INDEX IF NOT EXISTS idx_tr_brand    ON transaksi (brand_id);
    CREATE INDEX IF NOT EXISTS idx_tr_dompet   ON transaksi (dompet_id, tanggal, id);
    CREATE INDEX IF NOT EXISTS idx_tr_pengaju  ON transaksi (pengajuan_id);
    CREATE INDEX IF NOT EXISTS idx_pg_status   ON pengajuan (status, tanggal DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_pgb_pengaju ON pengajuan_brand (pengajuan_id);
    CREATE INDEX IF NOT EXISTS idx_pgb_brand   ON pengajuan_brand (brand_id);
    CREATE INDEX IF NOT EXISTS idx_op_dompet   ON dompet_opname (dompet_id, tanggal DESC);
    CREATE INDEX IF NOT EXISTS idx_att_tx      ON attachments (tx_id);
    CREATE INDEX IF NOT EXISTS idx_log_ts      ON activity_log (ts DESC);
  `);

  addColumn(db, "users", "perms", "TEXT");
  // Link profil/konten yang dikontrak (endorse), satu per baris. Kosong = tanpa link.
  addColumn(db, "pengajuan", "links", "TEXT NOT NULL DEFAULT ''");
  promoteFirstOwner(db);

  // Urutannya penting: indeks pada pasangan_id dibuat **setelah** tabelnya
  // dibangun ulang, karena pembukuan yang sudah berjalan belum punya kolomnya.
  upgradeTransaksiJenis(db);
  addColumn(db, "transaksi", "pasangan_id", "INTEGER REFERENCES transaksi(id)");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tr_pasangan ON transaksi (pasangan_id)`);

  // Alasannya sama dengan pasangan_id di atas: pembukuan yang sudah berjalan
  // belum punya kolom ini, dan upgradeTransaksiJenis membangun ulang tabelnya
  // tanpa membawa kolom di luar daftar salinannya.
  addColumn(db, "transaksi", "jenis_bayar_id", "INTEGER REFERENCES jenis_bayar(id)");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tr_jnsbayar ON transaksi (jenis_bayar_id)`);

  db.exec(`
    /*
     * Dua kolom turunan inilah seluruh aturan pembukuan ini:
     *
     * delta_saldo — pengaruh baris ke saldo dompet.
     * delta_biaya — pengaruh baris ke Total Biaya Marketing.
     *
     * Top-up dari finance menaikkan saldo tapi delta_biaya-nya 0. Itu bukan
     * detail: uang yang masuk dompet belum jadi biaya, dan menghitungnya
     * sebagai biaya membuat setiap belanja lewat dompet terhitung dua kali —
     * sekali saat dananya datang, sekali saat dibelanjakan.
     */
    DROP VIEW IF EXISTS v_transaksi;
    CREATE VIEW v_transaksi AS
    SELECT
      t.id, t.tanggal, t.jenis, t.nominal, t.arah, t.sumber,
      t.dompet_id, t.divisi_id, t.platform_id, t.brand_id, t.akun_iklan_id,
      t.penerima_id, t.pengajuan_id, t.keterangan, t.no_ref, t.split_group,
      t.pasangan_id, t.created_by, t.created_at, t.updated_at,
      -- Dompet di sisi lain sebuah pindah saldo, supaya satu baris mutasi bisa
      -- menyebut ke/dari mana tanpa perlu dicari lagi di tabelnya.
      (SELECT p2.name FROM transaksi p JOIN dompet p2 ON p2.id = p.dompet_id
        WHERE p.id = t.pasangan_id) AS pasangan_dompet_name,
      d.name       AS divisi_name,
      d.color_slot AS divisi_slot,
      p.name       AS platform_name,
      p.color_slot AS platform_slot,
      b.name       AS brand_name,
      b.color_slot AS brand_slot,
      w.name       AS dompet_name,
      ai.name      AS akun_iklan_name,
      r.nama       AS penerima_nama,
      r.bank       AS penerima_bank,
      r.no_rek     AS penerima_no_rek,
      t.jenis_bayar_id,
      jb.name      AS jenis_bayar_name,
      u.username   AS created_by_name,
      substr(t.tanggal, 1, 7) AS bulan,
      CASE t.jenis
        WHEN 'topup'           THEN  t.nominal
        WHEN 'belanja'         THEN CASE WHEN t.sumber = 'dompet' THEN -t.nominal ELSE 0 END
        WHEN 'refund'          THEN CASE WHEN t.dompet_id IS NOT NULL THEN t.nominal ELSE 0 END
        WHEN 'biaya_dompet'    THEN -t.nominal
        WHEN 'koreksi'         THEN  t.arah * t.nominal
        WHEN 'transfer_keluar' THEN -t.nominal
        WHEN 'transfer_masuk'  THEN  t.nominal
        ELSE 0
      END AS delta_saldo,
      -- Pindah saldo antar-dompet tidak muncul di sini sama sekali: uangnya
      -- belum dipakai, cuma berganti tempat. Kedua sisinya juga saling
      -- menghapus di total saldo, jadi tidak ada uang yang lahir atau hilang.
      CASE t.jenis
        WHEN 'belanja'      THEN  t.nominal
        WHEN 'refund'       THEN -t.nominal
        WHEN 'biaya_dompet' THEN  t.nominal
        ELSE 0
      END AS delta_biaya,
      (SELECT COUNT(*) FROM attachments a WHERE a.tx_id = t.id) AS bukti_count
    FROM transaksi t
    LEFT JOIN divisi     d  ON d.id  = t.divisi_id
    LEFT JOIN platform   p  ON p.id  = t.platform_id
    LEFT JOIN brand      b  ON b.id  = t.brand_id
    LEFT JOIN dompet     w  ON w.id  = t.dompet_id
    LEFT JOIN akun_iklan ai ON ai.id = t.akun_iklan_id
    LEFT JOIN penerima   r  ON r.id  = t.penerima_id
    LEFT JOIN jenis_bayar jb ON jb.id = t.jenis_bayar_id
    LEFT JOIN users      u  ON u.id  = t.created_by;

    /* Saldo tiap dompet: titik nolnya saldo_awal, sisanya akumulasi mutasi. */
    DROP VIEW IF EXISTS v_saldo_dompet;
    CREATE VIEW v_saldo_dompet AS
    SELECT
      w.id, w.name, w.jenis, w.bank, w.no_rek, w.pemilik, w.saldo_awal,
      w.tanggal_awal, w.min_saldo, w.note, w.archived, w.created_at,
      IFNULL(SUM(CASE WHEN v.delta_saldo > 0 THEN v.delta_saldo END), 0)  AS masuk,
      IFNULL(-SUM(CASE WHEN v.delta_saldo < 0 THEN v.delta_saldo END), 0) AS keluar,
      w.saldo_awal + IFNULL(SUM(v.delta_saldo), 0)                        AS sisa,
      IFNULL(SUM(CASE WHEN v.jenis = 'belanja' THEN v.nominal END), 0)    AS belanja,
      IFNULL(SUM(CASE WHEN v.jenis = 'topup'   THEN v.nominal END), 0)    AS topup,
      COUNT(v.id)    AS tx_count,
      MAX(v.tanggal) AS last_tanggal
    FROM dompet w
    LEFT JOIN v_transaksi v ON v.dompet_id = w.id
    GROUP BY w.id;
  `);
}

const SEED_DIVISI: Array<[string, number]> = [
  ["Endorse", 5],
  ["Ads", 1],
  ["SEO", 3],
];

/** Platform contoh; semuanya bisa diubah, diarsipkan, atau ditambah dari panel. */
const SEED_PLATFORM: Array<[string, string, number]> = [
  ["Meta Ads", "Ads", 1],
  ["Google Ads", "Ads", 4],
  ["TikTok Ads", "Ads", 8],
  ["Instagram", "Endorse", 5],
  ["TikTok", "Endorse", 2],
  ["YouTube", "Endorse", 8],
  ["Backlink", "SEO", 3],
  ["Guest Post", "SEO", 6],
];

function seed(db: DatabaseSync) {
  const n = (db.prepare(`SELECT COUNT(*) AS n FROM divisi`).get() as { n: number }).n;
  if (n > 0) return;
  const now = new Date().toISOString();

  const insDiv = db.prepare(
    `INSERT INTO divisi (name, color_slot, created_at) VALUES (?, ?, ?)`,
  );
  for (const [name, slot] of SEED_DIVISI) insDiv.run(name, slot, now);

  const insPlat = db.prepare(
    `INSERT INTO platform (name, divisi_id, color_slot, created_at)
     VALUES (?, (SELECT id FROM divisi WHERE name = ?), ?, ?)`,
  );
  for (const [name, divisi, slot] of SEED_PLATFORM) insPlat.run(name, divisi, slot, now);
}

export function getDb(): DatabaseSync {
  if (g.__mktDb) return g.__mktDb;
  if (dataDirHealth().ephemeralRisk) {
    console.error(
      `[pembukuan-marketing] PERINGATAN: database disimpan di ${DATA_DIR}, di dalam ` +
        `folder aplikasi. Di Railway/Vercel folder ini dibuang setiap deploy — seluruh ` +
        `data akan hilang. Pasang volume lalu set ${DATA_DIR_ENV} ke mount path-nya (mis. /data).`,
    );
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BUKTI_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  migrate(db);
  seed(db);
  g.__mktDb = db;
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

/** Menutup koneksi supaya berkasnya bisa ditukar saat pemulihan backup. */
export function closeDb() {
  try {
    g.__mktDb?.close();
  } catch {
    // sudah tertutup
  }
  g.__mktDb = undefined;
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
  return (
    one<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, key)?.value ??
    null
  );
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
