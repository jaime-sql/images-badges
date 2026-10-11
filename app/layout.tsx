import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Press_Start_2P, Silkscreen } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pressStart2P = Press_Start_2P({
  weight: "400",
  variable: "--font-press-start",
  subsets: ["latin"],
});

const silkscreen = Silkscreen({
  weight: ["400", "700"],
  variable: "--font-silkscreen",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Badge Generator // Pixel Art Hackathon Pass",
  description: "Retro brutalist 4-level dithered hackathon badge generator",
};

const pixelFontHref = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/fonts/PressStart2P-Regular.ttf`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${pressStart2P.variable} ${silkscreen.variable} ${inter.variable} h-full antialiased dark`}
    >
      <head>
        <link
          rel="preload"
          href={pixelFontHref}
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#0d0f12] text-[#e2e8f0] font-mono">{children}</body>
    </html>
  );
}
