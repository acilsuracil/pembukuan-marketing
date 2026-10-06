import { STATUS_LABEL } from "@/lib/format";
import type { PengajuanStatus } from "@/lib/types";
import { Badge } from "./ui";

const TONE: Record<
  PengajuanStatus,
  "muted" | "good" | "warning" | "serious" | "critical"
> = {
  draft: "muted",
  diajukan: "serious",
  disetujui: "warning",
  ditolak: "critical",
  dibayar: "good",
};

/**
 * `leaderOk` memecah 'diajukan' jadi dua tahap yang berbeda bagi pembacanya:
 * masih di leader, atau sudah di penyetuju pembayaran.
 */
export default function StatusBadge({
  status,
  leaderOk,
}: {
  status: PengajuanStatus;
  leaderOk?: boolean;
}) {
  const label =
    status === "diajukan"
      ? leaderOk
        ? "Menunggu persetujuan"
        : "Menunggu leader"
      : STATUS_LABEL[status];
  return <Badge tone={TONE[status]}>{label}</Badge>;
}
