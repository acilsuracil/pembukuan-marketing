import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import TxFilters from "@/components/TxFilters";
import TxTable from "@/components/TxTable";
import { fmtIdr, fmtUsdt } from "@/lib/format";
import {
  getSummary,
  isSortKey,
  listBrands,
  listCategories,
  listTransactions,
  type SortDir,
  type SortKey,
  type TxFilter,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";

type SP = Record<string, string | string[] | undefined>;

function first(sp: SP, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function TransaksiPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  await requireUser();
  const sp = await searchParams;

  const typeRaw = first(sp, "type");
  const catRaw = first(sp, "cat");
  const brandRaw = first(sp, "brand");
  const sortRaw = first(sp, "sort");
  const dirRaw = first(sp, "dir");

  const sort: SortKey = isSortKey(sortRaw) ? sortRaw : "date";
  const dir: SortDir = dirRaw === "asc" ? "asc" : "desc";

  const filter: TxFilter = {
    from: first(sp, "from") || undefined,
    to: first(sp, "to") || undefined,
    type: typeRaw === "in" || typeRaw === "out" ? typeRaw : undefined,
    categoryId: catRaw ? Number(catRaw) : undefined,
    noBrand: brandRaw === "none",
    brandId: brandRaw && brandRaw !== "none" ? Number(brandRaw) : undefined,
    q: first(sp, "q") || undefined,
    sort,
    dir,
  };

  const categories = listCategories(true);
  const brands = listBrands(true);
  const rows = listTransactions(filter);
  const s = getSummary(filter);

  const params = new URLSearchParams(
    Object.entries({
      from: filter.from ?? "",
      to: filter.to ?? "",
      type: filter.type ?? "",
      cat: catRaw,
      brand: brandRaw,
      q: filter.q ?? "",
    }).filter(([, v]) => v !== ""),
  );
  const exportQs = params.toString();
  params.set("sort", sort);
  params.set("dir", dir);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Transaksi</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            {rows.length} transaksi pada filter aktif
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/export${exportQs ? `?${exportQs}` : ""}`}
            className="btn btn-ghost"
            download
          >
            Ekspor CSV
          </a>
          <Link href="/transaksi/baru" className="btn btn-primary">
            + Catat transaksi
          </Link>
        </div>
      </div>

      <Suspense fallback={<div className="card h-[150px]" />}>
        <TxFilters categories={categories} brands={brands} />
      </Suspense>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-3">
          <div className="text-xs text-[var(--text-secondary)]">Masuk (terfilter)</div>
          <div className="tnum mt-0.5 text-lg font-semibold">{fmtUsdt(s.inUsdt)}</div>
          <div className="text-xs text-[var(--text-muted)]">{fmtIdr(s.inIdr)}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-[var(--text-secondary)]">Keluar (terfilter)</div>
          <div className="tnum mt-0.5 text-lg font-semibold">{fmtUsdt(s.outUsdt)}</div>
          <div className="text-xs text-[var(--text-muted)]">{fmtIdr(s.outIdr)}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-[var(--text-secondary)]">Selisih (terfilter)</div>
          <div className="tnum mt-0.5 text-lg font-semibold">
            {fmtUsdt(s.inUsdt - s.outUsdt)}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {fmtIdr(s.inIdr - s.outIdr)}
          </div>
        </div>
      </div>

      <section className="card">
        <TxTable rows={rows} sort={sort} dir={dir} params={params.toString()} />
      </section>
    </div>
  );
}
