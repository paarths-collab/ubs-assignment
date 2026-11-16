import type { Metadata } from "next";
import Script from "next/script";
import { PublicHeader } from "@/components/public-header";
import { WorkspaceShell } from "@/components/workspace-shell";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ColorThemeController } from "@/components/color-theme";
import { initializeColorTheme } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "DataLens · AI Data Analyst", description: "Upload CSV and Excel files, ask questions, and explore computed charts, validated SQL, and source-backed results.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning><head><Script id="color-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: initializeColorTheme }} /></head><body suppressHydrationWarning>
    <ColorThemeController />
    <a className="skip-link" href="#main">Skip to content</a>
    <PublicHeader />
    <WorkspaceShell>{children}</WorkspaceShell>
  </body></html>;
}
