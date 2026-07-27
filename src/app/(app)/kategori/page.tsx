import Link from "next/link";
import { connection } from "next/server";
import { toggleArchiveCategory } from "@/app/actions";
import CategoryForm from "@/components/CategoryForm";
import DeleteMasterButton from "@/components/DeleteMasterButton";
import { currentMonth, fmtUsdt, monthLabelLong } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import { categoriesWithStats, getCategory } from "@/lib/queries";
import { requirePerm } from "@/lib/session";

type SP = Record<string, string | string[] | undefined>;

export default async function KategoriPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  await requirePerm("manageCategory");

  const sp = await searchParams;
  const editRaw = Array.isArray(sp.edit) ? sp.edit[0] : sp.edit;
  const editing = editRaw ? getCategory(Number(editRaw)) : undefined;

  const month = currentMonth();
  const cats = categoriesWithStats(month);
  const active = cats.filter((c) => !c.archived);
  const archived = cats.filter((c) => c.archived);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Kategori & Budget</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Kategori menjelaskan uangnya dipakai untuk apa — brand menjelaskan untuk
          siapa. Keduanya dipakai bersamaan di tiap transaksi.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <section className="card h-fit p-4 sm:p-5">
          <CategoryForm key={editing?.id ?? "new"} initial={editing} />
        </section>

        <div className="space-y-4">
          <section className="card">
            <div className="border-b border-[var(--hairline)] px-4 py-3">
              <h2 className="text-sm font-semibold">Kategori aktif</h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Realisasi bulan berjalan: {monthLabelLong(month)}
              </p>
            </div>

            {active.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                Belum ada kategori aktif.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {active.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-[3px]"
                      style={{ background: seriesVar(c.color_slot) }}
                    />
                    <div className="min-w-[150px] flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {c.name}
                        <span className="rounded-full border border-[var(--hairline)] px-1.5 py-px text-[10px] font-normal text-[var(--text-muted)]">
                          {c.kind === "in" ? "masuk" : "keluar"}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {c.tx_count} transaksi · total {fmtUsdt(c.total_usdt)}
                        {c.note ? ` · ${c.note}` : ""}
                      </div>
                    </div>

                    <div className="tnum min-w-[150px] text-right text-xs">
                      {c.kind === "out" && c.budget_usdt > 0 ? (
                        <>
                          <div className="font-medium">{fmtUsdt(c.month_usdt)}</div>
                          <div className="text-[var(--text-muted)]">
                            budget {fmtUsdt(c.budget_usdt)}
                          </div>
                        </>
                      ) : (
                        <span className="text-[var(--text-muted)]">
                          {c.kind === "out" ? "tanpa budget" : "—"}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-1">
                      <Link
                        href={`/transaksi?cat=${c.id}`}
                        className="btn btn-ghost px-2 py-1 text-xs"
                      >
                        Transaksi
                      </Link>
                      <Link
                        href={`/kategori?edit=${c.id}`}
                        className="btn btn-ghost px-2 py-1 text-xs"
                      >
                        Ubah
                      </Link>
                      <form action={toggleArchiveCategory}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="btn btn-ghost px-2 py-1 text-xs">
                          Arsipkan
                        </button>
                      </form>
                      {c.tx_count === 0 && (
                        <DeleteMasterButton kind="category" id={c.id} name={c.name} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {archived.length > 0 && (
            <section className="card">
              <div className="border-b border-[var(--hairline)] px-4 py-3">
                <h2 className="text-sm font-semibold">Arsip</h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Tidak muncul di form transaksi, tapi riwayatnya tetap utuh.
                </p>
              </div>
              <ul className="divide-y divide-[var(--hairline)]">
                {archived.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-[3px] opacity-50"
                      style={{ background: seriesVar(c.color_slot) }}
                    />
                    <span className="flex-1 text-[var(--text-secondary)]">{c.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {c.tx_count} transaksi
                    </span>
                    <form action={toggleArchiveCategory}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="btn btn-ghost px-2 py-1 text-xs">
                        Aktifkan
                      </button>
                    </form>
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
