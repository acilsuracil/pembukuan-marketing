import type { PermKey } from "@/lib/policy";

/** Bentuk serial PERM_LIST — dikirim dari Server Component ke komponen klien. */
export interface PermItem {
  key: PermKey;
  label: string;
  desc: string;
}

/**
 * Pengelompokan izin supaya daftar centangnya mudah dipindai, bukan tembok
 * checkbox. Kunci di sini harus tetap sinkron dengan PERM_LIST di lib/policy.
 */
export const PERM_GROUPS: ReadonlyArray<{
  title: string;
  keys: readonly PermKey[];
}> = [
  { title: "Pencatatan", keys: ["add", "edit", "delete"] },
  { title: "Bukti transfer", keys: ["uploadBukti", "deleteAnyBukti"] },
  {
    title: "Pengajuan & data master",
    keys: ["approveRequest", "manageBrand", "manageCategory"],
  },
  {
    title: "Administrasi",
    keys: ["lockPeriod", "manageUsers", "viewActivity", "exportData"],
  },
];
