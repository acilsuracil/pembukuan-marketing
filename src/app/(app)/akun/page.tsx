import { connection } from "next/server";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import { ROLE_LABEL } from "@/lib/format";
import type { Role } from "@/lib/types";

const ROLE_DESC: Record<Role, string> = {
  owner: "menyetujui pembayaran dan mengelola aplikasi, izinnya tidak bisa dibatasi",
  admin: "menyetujui pengajuan divisinya dan mengelola data master",
  finance: "membayar pengajuan yang sudah disetujui",
  staff: "membuat pengajuan dan mencatat pengeluaran harian",
};
import { requireUser } from "@/lib/session";

export default async function AkunPage() {
  await connection();
  const user = await requireUser();

  return (
    <div className="max-w-lg space-y-5">
      <div className="page-header">
        <h1 className="text-xl font-semibold tracking-tight">Akun</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Masuk sebagai <strong>{user.username}</strong> ·{" "}
          {ROLE_LABEL[user.role]} — {ROLE_DESC[user.role]}
        </p>
      </div>

      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Ganti password</h2>
        <p className="mt-0.5 mb-4 text-xs text-[var(--text-muted)]">
          Setelah diganti, sesi di perangkat lain otomatis keluar.
        </p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
