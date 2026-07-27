import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  newToken,
  verifyToken,
} from "./auth";
import { one, run } from "./db";
import { canOpenAdmin, hasPerm, type PermKey } from "./policy";
import type { Role } from "./types";

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: Role;
  /** Override izin per user (JSON mentah); dibaca lewat hasPerm(). */
  perms: string | null;
  session_epoch: number;
}

/**
 * Sesi + akun terkini. Role dan status aktif selalu dibaca ulang dari database,
 * dan `session_epoch` token dicocokkan — jadi mengganti password atau
 * menonaktifkan akun langsung mematikan seluruh sesi lama.
 */
export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const p = verifyToken(jar.get(SESSION_COOKIE)?.value);
  if (!p) return null;

  const u = one<SessionUser & { active: number }>(
    `SELECT id, username, name, role, active, perms, session_epoch FROM users WHERE id = ?`,
    p.uid,
  );
  if (!u || !u.active || u.session_epoch !== p.e) return null;

  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    perms: u.perms,
    session_epoch: u.session_epoch,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

/** Menjaga halaman berdasarkan izin, bukan berdasarkan nama peran. */
export async function requirePerm(key: PermKey): Promise<SessionUser> {
  const u = await requireUser();
  if (!hasPerm(u, key)) redirect("/?e=no-access");
  return u;
}

export async function requireAdminSection(): Promise<SessionUser> {
  const u = await requireUser();
  if (!canOpenAdmin(u)) redirect("/?e=no-access");
  return u;
}

/* ------------------------------------------------------------------ cookie */

async function isHttps(): Promise<boolean> {
  const h = await headers();
  const proto = (h.get("x-forwarded-proto") || "").split(",")[0].trim();
  if (proto) return proto === "https";
  return /^https:/i.test(process.env.PUBLIC_URL || "");
}

export async function startSession(user: SessionUser) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, newToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttps(),
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttps(),
    path: "/",
    maxAge: 0,
  });
}

/** Perpanjang sesi + catat kehadiran. Dipanggil dari aksi tulis saja. */
export async function touchSession(user: SessionUser) {
  run(`UPDATE users SET last_seen_at = ? WHERE id = ?`, new Date().toISOString(), user.id);
  await startSession(user);
}
