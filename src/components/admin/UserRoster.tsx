"use client";

import { Fragment, useActionState, useState } from "react";
import {
  deleteUser,
  resetUserPassword,
  updateUser,
  type ActionState,
} from "@/app/actions";
import { Alert, FormButton } from "@/components/ui";
import type { PermKey } from "@/lib/policy";
import type { Role } from "@/lib/types";
import PermsEditor from "./PermsEditor";
import type { PermItem } from "./perms";

const EMPTY: ActionState = { ok: false };

/** Data akun yang sudah diserialkan server — tanpa fungsi, tanpa Date. */
export interface RosterUser {
  id: number;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  online: boolean;
  isSelf: boolean;
  /** Tanggal terformat, dihitung di server. */
  passChanged: string | null;
  lastSeen: string | null;
  hasOverride: boolean;
  effective: Record<PermKey, boolean>;
  /** false = akun owner dilihat oleh non-owner: hanya bisa dibaca. */
  manageable: boolean;
  permsEditable: boolean;
}

export interface RoleDefaults {
  admin: Record<PermKey, boolean>;
  staff: Record<PermKey, boolean>;
}

/* ------------------------------------------------------------------ badge */

function RoleChip({ role }: { role: Role }) {
  if (role === "owner")
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{
          color: "var(--series-4)",
          background: "color-mix(in srgb, var(--series-4) 14%, transparent)",
        }}
      >
        <span aria-hidden>👑</span> Owner
      </span>
    );
  if (role === "admin")
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{
          color: "var(--series-1)",
          background: "color-mix(in srgb, var(--series-1) 12%, transparent)",
        }}
      >
        Admin
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
      Staff
    </span>
  );
}

/* ------------------------------------------------------------------ roster */

export default function UserRoster({
  users,
  permList,
  roleDefaults,
  meIsOwner,
}: {
  users: RosterUser[];
  permList: PermItem[];
  roleDefaults: RoleDefaults;
  meIsOwner: boolean;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const total = permList.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--hairline)] text-xs text-[var(--text-muted)]">
            <th className="px-4 py-2.5 font-medium">Akun</th>
            <th className="px-3 py-2.5 font-medium">Peran</th>
            <th className="px-3 py-2.5 font-medium">Izin</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Aktif terakhir</th>
            <th className="px-4 py-2.5 text-right font-medium">
              <span className="sr-only">Kelola</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const open = openId === u.id;
            const n = permList.filter((p) => u.effective[p.key]).length;
            return (
              <Fragment key={u.id}>
                <tr
                  className={`border-b border-[var(--hairline)] ${
                    open ? "border-b-0 bg-[var(--wash)]" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div
                      className={`flex items-center gap-2.5 ${
                        u.active ? "" : "opacity-60"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background: u.online
                            ? "var(--status-good)"
                            : "var(--grid)",
                        }}
                      />
                      <div className="min-w-0">
                        <div className="font-medium">
                          {u.username}
                          {u.isSelf && (
                            <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">
                              (kamu)
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-[var(--text-muted)]">
                          {u.name || "—"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <RoleChip role={u.role} />
                  </td>

                  <td className="px-3 py-3 text-xs">
                    {u.role === "owner" ? (
                      <span className="text-[var(--text-secondary)]">
                        Semua izin
                      </span>
                    ) : (
                      <>
                        <div
                          className={
                            u.hasOverride
                              ? "font-medium"
                              : "text-[var(--text-secondary)]"
                          }
                          style={
                            u.hasOverride
                              ? { color: "var(--series-7)" }
                              : undefined
                          }
                        >
                          {u.hasOverride ? "◆ Izin khusus" : "Ikut default peran"}
                        </div>
                        <div className="tnum text-[var(--text-muted)]">
                          {n}/{total} izin aktif
                        </div>
                      </>
                    )}
                  </td>

                  <td className="px-3 py-3 text-xs">
                    {u.active ? (
                      <span style={{ color: "var(--success-text)" }}>✓ Aktif</span>
                    ) : (
                      <span style={{ color: "var(--status-critical)" }}>
                        ✕ Nonaktif
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-3 text-xs">
                    {u.online ? (
                      <span
                        className="font-medium"
                        style={{ color: "var(--success-text)" }}
                      >
                        ● Online
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">
                        {u.lastSeen ?? "Belum pernah"}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {u.manageable ? (
                      <button
                        type="button"
                        className="btn btn-ghost px-2.5 py-1 text-xs"
                        aria-expanded={open}
                        onClick={() => setOpenId(open ? null : u.id)}
                      >
                        Kelola{" "}
                        <span aria-hidden className="text-[10px]">
                          {open ? "▲" : "▼"}
                        </span>
                      </button>
                    ) : (
                      <span
                        className="text-[11px] text-[var(--text-muted)]"
                        title="Akun owner hanya bisa dikelola oleh owner"
                      >
                        🔒 khusus owner
                      </span>
                    )}
                  </td>
                </tr>

                {open && (
                  <tr className="border-b border-[var(--hairline)] bg-[var(--wash)]">
                    <td colSpan={6} className="px-4 pb-4">
                      <UserEditor
                        user={u}
                        permList={permList}
                        roleDefaults={roleDefaults}
                        meIsOwner={meIsOwner}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ editor */

function UserEditor({
  user,
  permList,
  roleDefaults,
  meIsOwner,
}: {
  user: RosterUser;
  permList: PermItem[];
  roleDefaults: RoleDefaults;
  meIsOwner: boolean;
}) {
  const [state, action] = useActionState(updateUser, EMPTY);
  const [pw, pwAction] = useActionState(resetUserPassword, EMPTY);
  const [del, delAction] = useActionState(deleteUser, EMPTY);

  const roleLabel: "admin" | "staff" = user.role === "admin" ? "admin" : "staff";

  return (
    <div className="space-y-4 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-4">
      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
        {/* -------------------------------------------------- profil & peran */}
        <section>
          <h3 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
            Profil &amp; peran
          </h3>
          <form action={action} className="mt-2 space-y-3">
            <Alert state={state} />
            <input type="hidden" name="id" value={user.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`name-${user.id}`}>
                  Nama tampilan
                </label>
                <input
                  id={`name-${user.id}`}
                  name="name"
                  type="text"
                  defaultValue={user.name}
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor={`role-${user.id}`}>
                  Peran
                </label>
                <select
                  id={`role-${user.id}`}
                  name="role"
                  defaultValue={user.role}
                  className="field"
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                  {meIsOwner && <option value="owner">Owner</option>}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor={`active-${user.id}`}>
                  Status akun
                </label>
                {user.isSelf ? (
                  <>
                    <input type="hidden" name="active" value="1" />
                    <p className="text-xs text-[var(--text-muted)]">
                      Akun sendiri selalu aktif — tidak bisa dinonaktifkan dari
                      sini.
                    </p>
                  </>
                ) : (
                  <>
                    <select
                      id={`active-${user.id}`}
                      name="active"
                      defaultValue={user.active ? "1" : "0"}
                      className="field sm:max-w-[260px]"
                    >
                      <option value="1">Aktif — bisa login</option>
                      <option value="0">Nonaktif — sesi langsung diputus</option>
                    </select>
                  </>
                )}
              </div>
            </div>
            <FormButton className="btn btn-ghost" pendingLabel="Menyimpan…">
              Simpan profil
            </FormButton>
          </form>
        </section>

        {/* --------------------------------------------------------- keamanan */}
        <section>
          <h3 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
            Keamanan
          </h3>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {user.passChanged
              ? `Password terakhir diganti ${user.passChanged}.`
              : "Password belum pernah diganti sejak akun dibuat."}{" "}
            Me-reset password langsung memutus semua sesinya.
          </p>
          <form action={pwAction} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={user.id} />
            <input
              name="password"
              type="text"
              required
              minLength={8}
              className="field w-56 text-xs"
              placeholder="Password baru (min. 8 karakter)"
              autoComplete="off"
            />
            <FormButton className="btn btn-ghost" pendingLabel="Menyimpan…">
              Reset password
            </FormButton>
          </form>
          <Alert state={pw} className="mt-2" />

          {!user.isSelf && (
            <div className="mt-4 border-t border-[var(--hairline)] pt-3">
              <form action={delAction}>
                <input type="hidden" name="id" value={user.id} />
                <FormButton
                  className="btn btn-danger px-3 py-1.5 text-xs"
                  pendingLabel="Menghapus…"
                  confirm={`Hapus akun ${user.username}? Transaksi yang pernah dia catat tetap tersimpan.`}
                >
                  Hapus akun ini
                </FormButton>
              </form>
              <Alert state={del} className="mt-2" />
            </div>
          )}
        </section>
      </div>

      {/* ------------------------------------------------------------- izin */}
      <section className="border-t border-[var(--hairline)] pt-4">
        <h3 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
          Izin akses
        </h3>
        {user.role === "owner" ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span aria-hidden>👑</span> Owner selalu memegang seluruh izin dan
            tidak bisa dibatasi.
          </p>
        ) : !user.permsEditable ? (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Izin akun sendiri tidak bisa diubah — minta owner yang mengaturnya.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Saat ini{" "}
              {user.hasOverride
                ? "memakai izin khusus."
                : `ikut default peran ${roleLabel}.`}
            </p>
            <div className="mt-3">
              <PermsEditor
                userId={user.id}
                username={user.username}
                roleLabel={roleLabel}
                initial={user.effective}
                hasOverride={user.hasOverride}
                permList={permList}
                roleDefault={roleDefaults[roleLabel]}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
