import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import Welcome from "@/components/Welcome";
import PwaSetup from "@/components/PwaSetup";
import { Bear } from "@/components/Bear";

export const metadata: Metadata = {
  title: "Томи Мишка — рабочее пространство дизайнера · French IT",
  description:
    "Фото места и чертежи на входе — точный параметрический 3D-эскиз с размерами, материалами и цветами, плюс фотореалистичный рендер нового дизайна.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Томи Мишка",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Welcome />

        {/* аура-подсветка фона */}
        <div aria-hidden className="pointer-events-none fixed -top-48 right-[-140px] -z-10 h-[520px] w-[520px] rounded-full bg-violet/20 blur-[140px] motion-safe:animate-[drift_9s_ease-in-out_infinite]" />
        <div aria-hidden className="pointer-events-none fixed bottom-[-180px] left-[-160px] -z-10 h-[520px] w-[520px] rounded-full bg-pink/15 blur-[140px] motion-safe:animate-[drift_11s_ease-in-out_infinite_reverse]" />

        <header className="sticky top-0 z-40 border-b border-white/10 bg-paper/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <Bear size={34} />
              <span className="font-display text-lg font-semibold tracking-tight">
                ТОМИ<span className="glow-text"> МИШКА</span>
              </span>
              <span className="hidden rounded-full border border-white/15 bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-graphite sm:inline">
                French IT
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-graphite">
              <Link href="/" className="hover:text-ink">Дизайн</Link>
              <Link href="/retouch" className="hover:text-ink">Ретушь</Link>
              <Link href="/projects" className="hover:text-ink">Проекты</Link>
              <PwaSetup />
            </nav>
          </div>
          <div className="h-[2px] w-full bg-gradient-to-r from-violet via-pink to-amber opacity-80" />
        </header>
        <main className="mx-auto max-w-6xl px-5 pb-28 pt-8">{children}</main>
      </body>
    </html>
  );
}
