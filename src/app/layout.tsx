import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, Outfit } from "next/font/google";
import { Toaster } from "sonner";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Display face for headings only — Inter stays the body/UI font everywhere
// else. A distinct geometric heading face is most of what makes a dense
// data app read as "contemporary" rather than "generic admin template."
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: BRAND.productName,
  description: BRAND.metaDescription,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plexMono.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
