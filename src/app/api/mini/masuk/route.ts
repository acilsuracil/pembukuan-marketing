import { one } from "@/lib/db";
import { hasPerm, logActivity } from "@/lib/policy";
import { startSession, type SessionUser } from "@/lib/session";
import { cekInitData } from "@/lib/telegram";

/**
 * Pintu masuk Mini App: menukar `initData` bertanda tangan Telegram dengan sesi
 * aplikasi biasa untuk akun yang ID Telegram-nya terdaftar.
 *
 * Setelah itu Mini App memakai formulir dan server action yang sama persis
 * dengan aplikasi — tidak ada jalur kedua dengan aturan sendiri.
 */
export async function POST(request: Request) {
  let initData = "";
  try {
    initData = String(((await request.json()) as { initData?: unknown }).initData ?? "");
  } catch {
    return Response.json({ ok: false, error: "Permintaan tidak valid." }, { status: 400 });
  }

  const data = cekInitData(initData);
  if (!data)
    return Response.json(
      { ok: false, error: "Buka halaman ini dari tombol di bot Telegram, bukan dari browser." },
      { status: 401 },
    );

  const user = one<SessionUser & { active: number }>(
    `SELECT id, username, name, role, perms, session_epoch, active
     FROM users WHERE telegram_id = ?`,
    data.user.id,
  );
  if (!user || !user.active)
    return Response.json(
      {
        ok: false,
        error: `Akun Telegram Anda (ID ${data.user.id}) belum terdaftar di aplikasi. Minta owner mengisinya di Admin → Pengguna.`,
      },
      { status: 403 },
    );
  if (!hasPerm(user, "addPengajuan"))
    return Response.json(
      { ok: false, error: "Akun Anda tidak punya izin membuat pengajuan." },
      { status: 403 },
    );

  await startSession(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      perms: user.perms,
      session_epoch: user.session_epoch,
    },
    { mini: true },
  );
  logActivity(user, "masuk-mini-app", `Telegram ${data.user.id}`);

  // start_param "d<id>" = dibuka dari /ajukan di grup divisi tertentu.
  const divisi = /^d(\d+)$/.exec(data.startParam)?.[1] ?? "";
  return Response.json({ ok: true, divisi });
}
