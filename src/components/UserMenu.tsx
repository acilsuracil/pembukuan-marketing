import Link from "next/link";
import { doLogout } from "@/app/auth-actions";
import type { SessionUser } from "@/lib/session";

export default function UserMenu({
  user,
  compact = false,
}: {
  user: SessionUser;
  compact?: boolean;
}) {
  const ROLE = {
    owner: { label: "Owner", hint: "Akses penuh, tidak bisa dibatasi" },
    admin: { label: "Admin", hint: "Izinnya diatur owner" },
    staff: { label: "Staff", hint: "Izinnya diatur owner" },
  } as const;
  const r = ROLE[user.role];

  const badge = (
    <span
      className="rounded-full border border-[var(--hairline)] px-1.5 py-px text-[10px] font-medium text-[var(--text-muted)]"
      title={r.hint}
    >
      {user.role === "owner" ? "👑 " : ""}
      {r.label}
    </span>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {badge}
        <form action={doLogout}>
          <button type="submit" className="btn btn-ghost px-2 py-1 text-xs">
            Keluar
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="sb-expanded-only rounded-lg border border-[var(--hairline)] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium">
            {user.name || user.username}
          </span>
          {badge}
        </div>
        <div className="mt-2 flex gap-1">
          <Link href="/akun" className="btn btn-ghost flex-1 px-2 py-1 text-xs">
            Akun
          </Link>
          <form action={doLogout} className="flex-1">
            <button type="submit" className="btn btn-ghost w-full px-2 py-1 text-xs">
              Keluar
            </button>
          </form>
        </div>
      </div>

      {/* Sidebar menyempit: cukup inisial + tombol keluar. */}
      <div className="sb-collapsed-only space-y-1">
        <Link
          href="/akun"
          title={`${user.name || user.username} — ${r.label}`}
          className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--hairline)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--wash)]"
        >
          {(user.name || user.username).slice(0, 1).toUpperCase()}
        </Link>
        <form action={doLogout}>
          <button
            type="submit"
            title="Keluar"
            aria-label="Keluar"
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--hairline)] text-[var(--text-muted)] hover:bg-[var(--wash)] hover:text-[var(--text-primary)]"
          >
            <span aria-hidden>⎋</span>
          </button>
        </form>
      </div>
    </>
  );
}
