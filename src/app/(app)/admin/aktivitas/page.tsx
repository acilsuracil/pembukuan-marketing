import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import DateField from "@/components/DateField";
import { Badge } from "@/components/ui";
import {
  activityActions,
  activitySummary,
  activityUsernames,
  listActivity,
} from "@/lib/queries";
import { requirePerm } from "@/lib/session";

type SP = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) || "";
const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

const LIMITS = [100, 200, 500, 1000] as const;

/** ISO → "28 Jul 2026, 04.12" — deterministik terhadap input, aman untuk lint. */
function tsLabel(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminAktivitasPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  await requirePerm("viewActivity");

  const sp = await searchParams;
  const u = first(sp.u);
  const a = first(sp.a);
  const fromRaw = first(sp.from);
  const toRaw = first(sp.to);
  const from = dateOk(fromRaw) ? fromRaw : "";
  const to = dateOk(toRaw) ? toRaw : "";
  const nRaw = Number(first(sp.n));
  const limit = (LIMITS as readonly number[]).includes(nRaw) ? nRaw : 200;
  const filtered = Boolean(u || a || from || to);

  const usernames = activityUsernames();
  const actions = activityActions();
  const summary = activitySummary();
  const log = listActivity({
    username: u || undefined,
    action: a || undefined,
    from: from || undefined,
    to: to || undefined,
    limit,
  });

  return (
    <section className="card">
      {/* ------------------------------------------------------------ filter */}
      <div className="border-b border-[var(--hairline)] px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold">Log aktivitas</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Jejak semua perubahan: siapa, kapan, dan apa yang dilakukan.
        </p>

        <Form
          action="/admin/aktivitas"
          className="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6"
        >
          <div>
            <label className="label" htmlFor="f-u">
              Pengguna
            </label>
            <select id="f-u" name="u" defaultValue={u} className="field">
              <option value="">Semua</option>
              {usernames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-a">
              Aksi
            </label>
            <select id="f-a" name="a" defaultValue={a} className="field">
              <option value="">Semua</option>
              {actions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-from">
              Dari tanggal
            </label>
            <DateField id="f-from" name="from" defaultValue={from} />
          </div>
          <div>
            <label className="label" htmlFor="f-to">
              Sampai tanggal
            </label>
            <DateField id="f-to" name="to" defaultValue={to} />
          </div>
          <div>
            <label className="label" htmlFor="f-n">
              Jumlah
            </label>
            <select id="f-n" name="n" defaultValue={String(limit)} className="field">
              {LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n} terakhir
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">
              Terapkan
            </button>
            {filtered && (
              <Link href="/admin/aktivitas" className="btn btn-ghost">
                Reset
              </Link>
            )}
          </div>
        </Form>
      </div>

      {/* ------------------------------------------------- telusur per user */}
      {summary.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--hairline)] px-4 py-2.5 sm:px-5">
          <span className="mr-1 text-[11px] text-[var(--text-muted)]">
            Paling aktif:
          </span>
          {summary.slice(0, 8).map((s) => {
            const active = u === s.username;
            return (
              <Link
                key={s.username}
                href={`/admin/aktivitas?u=${encodeURIComponent(s.username)}`}
                aria-current={active ? "true" : undefined}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  active
                    ? "border-[var(--series-1)] font-medium text-[var(--text-primary)]"
                    : "border-[var(--hairline)] text-[var(--text-secondary)] hover:bg-[var(--wash)]"
                }`}
              >
                {s.username}
                <span className="tnum text-[var(--text-muted)]"> · {s.n}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- hasil */}
      {log.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-[var(--text-muted)]">
          {filtered
            ? "Tidak ada aktivitas yang cocok dengan filter ini."
            : "Belum ada aktivitas tercatat."}
        </p>
      ) : (
        <>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-[var(--surface-1)] text-[var(--text-muted)]">
                <tr className="border-b border-[var(--hairline)]">
                  <th className="px-4 py-2 font-medium sm:px-5">Waktu</th>
                  <th className="px-3 py-2 font-medium">Pengguna</th>
                  <th className="px-3 py-2 font-medium">Aksi</th>
                  <th className="px-4 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-[var(--hairline)] last:border-0"
                  >
                    <td className="tnum px-4 py-2 whitespace-nowrap text-[var(--text-muted)] sm:px-5">
                      {tsLabel(l.ts)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {l.username}
                      <span className="ml-1 text-[var(--text-muted)]">
                        ({l.role})
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge
                        tone={l.action.startsWith("hapus") ? "critical" : "muted"}
                      >
                        {l.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">
                      {l.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[var(--hairline)] px-4 py-2 text-[11px] text-[var(--text-muted)] sm:px-5">
            Menampilkan {log.length} kejadian
            {log.length === limit &&
              " — mungkin masih ada yang lebih lama; perbesar jumlah atau persempit filter"}
            .
          </p>
        </>
      )}
    </section>
  );
}
