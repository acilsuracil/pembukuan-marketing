import { dataDirHealth } from "@/lib/db";

/**
 * Peringatan penyimpanan sementara. Sengaja mencolok dan tidak bisa ditutup:
 * kegagalannya senyap — aplikasi tetap berfungsi normal, hanya seluruh data
 * hilang setiap kali kode diperbarui.
 */
export default function EphemeralWarning({
  compact = false,
}: {
  compact?: boolean;
}) {
  const h = dataDirHealth();
  if (!h.ephemeralRisk) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border p-4 text-sm"
      style={{
        borderColor: "color-mix(in srgb, var(--status-critical) 45%, transparent)",
        background: "color-mix(in srgb, var(--status-critical) 8%, transparent)",
      }}
    >
      <p className="flex items-center gap-2 font-semibold">
        <span aria-hidden style={{ color: "var(--status-critical)" }}>
          ⚠
        </span>
        Data akan hilang setiap kali aplikasi di-deploy ulang
      </p>

      <p className="mt-2 text-[var(--text-secondary)]">
        Database sedang disimpan di{" "}
        <code className="rounded bg-[var(--wash)] px-1 py-0.5 text-xs">
          {h.dir}
        </code>
        , di dalam folder aplikasi. Di Railway folder itu dibuang setiap deploy,
        jadi seluruh akun dan transaksi ikut terhapus.
      </p>

      {!compact && (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-[var(--text-secondary)]">
          <li>
            Railway → service ini → tab <strong>Volumes</strong> →{" "}
            <strong>Add Volume</strong>, mount path <code>/data</code>.
          </li>
          <li>
            Tab <strong>Variables</strong> → tambahkan{" "}
            <code>LEDGER_DATA_DIR</code> dengan nilai <code>/data</code>.
          </li>
          <li>Redeploy, lalu buat akun owner sekali lagi — yang terakhir.</li>
        </ol>
      )}

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Peringatan ini hilang sendiri begitu penyimpanannya sudah permanen.
      </p>
    </div>
  );
}
