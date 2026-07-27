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
  const badge = (
    <span
      className="rounded-full border border-[var(--hairline)] px-1.5 py-px text-[10px] font-medium text-[var(--text-muted)]"
      title={user.role === "admin" ? "Bisa ubah & hapus langsung" : "Perubahan lewat pengajuan"}
    >
      {user.role === "admin" ? "Admin" : "Staff"}
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
    <div className="rounded-lg border border-[var(--hairline)] p-2.5">
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
  );
}
