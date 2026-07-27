import { connection } from "next/server";
import AdminTabs, { type AdminTab } from "@/components/admin/AdminTabs";
import { hasPerm, isOwner } from "@/lib/policy";
import { requireAdminSection } from "@/lib/session";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const me = await requireAdminSection();

  // Hanya tab yang boleh dibuka user ini yang dirender.
  const tabs: AdminTab[] = [];
  if (hasPerm(me, "lockPeriod")) tabs.push({ href: "/admin", label: "Pengaturan" });
  if (hasPerm(me, "manageUsers"))
    tabs.push({ href: "/admin/pengguna", label: "Akun" });
  if (isOwner(me)) tabs.push({ href: "/admin/peran", label: "Peran & izin" });
  if (hasPerm(me, "viewActivity"))
    tabs.push({ href: "/admin/aktivitas", label: "Log aktivitas" });

  return (
    <div className="max-w-5xl space-y-5">
      <div className="page-header">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Kelola akun &amp; izin, kunci periode pembukuan, dan telusuri jejak
          aktivitas.
        </p>
        <div className="mt-3">
          <AdminTabs tabs={tabs} />
        </div>
      </div>
      {children}
    </div>
  );
}
