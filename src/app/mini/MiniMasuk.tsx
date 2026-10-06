"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface TgWebApp {
  initData: string;
  ready(): void;
  expand(): void;
  close(): void;
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

/**
 * Layar pembuka Mini App: menukar initData Telegram dengan sesi, lalu pindah ke
 * formulir pengajuan. Divisi bawaan datang dari ?divisi= (tombol bot) atau
 * start_param (tautan t.me).
 */
export default function MiniMasuk({ divisi }: { divisi: string }) {
  const router = useRouter();
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    const wa = window.Telegram?.WebApp;
    wa?.ready();
    wa?.expand();
    Promise.resolve()
      .then(() => {
        if (!wa?.initData)
          throw new Error("Buka halaman ini dari tombol “📝 Ajukan dana” di bot Telegram.");
        return fetch("/api/mini/masuk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData: wa.initData }),
        }).catch(() => {
          throw new Error("Tidak bisa menghubungi server. Coba tutup lalu buka lagi.");
        });
      })
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string; divisi?: string }>)
      .then((j) => {
        if (!j.ok) throw new Error(j.error ?? "Gagal masuk.");
        const d = divisi || j.divisi || "";
        router.replace(`/mini/ajukan${d ? `?divisi=${d}` : ""}`);
      })
      .catch((e: Error) => setGalat(e.message));
  }, [divisi, router]);

  return (
    <div className="card p-5 text-sm">
      {galat ? (
        <>
          <p className="font-medium">Tidak bisa membuka formulir</p>
          <p className="mt-1 text-[var(--text-muted)]">{galat}</p>
        </>
      ) : (
        <p className="text-[var(--text-muted)]">Memuat…</p>
      )}
    </div>
  );
}
