import type { Metadata } from "next";
import Script from "next/script";
import { WorkspaceShell } from "@/components/workspace-shell";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ColorThemeController } from "@/components/color-theme";
import { initializeColorTheme } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "DataLens · AI Data Analyst", description: "Interactive frontend preview of DataLens AI Data Analyst, with included data, working charts, local chat, and guides.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning><head><Script id="color-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: initializeColorTheme }} /></head><body suppressHydrationWarning>
    <ColorThemeController />
    <a className="skip-link" href="#main">Skip to content</a>
    <WorkspaceShell>{children}</WorkspaceShell>
  </body></html>;
}
