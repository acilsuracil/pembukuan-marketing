import Link from "next/link";
import { connection } from "next/server";
import { toggleArchiveBrand } from "@/app/actions";
import BrandForm from "@/components/BrandForm";
import DeleteMasterButton from "@/components/DeleteMasterButton";
import { currentMonth, fmtDate, fmtIdr, fmtUsdt, monthLabelLong } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import { brandsWithStats, getBrand } from "@/lib/queries";
import { requireUser } from "@/lib/session";

type SP = Record<string, string | string[] | undefined>;

export default async function BrandPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const user = await requireUser();
  const isAdmin = user.role === "admin";

  const sp = await searchParams;
  const editRaw = Array.isArray(sp.edit) ? sp.edit[0] : sp.edit;
  const editing = isAdmin && editRaw ? getBrand(Number(editRaw)) : undefined;

  const month = currentMonth();
  const brands = brandsWithStats(month);
  const active = brands.filter((b) => !b.archived);
  const archived = brands.filter((b) => b.archived);
  const totalOut = active.reduce((s, b) => s + b.out_usdt, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Brand</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Saldo USDT tetap satu kolam bersama — halaman ini menunjukkan berapa
          besar tiap brand sudah memakainya.
        </p>
      </div>

      <div className={isAdmin ? "grid gap-4 lg:grid-cols-[340px_1fr]" : ""}>
        {isAdmin && (
          <section className="card h-fit p-4 sm:p-5">
            <BrandForm key={editing?.id ?? "new"} initial={editing} />
          </section>
        )}

        <div className="space-y-4">
          <section className="card">
            <div className="border-b border-[var(--hairline)] px-4 py-3">
              <h2 className="text-sm font-semibold">Brand aktif</h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Kolom “bulan ini” = {monthLabelLong(month)}
              </p>
            </div>

            {active.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                Belum ada brand.{" "}
                {isAdmin
                  ? "Tambahkan lewat form di samping."
                  : "Minta admin menambahkannya."}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {active.map((b) => {
                  const share = totalOut > 0 ? (b.out_usdt / totalOut) * 100 : 0;
                  const overBudget =
                    b.budget_usdt > 0 && b.month_usdt > b.budget_usdt;
                  return (
                    <li key={b.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span
                          aria-hidden
                          className="h-3 w-3 shrink-0 rounded-[3px]"
                          style={{ background: seriesVar(b.color_slot) }}
                        />
                        <div className="min-w-[160px] flex-1">
                          <div className="text-sm font-medium">{b.name}</div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {b.tx_count} transaksi
                            {b.pic ? ` · PIC ${b.pic}` : ""}
                            {b.last_date ? ` · terakhir ${fmtDate(b.last_date)}` : ""}
                          </div>
                        </div>

                        <div className="tnum min-w-[150px] text-right">
                          <div className="text-sm font-medium">
                            {fmtUsdt(b.out_usdt)}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {fmtIdr(b.out_idr)} · {share.toFixed(1)}% total
                          </div>
                        </div>

                        <div className="tnum min-w-[130px] text-right text-xs">
                          <div
                            className="font-medium"
                            style={
                              overBudget
                                ? { color: "var(--status-critical)" }
                                : undefined
                            }
                          >
                            {fmtUsdt(b.month_usdt)}
                          </div>
                          <div className="text-[var(--text-muted)]">
                            {b.budget_usdt > 0
                              ? `budget ${fmtUsdt(b.budget_usdt)}`
                              : "bulan ini"}
                          </div>
                        </div>

                        <div className="flex gap-1">
                          <Link
                            href={`/transaksi?brand=${b.id}`}
                            className="btn btn-ghost px-2 py-1 text-xs"
                          >
                            Transaksi
                          </Link>
                          {isAdmin && (
                            <>
                              <Link
                                href={`/brand?edit=${b.id}`}
                                className="btn btn-ghost px-2 py-1 text-xs"
                              >
                                Ubah
                              </Link>
                              <form action={toggleArchiveBrand}>
                                <input type="hidden" name="id" value={b.id} />
                                <button
                                  type="submit"
                                  className="btn btn-ghost px-2 py-1 text-xs"
                                >
                                  Arsipkan
                                </button>
                              </form>
                              {b.tx_count === 0 && (
                                <DeleteMasterButton kind="brand" id={b.id} name={b.name} />
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {archived.length > 0 && (
            <section className="card">
              <div className="border-b border-[var(--hairline)] px-4 py-3">
                <h2 className="text-sm font-semibold">Arsip</h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Tidak muncul saat mencatat transaksi baru, riwayatnya tetap utuh.
                </p>
              </div>
              <ul className="divide-y divide-[var(--hairline)]">
                {archived.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-[3px] opacity-50"
                      style={{ background: seriesVar(b.color_slot) }}
                    />
                    <span className="flex-1 text-[var(--text-secondary)]">{b.name}</span>
                    <span className="tnum text-xs text-[var(--text-muted)]">
                      {fmtUsdt(b.out_usdt)}
                    </span>
                    {isAdmin && (
                      <form action={toggleArchiveBrand}>
                        <input type="hidden" name="id" value={b.id} />
                        <button type="submit" className="btn btn-ghost px-2 py-1 text-xs">
                          Aktifkan
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
