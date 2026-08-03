"use client";

import { PropsWithChildren } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const mainClassName = pathname === "/" ? "w-full p-0" : pathname.startsWith("/admin") ? "w-full p-0 pt-[104px]" : "mainContent pt-[104px]";
  const hideFooter = pathname.startsWith("/admin");

  return (
    <div className="min-h-dvh">
      <Navbar />
      <main id="main" className={mainClassName}>
        {children}
      </main>
      {hideFooter ? null : <Footer />}
    </div>
  );
}
