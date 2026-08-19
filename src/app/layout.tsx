import type { Metadata } from "next";
import { Roboto_Condensed } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto-condensed",
});

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
      <body className={`${robotoCondensed.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
