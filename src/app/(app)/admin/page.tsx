import { connection } from "next/server";
import { CreateUserForm, LockForm, UserRow } from "@/components/AdminForms";
import { getLockUntil } from "@/lib/policy";
import { listActivity, listUsers } from "@/lib/queries";
import { requireAdmin } from "@/lib/session";
import { storageStatus } from "@/lib/storage";

export default async function AdminPage() {
  await connection();
  const me = await requireAdmin();

  const users = listUsers();
  const lock = getLockUntil();
  const log = listActivity(80);
  const storage = storageStatus();

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Kelola akun, kunci periode pembukuan, dan telusuri jejak aktivitas.
        </p>
      </div>

      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Kunci periode</h2>
        <p className="mt-0.5 mb-4 text-xs text-[var(--text-muted)]">
          Setelah laporan suatu periode selesai dikerjakan, kunci tanggalnya
          supaya angkanya tidak berubah lagi di belakang hari.
          {lock && (
            <>
              {" "}
              Saat ini terkunci sampai{" "}
              <strong className="tnum text-[var(--text-primary)]">{lock}</strong>.
            </>
          )}
        </p>
        <LockForm current={lock} />
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Penyimpanan bukti transfer</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Backend aktif</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{
                  background:
                    storage.backend === "supabase"
                      ? "var(--status-good)"
                      : "var(--status-warning)",
                }}
              />
              {storage.backend === "supabase"
                ? "Supabase Storage"
                : "Disk lokal / volume"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Bucket</dt>
            <dd className="mt-0.5 font-medium">{storage.bucket}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Host</dt>
            <dd className="mt-0.5 font-medium">{storage.url || "—"}</dd>
          </div>
        </dl>
        <p className="hint mt-3">
          {storage.backend === "supabase"
            ? "Bukti disimpan di bucket privat Supabase dan tetap disajikan lewat route yang memeriksa sesi — tidak ada URL publik, dan service key tidak pernah sampai ke browser."
            : "Belum ada SUPABASE_URL / SUPABASE_SERVICE_KEY, jadi bukti disimpan di disk. Di Railway, isi kedua env itu atau pastikan volume terpasang supaya berkas tidak hilang saat redeploy."}
        </p>
      </section>

      <section className="card">
        <div className="border-b border-[var(--hairline)] px-4 py-3">
          <h2 className="text-sm font-semibold">Akun ({users.length})</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Menonaktifkan akun atau me-reset passwordnya langsung memutus sesi
            yang sedang berjalan di perangkat mana pun.
          </p>
        </div>
        <ul className="divide-y divide-[var(--hairline)]">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isSelf={u.id === me.id}
              online={u.online === 1}
            />
          ))}
        </ul>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Tambah akun</h2>
        <p className="mt-0.5 mb-4 text-xs text-[var(--text-muted)]">
          Staff bisa mencatat transaksi dan mengunggah bukti, tapi setiap
          perubahan dan penghapusan harus lewat pengajuan.
        </p>
        <CreateUserForm />
      </section>

      <section className="card">
        <div className="border-b border-[var(--hairline)] px-4 py-3">
          <h2 className="text-sm font-semibold">Log aktivitas</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            80 kejadian terakhir.
          </p>
        </div>
        {log.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
            Belum ada aktivitas tercatat.
          </p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="sticky top-0 bg-[var(--surface-1)] text-[var(--text-muted)]">
                <tr className="border-b border-[var(--hairline)]">
                  <th className="px-4 py-2 font-medium">Waktu</th>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Aksi</th>
                  <th className="px-4 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--hairline)] last:border-0">
                    <td className="tnum px-4 py-1.5 whitespace-nowrap text-[var(--text-muted)]">
                      {new Date(l.ts).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      {l.username}
                      <span className="ml-1 text-[var(--text-muted)]">({l.role})</span>
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">{l.action}</td>
                    <td className="px-4 py-1.5 text-[var(--text-secondary)]">{l.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
