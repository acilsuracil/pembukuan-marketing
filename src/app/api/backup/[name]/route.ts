import { readBackup } from "@/lib/backup";
import { isOwner } from "@/lib/policy";
import { getUser } from "@/lib/session";

/**
 * Mengunduh satu snapshot. Owner-only: berkas ini memuat seluruh database,
 * termasuk hash password setiap akun.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!isOwner(user)) return new Response("Forbidden", { status: 403 });

  const { name } = await params;
  const body = await readBackup(name);
  if (!body) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/x-sqlite3",
      "Content-Length": String(body.length),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
