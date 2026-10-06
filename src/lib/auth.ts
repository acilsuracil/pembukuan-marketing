import crypto from "node:crypto";
import { promisify } from "node:util";
import { getSetting, setSetting } from "./db";

const scrypt = promisify(crypto.scrypt) as (
  pw: string,
  salt: Buffer,
  len: number,
  opts: crypto.ScryptOptions,
) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1, len: 32, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(String(plain), salt, SCRYPT.len, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString(
    "hex",
  )}$${dk.toString("hex")}`;
}

export async function verifyPassword(
  plain: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored || !String(stored).startsWith("scrypt$")) return false;
  const parts = String(stored).split("$");
  if (parts.length !== 6) return false;
  const [, N, r, p, saltHex, hashHex] = parts;
  const want = Buffer.from(hashHex, "hex");
  let dk: Buffer;
  try {
    dk = await scrypt(String(plain), Buffer.from(saltHex, "hex"), want.length, {
      N: +N,
      r: +r,
      p: +p,
      maxmem: SCRYPT.maxmem,
    });
  } catch {
    return false;
  }
  return dk.length === want.length && crypto.timingSafeEqual(dk, want);
}

/* ------------------------------------------------------------------ token */

export const SESSION_COOKIE = "ledger_sess";
/**
 * Sesi berumur tetap 12 jam. Diperbarui hanya saat user melakukan aksi tulis,
 * bukan pada setiap request — supaya token yang dicuri tidak bisa dihidupkan
 * selamanya cuma dengan mem-polling halaman.
 */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Batas mutlak: sesi tidak bisa diperpanjang melewati ini sejak login. */
export const SESSION_ABSOLUTE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Rahasia penanda-tangan. Dari env kalau ada; kalau tidak, dibuat sekali dan
 * disimpan di database supaya tetap sama antar-restart tanpa perlu konfigurasi.
 */
function secret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  let s = getSetting("session_secret");
  if (!s) {
    s = crypto.randomBytes(32).toString("hex");
    setSetting("session_secret", s);
  }
  return s;
}

export interface TokenPayload {
  uid: number;
  u: string;
  r: "owner" | "admin" | "staff" | "finance";
  /** session_epoch pemilik token — dinaikkan untuk mematikan sesi lama. */
  e: number;
  iat: number;
  exp: number;
}

const b64u = (s: string) => Buffer.from(s).toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url").toString("utf8");

export function signToken(p: TokenPayload): string {
  const body = b64u(JSON.stringify(p));
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string | undefined): TokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const want = crypto
    .createHmac("sha256", secret())
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p: TokenPayload;
  try {
    p = JSON.parse(unb64u(body));
  } catch {
    return null;
  }
  if (!p || !p.uid || !p.u || !p.exp || !p.iat) return null;
  const now = Date.now();
  if (now > p.exp) return null;
  if (now - p.iat > SESSION_ABSOLUTE_MS) return null; // batas mutlak, tidak bisa diperpanjang
  return p;
}

export function newToken(
  user: { id: number; username: string; role: "owner" | "admin" | "staff" | "finance"; session_epoch: number },
  iat = Date.now(),
): string {
  return signToken({
    uid: user.id,
    u: user.username,
    r: user.role,
    e: user.session_epoch,
    iat,
    exp: Date.now() + SESSION_TTL_MS,
  });
}

/* --------------------------------------------------- pembatas login gagal */

/**
 * Dihitung per-username (bukan per-IP): header proxy bisa dipalsukan, jadi
 * kunci berbasis IP saja mudah dilewati dengan mengacak X-Forwarded-For.
 */
const tries = new Map<string, { n: number; at: number }>();
const MAX_TRIES = 8;
const WINDOW_MS = 10 * 60 * 1000;

export function loginAllowed(username: string): boolean {
  const e = tries.get(username.toLowerCase());
  if (!e) return true;
  if (Date.now() - e.at > WINDOW_MS) return true;
  return e.n < MAX_TRIES;
}

export function loginFailed(username: string) {
  const k = username.toLowerCase();
  const e = tries.get(k);
  if (!e || Date.now() - e.at > WINDOW_MS) tries.set(k, { n: 1, at: Date.now() });
  else e.n += 1;
  if (tries.size > 5000) tries.clear();
}

export function loginOk(username: string) {
  tries.delete(username.toLowerCase());
}

export function passwordProblem(pw: string): string | null {
  if (typeof pw !== "string" || pw.length < 8)
    return "Password minimal 8 karakter.";
  if (pw.length > 200) return "Password terlalu panjang.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw))
    return "Password harus memuat huruf dan angka.";
  return null;
}
