import Link from "next/link";
import { connection } from "next/server";
import BrandScope from "@/components/BrandScope";
import BudgetMeters from "@/components/BudgetMeters";
import StatTile from "@/components/StatTile";
import TxTable from "@/components/TxTable";
import BalanceChart from "@/components/charts/BalanceChart";
import CashflowChart from "@/components/charts/CashflowChart";
import CategoryBars from "@/components/charts/CategoryBars";
import {
  currentMonth,
  fmtDate,
  fmtIdr,
  fmtRate,
  fmtUsdt,
  monthLabelLong,
} from "@/lib/format";
import {
  brandBudgetStatus,
  brandSpend,
  budgetStatus,
  categorySpend,
  getSummary,
  listBrands,
  listTransactions,
  monthlyFlows,
  runningBalance,
  type TxFilter,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";

type SP = Record<string, string | string[] | undefined>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Driver SQLite ini sinkron; tanpa connection() query-nya ikut ter-prerender.
  await connection();
  const user = await requireUser();

  const sp = await searchParams;
  const brandRaw = (Array.isArray(sp.brand) ? sp.brand[0] : sp.brand) ?? "";
  const brands = listBrands();
  const scoped = brandRaw ? brands.find((b) => String(b.id) === brandRaw) : undefined;
  const scope: TxFilter = scoped ? { brandId: scoped.id } : {};

  const month = currentMonth();
  const monthScope: TxFilter = { ...scope, from: `${month}-01`, to: `${month}-31` };

  const s = getSummary(scope);
  const flows = monthlyFlows(12, scope);
  const balance = runningBalance(12);
  const spendByCategory = categorySpend(monthScope);
  const spendByBrand = brandSpend({ from: `${month}-01`, to: `${month}-31` });
  const recent = listTransactions({ ...scope, limit: 8 });

  const monthFlow = flows[flows.length - 1];
  const net = monthFlow ? monthFlow.in_usdt - monthFlow.out_usdt : 0;
  const budgets = scoped ? [] : budgetStatus(month);
  const brandBudgets = scoped ? [] : brandBudgetStatus(month);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            {scoped ? `Brand ${scoped.name}` : "Semua brand"} ·{" "}
            {monthLabelLong(month)}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {brands.length > 0 && <BrandScope brands={brands} value={brandRaw} />}
          <Link href="/transaksi/baru" className="btn btn-primary">
            + Catat transaksi
          </Link>
        </div>
      </div>

      {s.txCount === 0 && !scoped ? (
        <section className="card px-6 py-14 text-center">
          <h2 className="text-base font-semibold">Belum ada data</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
            Mulai dengan membuat brand, lalu catat pemasukan (top-up USDT)
            beserta kurs belinya. Kurs itu yang nanti dipakai untuk menilai setiap
            pengeluaran berikutnya.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            {brands.length === 0 && (
              <Link href="/brand" className="btn btn-ghost">
                Buat brand
              </Link>
            )}
            <Link href="/transaksi/baru" className="btn btn-primary">
              Catat transaksi pertama
            </Link>
          </div>
        </section>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <StatTile
                hero
                label="Saldo dompet (seluruh brand)"
                value={fmtUsdt(s.balanceUsdt)}
                sub={
                  s.balanceIdr === null
                    ? "Belum ada kurs pemasukan"
                    : `≈ ${fmtIdr(s.balanceIdr)} pada kurs pemasukan terakhir`
                }
              />
            </div>
            <StatTile
              label="Kurs pemasukan terakhir"
              value={fmtRate(s.lastRate)}
              sub={
                s.lastRateDate
                  ? `per 1 USDT · ${fmtDate(s.lastRateDate)}`
                  : "per 1 USDT"
              }
            />
            <StatTile
              label="Kurs rata-rata tertimbang"
              value={fmtRate(s.avgRate)}
              sub="Harga pokok seluruh pemasukan"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label={scoped ? `Masuk — ${scoped.name}` : "Total uang masuk"}
              value={fmtUsdt(s.inUsdt)}
              sub={`Modal ${fmtIdr(s.inIdr)}`}
            />
            <StatTile
              label={scoped ? `Pemakaian — ${scoped.name}` : "Total uang keluar"}
              value={fmtUsdt(s.outUsdt)}
              sub={`Terpakai ${fmtIdr(s.outIdr)}`}
            />
            <StatTile
              label={`Arus bersih ${monthLabelLong(month)}`}
              value={`${net >= 0 ? "+" : "−"}${fmtUsdt(Math.abs(net))}`}
              sub={
                monthFlow
                  ? `Masuk ${fmtUsdt(monthFlow.in_usdt)} · keluar ${fmtUsdt(
                      monthFlow.out_usdt,
                    )}`
                  : undefined
              }
            />
          </div>

          <CashflowChart data={flows} />

          {scoped ? (
            <CategoryBars
              data={spendByCategory}
              title={`Pengeluaran ${scoped.name} per kategori`}
              subtitle={`Realisasi ${monthLabelLong(month)}`}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <CategoryBars
                data={spendByBrand}
                title="Pemakaian per brand"
                subtitle={`Realisasi ${monthLabelLong(month)}`}
              />
              <CategoryBars
                data={spendByCategory}
                title="Pengeluaran per kategori"
                subtitle={`Realisasi ${monthLabelLong(month)}`}
              />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <BalanceChart data={balance} rate={s.lastRate} />
            <BudgetMeters
              rows={brandBudgets.length > 0 ? brandBudgets : budgets}
              periodLabel={monthLabelLong(month)}
              title={
                brandBudgets.length > 0 ? "Budget per brand" : "Budget per kategori"
              }
              manageHref={
                brandBudgets.length > 0
                  ? "/brand"
                  : user.role === "admin"
                    ? "/kategori"
                    : undefined
              }
            />
          </div>

          {brandBudgets.length > 0 && budgets.length > 0 && (
            <BudgetMeters
              rows={budgets}
              periodLabel={monthLabelLong(month)}
              title="Budget per kategori"
              manageHref={user.role === "admin" ? "/kategori" : undefined}
            />
          )}

          <section className="card">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3">
              <h2 className="text-sm font-semibold">Transaksi terakhir</h2>
              <Link
                href={scoped ? `/transaksi?brand=${scoped.id}` : "/transaksi"}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Lihat semua →
              </Link>
            </div>
            <TxTable rows={recent} compactView />
          </section>
        </>
      )}
    </div>
  );
}
