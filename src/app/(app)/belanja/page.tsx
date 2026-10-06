import Link from "next/link";
import { connection } from "next/server";
import Pager, { PER_HALAMAN } from "@/components/Pager";
import StatTile from "@/components/StatTile";
import TxFilters from "@/components/TxFilters";
import TxTable from "@/components/TxTable";
import { fmtIdr } from "@/lib/format";
import { txOptions } from "@/lib/opts";
import { JENIS_SEMUA } from "@/lib/jenis";
import { hasPerm } from "@/lib/policy";
import { getSummary, listTransaksi, type TxFilter } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { first, ids, num, qs, type SP } from "@/lib/sp";
import type { Jenis } from "@/lib/types";

export default async function BelanjaPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const me = await requireUser();
  const sp = await searchParams;

  const jenisRaw = first(sp, "jenis");
  const values = {
    from: first(sp, "from"),
    to: first(sp, "to"),
    jenis: jenisRaw,
    divisi: first(sp, "divisi"),
    platform: first(sp, "platform"),
    brand: first(sp, "brand"),
    dompet: first(sp, "dompet"),
    q: first(sp, "q"),
  };

  const filter: TxFilter = {
    from: values.from || undefined,
    to: values.to || undefined,
    jenis: JENIS_SEMUA.includes(jenisRaw as Jenis) ? (jenisRaw as Jenis) : undefined,
    divisiId: num(sp, "divisi"),
    platformIds: ids(sp, "platform"),
    brandId: num(sp, "brand"),
    dompetId: num(sp, "dompet"),
    q: values.q || undefined,
  };

  const s = getSummary(filter);
  const perRaw = num(sp, "per");
  const per = PER_HALAMAN.find((n) => n === perRaw) ?? PER_HALAMAN[0];
  const pages = Math.max(1, Math.ceil(s.txCount / per));
  // Halaman di luar jangkauan (mis. setelah filter mempersempit hasil) jatuh
  // ke halaman terakhir, bukan tabel kosong.
  const page = Math.min(num(sp, "hal") ?? 1, pages);
  const rows = listTransaksi({ ...filter, limit: per, offset: (page - 1) * per });
  const opts = txOptions();
  const biayaHalaman = rows.reduce((a, t) => a + t.delta_biaya, 0);

  return (
    <div className="space-y-5">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pengeluaran &amp; mutasi</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Seluruh baris buku besar. Top-up ikut tampil di sini, tapi tidak
            dihitung sebagai biaya.
          </p>
        </div>
        {hasPerm(me, "addBelanja") && (
          <div className="flex gap-2">
            <Link href="/belanja/harian" className="btn btn-primary">
              Input harian dompet
            </Link>
            <Link href="/belanja/baru" className="btn btn-ghost">
              Catat satu transaksi
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total biaya (filter ini)"
          value={fmtIdr(s.biaya)}
          sub={`${s.txCount} baris`}
        />
        <StatTile
          label="Pengeluaran dari dompet"
          value={fmtIdr(s.belanjaDompet)}
          sub="auto payment & transfer dari dompet kita"
        />
        <StatTile
          label="Pengeluaran finance langsung"
          value={fmtIdr(s.belanjaFinance)}
          sub="tanpa lewat dompet"
        />
        <StatTile
          label="Top-up masuk dompet"
          value={fmtIdr(s.topup)}
          sub="bukan biaya — hanya pindah tempat"
        />
      </div>

      <TxFilters
        value={values}
        divisi={opts.divisi}
        platform={opts.platform}
        brand={opts.brand}
        dompet={opts.dompet}
        keep={{ per: String(per) }}
        exportHref={
          hasPerm(me, "exportData")
            ? `/api/export${qs({ ...values, limit: undefined })}`
            : undefined
        }
      />

      <TxTable
        rows={rows}
        canEdit={hasPerm(me, "editBelanja")}
        canDelete={hasPerm(me, "deleteBelanja")}
        total={[
          // Subtotal halaman hanya berguna kalau barisnya terpecah ke beberapa
          // halaman; di satu halaman angkanya sama persis dengan total filter.
          ...(pages > 1 ? [{ label: "Total halaman ini", biaya: biayaHalaman }] : []),
          { label: `Total pengeluaran (${s.txCount} baris sesuai filter)`, biaya: s.biaya },
        ]}
      />

      <Pager path="/belanja" params={values} page={page} per={per} total={s.txCount} />
    </div>
  );
}
