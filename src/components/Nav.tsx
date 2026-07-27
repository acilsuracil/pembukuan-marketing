"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavAccess {
  manageCategory: boolean;
  adminSection: boolean;
}

const LINKS: Array<{
  href: string;
  label: string;
  needs?: keyof NavAccess;
}> = [
  { href: "/", label: "Dashboard" },
  { href: "/transaksi", label: "Transaksi" },
  { href: "/brand", label: "Brand" },
  { href: "/kategori", label: "Kategori & Budget", needs: "manageCategory" },
  { href: "/laporan", label: "Laporan" },
  { href: "/pengajuan", label: "Pengajuan" },
  { href: "/admin", label: "Admin", needs: "adminSection" },
];

export default function Nav({
  access,
  pending,
}: {
  /** Dihitung di server dari izin efektif, bukan dari nama peran. */
  access: NavAccess;
  pending: number;
}) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => !l.needs || access[l.needs]);

  return (
    <nav className="mt-4 flex gap-1 overflow-x-auto lg:mt-6 lg:flex-col lg:overflow-visible">
      {links.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        const badge = l.href === "/pengajuan" && pending > 0 ? pending : 0;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition ${
              active
                ? "bg-[var(--wash)] font-medium text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--wash)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span>{l.label}</span>
            {badge > 0 && (
              <span
                className="ml-auto rounded-full px-1.5 py-px text-[10px] font-semibold text-white"
                style={{ background: "var(--status-serious)" }}
                aria-label={`${badge} pengajuan menunggu`}
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
