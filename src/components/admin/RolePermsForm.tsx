"use client";

import { Fragment, useActionState, useState } from "react";
import { saveRolePerms, type ActionState } from "@/app/actions";
import { Alert, FormButton } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/format";
import type { PermKey, RolePermRole } from "@/lib/policy";
import { PERM_GROUPS, type PermItem } from "./perms";

const EMPTY: ActionState = { ok: false };

export type RoleMatrix = Record<RolePermRole, Record<PermKey, boolean>>;

/** Urutan kolom peran di matriks. */
const KOLOM: readonly RolePermRole[] = ["staff", "admin", "finance"];

/**
 * Matriks izin default per peran. Kolom owner hanya penanda "selalu aktif";
 * checkbox staff/admin/finance controlled supaya tombol "isi ulang bawaan" bisa
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

  const toggle = (role: RolePermRole, k: PermKey, on: boolean) =>
    setVals((v) => ({ ...v, [role]: { ...v[role], [k]: on } }));

  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[660px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-xs text-[var(--text-muted)]">
              <th className="py-2 pr-3 font-medium">Izin</th>
              <th className="w-24 px-3 py-2 text-center font-medium">
                <span aria-hidden>👑</span> {ROLE_LABEL.owner}
              </th>
              {KOLOM.map((r) => (
                <th key={r} className="w-24 px-3 py-2 text-center font-medium">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERM_GROUPS.map((g) => (
              <Fragment key={g.title}>
                <tr>
                  <td
                    colSpan={KOLOM.length + 2}
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
                        title={`${ROLE_LABEL.owner} selalu punya seluruh izin`}
                      >
                        <span aria-hidden>✓</span>
                        <span className="sr-only">selalu aktif</span>
                      </td>
                      {KOLOM.map((r) => (
                        <td key={r} className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            name={`${r}_${k}`}
                            checked={vals[r][k]}
                            onChange={(e) => toggle(r, k, e.target.checked)}
                            aria-label={`${item.label} untuk ${ROLE_LABEL[r]}`}
                            className="h-4 w-4 accent-[var(--series-1)]"
                          />
                        </td>
                      ))}
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
            setVals({
              admin: { ...factory.admin },
              staff: { ...factory.staff },
              finance: { ...factory.finance },
            })
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
