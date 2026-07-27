"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavAccess {
  manageCategory: boolean;
  adminSection: boolean;
}

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Ikon dipakai saat sidebar menyempit; inline SVG, tanpa library. */
const ICONS: Record<string, React.ReactNode> = {
  "/": (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" {...S} />
      <rect x="9" y="2" width="5" height="5" rx="1" {...S} />
      <rect x="2" y="9" width="5" height="5" rx="1" {...S} />
      <rect x="9" y="9" width="5" height="5" rx="1" {...S} />
    </svg>
  ),
  "/transaksi": (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M4 11V3M4 3 1.8 5.2M4 3l2.2 2.2" {...S} />
      <path d="M12 5v8M12 13l2.2-2.2M12 13l-2.2-2.2" {...S} />
    </svg>
  ),
  "/brand": (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M8.4 1.8H13a1.2 1.2 0 0 1 1.2 1.2v4.6a1.2 1.2 0 0 1-.35.85l-5.9 5.9a1 1 0 0 1-1.4 0L2.2 10a1 1 0 0 1 0-1.4l5.9-5.9a1.2 1.2 0 0 1 .3-.2Z" {...S} />
      <circle cx="11" cy="5" r="1.05" {...S} />
    </svg>
  ),
  "/kategori": (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M8 1.8 14.5 5 8 8.2 1.5 5 8 1.8Z" {...S} />
      <path d="M1.5 8.4 8 11.6l6.5-3.2" {...S} />
      <path d="M1.5 11.6 8 14.8l6.5-3.2" {...S} />
    </svg>
  ),
  "/laporan": (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M2 13.6h12" {...S} />
      <rect x="3" y="8" width="2.6" height="4" rx="0.6" {...S} />
      <rect x="7" y="5" width="2.6" height="7" rx="0.6" {...S} />
      <rect x="11" y="2.6" width="2.6" height="9.4" rx="0.6" {...S} />
    </svg>
  ),
  "/pengajuan": (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M2 8.6h3l1 1.8h4l1-1.8h3" {...S} />
      <path d="M2.6 8.6 4 3.2a1 1 0 0 1 1-.7h6a1 1 0 0 1 1 .7l1.4 5.4v3.2a1.2 1.2 0 0 1-1.2 1.2H3.8a1.2 1.2 0 0 1-1.2-1.2Z" {...S} />
    </svg>
  ),
  "/admin": (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M8 1.6 13.2 3.4v4.1c0 3.2-2.2 5.6-5.2 6.9-3-1.3-5.2-3.7-5.2-6.9V3.4Z" {...S} />
      <path d="m5.9 7.9 1.5 1.5 2.8-2.9" {...S} />
    </svg>
  ),
};

const LINKS: Array<{ href: string; label: string; needs?: keyof NavAccess }> = [
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
    <nav className="mt-4 flex gap-1 overflow-x-auto lg:mt-5 lg:flex-col lg:overflow-visible">
      {links.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        const badge = l.href === "/pengajuan" && pending > 0 ? pending : 0;
        return (
          <Link
            key={l.href}
            href={l.href}
            title={l.label}
            aria-current={active ? "page" : undefined}
            className={`sb-row relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition ${
              active
                ? "bg-[var(--wash)] font-medium text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--wash)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span className="nav-icon">{ICONS[l.href]}</span>
            <span className="sb-expanded-only">{l.label}</span>

            {badge > 0 && (
              <>
                <span
                  className="sb-expanded-only ml-auto rounded-full px-1.5 py-px text-[10px] font-semibold text-white"
                  style={{ background: "var(--status-serious)" }}
                  aria-label={`${badge} pengajuan menunggu`}
                >
                  {badge}
                </span>
                {/* Saat menyempit angkanya tidak muat — jadi titik penanda. */}
                <span
                  aria-hidden
                  className="sb-collapsed-only absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--status-serious)" }}
                />
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
