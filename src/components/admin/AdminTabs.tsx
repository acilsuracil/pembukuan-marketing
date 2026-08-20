"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AdminTab {
  href: string;
  label: string;
}

/**
 * Navigasi tab. Daftar tab dihitung server sesuai izin user.
 *
 * Tab yang aktif adalah yang **paling panjang** cocok dengan alamat sekarang,
 * bukan yang pertama cocok: tab induk seperti "/master" adalah awalan dari
 * seluruh anaknya, jadi aturan "startsWith" saja akan menyalakan dua tab.
 */
export default function AdminTabs({
  tabs,
  label = "Bagian admin",
}: {
  tabs: AdminTab[];
  label?: string;
}) {
  const pathname = usePathname();

  const activeHref = tabs
    .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
    .reduce<string | null>(
      (best, t) => (best === null || t.href.length > best.length ? t.href : best),
      null,
    );

  return (
    <nav
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b border-[var(--hairline)]"
    >
      {tabs.map((t) => {
        const active = t.href === activeHref;
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
