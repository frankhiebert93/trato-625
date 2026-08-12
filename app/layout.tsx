import type { Metadata, Viewport } from "next";
import { Archivo, Archivo_Black } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next"; // NEW: Speed Insights Import

// Body face — labels lean on the heavy end (800/900 uppercase).
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

// Display face — logo, prices, stamps, CTAs.
const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-archivo-black",
  display: "swap",
});

// This prevents the annoying iPhone zoom when clicking input boxes
export const viewport: Viewport = {
  themeColor: "#FAF3EA",
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
    <html lang="es" className={`${archivo.variable} ${archivoBlack.variable}`}>
      <body>
        {children}
        <Analytics />
        {/* NEW: Speed Insights Tracker */}
        <SpeedInsights />
      </body>
    </html>
  );
}
