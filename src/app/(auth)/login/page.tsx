import { redirect } from "next/navigation";
import { connection } from "next/server";
import LoginForm from "@/components/LoginForm";
import { countUsers } from "@/lib/queries";
import { getUser } from "@/lib/session";

export default async function LoginPage() {
  await connection();
  if (countUsers() === 0) redirect("/setup");
  if (await getUser()) redirect("/");

  return (
    <>
      <h1 className="text-base font-semibold">Masuk</h1>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Gunakan akun yang dibuatkan admin.
      </p>
      <LoginForm />
    </>
  );
}
