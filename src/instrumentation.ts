/**
 * Penjadwal backup harian.
 *
 * `register()` dipanggil sekali saat server dinyalakan — oleh Next di runtime
 * Node maupun Edge. Semua kode yang butuh API Node hidup di
 * `instrumentation-node.ts` dan hanya diimpor setelah runtime dipastikan Node,
 * supaya bundle Edge tetap bersih.
 *
 * Penjadwalnya di dalam proses — cukup karena aplikasi ini memang berjalan
 * terus, dan tidak menambah infrastruktur apa pun. Kalau server mati semalaman,
 * snapshot yang terlewat dibuat pada boot berikutnya (lihat pemeriksaan umur
 * snapshot terakhir).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startBackupScheduler } = await import("./instrumentation-node");
  await startBackupScheduler();
}
