import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pembukuan Dompet USDT",
  description: "Panel admin arus kas dan pengeluaran dompet USDT",
};

const THEME_BOOT = `try{var t=localStorage.getItem('ledger-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
