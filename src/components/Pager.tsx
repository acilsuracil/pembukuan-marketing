import Link from "next/link";
import { qs } from "@/lib/sp";

export const PER_HALAMAN = [10, 20, 50, 100] as const;

/**
 * Navigasi halaman lewat URL, bukan state: halaman yang sedang dibuka ikut
 * tersalin saat tautannya dibagikan, dan tombol kembali browser tetap jalan.
 */
export default function Pager({
  path,
  params,
  page,
  per,
  total,
}: {
  path: string;
  /** Filter yang sedang aktif — ikut terbawa di setiap tautan. */
  params: Record<string, string | undefined>;
  page: number;
  per: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / per));
  const href = (hal: number, n = per) =>
    path + qs({ ...params, per: n, hal: hal > 1 ? hal : undefined });
  const dari = total === 0 ? 0 : (page - 1) * per + 1;
  const sampai = Math.min(page * per, total);

  return (
    <nav
      aria-label="Halaman tabel"
      className="flex flex-wrap items-center justify-between gap-3 text-xs"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--text-muted)]">Baris per halaman</span>
        {PER_HALAMAN.map((n) => (
          // Ganti jumlah baris kembali ke halaman 1: halaman 5 dari 10 baris
          // bukan halaman 5 dari 100 baris.
          <Link
            key={n}
            href={href(1, n)}
            aria-current={n === per ? "true" : undefined}
            className={`btn px-2 py-1 text-xs ${n === per ? "btn-primary" : "btn-ghost"}`}
          >
            {n}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="tnum text-[var(--text-muted)]">
          {dari}–{sampai} dari {total} baris
        </span>
        {page > 1 ? (
          <Link href={href(page - 1)} className="btn btn-ghost px-2 py-1 text-xs">
            ‹ Sebelumnya
          </Link>
        ) : (
          <span className="btn btn-ghost pointer-events-none px-2 py-1 text-xs opacity-40">
            ‹ Sebelumnya
          </span>
        )}
        <span className="tnum">
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className="btn btn-ghost px-2 py-1 text-xs">
            Berikutnya ›
          </Link>
        ) : (
          <span className="btn btn-ghost pointer-events-none px-2 py-1 text-xs opacity-40">
            Berikutnya ›
          </span>
        )}
      </div>
    </nav>
  );
}
