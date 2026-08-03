import Link from "next/link";

/** Pilihan jumlah baris per halaman. */
export const PER_OPTIONS = [50, 100, 200] as const;
export const PER_DEFAULT = 50;

/** Nilai `per` yang sah, atau bawaannya. Dipakai server saat membaca query. */
export function parsePer(raw: string): number {
  const n = Number(raw);
  return (PER_OPTIONS as readonly number[]).includes(n) ? n : PER_DEFAULT;
}

/**
 * Navigasi halaman untuk daftar transaksi.
 *
 * Seluruhnya tautan biasa, bukan tombol ber-JavaScript: halamannya jadi bisa
 * dibagikan, di-bookmark, dibuka di tab baru, dan tetap bekerja sebelum JS
 * termuat. Nomor halaman dan jumlah baris memang bagian dari alamat, sama seperti
 * filternya.
 */
export default function TxPager({
  total,
  page,
  per,
  query,
}: {
  total: number;
  page: number;
  per: number;
  /** Query filter + sort yang sedang aktif, tanpa `page`/`per`. */
  query: string;
}) {
  const pages = Math.max(1, Math.ceil(total / per));
  const from = total === 0 ? 0 : (page - 1) * per + 1;
  const to = Math.min(total, page * per);

  const href = (p: number, n: number) => {
    const q = new URLSearchParams(query);
    // Nilai bawaan tidak ditulis, supaya alamatnya tetap bersih dan satu keadaan
    // tidak punya dua URL yang berbeda.
    if (n !== PER_DEFAULT) q.set("per", String(n));
    else q.delete("per");
    if (p > 1) q.set("page", String(p));
    else q.delete("page");
    const s = q.toString();
    return `/transaksi${s ? `?${s}` : ""}`;
  };

  /** Jendela nomor halaman di sekitar halaman aktif — 200 halaman tidak mungkin dicetak semua. */
  const window: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) {
    window.push(p);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline)] px-4 py-3 text-xs">
      <div className="text-[var(--text-muted)]">
        {total === 0 ? (
          "Tidak ada transaksi pada filter ini"
        ) : (
          <>
            Menampilkan <strong className="tnum">{from}</strong>–
            <strong className="tnum">{to}</strong> dari{" "}
            <strong className="tnum">{total}</strong>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-[var(--text-muted)]">Baris</span>
          {PER_OPTIONS.map((n) => (
            <Link
              key={n}
              // Ganti jumlah baris selalu kembali ke halaman 1: halaman 5 dari
              // 50-baris tidak punya padanan yang bermakna di 200-baris.
              href={href(1, n)}
              aria-current={n === per ? "true" : undefined}
              className="btn btn-ghost px-2 py-0.5 text-[11px]"
              style={
                n === per
                  ? {
                      color: "var(--text-primary)",
                      background: "var(--wash)",
                      fontWeight: 500,
                    }
                  : undefined
              }
            >
              {n}
            </Link>
          ))}
        </div>

        {pages > 1 && (
          <div className="flex items-center gap-1">
            {page > 1 ? (
              <Link href={href(page - 1, per)} className="btn btn-ghost px-2 py-0.5 text-[11px]">
                ‹ Sebelumnya
              </Link>
            ) : (
              <span className="px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                ‹ Sebelumnya
              </span>
            )}

            {window[0] > 1 && <span className="text-[var(--text-muted)]">…</span>}
            {window.map((p) => (
              <Link
                key={p}
                href={href(p, per)}
                aria-current={p === page ? "page" : undefined}
                className="btn btn-ghost px-2 py-0.5 text-[11px]"
                style={
                  p === page
                    ? {
                        color: "var(--text-primary)",
                        background: "var(--wash)",
                        fontWeight: 500,
                      }
                    : undefined
                }
              >
                {p}
              </Link>
            ))}
            {window[window.length - 1] < pages && (
              <span className="text-[var(--text-muted)]">…</span>
            )}

            {page < pages ? (
              <Link href={href(page + 1, per)} className="btn btn-ghost px-2 py-0.5 text-[11px]">
                Berikutnya ›
              </Link>
            ) : (
              <span className="px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                Berikutnya ›
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
