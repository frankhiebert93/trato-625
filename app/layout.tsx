import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react"; // NEW: Analytics Import

const inter = Inter({ subsets: ["latin"] });

// This prevents the annoying iPhone zoom when clicking input boxes
export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// This tells Apple to treat it like a standalone native app
export const metadata: Metadata = {
  title: "Trato 625",
  description: "Mercado Local Cuauhtémoc",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Trato 625",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        {children}
        {/* NEW: Analytics Tracker */}
        <Analytics />
      </body>
    </html>
  );
}