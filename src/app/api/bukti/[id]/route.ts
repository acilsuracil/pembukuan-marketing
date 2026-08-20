import { getAttachment } from "@/lib/queries";
import { getUser } from "@/lib/session";
import { getObject } from "@/lib/storage";

/**
 * Bukti transfer hanya boleh dilihat oleh user yang sudah login.
 *
 * Berkasnya bisa ada di disk lokal atau di Supabase Storage — dua-duanya
 * diambil server lalu diteruskan lewat route ini, tidak pernah lewat URL publik.
 * Jadi kunci Supabase tidak pernah sampai ke browser, dan bucket-nya tetap privat.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const att = getAttachment(id);
  if (!att) return new Response("Not found", { status: 404 });

  let obj;
  try {
    obj = await getObject(att.stored_name, att.storage);
  } catch {
    return new Response("Gagal membaca bukti", { status: 502 });
  }
  if (!obj) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(obj.body), {
    headers: {
      // Tipe dari database yang dipakai — bukan dari respons hulu — supaya
      // tidak bisa dibelokkan jadi tipe lain.
      "Content-Type": att.mime,
      "Content-Length": String(obj.body.length),
      "Content-Disposition": `inline; filename="${encodeURIComponent(att.orig_name || att.id)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
