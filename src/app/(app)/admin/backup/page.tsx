import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  BackupList,
  CreateBackupButton,
  type BackupRow,
} from "@/components/admin/BackupPanel";
import { backupOverview } from "@/lib/backup";
import { isOwner } from "@/lib/policy";
import { requireUser } from "@/lib/session";
import { storageStatus } from "@/lib/storage";

function fmtSize(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} byte`;
}

export default async function AdminBackupPage() {
  await connection();
  const me = await requireUser();
  // Backup memuat hash password seluruh akun — owner saja.
  if (!isOwner(me)) redirect("/?e=no-access");

  // Seluruh hitungan waktu dikerjakan di lib; komponen tidak boleh memanggil Date.now().
  const o = await backupOverview();
  const storage = storageStatus();

  const rows: BackupRow[] = o.rows.map((r) => ({
    name: r.name,
    size: fmtSize(r.size),
    when: r.when.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }),
    tier: r.tier,
    isLatest: r.isLatest,
  }));

  const fresh = o.staleHours !== null && o.staleHours <= 36;

  return (
    <div className="space-y-4">
      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Backup otomatis</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Seluruh database dipotret setiap hari dan disimpan di{" "}
          {storage.backend === "supabase"
            ? `Supabase — folder backup/ pada bucket ${storage.bucket}`
            : "folder data lokal"}
          . Retensinya bertingkat: harian selama 14 hari, lalu satu per minggu
          selama 8 minggu, lalu satu per bulan selama 12 bulan.
        </p>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Snapshot tersimpan</dt>
            <dd className="tnum mt-0.5 font-medium">{o.count}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Total ukuran</dt>
            <dd className="tnum mt-0.5 font-medium">{fmtSize(o.totalBytes)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Snapshot terakhir</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
              <span
                aria-hidden
                style={{
                  color: fresh ? "var(--success-text)" : "var(--status-warning)",
                }}
              >
                {fresh ? "✓" : "⚠"}
              </span>
              {o.staleHours === null
                ? "Belum ada"
                : o.staleHours < 1
                  ? "Baru saja"
                  : `${Math.round(o.staleHours)} jam lalu`}
            </dd>
          </div>
        </dl>

        <div className="mt-4 border-t border-[var(--hairline)] pt-4">
          <CreateBackupButton />
        </div>
      </section>

      <section
        className="rounded-xl border p-4 text-xs leading-relaxed"
        style={{
          borderColor: "color-mix(in srgb, var(--status-warning) 40%, transparent)",
          background: "color-mix(in srgb, var(--status-warning) 7%, transparent)",
        }}
      >
        <p className="font-medium text-[var(--text-primary)]">
          Sebulan sekali, unduh satu snapshot ke luar Supabase
        </p>
        <p className="mt-1 text-[var(--text-secondary)]">
          Backup ini tersimpan di Supabase yang sama dengan bukti transfer dan
          dibuka dengan kunci yang sama. Kalau project Supabase-nya bermasalah
          atau kuncinya bocor, dua-duanya terdampak sekaligus. Satu salinan di
          laptop atau Google Drive adalah satu-satunya lapisan yang tidak ikut
          hilang.
        </p>
      </section>

      <section className="card">
        <div className="border-b border-[var(--hairline)] px-4 py-3">
          <h2 className="text-sm font-semibold">Daftar snapshot</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Memulihkan akan menimpa seluruh data sekarang — kondisi sebelumnya
            dipotret otomatis lebih dulu, jadi keputusannya masih bisa dibalik.
          </p>
        </div>
        <BackupList rows={rows} />
      </section>
    </div>
  );
}
