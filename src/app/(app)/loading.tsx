/**
 * Tampilan sementara selagi halaman disiapkan server.
 *
 * Bukan sekadar hiasan. Seluruh halaman di grup ini dinamis, dan menurut
 * dokumentasi Link, route dinamis hanya di-prefetch **sampai batas `loading`
 * terdekat** — tanpa berkas ini tidak ada apa pun yang di-prefetch, jadi setiap
 * klik menunggu satu perjalanan penuh ke server sebelum ada satu piksel pun
 * berubah. Yang terasa: menu diklik, lalu tidak terjadi apa-apa, lalu halaman
 * baru muncul mendadak.
 *
 * Dengan batas ini, kerangkanya tampil seketika sementara datanya menyusul —
 * dan tautan di sidebar mulai di-prefetch begitu masuk pandangan.
 *
 * Bentuknya sengaja menyerupai susunan halaman-halaman di sini (judul, sebaris
 * kartu angka, lalu satu blok besar) supaya isinya tidak melompat saat datang.
 */
function Bar({ w, h = "h-4" }: { w: string; h?: string }) {
  return <div className={`${h} ${w} rounded bg-[var(--wash)]`} />;
}

export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat…</span>

      <div className="page-header flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Bar w="w-40" h="h-6" />
          <Bar w="w-56" h="h-3" />
        </div>
        <div className="flex gap-2">
          <Bar w="w-28" h="h-9" />
          <Bar w="w-36" h="h-9" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card space-y-2 p-4">
            <Bar w="w-24" h="h-3" />
            <Bar w="w-32" h="h-6" />
            <Bar w="w-20" h="h-3" />
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Bar w="w-20" h="h-3" />
              <Bar w="w-16" h="h-3" />
              <Bar w="w-24" h="h-3" />
              <div className="flex-1" />
              <Bar w="w-20" h="h-3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
