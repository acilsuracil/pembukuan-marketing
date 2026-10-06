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
 * Skrip telegram-web-app.js tidak menahan hidrasi React, jadi di jaringan cepat
 * kode ini bisa berjalan lebih dulu dari skripnya. Ditunggu sebentar alih-alih
 * langsung menyimpulkan halaman dibuka di luar Telegram.
 */
function tungguTelegram(batasMs = 5000): Promise<TgWebApp | undefined> {
  return new Promise((selesai) => {
    const mulai = Date.now();
    const cek = () => {
      const wa = window.Telegram?.WebApp;
      if (wa?.initData || Date.now() - mulai > batasMs) return selesai(wa);
      setTimeout(cek, 50);
    };
    cek();
  });
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
    let wa: TgWebApp | undefined;
    tungguTelegram()
      .then((w) => {
        wa = w;
        wa?.ready();
        wa?.expand();
        if (!wa?.initData)
          throw new Error("Buka halaman ini dari tombol “📝 Ajukan dana” di bot Telegram.");
        // Pengaman putaran: kalau perangkat menolak cookie sesi, /mini/ajukan
        // akan mengembalikan ke sini terus-menerus. Masuk kedua dalam waktu
        // singkat berarti cookie-nya tidak tersimpan.
        const terakhir = Number(sessionStorage.getItem("mini-masuk") ?? 0);
        if (Date.now() - terakhir < 8000) {
          sessionStorage.removeItem("mini-masuk");
          throw new Error(
            "Perangkat ini menolak cookie login, jadi formulir tidak bisa dibuka. Coba buka dari aplikasi Telegram di HP, atau perbarui Telegram.",
          );
        }
        sessionStorage.setItem("mini-masuk", String(Date.now()));
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
