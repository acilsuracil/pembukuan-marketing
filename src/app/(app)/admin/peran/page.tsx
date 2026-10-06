import { redirect } from "next/navigation";
import { connection } from "next/server";
import RolePermsForm from "@/components/admin/RolePermsForm";
import type { PermItem } from "@/components/admin/perms";
import { ROLE_LABEL } from "@/lib/format";
import { DEFAULT_ROLE_PERMS, PERM_LIST, getRolePerms, isOwner } from "@/lib/policy";
import { listUsers } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function AdminPeranPage() {
  await connection();
  const me = await requireUser();
  if (!isOwner(me)) redirect("/?e=no-access");

  const permList: PermItem[] = PERM_LIST.map(([key, label, desc]) => ({
    key,
    label,
    desc,
  }));
  const current = getRolePerms();

  const users = listUsers();
  const nIkut = (role: "staff" | "admin" | "finance") =>
    users.filter((u) => u.role === role && u.perms === null).length;
  const nOverride = users.filter(
    (u) => u.role !== "owner" && u.perms !== null,
  ).length;

  return (
    <section className="card">
      <div className="border-b border-[var(--hairline)] px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold">Izin default per peran</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Berlaku untuk {nIkut("staff")} akun {ROLE_LABEL.staff},{" "}
          {nIkut("admin")} akun {ROLE_LABEL.admin}, dan {nIkut("finance")} akun{" "}
          {ROLE_LABEL.finance} yang ikut default.
          {nOverride > 0 &&
            ` ${nOverride} akun memakai izin khusus dan tidak ikut berubah.`}{" "}
          {ROLE_LABEL.owner} selalu memegang seluruh izin dan tidak bisa
          dibatasi.
        </p>
      </div>
      <div className="p-4 sm:p-5">
        <RolePermsForm
          permList={permList}
          initial={current}
          factory={DEFAULT_ROLE_PERMS}
        />
      </div>
    </section>
  );
}
