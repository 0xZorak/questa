import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Providers } from "@/components/Providers";
import Reveal from "@/components/Reveal";
import "./globals.css";

// Outfit is the closest publicly available match to TikTok Sans Medium —
// same geometric grotesque proportions, identical weight axis.
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Questa — Injective Testnet",
  description: "AI-powered quest campaigns with trustless INJ rewards on Injective",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <Reveal />
      </body>
    </html>
  );
}
