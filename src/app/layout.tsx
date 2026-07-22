import type { Metadata } from "next";
import "./globals.css";
import "./landing.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "AI UX Audit Tool",
  description: "AI-powered UX audits via n8n webhook",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className="antialiased">
        <a className="skipLink" href="#main">
          Skip to content
        </a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
