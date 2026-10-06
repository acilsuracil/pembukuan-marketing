import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pembukuan Marketing",
  description: "Panel pembukuan pengeluaran marketing — divisi, category, dan dompet",
};

// Tema dan lebar sidebar diterapkan sebelum paint pertama, supaya halaman tidak
// sempat berkedip dari kondisi bawaan ke pilihan yang tersimpan.
const BOOT = `try{
var d=document.documentElement;
var t=localStorage.getItem('ledger-theme');if(t)d.dataset.theme=t;
if(localStorage.getItem('ledger-sidebar')==='collapsed')d.dataset.sidebar='collapsed';
}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
