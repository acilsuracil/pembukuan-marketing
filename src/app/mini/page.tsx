import { first, type SP } from "@/lib/sp";
import MiniMasuk from "./MiniMasuk";

export default async function MiniPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const d = first(sp, "divisi");
  return <MiniMasuk divisi={/^\d+$/.test(d) ? d : ""} />;
}
