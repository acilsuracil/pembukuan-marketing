import fs from "node:fs/promises";
import path from "node:path";
import { BUKTI_DIR } from "./db";

/**
 * Penyimpanan bukti transfer.
 *
 * Dua backend, dipilih otomatis dari environment:
 *   - `supabase` — dipakai kalau SUPABASE_URL + SUPABASE_SERVICE_KEY terisi.
 *   - `local`    — folder di disk (dev, atau Railway volume).
 *
 * Service key HANYA hidup di server; browser tidak pernah menyentuh Supabase.
 * Bucket-nya sengaja dibuat PRIVAT: berkas diambil server lalu diteruskan lewat
 * /api/bukti/[id] yang memeriksa sesi. Bucket publik berarti siapa pun yang
 * memegang URL-nya bisa melihat bukti transfer tanpa login.
 */
export type StorageBackend = "local" | "supabase";

const SUPA_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const BUCKET = process.env.SUPABASE_BUCKET || "bukti";

export function activeBackend(): StorageBackend {
  return SUPA_URL && SERVICE_KEY ? "supabase" : "local";
}

export function storageStatus() {
  return {
    backend: activeBackend(),
    bucket: BUCKET,
    configured: Boolean(SUPA_URL && SERVICE_KEY),
    url: SUPA_URL ? new URL(SUPA_URL).host : "",
  };
}

/** Nama objek dibuat server (uuid + ekstensi); tetap dipagari sebelum dipakai. */
function safeKey(key: string): string {
  const base = path.basename(key);
  if (!/^[A-Za-z0-9._-]+$/.test(base) || base.includes(".."))
    throw new Error("Nama berkas bukti tidak valid.");
  return base;
}

function supaHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...extra,
  };
}

/* ------------------------------------------------------------------ tulis */

export async function putObject(
  key: string,
  data: Buffer,
  mime: string,
): Promise<StorageBackend> {
  const name = safeKey(key);

  if (activeBackend() === "supabase") {
    const r = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${name}`, {
      method: "POST",
      headers: supaHeaders({ "Content-Type": mime, "x-upsert": "false" }),
      body: new Uint8Array(data),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      throw new Error(
        `Supabase menolak unggahan (${r.status}). ${detail.slice(0, 200)}`,
      );
    }
    return "supabase";
  }

  await fs.mkdir(BUKTI_DIR, { recursive: true });
  await fs.writeFile(path.join(BUKTI_DIR, name), data);
  return "local";
}

/* -------------------------------------------------------------------- baca */

export async function getObject(
  key: string,
  backend: StorageBackend,
): Promise<{ body: Buffer; mime: string | null } | null> {
  const name = safeKey(key);

  if (backend === "supabase") {
    if (!SUPA_URL || !SERVICE_KEY) return null;
    const r = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${name}`, {
      headers: supaHeaders(),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return { body: buf, mime: r.headers.get("content-type") };
  }

  const file = path.join(BUKTI_DIR, name);
  if (!path.resolve(file).startsWith(path.resolve(BUKTI_DIR) + path.sep))
    return null;
  try {
    return { body: await fs.readFile(file), mime: null };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ hapus */

export async function deleteObject(
  key: string,
  backend: StorageBackend,
): Promise<void> {
  let name: string;
  try {
    name = safeKey(key);
  } catch {
    return; // nama aneh — tidak ada yang bisa dihapus dengan aman
  }

  if (backend === "supabase") {
    if (!SUPA_URL || !SERVICE_KEY) return;
    await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${name}`, {
      method: "DELETE",
      headers: supaHeaders(),
    }).catch(() => {
      // gagal hapus di storage tidak boleh menggagalkan aksi utamanya;
      // barisnya tetap dibuang supaya tidak jadi bukti yatim di UI
    });
    return;
  }

  try {
    await fs.unlink(path.join(BUKTI_DIR, name));
  } catch {
    // berkas sudah tidak ada
  }
}
