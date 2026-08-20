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

export default function StatusBadge({ status }: { status: PengajuanStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
