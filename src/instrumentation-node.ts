/**
 * Penjadwal backup harian — khusus runtime Node.
 *
 * Dipisah dari `instrumentation.ts` karena Next memuat berkas instrumentation
 * di runtime Node *dan* Edge. Modul ini menyentuh `node:sqlite`, `node:fs`, dan
 * `process.cwd()` lewat `lib/backup`, yang tidak ada di Edge. Dengan dipisah,
 * bundle Edge tidak pernah ikut menarik rantai impor tersebut.
 */
export async function startBackupScheduler() {
  if (process.env.LEDGER_DISABLE_BACKUP_SCHEDULER === "1") return;

  const g = globalThis as unknown as { __ledgerBackupTimer?: NodeJS.Timeout };
  if (g.__ledgerBackupTimer) return;

  const { createBackup, listBackups } = await import("./lib/backup");
  const DAY = 24 * 60 * 60 * 1000;

  async function runIfDue() {
    try {
      const files = await listBackups();
      const last = files[0]?.at.getTime() ?? 0;
      if (Date.now() - last < DAY) return;
      const r = await createBackup();
      console.log(
        `[pembukuan] backup harian dibuat: ${r.name} (${r.size} byte, ${r.backend})` +
          (r.pruned ? `, ${r.pruned} snapshot lama dibuang` : ""),
      );
    } catch (e) {
      // Backup gagal tidak boleh menjatuhkan aplikasi; dicatat supaya terlihat di log.
      console.error("[pembukuan] backup harian gagal:", (e as Error).message);
    }
  }

  // Beri jeda supaya boot tidak tertahan I/O, lalu periksa tiap jam.
  setTimeout(runIfDue, 30_000).unref?.();
  g.__ledgerBackupTimer = setInterval(runIfDue, 60 * 60 * 1000);
  g.__ledgerBackupTimer.unref?.();
}
