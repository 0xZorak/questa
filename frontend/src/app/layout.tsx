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
  metadataBase: new URL("https://questa-inj.vercel.app"),
  title: "Questa — Injective Testnet",
  description: "AI-powered quest campaigns with trustless INJ rewards on Injective",
  applicationName: "Questa",
  // Single logo file served from public/questa-logo.png drives the tab favicon,
  // the link-share preview (Open Graph), and the X/Twitter card.
  icons: {
    icon: "/questa-logo.png",
    shortcut: "/questa-logo.png",
    apple: "/questa-logo.png",
  },
  openGraph: {
    type: "website",
    siteName: "Questa",
    title: "Questa — AI-powered quests on Injective",
    description: "AI-powered quest campaigns with trustless INJ rewards on Injective.",
    url: "https://questa-inj.vercel.app",
    images: [{ url: "/questa-logo.png", width: 1254, height: 1254, alt: "Questa" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Questa — AI-powered quests on Injective",
    description: "AI-powered quest campaigns with trustless INJ rewards on Injective.",
    images: ["/questa-logo.png"],
  },
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
