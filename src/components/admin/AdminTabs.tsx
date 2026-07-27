"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AdminTab {
  href: string;
  label: string;
}

/** Navigasi tab bagian Admin. Daftar tab dihitung server sesuai izin user. */
export default function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Bagian admin"
      className="flex gap-1 overflow-x-auto border-b border-[var(--hairline)]"
    >
      {tabs.map((t) => {
        const active =
          t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
              active
                ? "border-[var(--series-1)] font-medium text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
