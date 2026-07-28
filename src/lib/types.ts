export type TxType = "in" | "out";
export type Role = "owner" | "admin" | "staff";

export interface Category {
  id: number;
  name: string;
  kind: TxType;
  color_slot: number;
  budget_usdt: number;
  note: string;
  archived: number;
  created_at: string;
}

export interface Brand {
  id: number;
  name: string;
  color_slot: number;
  pic: string;
  note: string;
  budget_usdt: number;
  archived: number;
  created_at: string;
}

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
  active: number;
  /** Override izin per user dalam bentuk JSON; null = ikut default peran. */
  perms: string | null;
  session_epoch: number;
  pass_changed_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface TxRow {
  id: number;
  date: string;
  type: TxType;
  amount_usdt: number;
  fee_usdt: number;
  /** Fee agency dalam persen dari nominal. 0 = tidak ada. */
  fee_pct: number;
  /** Hasil rupiahnya dalam USDT: nominal × fee_pct ÷ 100, dibulatkan 2 desimal. */
  fee_pct_usdt: number;
  rate_idr: number | null;
  category_id: number | null;
  brand_id: number | null;
  description: string;
  counterparty: string;
  tx_hash: string;
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
  category_name: string | null;
  color_slot: number | null;
  brand_name: string | null;
  brand_slot: number | null;
  created_by_name: string | null;
  /** Kurs yang berlaku: kurs sendiri (in) atau warisan dari pemasukan terakhir (out). */
  eff_rate: number | null;
  rate_source: "manual" | "warisan";
  /** Perubahan saldo dompet, bertanda. */
  delta_usdt: number;
  /** Nilai absolut arus kas (nominal + semua fee untuk keluar, nominal - semua fee untuk masuk). */
  flow_usdt: number;
  month: string;
  bukti_count: number;
  pending_count: number;
}

export interface Attachment {
  id: string;
  tx_id: number;
  stored_name: string;
  orig_name: string;
  mime: string;
  size: number;
  uploaded_by: number | null;
  created_at: string;
  /** Di mana berkasnya berada: disk lokal atau Supabase Storage. */
  storage: "local" | "supabase";
}

export type RequestType = "edit" | "delete";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface ChangeRequest {
  id: number;
  tx_id: number | null;
  type: RequestType;
  payload: string | null;
  snapshot: string;
  reason: string;
  status: RequestStatus;
  requested_by: number | null;
  requested_at: string;
  decided_by: number | null;
  decided_at: string | null;
  decision_note: string;
  requester_name: string | null;
  decider_name: string | null;
}

export interface MonthFlow {
  month: string;
  in_usdt: number;
  out_usdt: number;
  in_idr: number;
  out_idr: number;
}

export interface GroupSpend {
  id: number | null;
  name: string;
  color_slot: number;
  usdt: number;
  idr: number;
  budget_usdt: number;
}

/** Alias historis — pengeluaran dikelompokkan per kategori. */
export type CategorySpend = GroupSpend;

export interface ActivityRow {
  id: number;
  ts: string;
  user_id: number | null;
  username: string;
  role: string;
  action: string;
  detail: string;
}
