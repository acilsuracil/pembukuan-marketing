"use client";

import { useActionState, useState } from "react";
import { setUserPerms, type ActionState } from "@/app/actions";
import { Alert, FormButton } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/format";
import type { PermKey, RolePermRole } from "@/lib/policy";
import { PERM_GROUPS, type PermItem } from "./perms";

const EMPTY: ActionState = { ok: false };

/**
 * Editor izin satu akun. Checkbox-nya controlled supaya tombol "kembalikan ke
 * default" bisa langsung memperlihatkan nilai default peran tanpa menunggu
 * render ulang dari server.
 */
export default function PermsEditor({
  userId,
  username,
  roleLabel,
  initial,
  hasOverride,
  permList,
  roleDefault,
}: {
  userId: number;
  username: string;
  roleLabel: RolePermRole;
  initial: Record<PermKey, boolean>;
  hasOverride: boolean;
  permList: PermItem[];
  roleDefault: Record<PermKey, boolean>;
}) {
  const [state, action] = useActionState(setUserPerms, EMPTY);
  const [vals, setVals] = useState(initial);
  const byKey = new Map(permList.map((p) => [p.key, p]));
  const peran = ROLE_LABEL[roleLabel];

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={userId} />
      <Alert state={state} />

      <div className="grid gap-3 sm:grid-cols-2">
        {PERM_GROUPS.map((g) => (
          <fieldset
            key={g.title}
            className="rounded-lg border border-[var(--hairline)] p-3"
          >
            <legend className="px-1 text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
              {g.title}
            </legend>
            <div className="space-y-2.5">
              {g.keys.map((k) => {
                const item = byKey.get(k);
                if (!item) return null;
                return (
                  <label key={k} className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      name={`p_${k}`}
                      checked={vals[k]}
                      onChange={(e) =>
                        setVals((v) => ({ ...v, [k]: e.target.checked }))
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--series-1)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium">{item.label}</span>
                        <span className="text-[11px] whitespace-nowrap text-[var(--text-muted)]">
                          {peran}: {roleDefault[k] ? "ya" : "tidak"}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
                        {item.desc}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FormButton pendingLabel="Menyimpan…">Simpan sebagai izin khusus</FormButton>
        {hasOverride && (
          <button
            type="submit"
            name="mode"
            value="reset"
            formNoValidate
            className="btn btn-ghost"
            onClick={(e) => {
              if (
                !window.confirm(
                  `Hapus izin khusus ${username} dan kembalikan ke default peran ${peran}?`,
                )
              ) {
                e.preventDefault();
                return;
              }
              setVals({ ...roleDefault });
            }}
          >
            Kembalikan ke default peran
          </button>
        )}
        <p className="text-[11px] text-[var(--text-muted)]">
          Menyimpan membuat izin akun ini lepas dari default peran {peran}.
        </p>
      </div>
    </form>
  );
}
