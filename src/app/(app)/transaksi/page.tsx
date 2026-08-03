import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import TxFilters from "@/components/TxFilters";
import TxPager, { parsePer } from "@/components/TxPager";
import TxTable from "@/components/TxTable";
import { fmtIdr, fmtUsdt } from "@/lib/format";
import {
  countTransactions,
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

  // Jumlah total dihitung dari filternya, bukan dari baris yang terambil — kalau
  // tidak, judul halaman akan menulis "50 transaksi" untuk filter yang isinya 235.
  const total = countTransactions(filter);
  const per = parsePer(first(sp, "per"));
  const pages = Math.max(1, Math.ceil(total / per));
  // Nomor halaman dijepit ke rentang yang ada. Tanpa ini `?page=99` menghasilkan
  // tabel kosong tanpa penjelasan, dan itu mudah terjadi hanya karena filternya
  // dipersempit selagi berada di halaman belakang.
  const page = Math.min(Math.max(1, Number(first(sp, "page")) || 1), pages);

  const rows = listTransactions({ ...filter, limit: per, offset: (page - 1) * per });
  // Ringkasan tetap menghitung SELURUH filter, bukan hanya halaman yang tampil:
  // total masuk/keluar yang berubah setiap kali halaman diganti tidak ada gunanya
  // untuk pembukuan.
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
  // Ekspor CSV mengikuti filternya saja, bukan halaman yang sedang tampil — orang
  // yang mengunduh mengharapkan seluruh isi filter, bukan 50 baris pertama.
  const exportQs = params.toString();

  params.set("sort", sort);
  params.set("dir", dir);
  // `per` ikut dibawa tautan urut supaya pilihan jumlah baris tidak hilang setiap
  // kali kolom diurutkan. `page` sengaja TIDAK dibawa: urutan yang berubah membuat
  // "halaman 4" menunjuk baris yang sama sekali lain, jadi lebih jujur kembali ke
  // halaman pertama.
  if (per !== 50) params.set("per", String(per));

  return (
    <div className="space-y-5">
      <div className="page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Transaksi</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            {total} transaksi pada filter aktif
            {pages > 1 && ` · halaman ${page} dari ${pages}`}
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
        <TxPager total={total} page={page} per={per} query={params.toString()} />
      </section>
    </div>
  );
}
