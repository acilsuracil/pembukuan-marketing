import { redirect } from "next/navigation";
import { connection } from "next/server";
import SetupForm from "@/components/SetupForm";
import { countUsers } from "@/lib/queries";

export default async function SetupPage() {
  await connection();
  if (countUsers() > 0) redirect("/login");

  return (
    <>
      <h1 className="text-base font-semibold">Buat akun admin pertama</h1>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Akun ini punya akses penuh: mengelola user, brand, kategori, mengunci
        periode, dan menyetujui pengajuan staff.
      </p>
      <SetupForm />
    </>
  );
}
