import { redirect } from "next/navigation";
import { connection } from "next/server";
import EphemeralWarning from "@/components/EphemeralWarning";
import SetupForm from "@/components/SetupForm";
import { countUsers } from "@/lib/queries";

export default async function SetupPage() {
  await connection();
  if (countUsers() > 0) redirect("/login");

  return (
    <>
      <div className="mb-4">
        <EphemeralWarning />
      </div>
      <h1 className="text-base font-semibold">Buat akun owner pertama</h1>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Owner punya akses penuh dan tidak bisa dibatasi izinnya. Dari sini kamu
        membuat akun Admin dan Staff, lalu mengatur izin masing-masing.
      </p>
      <SetupForm />
    </>
  );
}
