import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: { default: "Оборот CRM", template: "%s — Оборот CRM" },
  description: "CRM для продаж, отгрузки и производства: 30 возможностей в одной системе",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full">
        {children}
        <Toaster position="bottom-right" richColors closeButton toastOptions={{ style: { fontFamily: "inherit" } }} />
      </body>
    </html>
  );
}
