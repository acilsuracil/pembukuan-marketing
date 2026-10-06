import Script from "next/script";

/**
 * Tata letak Mini App Telegram: tanpa navigasi, selebar layar HP. Skrip
 * telegram-web-app.js menyediakan window.Telegram.WebApp (initData, tombol
 * tutup, tema).
 */
export default function MiniLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <main className="mx-auto w-full max-w-xl px-3 py-4">{children}</main>
    </>
  );
}
