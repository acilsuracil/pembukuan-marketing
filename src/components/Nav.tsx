"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/types";

const LINKS: Array<{ href: string; label: string; adminOnly?: boolean }> = [
  { href: "/", label: "Dashboard" },
  { href: "/transaksi", label: "Transaksi" },
  { href: "/brand", label: "Brand" },
  { href: "/kategori", label: "Kategori & Budget", adminOnly: true },
  { href: "/laporan", label: "Laporan" },
  { href: "/pengajuan", label: "Pengajuan" },
  { href: "/admin", label: "Admin", adminOnly: true },
];

export default function Nav({
  role,
  pending,
}: {
  role: Role;
  pending: number;
}) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => !l.adminOnly || role === "admin");

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
