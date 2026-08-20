import { connection } from "next/server";
import CreateUserForm from "@/components/admin/CreateUserForm";
import UserRoster, { type RosterUser } from "@/components/admin/UserRoster";
import type { PermItem } from "@/components/admin/perms";
import { fmtDate } from "@/lib/format";
import { PERM_LIST, effectivePerms, getRolePerms, isOwner } from "@/lib/policy";
import { listUsers } from "@/lib/queries";
import { requirePerm } from "@/lib/session";

export default async function AdminPenggunaPage() {
  await connection();
  const me = await requirePerm("manageUsers");
  const meOwner = isOwner(me);

  const permList: PermItem[] = PERM_LIST.map(([key, label, desc]) => ({
    key,
    label,
    desc,
  }));
  const roleDefaults = getRolePerms();

  // Semua yang butuh DB/tanggal dihitung di sini; komponen klien hanya
  // menerima data polos.
  const users: RosterUser[] = listUsers().map((u) => {
    const owner = u.role === "owner";
    return {
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      active: u.active === 1,
      online: u.online === 1,
      isSelf: u.id === me.id,
      passChanged: u.pass_changed_at ? fmtDate(u.pass_changed_at.slice(0, 10)) : null,
      lastSeen: u.last_seen_at ? fmtDate(u.last_seen_at.slice(0, 10)) : null,
      hasOverride: !owner && u.perms !== null,
      effective: effectivePerms(u),
      manageable: !owner || meOwner,
      permsEditable: !owner && (meOwner || u.id !== me.id),
    };
  });

  const online = users.filter((u) => u.online).length;
  const override = users.filter((u) => u.hasOverride).length;

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="border-b border-[var(--hairline)] px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold">Akun ({users.length})</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {online} sedang online · {override} memakai izin khusus. Menonaktifkan
            akun atau me-reset password langsung memutus sesi lamanya di semua
            perangkat.
          </p>
        </div>
        <UserRoster
          users={users}
          permList={permList}
          roleDefaults={roleDefaults}
          meIsOwner={meOwner}
        />
      </section>

      <CreateUserForm allowOwner={meOwner} />
    </div>
  );
}
