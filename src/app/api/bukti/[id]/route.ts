import fs from "node:fs/promises";
import path from "node:path";
import { BUKTI_DIR } from "@/lib/db";
import { getAttachment } from "@/lib/queries";
import { getUser } from "@/lib/session";

/** Bukti transfer hanya boleh dilihat oleh user yang sudah login. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const att = getAttachment(id);
  if (!att) return new Response("Not found", { status: 404 });

  // stored_name selalu dibuat server (uuid + ekstensi), tapi tetap dipagari
  // supaya tidak ada jalan keluar dari folder bukti.
  const file = path.join(BUKTI_DIR, path.basename(att.stored_name));
  if (!file.startsWith(path.resolve(BUKTI_DIR) + path.sep))
    return new Response("Forbidden", { status: 403 });

  let data: Buffer;
  try {
    data = await fs.readFile(file);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": att.mime,
      "Content-Length": String(data.length),
      "Content-Disposition": `inline; filename="${encodeURIComponent(att.orig_name || att.id)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
