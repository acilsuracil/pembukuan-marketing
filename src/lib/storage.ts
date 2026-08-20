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
// Nama bucket ikut masuk ke path URL. Nama yang memuat spasi atau karakter
// khusus akan merusak request kalau tidak di-encode.
const BUCKET_PATH = encodeURIComponent(BUCKET);

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
    throw new Error("Nama berkas tidak valid.");
  return base;
}

/** Subfolder di dalam bucket/direktori data, mis. "backup". */
function safeFolder(folder?: string): string {
  if (!folder) return "";
  if (!/^[a-z0-9-]+$/.test(folder)) throw new Error("Folder tidak valid.");
  return folder;
}

function objectPath(name: string, folder?: string): string {
  const f = safeFolder(folder);
  return f ? `${encodeURIComponent(f)}/${encodeURIComponent(name)}` : encodeURIComponent(name);
}

function localPath(name: string, folder?: string): string {
  const f = safeFolder(folder);
  return f ? path.join(BUKTI_DIR, "..", f, name) : path.join(BUKTI_DIR, name);
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
  folder?: string,
): Promise<StorageBackend> {
  const name = safeKey(key);

  if (activeBackend() === "supabase") {
    const r = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET_PATH}/${objectPath(name, folder)}`, {
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

  const dest = localPath(name, folder);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, data);
  return "local";
}

/* -------------------------------------------------------------------- baca */

export async function getObject(
  key: string,
  backend: StorageBackend,
  folder?: string,
): Promise<{ body: Buffer; mime: string | null } | null> {
  const name = safeKey(key);

  if (backend === "supabase") {
    if (!SUPA_URL || !SERVICE_KEY) return null;
    const r = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET_PATH}/${objectPath(name, folder)}`, {
      headers: supaHeaders(),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return { body: buf, mime: r.headers.get("content-type") };
  }

  try {
    return { body: await fs.readFile(localPath(name, folder)), mime: null };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ hapus */

export async function deleteObject(
  key: string,
  backend: StorageBackend,
  folder?: string,
): Promise<void> {
  let name: string;
  try {
    name = safeKey(key);
  } catch {
    return; // nama aneh — tidak ada yang bisa dihapus dengan aman
  }

  if (backend === "supabase") {
    if (!SUPA_URL || !SERVICE_KEY) return;
    await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET_PATH}/${objectPath(name, folder)}`, {
      method: "DELETE",
      headers: supaHeaders(),
    }).catch(() => {
      // gagal hapus di storage tidak boleh menggagalkan aksi utamanya;
      // barisnya tetap dibuang supaya tidak jadi bukti yatim di UI
    });
    return;
  }

  try {
    await fs.unlink(localPath(name, folder));
  } catch {
    // berkas sudah tidak ada
  }
}

/* ----------------------------------------------------------------- daftar */

export interface StoredObject {
  name: string;
  size: number;
}

/** Isi sebuah folder. Dipakai daftar backup — sumber kebenarannya storage. */
export async function listObjects(folder: string): Promise<StoredObject[]> {
  const f = safeFolder(folder);

  if (activeBackend() === "supabase") {
    const r = await fetch(`${SUPA_URL}/storage/v1/object/list/${BUCKET_PATH}`, {
      method: "POST",
      headers: supaHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        prefix: f,
        limit: 200,
        sortBy: { column: "name", order: "desc" },
      }),
      cache: "no-store",
    });
    if (!r.ok) return [];
    const rows = (await r.json()) as Array<{
      name: string;
      metadata?: { size?: number } | null;
    }>;
    return rows
      .filter((x) => x?.name && x.name !== ".emptyFolderPlaceholder")
      .map((x) => ({ name: x.name, size: x.metadata?.size ?? 0 }));
  }

  const dir = path.join(BUKTI_DIR, "..", f);
  try {
    const names = await fs.readdir(dir);
    const out: StoredObject[] = [];
    for (const n of names) {
      const st = await fs.stat(path.join(dir, n));
      if (st.isFile()) out.push({ name: n, size: st.size });
    }
    return out;
  } catch {
    return [];
  }
}
