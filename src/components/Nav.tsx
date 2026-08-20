"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavAccess {
  master: boolean;
  dompet: boolean;
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
  "/pengajuan": (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M3.4 1.9h6.2l3 3v9.2H3.4Z" {...S} />
      <path d="M9.6 1.9v3h3" {...S} />
      <path d="M5.6 8.4h4.8M5.6 11h3.2" {...S} />
    </svg>
  ),
  "/belanja": (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M2 4.4h12l-1 8.2a1.2 1.2 0 0 1-1.2 1H4.2a1.2 1.2 0 0 1-1.2-1Z" {...S} />
      <path d="M5.6 4.4V3.2a2.4 2.4 0 0 1 4.8 0v1.2" {...S} />
    </svg>
  ),
  "/dompet": (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <rect x="1.8" y="3.6" width="12.4" height="9" rx="1.6" {...S} />
      <path d="M1.8 6.6h12.4" {...S} />
      <circle cx="11.4" cy="9.8" r="1" {...S} />
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
  "/master": (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M8 1.8 14.5 5 8 8.2 1.5 5 8 1.8Z" {...S} />
      <path d="M1.5 8.4 8 11.6l6.5-3.2" {...S} />
      <path d="M1.5 11.6 8 14.8l6.5-3.2" {...S} />
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
  { href: "/", label: "Ringkasan" },
  { href: "/pengajuan", label: "Pengajuan" },
  { href: "/belanja", label: "Belanja" },
  { href: "/dompet", label: "Dompet" },
  { href: "/laporan", label: "Laporan" },
  { href: "/master", label: "Data master", needs: "master" },
  { href: "/admin", label: "Admin", needs: "adminSection" },
];

export default function Nav({
  access,
  outstanding,
}: {
  /** Dihitung di server dari izin efektif, bukan dari nama peran. */
  access: NavAccess;
  /** Jumlah pengajuan yang dananya belum cair — penanda di menu Pengajuan. */
  outstanding: number;
}) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => !l.needs || access[l.needs]);

  return (
    <nav className="mt-4 flex gap-1 overflow-x-auto lg:mt-5 lg:flex-col lg:overflow-visible">
      {links.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        const badge = l.href === "/pengajuan" && outstanding > 0 ? outstanding : 0;
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
                  aria-label={`${badge} pengajuan belum cair`}
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
