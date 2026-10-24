import type { Metadata, Viewport } from "next";
import { Inter, Heebo } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/context/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { CartProvider } from "@/context/CartContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PrivacyConsentBanner from "@/components/PrivacyConsentBanner";
import {
  buildPageMetadata,
  buildStoreJsonLd,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  display: "swap",
  variable: "--font-heebo",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export const metadata: Metadata = {
  ...buildPageMetadata("home"),
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/store-icon.sv", sizes: "any", type: "image/svg+xml" },
    ],
    shortcut: ["/icon.svg", "/favicon.ico"],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const storeJsonLd = buildStoreJsonLd();

  return (
    <html
      lang="en"
      dir="ltr"
      className={`dark ${inter.variable} ${heebo.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased transition-colors">
        <a
          href="#main-content"
          data-testid="skip-to-main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-teal-600 focus:text-white focus:font-bold focus:shadow-lg"
        >
          Skip to main content
        </a>
        <script
          type="application/ld+json"
          data-testid="jsonld-store"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(storeJsonLd) }}
        />
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <SessionProvider>
          <ThemeProvider>
            <LanguageProvider>
              <CartProvider>
                <Navbar />
                <main
                  id="main-content"
                  role="main"
                  tabIndex={-1}
                  className="flex-1 focus:outline-none"
                >
                  {children}
                </main>
                <Footer />
                <PrivacyConsentBanner />
              </CartProvider>
            </LanguageProvider>
          </ThemeProvider>
          </SessionProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
