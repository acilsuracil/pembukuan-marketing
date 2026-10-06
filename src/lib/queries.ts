import { all, one } from "./db";
import { addMonths, currentMonth, monthRange, todayISO } from "./format";
import type {
  ActivityRow,
  AkunIklan,
  Attachment,
  Brand,
  CrossCell,
  DayTotal,
  Divisi,
  Dompet,
  GroupSpend,
  Jenis,
  JenisBayar,
  MonthTotal,
  MutasiRow,
  Opname,
  Penerima,
  PengajuanBrand,
  PengajuanRow,
  PengajuanStatus,
  Platform,
  SaldoDompet,
  Sumber,
  TxRow,
  User,
} from "./types";

/* ============================================================ data master */

export function listDivisi(includeArchived = false): Divisi[] {
  return all<Divisi>(
    `SELECT * FROM divisi ${includeArchived ? "" : "WHERE archived = 0"}
     ORDER BY archived, name COLLATE NOCASE`,
  );
}

export function listJenisBayar(includeArchived = false): JenisBayar[] {
  return all<JenisBayar>(
    `SELECT * FROM jenis_bayar ${includeArchived ? "" : "WHERE archived = 0"}
     ORDER BY archived, name COLLATE NOCASE`,
  );
}

export function getJenisBayar(id: number): JenisBayar | undefined {
  return one<JenisBayar>(`SELECT * FROM jenis_bayar WHERE id = ?`, id);
}

export function getDivisi(id: number): Divisi | undefined {
  return one<Divisi>(`SELECT * FROM divisi WHERE id = ?`, id);
}

export function listBrand(includeArchived = false): Brand[] {
  return all<Brand>(
    `SELECT * FROM brand ${includeArchived ? "" : "WHERE archived = 0"}
     ORDER BY archived, name COLLATE NOCASE`,
  );
}

export function getBrand(id: number): Brand | undefined {
  return one<Brand>(`SELECT * FROM brand WHERE id = ?`, id);
}

const PLATFORM_SELECT = `
  SELECT p.*, d.name AS divisi_name, w.name AS dompet_name
  FROM platform p
  LEFT JOIN divisi d ON d.id = p.divisi_id
  LEFT JOIN dompet w ON w.id = p.dompet_id`;

export function listPlatform(includeArchived = false): Platform[] {
  return all<Platform>(
    `${PLATFORM_SELECT} ${includeArchived ? "" : "WHERE p.archived = 0"}
     ORDER BY p.archived, p.name COLLATE NOCASE`,
  );
}

export function getPlatform(id: number): Platform | undefined {
  return one<Platform>(`${PLATFORM_SELECT} WHERE p.id = ?`, id);
}

const AKUN_SELECT = `
  SELECT a.*, p.name AS platform_name, b.name AS brand_name, w.name AS dompet_name
  FROM akun_iklan a
  JOIN platform p ON p.id = a.platform_id
  LEFT JOIN brand  b ON b.id = a.brand_id
  LEFT JOIN dompet w ON w.id = a.dompet_id`;

export function listAkunIklan(
  opts: { platformId?: number; includeArchived?: boolean } = {},
): AkunIklan[] {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeArchived) parts.push("a.archived = 0");
  if (opts.platformId) {
    parts.push("a.platform_id = ?");
    params.push(opts.platformId);
  }
  return all<AkunIklan>(
    `${AKUN_SELECT} ${parts.length ? `WHERE ${parts.join(" AND ")}` : ""}
     ORDER BY a.archived, p.name COLLATE NOCASE, a.name COLLATE NOCASE`,
    ...params,
  );
}

export function getAkunIklan(id: number): AkunIklan | undefined {
  return one<AkunIklan>(`${AKUN_SELECT} WHERE a.id = ?`, id);
}

export function listPenerima(includeArchived = false): Penerima[] {
  return all<Penerima>(
    `SELECT * FROM penerima ${includeArchived ? "" : "WHERE archived = 0"}
     ORDER BY archived, nama COLLATE NOCASE`,
  );
}

export function getPenerima(id: number): Penerima | undefined {
  return one<Penerima>(`SELECT * FROM penerima WHERE id = ?`, id);
}

export function listDompet(includeArchived = false): Dompet[] {
  return all<Dompet>(
    `SELECT * FROM dompet ${includeArchived ? "" : "WHERE archived = 0"}
     ORDER BY archived, name COLLATE NOCASE`,
  );
}

export function getDompet(id: number): Dompet | undefined {
  return one<Dompet>(`SELECT * FROM dompet WHERE id = ?`, id);
}

/**
 * Berapa baris yang menyandarkan diri pada satu data master.
 *
 * Dipakai untuk memutuskan boleh-tidaknya dihapus: master yang sudah terpakai
 * hanya boleh diarsipkan, karena menghapusnya akan melepas tautan baris-baris
 * lama (`ON DELETE SET NULL`) dan mengubah laporan periode yang sudah selesai.
 */
export function masterUsage(
  kind:
    | "divisi"
    | "platform"
    | "brand"
    | "penerima"
    | "dompet"
    | "akun_iklan"
    | "jenis_bayar",
  id: number,
): number {
  const col = `${kind}_id`;
  const inTx =
    one<{ n: number }>(`SELECT COUNT(*) AS n FROM transaksi WHERE ${col} = ?`, id)?.n ??
    0;
  // Brand juga bisa terpakai sebagai porsi pembagian, bukan cuma sebagai kolom
  // langsung — tanpa ini, brand yang dipakai pembagian akan tampak belum
  // terpakai dan ditawarkan untuk dihapus.
  const inPorsi =
    kind === "brand"
      ? (one<{ n: number }>(
          `SELECT COUNT(*) AS n FROM pengajuan_brand WHERE brand_id = ?`,
          id,
        )?.n ?? 0)
      : 0;
  // Pengajuan tidak punya kolom akun iklan maupun jenis pembayaran — menanyakannya
  // ke sana bukan menghasilkan nol, melainkan galat "no such column".
  const inPengajuan =
    kind === "akun_iklan" || kind === "jenis_bayar"
      ? 0
      : (one<{ n: number }>(
          `SELECT COUNT(*) AS n FROM pengajuan WHERE ${col} = ?`,
          id,
        )?.n ?? 0);
  return inTx + inPengajuan + inPorsi;
}

/* ------------------------------------------------------ master + statistik */

export interface MasterStat {
  id: number;
  name: string;
  color_slot: number;
  budget_idr: number;
  note: string;
  archived: number;
  /** Hanya ada pada brand. */
  pic?: string;
  tx_count: number;
  biaya_total: number;
  biaya_bulan: number;
  last_tanggal: string | null;
}

/**
 * Daftar master beserta realisasinya. `biaya_bulan` memakai delta_biaya, jadi
 * refund ikut mengurangi — angka yang sama dengan yang muncul di laporan.
 */
function masterStats(
  table: "divisi" | "brand" | "jenis_bayar",
  month: string,
  includeArchived: boolean,
): MasterStat[] {
  return all<MasterStat>(
    `SELECT m.*,
            IFNULL(COUNT(v.id), 0)        AS tx_count,
            IFNULL(SUM(v.delta_biaya), 0) AS biaya_total,
            IFNULL(SUM(CASE WHEN v.bulan = ? THEN v.delta_biaya END), 0) AS biaya_bulan,
            MAX(v.tanggal) AS last_tanggal
     FROM ${table} m
     LEFT JOIN v_transaksi v ON v.${table}_id = m.id
     ${includeArchived ? "" : "WHERE m.archived = 0"}
     GROUP BY m.id
     ORDER BY m.archived, biaya_total DESC, m.name COLLATE NOCASE`,
    month,
  );
}

export function divisiStats(
  month: string = currentMonth(),
  includeArchived = true,
): MasterStat[] {
  return masterStats("divisi", month, includeArchived);
}

export function jenisBayarStats(
  month: string = currentMonth(),
  includeArchived = true,
): MasterStat[] {
  return masterStats("jenis_bayar", month, includeArchived);
}

export function brandStats(
  month: string = currentMonth(),
  includeArchived = true,
): MasterStat[] {
  return masterStats("brand", month, includeArchived);
}

export interface PlatformStat extends MasterStat {
  divisi_name: string | null;
  dompet_name: string | null;
  akun_count: number;
}

export function platformStats(
  month: string = currentMonth(),
  includeArchived = true,
): PlatformStat[] {
  return all<PlatformStat>(
    `SELECT p.id, p.name, p.color_slot, 0 AS budget_idr, p.note, p.archived,
            d.name AS divisi_name, w.name AS dompet_name,
            IFNULL(COUNT(v.id), 0)        AS tx_count,
            IFNULL(SUM(v.delta_biaya), 0) AS biaya_total,
            IFNULL(SUM(CASE WHEN v.bulan = ? THEN v.delta_biaya END), 0) AS biaya_bulan,
            MAX(v.tanggal) AS last_tanggal,
            (SELECT COUNT(*) FROM akun_iklan a WHERE a.platform_id = p.id AND a.archived = 0)
              AS akun_count
     FROM platform p
     LEFT JOIN divisi d ON d.id = p.divisi_id
     LEFT JOIN dompet w ON w.id = p.dompet_id
     LEFT JOIN v_transaksi v ON v.platform_id = p.id
     ${includeArchived ? "" : "WHERE p.archived = 0"}
     GROUP BY p.id
     ORDER BY p.archived, biaya_total DESC, p.name COLLATE NOCASE`,
    month,
  );
}

export interface PenerimaStat extends Penerima {
  tx_count: number;
  total: number;
  last_tanggal: string | null;
}

export function penerimaStats(includeArchived = true): PenerimaStat[] {
  return all<PenerimaStat>(
    `SELECT r.*,
            IFNULL(COUNT(v.id), 0)        AS tx_count,
            IFNULL(SUM(v.delta_biaya), 0) AS total,
            MAX(v.tanggal) AS last_tanggal
     FROM penerima r
     LEFT JOIN v_transaksi v ON v.penerima_id = r.id
     ${includeArchived ? "" : "WHERE r.archived = 0"}
     GROUP BY r.id
     ORDER BY r.archived, total DESC, r.nama COLLATE NOCASE`,
  );
}

/* ================================================================= dompet */

export function saldoDompet(includeArchived = false): SaldoDompet[] {
  return all<SaldoDompet>(
    `SELECT * FROM v_saldo_dompet ${includeArchived ? "" : "WHERE archived = 0"}
     ORDER BY archived, name COLLATE NOCASE`,
  );
}

export function getSaldoDompet(id: number): SaldoDompet | undefined {
  return one<SaldoDompet>(`SELECT * FROM v_saldo_dompet WHERE id = ?`, id);
}

/** Saldo seluruh dompet aktif, dijumlahkan. */
export function totalSaldo(): number {
  return one<{ v: number }>(
    `SELECT IFNULL(SUM(sisa), 0) AS v FROM v_saldo_dompet WHERE archived = 0`,
  )?.v ?? 0;
}

/**
 * Mutasi satu dompet dengan saldo berjalan.
 *
 * Saldo dihitung menyapu seluruh riwayat dompetnya dari yang paling lama —
 * bukan hanya baris yang tampil. Kalau tidak, halaman yang dibatasi 100 baris
 * akan memperlihatkan saldo yang mulai dari nol di tengah pembukuan.
 */
export function mutasiDompet(dompetId: number, limit = 300): MutasiRow[] {
  const rows = all<MutasiRow>(
    `SELECT v.*,
            (SELECT w.saldo_awal FROM dompet w WHERE w.id = ?)
              + SUM(v.delta_saldo) OVER (
                  ORDER BY v.tanggal, v.id
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS saldo_setelah
     FROM v_transaksi v
     WHERE v.dompet_id = ?
     ORDER BY v.tanggal, v.id`,
    dompetId,
    dompetId,
  );
  // Terbaru di atas, tapi hanya setelah saldo berjalannya selesai dihitung.
  return rows.reverse().slice(0, limit);
}

export interface OpnameRow extends Opname {
  saldo_tercatat: number;
  selisih: number;
}

export function listOpname(dompetId: number, limit = 20): OpnameRow[] {
  const rows = all<Omit<OpnameRow, "selisih">>(
    `SELECT o.*, u.username AS created_by_name,
            (SELECT w.saldo_awal FROM dompet w WHERE w.id = o.dompet_id)
              + IFNULL((SELECT SUM(v.delta_saldo) FROM v_transaksi v
                        WHERE v.dompet_id = o.dompet_id AND v.tanggal <= o.tanggal), 0)
              AS saldo_tercatat
     FROM dompet_opname o
     LEFT JOIN users u ON u.id = o.created_by
     WHERE o.dompet_id = ?
     ORDER BY o.tanggal DESC, o.id DESC
     LIMIT ?`,
    dompetId,
    limit,
  );
  return rows.map((r) => ({ ...r, selisih: r.saldo_aktual - r.saldo_tercatat }));
}

/* ============================================================== buku besar */

export const SORT_COLUMNS = {
  tanggal: "tanggal",
  nominal: "nominal",
  divisi: "IFNULL(divisi_name, 'zzz') COLLATE NOCASE",
  platform: "IFNULL(platform_name, 'zzz') COLLATE NOCASE",
  brand: "IFNULL(brand_name, 'zzz') COLLATE NOCASE",
  jenis: "jenis",
} as const;

export type SortKey = keyof typeof SORT_COLUMNS;
export type SortDir = "asc" | "desc";

export function isSortKey(v: string): v is SortKey {
  return Object.prototype.hasOwnProperty.call(SORT_COLUMNS, v);
}

export interface TxFilter {
  from?: string;
  to?: string;
  jenis?: Jenis;
  sumber?: Sumber;
  divisiId?: number;
  platformId?: number;
  /** Beberapa category sekaligus — baris yang category-nya salah satu dari ini. */
  platformIds?: number[];
  brandId?: number;
  dompetId?: number;
  akunIklanId?: number;
  penerimaId?: number;
  pengajuanId?: number;
  q?: string;
  limit?: number;
  /** Lewati sekian baris pertama — untuk halaman berikutnya. Hanya berlaku bersama `limit`. */
  offset?: number;
  sort?: SortKey;
  dir?: SortDir;
}

function whereClause(f: TxFilter, alias = "") {
  const p = alias ? `${alias}.` : "";
  const parts: string[] = [];
  const params: unknown[] = [];
  const eq = (col: string, v: unknown) => {
    parts.push(`${p}${col} = ?`);
    params.push(v);
  };
  if (f.from) {
    parts.push(`${p}tanggal >= ?`);
    params.push(f.from);
  }
  if (f.to) {
    parts.push(`${p}tanggal <= ?`);
    params.push(f.to);
  }
  if (f.jenis) eq("jenis", f.jenis);
  if (f.sumber) eq("sumber", f.sumber);
  if (f.divisiId) eq("divisi_id", f.divisiId);
  if (f.platformId) eq("platform_id", f.platformId);
  if (f.platformIds?.length) {
    parts.push(`${p}platform_id IN (${f.platformIds.map(() => "?").join(", ")})`);
    params.push(...f.platformIds);
  }
  if (f.brandId) eq("brand_id", f.brandId);
  if (f.dompetId) eq("dompet_id", f.dompetId);
  if (f.akunIklanId) eq("akun_iklan_id", f.akunIklanId);
  if (f.penerimaId) eq("penerima_id", f.penerimaId);
  if (f.pengajuanId) eq("pengajuan_id", f.pengajuanId);
  if (f.q) {
    parts.push(
      `(${p}keterangan LIKE ? OR ${p}no_ref LIKE ?
        OR IFNULL(${p}divisi_name,'')   LIKE ?
        OR IFNULL(${p}platform_name,'') LIKE ?
        OR IFNULL(${p}brand_name,'')    LIKE ?
        OR IFNULL(${p}penerima_nama,'') LIKE ?
        OR IFNULL(${p}akun_iklan_name,'') LIKE ?)`,
    );
    const like = `%${f.q}%`;
    params.push(like, like, like, like, like, like, like);
  }
  return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

function orderClause(f: TxFilter) {
  const key: SortKey = f.sort && isSortKey(f.sort) ? f.sort : "tanggal";
  const dir = f.dir === "asc" ? "ASC" : "DESC";
  // id sebagai pemecah seri supaya urutan selalu deterministik.
  return `ORDER BY ${SORT_COLUMNS[key]} ${dir}, id ${dir}`;
}

export function listTransaksi(f: TxFilter = {}): TxRow[] {
  const { sql, params } = whereClause(f);
  return all<TxRow>(
    `SELECT * FROM v_transaksi ${sql} ${orderClause(f)}
     ${f.limit ? `LIMIT ${Number(f.limit)}` : ""}
     ${f.limit && f.offset ? `OFFSET ${Number(f.offset)}` : ""}`,
    ...params,
  );
}

export function countTransaksi(f: TxFilter = {}): number {
  const { sql, params } = whereClause(f);
  return (
    one<{ n: number }>(`SELECT COUNT(*) AS n FROM v_transaksi ${sql}`, ...params)?.n ?? 0
  );
}

export function getTransaksi(id: number): TxRow | undefined {
  return one<TxRow>(`SELECT * FROM v_transaksi WHERE id = ?`, id);
}

/* --------------------------------------------------------------- ringkasan */

export interface Summary {
  /** Total Biaya Marketing: belanja + biaya bank − refund. */
  biaya: number;
  /** Dana yang masuk dompet dari finance. Bukan biaya — jangan dijumlahkan. */
  topup: number;
  belanjaFinance: number;
  belanjaDompet: number;
  refund: number;
  biayaBank: number;
  txCount: number;
}

export function getSummary(f: TxFilter = {}): Summary {
  const { sql, params } = whereClause(f);
  const r = one<{
    biaya: number | null;
    topup: number | null;
    belanja_finance: number | null;
    belanja_dompet: number | null;
    refund: number | null;
    biaya_bank: number | null;
    n: number;
  }>(
    `SELECT
       SUM(delta_biaya) AS biaya,
       SUM(CASE WHEN jenis = 'topup'        THEN nominal END) AS topup,
       SUM(CASE WHEN jenis = 'belanja' AND sumber = 'finance' THEN nominal END)
         AS belanja_finance,
       SUM(CASE WHEN jenis = 'belanja' AND sumber = 'dompet'  THEN nominal END)
         AS belanja_dompet,
       SUM(CASE WHEN jenis = 'refund'       THEN nominal END) AS refund,
       SUM(CASE WHEN jenis = 'biaya_dompet' THEN nominal END) AS biaya_bank,
       COUNT(*) AS n
     FROM v_transaksi ${sql}`,
    ...params,
  );
  return {
    biaya: r?.biaya ?? 0,
    topup: r?.topup ?? 0,
    belanjaFinance: r?.belanja_finance ?? 0,
    belanjaDompet: r?.belanja_dompet ?? 0,
    refund: r?.refund ?? 0,
    biayaBank: r?.biaya_bank ?? 0,
    txCount: r?.n ?? 0,
  };
}

/** Biaya satu hari saja — dipakai kartu "belanja hari ini". */
export function biayaHari(tanggal: string = todayISO()): number {
  return (
    one<{ v: number }>(
      `SELECT IFNULL(SUM(delta_biaya), 0) AS v FROM v_transaksi WHERE tanggal = ?`,
      tanggal,
    )?.v ?? 0
  );
}

/* ------------------------------------------------------- pengelompokan */

type GroupKind = "divisi" | "platform" | "brand";

/**
 * Total biaya per divisi / platform / brand.
 *
 * Baris tanpa kelompok tidak disembunyikan — ia muncul sebagai "(Tanpa …)".
 * Laporan yang membuang baris tak berlabel akan menampilkan jumlah kelompok
 * yang lebih kecil dari totalnya, dan selisihnya tidak kelihatan dari mana.
 */
export function groupBiaya(kind: GroupKind, f: TxFilter = {}): GroupSpend[] {
  const idCol = `${kind}_id`;
  const nameCol = `${kind}_name`;
  const slotCol = kind === "divisi" ? "divisi_slot" : `${kind}_slot`;
  const label =
    kind === "divisi" ? "(Tanpa divisi)" : kind === "brand" ? "(Tanpa brand)" : "(Tanpa category)";
  const budget =
    kind === "platform" ? "0" : `IFNULL(MAX(m.budget_idr), 0)`;
  const join =
    kind === "platform" ? "" : `LEFT JOIN ${kind} m ON m.id = v.${idCol}`;

  return all<GroupSpend>(
    `SELECT v.${idCol}                    AS id,
            IFNULL(v.${nameCol}, ?)       AS name,
            IFNULL(v.${slotCol}, 6)       AS color_slot,
            SUM(v.delta_biaya)            AS biaya,
            ${budget}                     AS budget_idr,
            COUNT(v.id)                   AS tx_count
     FROM v_transaksi v
     ${join}
     ${whereClause(f, "v").sql
       ? `${whereClause(f, "v").sql} AND v.delta_biaya <> 0`
       : "WHERE v.delta_biaya <> 0"}
     GROUP BY v.${idCol}
     ORDER BY biaya DESC`,
    label,
    ...whereClause(f, "v").params,
  );
}

/** Matriks divisi × platform untuk laporan silang. */
export function crossDivisiPlatform(f: TxFilter = {}): CrossCell[] {
  const w = whereClause(f, "v");
  return all<CrossCell>(
    `SELECT v.divisi_id, IFNULL(v.divisi_name, '(Tanpa divisi)')     AS divisi_name,
            v.platform_id, IFNULL(v.platform_name, '(Tanpa category)') AS platform_name,
            SUM(v.delta_biaya) AS biaya
     FROM v_transaksi v
     ${w.sql ? `${w.sql} AND v.delta_biaya <> 0` : "WHERE v.delta_biaya <> 0"}
     GROUP BY v.divisi_id, v.platform_id`,
    ...w.params,
  );
}

/* --------------------------------------------------------------- deret */

export function monthlyTotals(from: string, to: string, f: TxFilter = {}): MonthTotal[] {
  const scoped = { ...f, from: undefined, to: undefined };
  const w = whereClause(scoped);
  const extra = w.sql ? `${w.sql} AND` : "WHERE";
  const rows = all<MonthTotal>(
    `SELECT bulan,
            IFNULL(SUM(delta_biaya), 0)                            AS biaya,
            IFNULL(SUM(CASE WHEN jenis = 'topup' THEN nominal END), 0) AS topup
     FROM v_transaksi
     ${extra} bulan >= ? AND bulan <= ?
     GROUP BY bulan`,
    ...w.params,
    from,
    to,
  );
  const byMonth = new Map(rows.map((r) => [r.bulan, r]));
  return monthRange(from, to).map(
    (m) => byMonth.get(m) ?? { bulan: m, biaya: 0, topup: 0 },
  );
}

export function dailyTotals(from: string, to: string, f: TxFilter = {}): DayTotal[] {
  const w = whereClause({ ...f, from, to });
  return all<DayTotal>(
    `SELECT tanggal, IFNULL(SUM(delta_biaya), 0) AS biaya
     FROM v_transaksi ${w.sql}
     GROUP BY tanggal ORDER BY tanggal`,
    ...w.params,
  );
}

export function firstMonth(): string | null {
  return one<{ m: string | null }>(`SELECT MIN(bulan) AS m FROM v_transaksi`)?.m ?? null;
}

/** Bulan paling awal yang punya data, atau 12 bulan ke belakang kalau kosong. */
export function reportRangeStart(): string {
  return firstMonth() ?? addMonths(currentMonth(), -11);
}

/* ============================================================== pengajuan */

const PENGAJUAN_SELECT = `
  SELECT g.*,
         r.nama    AS penerima_nama,
         r.bank    AS penerima_bank,
         r.no_rek  AS penerima_no_rek,
         w.name    AS dompet_name,
         w.bank    AS dompet_bank,
         w.no_rek  AS dompet_no_rek,
         w.pemilik AS dompet_pemilik,
         b.name    AS brand_name,
         p.name    AS platform_name,
         d.name    AS divisi_name,
         u.username AS created_by_name,
         (SELECT COUNT(*) FROM transaksi t WHERE t.pengajuan_id = g.id) AS tx_count,
         (SELECT COUNT(*) FROM pengajuan_brand pb WHERE pb.pengajuan_id = g.id)
           AS brand_count,
         (SELECT group_concat(b2.name, ', ')
            FROM pengajuan_brand pb
            JOIN brand b2 ON b2.id = pb.brand_id
           WHERE pb.pengajuan_id = g.id) AS brand_ringkas
  FROM pengajuan g
  LEFT JOIN penerima r ON r.id = g.penerima_id
  LEFT JOIN dompet   w ON w.id = g.dompet_id
  LEFT JOIN brand    b ON b.id = g.brand_id
  LEFT JOIN platform p ON p.id = g.platform_id
  LEFT JOIN divisi   d ON d.id = g.divisi_id
  LEFT JOIN users    u ON u.id = g.created_by`;

export interface PengajuanFilter {
  status?: PengajuanStatus;
  /** "outstanding" = sudah diajukan tapi dananya belum cair. */
  outstanding?: boolean;
  from?: string;
  to?: string;
  divisiId?: number;
  platformId?: number;
  brandId?: number;
  tujuan?: "langsung" | "dompet";
  q?: string;
  limit?: number;
}

export function listPengajuan(f: PengajuanFilter = {}): PengajuanRow[] {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.status) {
    parts.push("g.status = ?");
    params.push(f.status);
  }
  if (f.outstanding) parts.push("g.status IN ('diajukan','disetujui')");
  if (f.from) {
    parts.push("g.tanggal >= ?");
    params.push(f.from);
  }
  if (f.to) {
    parts.push("g.tanggal <= ?");
    params.push(f.to);
  }
  if (f.divisiId) {
    parts.push("g.divisi_id = ?");
    params.push(f.divisiId);
  }
  if (f.platformId) {
    parts.push("g.platform_id = ?");
    params.push(f.platformId);
  }
  if (f.brandId) {
    parts.push("g.brand_id = ?");
    params.push(f.brandId);
  }
  if (f.tujuan) {
    parts.push("g.tujuan = ?");
    params.push(f.tujuan);
  }
  if (f.q) {
    parts.push(
      `(g.keterangan LIKE ? OR g.catatan LIKE ? OR IFNULL(r.nama,'') LIKE ?
        OR IFNULL(b.name,'') LIKE ? OR IFNULL(p.name,'') LIKE ?)`,
    );
    const like = `%${f.q}%`;
    params.push(like, like, like, like, like);
  }
  return all<PengajuanRow>(
    `${PENGAJUAN_SELECT}
     ${parts.length ? `WHERE ${parts.join(" AND ")}` : ""}
     ORDER BY
       -- Yang masih menggantung dulu; sisanya menurut tanggal.
       CASE g.status WHEN 'diajukan' THEN 0 WHEN 'disetujui' THEN 1
                     WHEN 'draft' THEN 2 ELSE 3 END,
       g.tanggal DESC, g.id DESC
     ${f.limit ? `LIMIT ${Number(f.limit)}` : ""}`,
    ...params,
  );
}

export function getPengajuan(id: number): PengajuanRow | undefined {
  return one<PengajuanRow>(`${PENGAJUAN_SELECT} WHERE g.id = ?`, id);
}

/** Porsi tiap brand pada pengajuan yang dibagi. Kosong = brand tunggal. */
export function brandPengajuan(pengajuanId: number): PengajuanBrand[] {
  return all<PengajuanBrand>(
    `SELECT pb.*, b.name AS brand_name, b.color_slot
     FROM pengajuan_brand pb
     JOIN brand b ON b.id = pb.brand_id
     WHERE pb.pengajuan_id = ?
     ORDER BY pb.nominal DESC, b.name COLLATE NOCASE`,
    pengajuanId,
  );
}

export interface PengajuanTally {
  status: PengajuanStatus;
  n: number;
  total: number;
}

export function pengajuanTally(f: { from?: string; to?: string } = {}): PengajuanTally[] {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.from) {
    parts.push("tanggal >= ?");
    params.push(f.from);
  }
  if (f.to) {
    parts.push("tanggal <= ?");
    params.push(f.to);
  }
  return all<PengajuanTally>(
    `SELECT status, COUNT(*) AS n, IFNULL(SUM(nominal), 0) AS total
     FROM pengajuan ${parts.length ? `WHERE ${parts.join(" AND ")}` : ""}
     GROUP BY status`,
    ...params,
  );
}

/** Dana yang sudah diminta tapi belum cair, beserta jumlah dan nilainya. */
export function outstandingPengajuan(): { n: number; total: number } {
  const r = one<{ n: number; total: number }>(
    `SELECT COUNT(*) AS n, IFNULL(SUM(nominal), 0) AS total
     FROM pengajuan WHERE status IN ('diajukan','disetujui')`,
  );
  return { n: r?.n ?? 0, total: r?.total ?? 0 };
}

/* ------------------------------------------------------------------ bukti */

export function attachmentsOf(txId: number): Attachment[] {
  return all<Attachment>(
    `SELECT * FROM attachments WHERE tx_id = ? ORDER BY created_at`,
    txId,
  );
}

export function getAttachment(id: string): Attachment | undefined {
  return one<Attachment>(`SELECT * FROM attachments WHERE id = ?`, id);
}

/* ------------------------------------------------------------------- user */

export interface UserWithPresence extends User {
  online: number;
}

/**
 * Status online dihitung di SQL, bukan dengan Date.now() saat render —
 * pemanggilan fungsi tak-murni saat render dilarang React.
 */
export function listUsers(): UserWithPresence[] {
  return all<UserWithPresence>(
    `SELECT id, username, name, role, active, perms, session_epoch,
            pass_changed_at, last_seen_at, created_at,
            CASE
              WHEN last_seen_at IS NOT NULL
               AND (julianday('now') - julianday(replace(last_seen_at, 'Z', ''))) * 1440 < 5
              THEN 1 ELSE 0
            END AS online
     FROM users
     ORDER BY active DESC,
              CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
              username COLLATE NOCASE`,
  );
}

export function getUserById(id: number): User | undefined {
  return one<User>(
    `SELECT id, username, name, role, active, perms, session_epoch,
            pass_changed_at, last_seen_at, created_at
     FROM users WHERE id = ?`,
    id,
  );
}

export function getUserWithHash(
  username: string,
): (User & { pass_hash: string }) | undefined {
  return one<User & { pass_hash: string }>(
    `SELECT * FROM users WHERE username = ? COLLATE NOCASE`,
    username,
  );
}

export function countUsers(): number {
  return one<{ n: number }>(`SELECT COUNT(*) AS n FROM users`)?.n ?? 0;
}

export function countActiveOwners(exceptId?: number): number {
  return (
    one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM users
       WHERE role = 'owner' AND active = 1 ${exceptId ? "AND id <> ?" : ""}`,
      ...(exceptId ? [exceptId] : []),
    )?.n ?? 0
  );
}

/* ----------------------------------------------------------- log aktivitas */

export interface ActivityFilter {
  username?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export function listActivity(f: ActivityFilter = {}): ActivityRow[] {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.username) {
    parts.push("username = ?");
    params.push(f.username);
  }
  if (f.action) {
    parts.push("action = ?");
    params.push(f.action);
  }
  // ts disimpan sebagai ISO penuh; dibandingkan pada bagian tanggalnya saja.
  if (f.from) {
    parts.push("substr(ts, 1, 10) >= ?");
    params.push(f.from);
  }
  if (f.to) {
    parts.push("substr(ts, 1, 10) <= ?");
    params.push(f.to);
  }
  return all<ActivityRow>(
    `SELECT * FROM activity_log
     ${parts.length ? `WHERE ${parts.join(" AND ")}` : ""}
     ORDER BY ts DESC, id DESC LIMIT ?`,
    ...params,
    Math.min(Number(f.limit) || 200, 1000),
  );
}

/** Daftar aksi yang pernah tercatat — untuk mengisi dropdown filter. */
export function activityActions(): string[] {
  return all<{ action: string }>(
    `SELECT DISTINCT action FROM activity_log ORDER BY action`,
  ).map((r) => r.action);
}

export function activityUsernames(): string[] {
  return all<{ username: string }>(
    `SELECT DISTINCT username FROM activity_log
     WHERE username <> '' ORDER BY username COLLATE NOCASE`,
  ).map((r) => r.username);
}

/** Ringkasan per user untuk kartu telusur di halaman aktivitas. */
export function activitySummary(): Array<{
  username: string;
  role: string;
  n: number;
  last_ts: string;
}> {
  return all(
    `SELECT username, MAX(role) AS role, COUNT(*) AS n, MAX(ts) AS last_ts
     FROM activity_log WHERE username <> ''
     GROUP BY username ORDER BY n DESC`,
  );
}
