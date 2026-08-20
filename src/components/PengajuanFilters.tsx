"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PengajuanStatus } from "@/lib/types";

const STATUSES: Array<{ v: PengajuanStatus | "" | "outstanding"; t: string }> = [
  { v: "", t: "Semua" },
  { v: "outstanding", t: "Belum cair" },
  { v: "draft", t: "Draft" },
  { v: "diajukan", t: "Diajukan" },
  { v: "disetujui", t: "Disetujui" },
  { v: "dibayar", t: "Dibayar" },
  { v: "ditolak", t: "Ditolak" },
];

export default function PengajuanFilters({
  status,
  q,
}: {
  status: string;
  q: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(q);

  function go(nextStatus: string, nextQ: string) {
    const u = new URLSearchParams();
    if (nextStatus) u.set("status", nextStatus);
    if (nextQ) u.set("q", nextQ);
    const s = u.toString();
    router.push(s ? `/pengajuan?${s}` : "/pengajuan");
  }

  return (
    <section className="card flex flex-wrap items-end gap-3 p-3">
      <div className="flex flex-wrap gap-1">
        {STATUSES.map((s) => {
          const active = status === s.v;
          return (
            <button
              key={s.v || "all"}
              type="button"
              onClick={() => go(s.v, text)}
              aria-pressed={active}
              className="btn btn-ghost px-2.5 py-1 text-xs"
              style={
                active
                  ? { background: "var(--wash)", color: "var(--text-primary)" }
                  : undefined
              }
            >
              {active && <span aria-hidden>✓</span>}
              {s.t}
            </button>
          );
        })}
      </div>

      <form
        className="ml-auto flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go(status, text);
        }}
      >
        <div>
          <label className="label" htmlFor="pg-q">
            Cari
          </label>
          <input
            id="pg-q"
            type="search"
            className="field w-[200px] py-1.5 text-xs"
            placeholder="keterangan, penerima, brand…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-ghost px-2.5 py-1.5 text-xs">
          Terapkan
        </button>
      </form>
    </section>
  );
}
