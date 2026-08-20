import type { Opt } from "@/components/PengajuanForm";
import type { TxOpt } from "@/components/TxForm";
import {
  listAkunIklan,
  listBrand,
  listDivisi,
  listDompet,
  listPenerima,
  listPlatform,
  saldoDompet,
} from "./queries";

/**
 * Pilihan untuk formulir, sudah diserialkan jadi bentuk sederhana.
 *
 * Baris rekening ikut dirakit di sini — satu tempat — karena teks itulah yang
 * dikirim ke finance dan tampil di detail pengajuan; dua perakit berarti dua
 * bentuk yang bisa berselisih.
 */
export function rekLine(bank: string, noRek: string, nama: string): string {
  const kiri = [bank, noRek].filter(Boolean).join(" ");
  return kiri ? `${kiri} (${nama})` : nama;
}

export interface FormOptions {
  penerima: Opt[];
  dompet: Opt[];
  brand: Opt[];
  platform: Opt[];
  divisi: Opt[];
}

export function formOptions(): FormOptions {
  return {
    penerima: listPenerima().map((p) => ({
      id: p.id,
      label: p.nama,
      rek: rekLine(p.bank, p.no_rek, p.nama),
    })),
    dompet: listDompet().map((d) => ({
      id: d.id,
      label: d.name,
      rek: rekLine(d.bank || d.name, d.no_rek, d.pemilik || d.name),
    })),
    brand: listBrand().map((b) => ({ id: b.id, label: b.name })),
    platform: listPlatform().map((p) => ({
      id: p.id,
      label: p.name,
      divisiId: p.divisi_id,
    })),
    divisi: listDivisi().map((d) => ({ id: d.id, label: d.name })),
  };
}

export interface TxOptions {
  divisi: TxOpt[];
  platform: TxOpt[];
  brand: TxOpt[];
  dompet: TxOpt[];
  akun: TxOpt[];
  penerima: TxOpt[];
}

/** Pilihan untuk formulir transaksi & filter daftar belanja. */
export function txOptions(): TxOptions {
  return {
    divisi: listDivisi().map((d) => ({ id: d.id, label: d.name })),
    platform: listPlatform().map((p) => ({
      id: p.id,
      label: p.name,
      divisiId: p.divisi_id,
      dompetId: p.dompet_id,
    })),
    brand: listBrand().map((b) => ({ id: b.id, label: b.name })),
    dompet: listDompet().map((d) => ({ id: d.id, label: d.name })),
    akun: listAkunIklan().map((a) => ({
      id: a.id,
      label: a.name,
      platformId: a.platform_id,
    })),
    penerima: listPenerima().map((p) => ({
      id: p.id,
      label: rekLine(p.bank, p.no_rek, p.nama),
    })),
  };
}

/** Dompet beserta saldo berjalannya — untuk pratinjau sisa di input harian. */
export function dompetOptions() {
  return saldoDompet().map((d) => ({
    id: d.id,
    label: d.name,
    sisa: d.sisa,
    minSaldo: d.min_saldo,
  }));
}
