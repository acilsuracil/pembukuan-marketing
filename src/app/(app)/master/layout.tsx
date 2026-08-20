import { connection } from "next/server";
import AdminTabs, { type AdminTab } from "@/components/admin/AdminTabs";
import { requirePerm } from "@/lib/session";

const TABS: AdminTab[] = [
  { href: "/master", label: "Divisi" },
  { href: "/master/platform", label: "Platform" },
  { href: "/master/akun-iklan", label: "Akun iklan" },
  { href: "/master/brand", label: "Brand" },
  { href: "/master/penerima", label: "Rekening penerima" },
];

export default async function MasterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  await requirePerm("manageMaster");

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="text-xl font-semibold tracking-tight">Data master</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Divisi, platform, akun iklan, brand, dan rekening penerima. Yang sudah
          terpakai hanya bisa diarsipkan — supaya laporan periode lama tidak
          berubah di belakang hari.
        </p>
        <div className="mt-3">
          <AdminTabs tabs={TABS} />
        </div>
      </div>
      {children}
    </div>
  );
}
