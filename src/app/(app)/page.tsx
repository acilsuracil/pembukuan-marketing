import Link from "next/link";
import { connection } from "next/server";
import BrandScope from "@/components/BrandScope";
import PeriodScope from "@/components/PeriodScope";
import BudgetMeters from "@/components/BudgetMeters";
import StatTile from "@/components/StatTile";
import TxTable from "@/components/TxTable";
import BalanceChart from "@/components/charts/BalanceChart";
import CashflowChart from "@/components/charts/CashflowChart";
import CategoryBars from "@/components/charts/CategoryBars";
import { fmtDate, fmtIdr, fmtRate, fmtUsdt, fmtUsdtExact } from "@/lib/format";
import {
  brandBudgetStatus,
  brandSpend,
  budgetStatus,
  categorySpend,
  firstMonth,
  getSummary,
  listBrands,
  listTransactions,
  monthlyFlowsBetween,
  monthsWithData,
  openingBalance,
  runningBalanceBetween,
  type TxFilter,
} from "@/lib/queries";
import { chartMonths, parsePeriod, periodOptions } from "@/lib/period";
import { hasPerm } from "@/lib/policy";
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

  const period = parsePeriod(sp.periode);
  const periodScope: TxFilter = { ...scope, from: period.from, to: period.to };
  const chart = chartMonths(period);

  const s = getSummary(scope);
  // Rentang grafik mengikuti periode, jadi membuka bulan lampau memperlihatkan
  // 12 bulan yang berakhir di sana — bukan grafik yang ujungnya selalu hari ini.
  const flows = monthlyFlowsBetween(chart.from, chart.to, scope);
  const balance = runningBalanceBetween(chart.from, chart.to);
  const spendByCategory = categorySpend(periodScope);
  const spendByBrand = brandSpend({ from: period.from, to: period.to });
  const recent = listTransactions({ ...periodScope, limit: 8 });

  // Arus periode dijumlahkan dari bulan-bulan di dalamnya, bukan diambil dari
  // elemen terakhir grafik: untuk tampilan tahunan yang benar adalah total 12
  // bulannya, dan untuk tampilan bulanan hasilnya tetap sama.
  const inPeriod = monthlyFlowsBetween(period.firstMonth, period.lastMonth, scope);
  const flowIn = inPeriod.reduce((n, f) => n + f.in_usdt, 0);
  const flowOut = inPeriod.reduce((n, f) => n + f.out_usdt, 0);
  const net = flowIn - flowOut;

  // Saldo awal periode = saldo akhir sebelum periode itu dimulai. Saldo dompet
  // adalah kolam bersama, jadi angkanya hanya punya arti saat tidak disaring
  // per brand.
  const opening = scoped ? null : openingBalance(period.firstMonth);
  const closing = opening === null ? null : opening + net;

  // Budget dipasang per bulan, jadi tidak ada padanannya untuk tampilan tahunan.
  const monthly = period.kind === "month" && !scoped;
  const budgets = monthly ? budgetStatus(period.key) : [];
  const brandBudgets = monthly ? brandBudgetStatus(period.key) : [];

  const periodPick = periodOptions(firstMonth());
  const filledMonths = monthsWithData();

  return (
    <div className="space-y-5">
      <div className="page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            {scoped ? `Brand ${scoped.name}` : "Semua brand"} ·{" "}
            {period.label}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <PeriodScope
            months={periodPick.months}
            years={periodPick.years}
            filled={filledMonths}
            value={period.key}
            brand={brandRaw}
          />
          {brands.length > 0 && (
            <BrandScope brands={brands} value={brandRaw} periode={period.key} />
          )}
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
                // Angka utuhnya ikut ditulis. Nilai yang dibulatkan 2 desimal
                // tidak bisa dicocokkan dengan saldo dompet sungguhan yang
                // berbunyi 6 desimal — dan saat ada selisih, itu justru
                // pemeriksaan pertama yang dibutuhkan.
                sub={
                  `Tepatnya ${fmtUsdtExact(s.balanceUsdt)}` +
                  (s.balanceIdr === null
                    ? " · belum ada kurs pemasukan"
                    : ` · ≈ ${fmtIdr(s.balanceIdr)} pada kurs terakhir`)
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
            {/* Kartu-kartu ini sepanjang waktu, bukan bulan yang tertulis di
                judul halaman. Periodenya ditulis di labelnya sendiri: tanpa itu,
                "Agustus 2026" di atas membuat total seumur hidup terbaca sebagai
                angka bulan ini, dan arus bersih yang negatif jadi tampak seperti
                saldo yang minus. */}
            <StatTile
              label={
                scoped ? `Masuk — ${scoped.name}` : "Total uang masuk · sejak awal"
              }
              value={fmtUsdt(s.inUsdt)}
              sub={`Modal ${fmtIdr(s.inIdr)}`}
            />
            <StatTile
              label={
                scoped
                  ? `Pemakaian — ${scoped.name}`
                  : "Total uang keluar · sejak awal"
              }
              value={fmtUsdt(s.outUsdt)}
              sub={`Terpakai ${fmtIdr(s.outIdr)}`}
            />
            <StatTile
              label={`Arus bersih ${period.label}`}
              value={`${net >= 0 ? "+" : "−"}${fmtUsdt(Math.abs(net))}`}
              sub={`Masuk ${fmtUsdt(flowIn)} · keluar ${fmtUsdt(flowOut)}`}
            />
          </div>

          {/* Arus bersih adalah selisih masuk-keluar bulan ini, bukan saldo — dan
              bulan yang belum ada top-up-nya pasti negatif sebesar seluruh
              pengeluarannya. Tanpa saldo awal di sebelahnya, angka minus itu
              terbaca seperti dompet yang kehabisan uang, padahal saldo akhir
              bulan lalu memang terbawa. Rangkaiannya ditulis terbuka di sini
              supaya asal-usulnya tidak perlu ditebak. */}
          {opening !== null && closing !== null && (
            <section className="card p-4">
              <div className="text-xs text-[var(--text-secondary)]">
                Perjalanan saldo {period.label}
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span className="text-[var(--text-muted)]">Saldo awal</span>
                <strong className="tnum">{fmtUsdt(opening)}</strong>

                <span className="text-[var(--text-muted)]">+ masuk</span>
                <strong className="tnum" style={{ color: "var(--flow-in)" }}>
                  {fmtUsdt(flowIn)}
                </strong>

                <span className="text-[var(--text-muted)]">− keluar</span>
                <strong className="tnum" style={{ color: "var(--flow-out)" }}>
                  {fmtUsdt(flowOut)}
                </strong>

                <span className="text-[var(--text-muted)]">=</span>
                <strong className="tnum">Saldo akhir {fmtUsdt(closing)}</strong>
              </div>
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                Saldo awal {period.label} adalah saldo akhir{" "}
                {period.kind === "year" ? "tahun" : "bulan"} sebelumnya — uangnya
                terbawa, tidak dihitung ulang dari nol.
              </p>
            </section>
          )}

          <CashflowChart
            data={flows}
            periodLabel={
              period.kind === "year"
                ? `12 bulan ${period.key}`
                : `12 bulan sampai ${period.label}`
            }
          />

          {scoped ? (
            <CategoryBars
              data={spendByCategory}
              title={`Pengeluaran ${scoped.name} per kategori`}
              subtitle={`Realisasi ${period.label}`}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <CategoryBars
                data={spendByBrand}
                title="Pemakaian per brand"
                subtitle={`Realisasi ${period.label}`}
              />
              <CategoryBars
                data={spendByCategory}
                title="Pengeluaran per kategori"
                subtitle={`Realisasi ${period.label}`}
              />
            </div>
          )}

          {/* Budget dipasang per bulan. Pada tampilan tahunan meternya sengaja
              tidak ditampilkan sama sekali — bukan dikosongkan: meter kosong
              terbaca seolah budgetnya belum diatur, padahal budgetnya ada dan
              hanya tidak punya arti untuk rentang setahun. */}
          <div className={monthly ? "grid gap-4 lg:grid-cols-2" : ""}>
            <BalanceChart data={balance} rate={s.lastRate} />
            {monthly && (
              <BudgetMeters
                rows={brandBudgets.length > 0 ? brandBudgets : budgets}
                periodLabel={period.label}
                title={
                  brandBudgets.length > 0 ? "Budget per brand" : "Budget per kategori"
                }
                manageHref={
                  brandBudgets.length > 0
                    ? "/brand"
                    : hasPerm(user, "manageCategory")
                      ? "/kategori"
                      : undefined
                }
              />
            )}
          </div>

          {brandBudgets.length > 0 && budgets.length > 0 && (
            <BudgetMeters
              rows={budgets}
              periodLabel={period.label}
              title="Budget per kategori"
              manageHref={hasPerm(user, "manageCategory") ? "/kategori" : undefined}
            />
          )}

          <section className="card">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3">
              <h2 className="text-sm font-semibold">
                Transaksi terakhir · {period.label}
              </h2>
              {/* Daftarnya sudah disaring ke periode ini, jadi tautannya membawa
                  saringan yang sama — kalau tidak, "lihat semua" akan membuka
                  daftar yang isinya berbeda dari yang barusan dilihat. */}
              <Link
                href={`/transaksi?from=${period.from}&to=${period.to}${
                  scoped ? `&brand=${scoped.id}` : ""
                }`}
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
