import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "go see art SF",
  description: "SF art museum exhibitions, all in one place",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <header className="border-b border-border sticky top-0 bg-white z-10">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-pink hover:text-pink-dark transition-colors"
            >
              go see art sf
            </Link>
            <nav className="ml-auto">
              <Link
                href="/about"
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                About
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
