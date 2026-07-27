"use client";

import { Fragment, useActionState, useState } from "react";
import { saveRolePerms, type ActionState } from "@/app/actions";
import { Alert, FormButton } from "@/components/ui";
import type { PermKey } from "@/lib/policy";
import { PERM_GROUPS, type PermItem } from "./perms";

const EMPTY: ActionState = { ok: false };

export type RoleMatrix = {
  admin: Record<PermKey, boolean>;
  staff: Record<PermKey, boolean>;
};

/**
 * Matriks izin default per peran. Kolom owner hanya penanda "selalu aktif";
 * checkbox admin/staff controlled supaya tombol "isi ulang bawaan" bisa
 * mengembalikan centang tanpa kirim ke server.
 */
export default function RolePermsForm({
  permList,
  initial,
  factory,
}: {
  permList: PermItem[];
  initial: RoleMatrix;
  factory: RoleMatrix;
}) {
  const [state, action] = useActionState(saveRolePerms, EMPTY);
  const [vals, setVals] = useState<RoleMatrix>(initial);
  const byKey = new Map(permList.map((p) => [p.key, p]));

  const toggle = (role: "admin" | "staff", k: PermKey, on: boolean) =>
    setVals((v) => ({ ...v, [role]: { ...v[role], [k]: on } }));

  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-xs text-[var(--text-muted)]">
              <th className="py-2 pr-3 font-medium">Izin</th>
              <th className="w-24 px-3 py-2 text-center font-medium">
                <span aria-hidden>👑</span> Owner
              </th>
              <th className="w-24 px-3 py-2 text-center font-medium">Admin</th>
              <th className="w-24 px-3 py-2 text-center font-medium">Staff</th>
            </tr>
          </thead>
          <tbody>
            {PERM_GROUPS.map((g) => (
              <Fragment key={g.title}>
                <tr>
                  <td
                    colSpan={4}
                    className="pt-4 pb-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase"
                  >
                    {g.title}
                  </td>
                </tr>
                {g.keys.map((k) => {
                  const item = byKey.get(k);
                  if (!item) return null;
                  return (
                    <tr
                      key={k}
                      className="border-b border-[var(--hairline)] last:border-0"
                    >
                      <td className="py-2.5 pr-3">
                        <div className="text-[13px] font-medium">{item.label}</div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {item.desc}
                        </div>
                      </td>
                      <td
                        className="px-3 py-2.5 text-center text-xs text-[var(--text-muted)]"
                        title="Owner selalu punya seluruh izin"
                      >
                        <span aria-hidden>✓</span>
                        <span className="sr-only">selalu aktif</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          name={`admin_${k}`}
                          checked={vals.admin[k]}
                          onChange={(e) => toggle("admin", k, e.target.checked)}
                          aria-label={`${item.label} untuk admin`}
                          className="h-4 w-4 accent-[var(--series-1)]"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          name={`staff_${k}`}
                          checked={vals.staff[k]}
                          onChange={(e) => toggle("staff", k, e.target.checked)}
                          aria-label={`${item.label} untuk staff`}
                          className="h-4 w-4 accent-[var(--series-1)]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FormButton pendingLabel="Menyimpan…">Simpan izin default</FormButton>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            setVals({ admin: { ...factory.admin }, staff: { ...factory.staff } })
          }
        >
          Isi ulang bawaan aplikasi
        </button>
        <p className="text-[11px] text-[var(--text-muted)]">
          “Isi ulang bawaan” hanya mengubah centang — tetap perlu disimpan.
        </p>
      </div>
    </form>
  );
}
