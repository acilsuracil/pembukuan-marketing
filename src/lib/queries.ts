import { all, one } from "./db";
import { addMonths, currentMonth, monthRange } from "./format";
import type {
  ActivityRow,
  Attachment,
  Brand,
  Category,
  ChangeRequest,
  GroupSpend,
  MonthFlow,
  TxRow,
  User,
} from "./types";

/* ---------------------------------------------------------------- kategori */

export function listCategories(includeArchived = false): Category[] {
  return all<Category>(
    `SELECT * FROM categories
     ${includeArchived ? "" : "WHERE archived = 0"}
     ORDER BY kind DESC, name COLLATE NOCASE`,
  );
}

export function getCategory(id: number): Category | undefined {
  return one<Category>(`SELECT * FROM categories WHERE id = ?`, id);
}

export function categoryUsage(id: number): number {
  return (
    one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?`,
      id,
    )?.n ?? 0
  );
}

export interface CategoryStat extends Category {
  tx_count: number;
  total_usdt: number;
  month_usdt: number;
}

export function categoriesWithStats(
  month: string = currentMonth(),
): CategoryStat[] {
  return all<CategoryStat>(
    `SELECT c.*,
            IFNULL(COUNT(t.id), 0)      AS tx_count,
            IFNULL(SUM(t.flow_usdt), 0) AS total_usdt,
            IFNULL(SUM(CASE WHEN t.month = ? THEN t.flow_usdt END), 0) AS month_usdt
     FROM categories c
     LEFT JOIN tx_view t ON t.category_id = c.id
     GROUP BY c.id
     ORDER BY c.archived, c.kind DESC, c.name COLLATE NOCASE`,
    month,
  );
}

/* ------------------------------------------------------------------- brand */

export function listBrands(includeArchived = false): Brand[] {
  return all<Brand>(
    `SELECT * FROM brands
     ${includeArchived ? "" : "WHERE archived = 0"}
     ORDER BY archived, name COLLATE NOCASE`,
  );
}

export function getBrand(id: number): Brand | undefined {
  return one<Brand>(`SELECT * FROM brands WHERE id = ?`, id);
}

export function brandUsage(id: number): number {
  return (
    one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transactions WHERE brand_id = ?`,
      id,
    )?.n ?? 0
  );
}

export interface BrandStat extends Brand {
  tx_count: number;
  out_usdt: number;
  out_idr: number;
  in_usdt: number;
  month_usdt: number;
  last_date: string | null;
}

export function brandsWithStats(month: string = currentMonth()): BrandStat[] {
  return all<BrandStat>(
    `SELECT b.*,
            IFNULL(COUNT(t.id), 0) AS tx_count,
            IFNULL(SUM(CASE WHEN t.type = 'out' THEN t.flow_usdt END), 0)              AS out_usdt,
            IFNULL(SUM(CASE WHEN t.type = 'out' THEN t.flow_usdt * t.eff_rate END), 0) AS out_idr,
            IFNULL(SUM(CASE WHEN t.type = 'in'  THEN t.flow_usdt END), 0)              AS in_usdt,
            IFNULL(SUM(CASE WHEN t.type = 'out' AND t.month = ? THEN t.flow_usdt END), 0) AS month_usdt,
            MAX(t.date) AS last_date
     FROM brands b
     LEFT JOIN tx_view t ON t.brand_id = b.id
     GROUP BY b.id
     ORDER BY b.archived, out_usdt DESC, b.name COLLATE NOCASE`,
    month,
  );
}

/* -------------------------------------------------------------- transaksi */

export const SORT_COLUMNS = {
  date: "date",
  amount: "flow_usdt",
  idr: "(flow_usdt * IFNULL(eff_rate, 0))",
  brand: "IFNULL(brand_name, 'zzz') COLLATE NOCASE",
  category: "IFNULL(category_name, 'zzz') COLLATE NOCASE",
  type: "type",
} as const;

export type SortKey = keyof typeof SORT_COLUMNS;
export type SortDir = "asc" | "desc";

export function isSortKey(v: string): v is SortKey {
  return Object.prototype.hasOwnProperty.call(SORT_COLUMNS, v);
}

export interface TxFilter {
  from?: string;
  to?: string;
  type?: "in" | "out";
  categoryId?: number;
  brandId?: number;
  /** -1 = khusus transaksi tanpa brand. */
  noBrand?: boolean;
  q?: string;
  limit?: number;
  sort?: SortKey;
  dir?: SortDir;
}

function whereClause(f: TxFilter) {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.from) {
    parts.push("date >= ?");
    params.push(f.from);
  }
  if (f.to) {
    parts.push("date <= ?");
    params.push(f.to);
  }
  if (f.type) {
    parts.push("type = ?");
    params.push(f.type);
  }
  if (f.categoryId) {
    parts.push("category_id = ?");
    params.push(f.categoryId);
  }
  if (f.noBrand) {
    parts.push("brand_id IS NULL");
  } else if (f.brandId) {
    parts.push("brand_id = ?");
    params.push(f.brandId);
  }
  if (f.q) {
    parts.push(
      `(description LIKE ? OR counterparty LIKE ? OR tx_hash LIKE ?
        OR IFNULL(category_name,'') LIKE ? OR IFNULL(brand_name,'') LIKE ?)`,
    );
    const like = `%${f.q}%`;
    params.push(like, like, like, like, like);
  }
  return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

function orderClause(f: TxFilter) {
  const key: SortKey = f.sort && isSortKey(f.sort) ? f.sort : "date";
  const dir = f.dir === "asc" ? "ASC" : "DESC";
  const col = SORT_COLUMNS[key];
  // id sebagai pemecah seri supaya urutan selalu deterministik.
  return `ORDER BY ${col} ${dir}, id ${dir}`;
}

export function listTransactions(f: TxFilter = {}): TxRow[] {
  const { sql, params } = whereClause(f);
  return all<TxRow>(
    `SELECT * FROM tx_view ${sql} ${orderClause(f)}
     ${f.limit ? `LIMIT ${Number(f.limit)}` : ""}`,
    ...params,
  );
}

export function countTransactions(f: TxFilter = {}): number {
  const { sql, params } = whereClause(f);
  return (
    one<{ n: number }>(`SELECT COUNT(*) AS n FROM tx_view ${sql}`, ...params)
      ?.n ?? 0
  );
}

export function getTransaction(id: number): TxRow | undefined {
  return one<TxRow>(`SELECT * FROM tx_view WHERE id = ?`, id);
}

/**
 * Seluruh pecahan dari satu pembayaran yang dibagi ke beberapa brand, terurut
 * seperti saat dicatat. Daftar kosong kalau grupnya tidak ada.
 */
export function splitMembers(group: string): TxRow[] {
  return all<TxRow>(
    `SELECT * FROM tx_view WHERE split_group = ? ORDER BY id`,
    group,
  );
}

/* ---------------------------------------------------------------- ringkasan */

export interface Summary {
  balanceUsdt: number;
  inUsdt: number;
  outUsdt: number;
  inIdr: number;
  outIdr: number;
  /** Bagian dari uang keluar yang berupa fee agency — sudah termasuk di outUsdt. */
  feeAgencyUsdt: number;
  feeAgencyIdr: number;
  lastRate: number | null;
  lastRateDate: string | null;
  avgRate: number | null;
  balanceIdr: number | null;
  txCount: number;
}

export function getSummary(f: TxFilter = {}): Summary {
  const { sql, params } = whereClause(f);
  const agg = one<{
    in_usdt: number | null;
    out_usdt: number | null;
    in_idr: number | null;
    out_idr: number | null;
    fee_agency_usdt: number | null;
    fee_agency_idr: number | null;
    n: number;
  }>(
    `SELECT
       SUM(CASE WHEN type = 'in'  THEN flow_usdt END)             AS in_usdt,
       SUM(CASE WHEN type = 'out' THEN flow_usdt END)             AS out_usdt,
       SUM(CASE WHEN type = 'in'  THEN flow_usdt * eff_rate END)  AS in_idr,
       SUM(CASE WHEN type = 'out' THEN flow_usdt * eff_rate END)  AS out_idr,
       SUM(CASE WHEN type = 'out' THEN fee_pct_usdt END)          AS fee_agency_usdt,
       SUM(CASE WHEN type = 'out' THEN fee_pct_usdt * eff_rate END) AS fee_agency_idr,
       COUNT(*) AS n
     FROM tx_view ${sql}`,
    ...params,
  );

  const last = one<{ rate_idr: number; date: string }>(
    `SELECT rate_idr, date FROM transactions
     WHERE type = 'in' AND rate_idr IS NOT NULL
     ORDER BY date DESC, id DESC LIMIT 1`,
  );

  const avg = one<{ w: number | null; q: number | null }>(
    `SELECT SUM(flow_usdt * eff_rate) AS w, SUM(flow_usdt) AS q
     FROM tx_view WHERE type = 'in' AND eff_rate IS NOT NULL`,
  );

  // Saldo dompet selalu global (satu kolam), tidak ikut filter brand.
  const wallet = one<{ v: number | null }>(
    `SELECT SUM(delta_usdt) AS v FROM tx_view`,
  );

  const lastRate = last?.rate_idr ?? null;
  const balanceUsdt = wallet?.v ?? 0;

  return {
    balanceUsdt,
    inUsdt: agg?.in_usdt ?? 0,
    outUsdt: agg?.out_usdt ?? 0,
    inIdr: agg?.in_idr ?? 0,
    outIdr: agg?.out_idr ?? 0,
    /** Bagian dari "uang keluar" yang sebenarnya fee agency, bukan belanja. */
    feeAgencyUsdt: agg?.fee_agency_usdt ?? 0,
    feeAgencyIdr: agg?.fee_agency_idr ?? 0,
    lastRate,
    lastRateDate: last?.date ?? null,
    avgRate: avg?.q ? (avg.w ?? 0) / avg.q : null,
    balanceIdr: lastRate === null ? null : balanceUsdt * lastRate,
    txCount: agg?.n ?? 0,
  };
}

/* ------------------------------------------------------------ arus bulanan */

export function monthlyFlows(months: number = 12, f: TxFilter = {}): MonthFlow[] {
  const to = currentMonth();
  return monthlyFlowsBetween(addMonths(to, -(months - 1)), to, f);
}

export function monthlyFlowsBetween(
  from: string,
  to: string,
  f: TxFilter = {},
): MonthFlow[] {
  const scoped = { ...f, from: undefined, to: undefined };
  const { sql, params } = whereClause(scoped);
  const extra = sql ? `${sql} AND` : "WHERE";
  const rows = all<MonthFlow>(
    `SELECT month,
            IFNULL(SUM(CASE WHEN type = 'in'  THEN flow_usdt END), 0)            AS in_usdt,
            IFNULL(SUM(CASE WHEN type = 'out' THEN flow_usdt END), 0)            AS out_usdt,
            IFNULL(SUM(CASE WHEN type = 'in'  THEN flow_usdt * eff_rate END), 0) AS in_idr,
            IFNULL(SUM(CASE WHEN type = 'out' THEN flow_usdt * eff_rate END), 0) AS out_idr
     FROM tx_view
     ${extra} month >= ? AND month <= ?
     GROUP BY month`,
    ...params,
    from,
    to,
  );
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return monthRange(from, to).map(
    (m) =>
      byMonth.get(m) ?? {
        month: m,
        in_usdt: 0,
        out_usdt: 0,
        in_idr: 0,
        out_idr: 0,
      },
  );
}

/**
 * Saldo dompet tepat sebelum sebuah bulan dimulai — yaitu saldo akhir bulan
 * sebelumnya, yang menjadi modal awal bulan itu.
 *
 * Selalu global, tidak pernah per brand: saldo dompet adalah satu kolam bersama,
 * jadi "saldo awal brand X" bukan angka yang punya arti di pembukuan ini.
 */
export function openingBalance(month: string): number {
  return (
    one<{ v: number | null }>(
      `SELECT SUM(delta_usdt) AS v FROM tx_view WHERE month < ?`,
      month,
    )?.v ?? 0
  );
}

/** Saldo dompet di akhir tiap bulan — selalu global, bukan per brand. */
export function runningBalance(
  months: number = 12,
): Array<{ month: string; balance: number }> {
  const to = currentMonth();
  return runningBalanceBetween(addMonths(to, -(months - 1)), to);
}

/**
 * Saldo akhir tiap bulan pada rentang tertentu.
 *
 * Dimulai dari saldo sebelum `from`, bukan dari nol — grafik saldo bulan-bulan
 * lampau harus memperlihatkan uang yang memang sudah ada di dompet saat itu,
 * bukan seolah pembukuannya baru dimulai di awal rentang.
 */
export function runningBalanceBetween(
  from: string,
  to: string,
): Array<{ month: string; balance: number }> {
  const flows = monthlyFlowsBetween(from, to);
  if (flows.length === 0) return [];
  let acc = openingBalance(flows[0].month);
  return flows.map((f) => {
    acc += f.in_usdt - f.out_usdt;
    return { month: f.month, balance: acc };
  });
}

/* ------------------------------------------- pengeluaran per kategori/brand */

export function categorySpend(f: TxFilter = {}): GroupSpend[] {
  const { sql, params } = whereClause({ ...f, type: "out" });
  return all<GroupSpend>(
    `SELECT t.category_id                             AS id,
            IFNULL(t.category_name, '(Tanpa kategori)') AS name,
            IFNULL(t.color_slot, 6)                  AS color_slot,
            SUM(t.flow_usdt)                         AS usdt,
            IFNULL(SUM(t.flow_usdt * t.eff_rate), 0) AS idr,
            IFNULL(MAX(c.budget_usdt), 0)            AS budget_usdt
     FROM tx_view t
     LEFT JOIN categories c ON c.id = t.category_id
     ${sql}
     GROUP BY t.category_id
     ORDER BY usdt DESC`,
    ...params,
  );
}

export function brandSpend(f: TxFilter = {}): GroupSpend[] {
  const { sql, params } = whereClause({ ...f, type: "out" });
  return all<GroupSpend>(
    `SELECT t.brand_id                                AS id,
            IFNULL(t.brand_name, '(Tanpa brand)')     AS name,
            IFNULL(t.brand_slot, 6)                   AS color_slot,
            SUM(t.flow_usdt)                          AS usdt,
            IFNULL(SUM(t.flow_usdt * t.eff_rate), 0)  AS idr,
            IFNULL(MAX(b.budget_usdt), 0)             AS budget_usdt
     FROM tx_view t
     LEFT JOIN brands b ON b.id = t.brand_id
     ${sql}
     GROUP BY t.brand_id
     ORDER BY usdt DESC`,
    ...params,
  );
}

/** Matriks brand × kategori untuk laporan silang. */
export interface CrossCell {
  brand_id: number | null;
  brand_name: string;
  category_id: number | null;
  category_name: string;
  usdt: number;
  idr: number;
}

export function brandCategoryCross(f: TxFilter = {}): CrossCell[] {
  const { sql, params } = whereClause({ ...f, type: "out" });
  return all<CrossCell>(
    `SELECT brand_id,
            IFNULL(brand_name, '(Tanpa brand)')        AS brand_name,
            category_id,
            IFNULL(category_name, '(Tanpa kategori)')  AS category_name,
            SUM(flow_usdt)                             AS usdt,
            IFNULL(SUM(flow_usdt * eff_rate), 0)       AS idr
     FROM tx_view ${sql}
     GROUP BY brand_id, category_id`,
    ...params,
  );
}

export interface BudgetRow extends GroupSpend {
  pct: number;
}

export function budgetStatus(month: string = currentMonth()): BudgetRow[] {
  const rows = all<{
    id: number;
    name: string;
    color_slot: number;
    budget_usdt: number;
    usdt: number | null;
    idr: number | null;
  }>(
    `SELECT c.id, c.name, c.color_slot, c.budget_usdt,
            SUM(t.flow_usdt)              AS usdt,
            SUM(t.flow_usdt * t.eff_rate) AS idr
     FROM categories c
     LEFT JOIN tx_view t
            ON t.category_id = c.id AND t.type = 'out' AND t.month = ?
     WHERE c.budget_usdt > 0 AND c.archived = 0 AND c.kind = 'out'
     GROUP BY c.id
     ORDER BY (IFNULL(SUM(t.flow_usdt), 0) / c.budget_usdt) DESC, c.name`,
    month,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color_slot: r.color_slot,
    budget_usdt: r.budget_usdt,
    usdt: r.usdt ?? 0,
    idr: r.idr ?? 0,
    pct: r.budget_usdt > 0 ? ((r.usdt ?? 0) / r.budget_usdt) * 100 : 0,
  }));
}

export function brandBudgetStatus(month: string = currentMonth()): BudgetRow[] {
  const rows = all<{
    id: number;
    name: string;
    color_slot: number;
    budget_usdt: number;
    usdt: number | null;
    idr: number | null;
  }>(
    `SELECT b.id, b.name, b.color_slot, b.budget_usdt,
            SUM(t.flow_usdt)              AS usdt,
            SUM(t.flow_usdt * t.eff_rate) AS idr
     FROM brands b
     LEFT JOIN tx_view t
            ON t.brand_id = b.id AND t.type = 'out' AND t.month = ?
     WHERE b.budget_usdt > 0 AND b.archived = 0
     GROUP BY b.id
     ORDER BY (IFNULL(SUM(t.flow_usdt), 0) / b.budget_usdt) DESC, b.name`,
    month,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color_slot: r.color_slot,
    budget_usdt: r.budget_usdt,
    usdt: r.usdt ?? 0,
    idr: r.idr ?? 0,
    pct: r.budget_usdt > 0 ? ((r.usdt ?? 0) / r.budget_usdt) * 100 : 0,
  }));
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

/* -------------------------------------------------------------- pengajuan */

const REQ_SELECT = `
  SELECT r.*, ru.username AS requester_name, du.username AS decider_name
  FROM requests r
  LEFT JOIN users ru ON ru.id = r.requested_by
  LEFT JOIN users du ON du.id = r.decided_by`;

export function listRequests(opts: {
  status?: "pending" | "decided" | "all";
  requestedBy?: number;
  limit?: number;
} = {}): ChangeRequest[] {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (opts.status === "pending") parts.push("r.status = 'pending'");
  else if (opts.status === "decided") parts.push("r.status <> 'pending'");
  if (opts.requestedBy) {
    parts.push("r.requested_by = ?");
    params.push(opts.requestedBy);
  }
  return all<ChangeRequest>(
    `${REQ_SELECT}
     ${parts.length ? `WHERE ${parts.join(" AND ")}` : ""}
     ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.requested_at DESC
     ${opts.limit ? `LIMIT ${Number(opts.limit)}` : ""}`,
    ...params,
  );
}

export function getRequest(id: number): ChangeRequest | undefined {
  return one<ChangeRequest>(`${REQ_SELECT} WHERE r.id = ?`, id);
}

export function pendingRequestCount(): number {
  return (
    one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM requests WHERE status = 'pending'`,
    )?.n ?? 0
  );
}

export function pendingRequestFor(txId: number): ChangeRequest | undefined {
  return one<ChangeRequest>(
    `${REQ_SELECT} WHERE r.tx_id = ? AND r.status = 'pending'
     ORDER BY r.requested_at DESC LIMIT 1`,
    txId,
  );
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

/* ------------------------------------------------------------------- misc */

export function incomeRates(): Array<{ date: string; rate: number }> {
  return all<{ date: string; rate: number }>(
    `SELECT date, rate_idr AS rate FROM transactions
     WHERE type = 'in' AND rate_idr IS NOT NULL
     ORDER BY date ASC, id ASC`,
  );
}

/** Bulan-bulan yang punya transaksi — untuk menandai periode kosong di pemilih. */
export function monthsWithData(): string[] {
  return all<{ month: string }>(
    `SELECT DISTINCT month FROM tx_view ORDER BY month`,
  ).map((r) => r.month);
}

export function firstMonth(): string | null {
  return (
    one<{ m: string | null }>(`SELECT MIN(month) AS m FROM tx_view`)?.m ?? null
  );
}
