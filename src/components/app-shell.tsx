"use client";

import { PropsWithChildren } from "react";
import { Navbar } from "@/components/navbar";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-dvh">
      <Navbar />
      <main id="main" className="min-h-dvh w-full pt-[104px]">
        {children}
      </main>
    </div>
  );
}
