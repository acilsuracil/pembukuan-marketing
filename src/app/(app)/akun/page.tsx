import { connection } from "next/server";
import ChangePasswordForm from "@/components/ChangePasswordForm";
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
          {user.role === "owner"
            ? "Owner — akses penuh, izinnya tidak bisa dibatasi"
            : user.role === "admin"
              ? "Admin — mencatat, menandai dana cair, dan mengelola data master"
              : "Staff — mencatat pengajuan dan belanja harian"}
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
