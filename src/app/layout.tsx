import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import OfflineBanner from "@/components/OfflineBanner";
import { Toaster } from "@/components/Toast";
import { ConfirmHost } from "@/components/ConfirmHost";
import { THEME_COLORS, themeInitScript } from "@/config/theme";

// One face for Thai and Latin on every device (system Thai fonts differ between iOS, Android and PC)
const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Nexore - Learning Management System",
  description: "Decentralized learning management system for students and teachers",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint (see ThemeContext) */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Nexore" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content={THEME_COLORS.light} />
      </head>
      <body className={`${notoSansThai.variable} ${notoSansThai.className}`}>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
          <OfflineBanner />
          <Toaster />
          <ConfirmHost />
        </ThemeProvider>
      </body>
    </html>
  );
}
