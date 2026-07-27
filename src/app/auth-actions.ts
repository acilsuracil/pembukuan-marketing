"use server";

import { redirect } from "next/navigation";
import {
  hashPassword,
  loginAllowed,
  loginFailed,
  loginOk,
  passwordProblem,
  verifyPassword,
} from "@/lib/auth";
import { run } from "@/lib/db";
import { logActivity } from "@/lib/policy";
import { countUsers, getUserWithHash } from "@/lib/queries";
import { endSession, getUser, startSession } from "@/lib/session";

export interface AuthState {
  ok: boolean;
  error?: string;
  message?: string;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * Hash boneka untuk menyamakan waktu proses saat username tidak ada, supaya
 * lama respons tidak membocorkan username mana yang terdaftar.
 */
const DUMMY_HASH =
  "scrypt$16384$8$1$00000000000000000000000000000000$" +
  "0000000000000000000000000000000000000000000000000000000000000000";

/* ------------------------------------------------------- setup admin awal */

export async function doSetup(
  _prev: AuthState,
  fd: FormData,
): Promise<AuthState> {
  if (countUsers() > 0)
    return { ok: false, error: "Sudah ada akun. Silakan gunakan halaman login." };

  const username = str(fd, "username").toLowerCase();
  const name = str(fd, "name");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  if (!/^[a-z0-9._-]{3,32}$/.test(username))
    return {
      ok: false,
      error: "Username 3–32 karakter, hanya huruf kecil, angka, titik, garis bawah, atau strip.",
    };
  const pwErr = passwordProblem(password);
  if (pwErr) return { ok: false, error: pwErr };
  if (password !== confirm)
    return { ok: false, error: "Konfirmasi password tidak sama." };

  const now = new Date().toISOString();
  run(
    `INSERT INTO users (username, pass_hash, name, role, active, pass_changed_at, created_at)
     VALUES (?, ?, ?, 'admin', 1, ?, ?)`,
    username,
    await hashPassword(password),
    name || username,
    now,
    now,
  );

  const u = getUserWithHash(username)!;
  logActivity(
    { id: u.id, username: u.username, role: "admin" },
    "setup",
    "Membuat admin pertama",
  );
  await startSession({
    id: u.id,
    username: u.username,
    name: u.name,
    role: "admin",
    session_epoch: u.session_epoch,
  });
  redirect("/");
}

/* -------------------------------------------------------------- login/out */

export async function doLogin(
  _prev: AuthState,
  fd: FormData,
): Promise<AuthState> {
  const username = str(fd, "username").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!username || !password)
    return { ok: false, error: "Isi username dan password." };

  if (!loginAllowed(username))
    return {
      ok: false,
      error: "Terlalu banyak percobaan gagal. Coba lagi sekitar 10 menit lagi.",
    };

  const u = getUserWithHash(username);
  const ok = await verifyPassword(password, u ? u.pass_hash : DUMMY_HASH);

  if (!u || !ok) {
    loginFailed(username);
    return { ok: false, error: "Username atau password salah." };
  }
  if (!u.active) {
    loginFailed(username);
    return { ok: false, error: "Akun ini dinonaktifkan. Hubungi admin." };
  }

  loginOk(username);
  run(`UPDATE users SET last_seen_at = ? WHERE id = ?`, new Date().toISOString(), u.id);
  logActivity({ id: u.id, username: u.username, role: u.role }, "login", "Masuk");
  await startSession({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    session_epoch: u.session_epoch,
  });
  redirect("/");
}

export async function doLogout() {
  const u = await getUser();
  if (u) logActivity(u, "logout", "Keluar");
  await endSession();
  redirect("/login");
}

/* --------------------------------------------------- ganti password sendiri */

export async function changeOwnPassword(
  _prev: AuthState,
  fd: FormData,
): Promise<AuthState> {
  const me = await getUser();
  if (!me) return { ok: false, error: "Sesi berakhir. Silakan login lagi." };

  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  const row = getUserWithHash(me.username);
  if (!row) return { ok: false, error: "Akun tidak ditemukan." };
  if (!(await verifyPassword(current, row.pass_hash)))
    return { ok: false, error: "Password saat ini salah." };

  const pwErr = passwordProblem(next);
  if (pwErr) return { ok: false, error: pwErr };
  if (next !== confirm) return { ok: false, error: "Konfirmasi password tidak sama." };
  if (await verifyPassword(next, row.pass_hash))
    return { ok: false, error: "Password baru harus berbeda dari password lama." };

  // Menaikkan session_epoch mematikan seluruh sesi lama, termasuk milik
  // perangkat lain yang mungkin sudah tidak dipegang lagi.
  const now = new Date().toISOString();
  run(
    `UPDATE users SET pass_hash = ?, pass_changed_at = ?, session_epoch = session_epoch + 1
     WHERE id = ?`,
    await hashPassword(next),
    now,
    me.id,
  );
  logActivity(me, "ubah-password", "Mengganti password sendiri");

  const fresh = getUserWithHash(me.username)!;
  await startSession({
    id: fresh.id,
    username: fresh.username,
    name: fresh.name,
    role: fresh.role,
    session_epoch: fresh.session_epoch,
  });
  return { ok: true, message: "Password diganti. Sesi di perangkat lain otomatis keluar." };
}
