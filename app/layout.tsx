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

const DESCRIPTION = "El mercado local de Cuauhtémoc. Compra y vende cerca de ti.";

// This tells Apple to treat it like a standalone native app
export const metadata: Metadata = {
  // Required so opengraph-image/twitter-image resolve to absolute URLs. Without
  // it Next falls back to VERCEL_URL, which is behind Vercel SSO — WhatsApp and
  // Facebook would get a 302 and show no preview image.
  metadataBase: new URL("https://trato625.com"),
  title: "Trato 625",
  description: DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Trato 625",
  },
  openGraph: {
    type: "website",
    siteName: "Trato 625",
    title: "Trato 625",
    description: DESCRIPTION,
    url: "/",
    locale: "es_MX",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trato 625",
    description: DESCRIPTION,
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
