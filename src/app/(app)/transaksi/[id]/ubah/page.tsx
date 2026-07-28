import { permanentRedirect } from "next/navigation";

/**
 * Halaman ubah tersendiri sudah dilebur ke halaman detail: formulirnya terbuka
 * di sana lewat query `?ubah`, supaya panel bukti tetap terlihat saat mengubah.
 * Route ini disisakan sebagai pengalih agar tautan dan bookmark lama tidak mati.
 */
export default async function UbahTransaksiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/transaksi/${id}?ubah`);
}
