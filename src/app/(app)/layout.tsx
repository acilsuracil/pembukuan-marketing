import { redirect } from "next/navigation";
import { connection } from "next/server";
import EphemeralWarning from "@/components/EphemeralWarning";
import Nav from "@/components/Nav";
import SidebarToggle from "@/components/SidebarToggle";
import ThemeToggle from "@/components/ThemeToggle";
import UserMenu from "@/components/UserMenu";
import { canOpenAdmin, getLockUntil, hasPerm } from "@/lib/policy";
import { countUsers, pendingRequestCount } from "@/lib/queries";
import { getUser } from "@/lib/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();

  // Instalasi baru: belum ada akun sama sekali → arahkan ke pembuatan admin.
  if (countUsers() === 0) redirect("/setup");

  const user = await getUser();
  if (!user) redirect("/login");

  const pending = hasPerm(user, "approveRequest") ? pendingRequestCount() : 0;
  const lockUntil = getLockUntil();
  const access = {
    manageCategory: hasPerm(user, "manageCategory"),
    adminSection: canOpenAdmin(user),
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-6 px-4 py-6 lg:flex-row lg:gap-8 lg:px-8">
      {/* Di layar lebar sidebar dibuat setinggi viewport dan lengket, supaya
          blok akun bisa dijangkarkan ke bawah dan tetap terlihat saat isi
          halaman digulir. Di ponsel ia kembali jadi bar mendatar biasa. */}
      <header className="app-sidebar lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)] lg:flex-col">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--series-3)] text-sm font-bold text-white"
              >
                ₮
              </span>
              <span className="sb-expanded-only truncate text-[15px] font-semibold tracking-tight">
                Pembukuan USDT
              </span>
            </div>
          </div>
          <div className="sb-toggle-wrap">
            <SidebarToggle />
          </div>
          <div className="lg:hidden">
            <UserMenu user={user} compact />
          </div>
        </div>

        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <Nav access={access} pending={pending} />
        </div>

        {/* mt-auto mendorong blok ini ke dasar sidebar. */}
        <div className="mt-4 hidden space-y-2 lg:mt-auto lg:block lg:pt-4">
          {lockUntil && (
            <p
              title={`Periode terkunci sampai ${lockUntil}`}
              className="sb-row flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--text-muted)]"
            >
              <span aria-hidden>🔒</span>
              <span className="sb-expanded-only">
                Terkunci s/d <span className="tnum">{lockUntil}</span>
              </span>
            </p>
          )}
          <UserMenu user={user} />
          <ThemeToggle />
        </div>
      </header>

      <main className="min-w-0 flex-1 space-y-5 pb-12">
        <EphemeralWarning compact />
        {children}
      </main>
    </div>
  );
}
