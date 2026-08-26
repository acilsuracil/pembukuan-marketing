/**
 * Pembagian nominal ke beberapa brand.
 *
 * Modul ini polos — tanpa `"use server"`, tanpa impor — supaya **server dan
 * klien memakai kode yang sama persis**. Formulir memperlihatkan sisa dan tombol
 * "bagi rata"; server memeriksa jumlahnya. Kalau keduanya menghitung sendiri-
 * sendiri, angka yang dijanjikan formulir bisa berbeda dari yang diterima
 * server, dan orang akan melihat penolakan yang tidak masuk akal.
 *
 * Semua nilai **rupiah utuh**. Tidak ada persen di sini: 33,33% × 3 tidak pernah
 * berjumlah 100%, dan pecahannya akan muncul lagi sebagai selisih di laporan.
 * Formulir boleh menawarkan tombol bantu, tapi yang tersimpan selalu rupiah.
 */

/**
 * Membagi `total` ke `n` bagian yang sedapat mungkin sama besar.
 *
 * Sisa pembagian dibagikan satu-satu ke bagian pertama, bukan dibuang: jumlah
 * hasilnya wajib sama persis dengan `total`, dan selisih beberapa rupiah yang
 * "hilang" adalah cacat yang paling sulit dilacak di pembukuan seperti ini.
 */
export function bagiRata(total: number, n: number): number[] {
  if (n <= 0) return [];
  const dasar = Math.floor(total / n);
  const sisa = total - dasar * n;
  return Array.from({ length: n }, (_, i) => dasar + (i < sisa ? 1 : 0));
}

/**
 * Menskalakan porsi ke `total` baru dengan perbandingan yang sama.
 *
 * Dipakai saat dana yang cair berbeda dari yang diminta: perbandingan antar-brand
 * tetap dipertahankan, dan sisa pembulatannya jatuh ke porsi terbesar — porsi
 * terbesar adalah tempat selisih beberapa rupiah paling tidak berarti.
 *
 * Jumlah hasilnya dijamin sama persis dengan `total`.
 */
export function skalakan(porsi: number[], total: number): number[] {
  const jumlah = porsi.reduce((a, b) => a + b, 0);
  if (porsi.length === 0) return [];
  if (jumlah === total) return [...porsi];
  if (jumlah <= 0) return bagiRata(total, porsi.length);

  const hasil = porsi.map((p) => Math.floor((p * total) / jumlah));
  let sisa = total - hasil.reduce((a, b) => a + b, 0);

  // Sisa dibagikan mulai dari porsi terbesar, satu rupiah per putaran, sampai
  // habis — cara paling sederhana yang tetap menjaga urutan besar-kecilnya.
  const urut = porsi
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p - a.p)
    .map((x) => x.i);
  for (let k = 0; sisa > 0; k = (k + 1) % urut.length) {
    hasil[urut[k]] += 1;
    sisa -= 1;
  }
  return hasil;
}

/** Selisih jumlah porsi terhadap nominalnya. 0 berarti pas. */
export function selisihPorsi(porsi: number[], nominal: number): number {
  return porsi.reduce((a, b) => a + b, 0) - nominal;
}
