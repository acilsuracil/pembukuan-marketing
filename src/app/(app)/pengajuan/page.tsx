import Link from "next/link";
import { connection } from "next/server";
import { CancelRequest, DecideRequest } from "@/components/RequestActions";
import { Badge } from "@/components/ui";
import { fmtDate, fmtIdr, fmtRate, fmtUsdt } from "@/lib/format";
import { getBrand, getCategory, listRequests } from "@/lib/queries";
import { hasPerm } from "@/lib/policy";
import { requireUser } from "@/lib/session";
import type { ChangeRequest, TxRow } from "@/lib/types";

/** Nilai usulan yang disimpan di kolom payload pengajuan 'edit'. */
interface Proposed {
  date: string;
  type: "in" | "out";
  amount: number;
  fee: number;
  /** Menyusul setelah rilis awal — pengajuan lama tidak memuatnya. */
  feePct?: number;
  rate: number | null;
  categoryId: number | null;
  brandId: number | null;
  description: string;
  counterparty: string;
  txHash: string;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const brandName = (id: number | null) =>
  id === null ? "—" : (getBrand(id)?.name ?? `#${id}`);
const catName = (id: number | null) =>
  id === null ? "—" : (getCategory(id)?.name ?? `#${id}`);

/** Baris "dari → jadi" hanya untuk field yang benar-benar berubah. */
function diffRows(before: TxRow, after: Proposed): Array<[string, string, string]> {
  const rows: Array<[string, string, string]> = [];
  const push = (label: string, a: string, b: string) => {
    if (a !== b) rows.push([label, a, b]);
  };
  push("Tanggal", fmtDate(before.date), fmtDate(after.date));
  push(
    "Jenis",
    before.type === "in" ? "Uang masuk" : "Uang keluar",
    after.type === "in" ? "Uang masuk" : "Uang keluar",
  );
  push("Brand", brandName(before.brand_id), brandName(after.brandId));
  push("Kategori", catName(before.category_id), catName(after.categoryId));
  push("Nominal", fmtUsdt(before.amount_usdt), fmtUsdt(after.amount));
  push("Biaya jaringan", fmtUsdt(before.fee_usdt), fmtUsdt(after.fee));
  // Pengajuan lama dibuat sebelum kolom ini ada, jadi feePct-nya kosong.
  push("Fee agency", `${before.fee_pct}%`, `${after.feePct ?? 0}%`);
  push(
    "Kurs manual",
    before.rate_idr === null ? "(warisan)" : fmtRate(before.rate_idr),
    after.rate === null ? "(warisan)" : fmtRate(after.rate),
  );
  push("Keterangan", before.description || "—", after.description || "—");
  push("Pihak terkait", before.counterparty || "—", after.counterparty || "—");
  push("Tx hash", before.tx_hash || "—", after.txHash || "—");
  return rows;
}

function StatusBadge({ status }: { status: ChangeRequest["status"] }) {
  if (status === "pending") return <Badge tone="serious">Menunggu</Badge>;
  if (status === "approved") return <Badge tone="good">✓ Disetujui</Badge>;
  return <Badge tone="critical">✕ Ditolak</Badge>;
}

function RequestCard({
  rq,
  canDecide,
  canCancel,
}: {
  rq: ChangeRequest;
  canDecide: boolean;
  canCancel: boolean;
}) {
  const before = safeParse<TxRow>(rq.snapshot);
  const after = safeParse<Proposed>(rq.payload);
  const diff = before && after ? diffRows(before, after) : [];

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {rq.type === "edit" ? "Perubahan" : "Penghapusan"} transaksi{" "}
              {rq.tx_id ? (
                <Link href={`/transaksi/${rq.tx_id}`} className="underline">
                  #{rq.tx_id}
                </Link>
              ) : (
                "(sudah hilang)"
              )}
            </span>
            <StatusBadge status={rq.status} />
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Diajukan {rq.requester_name ?? "—"} ·{" "}
            {new Date(rq.requested_at).toLocaleString("id-ID")}
          </p>
        </div>

        {before && (
          <div className="tnum text-right text-xs text-[var(--text-secondary)]">
            <div className="font-medium text-[var(--text-primary)]">
              {before.type === "in" ? "+" : "−"}
              {fmtUsdt(before.flow_usdt)}
            </div>
            <div>
              {fmtDate(before.date)}
              {before.brand_name ? ` · ${before.brand_name}` : ""}
            </div>
            {before.eff_rate !== null && (
              <div>{fmtIdr(before.flow_usdt * before.eff_rate)}</div>
            )}
          </div>
        )}
      </div>

      <p className="mt-3 rounded-lg bg-[var(--wash)] px-3 py-2 text-xs">
        <span className="text-[var(--text-muted)]">Alasan: </span>
        {rq.reason || "—"}
      </p>

      {rq.type === "edit" && (
        <div className="mt-3">
          {diff.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              Tidak ada perbedaan nilai yang terdeteksi.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="py-1 font-medium">Field</th>
                  <th className="py-1 font-medium">Sekarang</th>
                  <th className="py-1 font-medium">Diusulkan</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {diff.map(([label, a, b]) => (
                  <tr key={label} className="border-t border-[var(--hairline)]">
                    <td className="py-1 pr-3 text-[var(--text-secondary)]">{label}</td>
                    <td className="py-1 pr-3 line-through opacity-60">{a}</td>
                    <td className="py-1 font-medium">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {rq.status !== "pending" && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Diputus {rq.decider_name ?? "—"}
          {rq.decided_at
            ? ` · ${new Date(rq.decided_at).toLocaleString("id-ID")}`
            : ""}
          {rq.decision_note ? ` · “${rq.decision_note}”` : ""}
        </p>
      )}

      {rq.status === "pending" && (canDecide || canCancel) && (
        <div className="mt-4 border-t border-[var(--hairline)] pt-3">
          {canDecide ? <DecideRequest id={rq.id} /> : <CancelRequest id={rq.id} />}
        </div>
      )}
    </li>
  );
}

export default async function PengajuanPage() {
  await connection();
  const user = await requireUser();
  // Yang boleh memutus melihat semua; sisanya hanya pengajuannya sendiri.
  const isAdmin = hasPerm(user, "approveRequest");
  const all = listRequests(isAdmin ? {} : { requestedBy: user.id, limit: 100 });
  const pending = all.filter((r) => r.status === "pending");
  const decided = all.filter((r) => r.status !== "pending").slice(0, 30);

  return (
    <div className="max-w-4xl space-y-5">
      <div className="page-header">
        <h1 className="text-xl font-semibold tracking-tight">Pengajuan</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          {isAdmin
            ? "Perubahan dan penghapusan yang diajukan staff. Perubahan baru diterapkan setelah kamu setujui."
            : "Perubahan dan penghapusan yang kamu ajukan ke admin."}
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">
          Menunggu keputusan{" "}
          <span className="font-normal text-[var(--text-muted)]">
            ({pending.length})
          </span>
        </h2>
        {pending.length === 0 ? (
          <p className="card px-4 py-10 text-center text-sm text-[var(--text-muted)]">
            Tidak ada pengajuan yang menunggu.
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((rq) => (
              <RequestCard
                key={rq.id}
                rq={rq}
                canDecide={isAdmin}
                canCancel={rq.requested_by === user.id}
              />
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Riwayat keputusan</h2>
          <ul className="space-y-3">
            {decided.map((rq) => (
              <RequestCard key={rq.id} rq={rq} canDecide={false} canCancel={false} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
