import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

// Folder induk repo ini menyimpan package-lock.json proyek lain, sehingga Turbopack
// salah menebak root workspace dan mencetak jalur berkas relatif terhadap folder
// yang keliru. Pin ke folder aplikasi ini.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    serverActions: {
      // Bukti transfer sampai 5 MB per berkas, beberapa sekaligus, plus
      // overhead multipart.
      bodySizeLimit: "48mb",
    },
  },
  // Panel ini menyajikan data keuangan — jangan sampai ter-embed di situs lain.
  // Satu-satunya pengecualian: Mini App (/mini), yang di Telegram Web tampil
  // di dalam iframe web.telegram.org — dan hanya boleh di-embed oleh Telegram.
  async headers() {
    return [
      {
        source: "/((?!mini).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
      {
        source: "/mini/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
