import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Bukti transfer sampai 5 MB per berkas, beberapa sekaligus, plus
      // overhead multipart.
      bodySizeLimit: "48mb",
    },
  },
  // Panel ini menyajikan data keuangan — jangan sampai ter-embed di situs lain.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
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
