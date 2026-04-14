/**
 * Root layout — wraps every page with global providers, navigation, and the
 * verification guard.
 *
 * Provider order (innermost to outermost):
 *   SmartAccountProvider → QueryClientProvider → WagmiProvider
 *
 * The Nav renders above all pages. The VerificationGuard enforces that only
 * verified students (with a linked @davidson.edu email) can access protected routes.
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";
import { VerificationGuard } from "@/components/verification-guard";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MealCoin",
  description: "Davidson College meal swipe marketplace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <Nav />
          <VerificationGuard>
            {children}
          </VerificationGuard>
        </Providers>
      </body>
    </html>
  );
}
