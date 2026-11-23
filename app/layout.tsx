import type { Metadata, Viewport } from "next";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/800.css";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/500.css";
import "@fontsource/tajawal/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "وصلة — مكتب الطلبات",
  description: "إدارة طلبات فيسبوك وإنستغرام للتجار في ليبيا",
};

export const viewport: Viewport = { themeColor: "#10302e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
