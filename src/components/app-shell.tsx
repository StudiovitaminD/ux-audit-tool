"use client";

import { PropsWithChildren } from "react";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-dvh">
      <main id="main" className="min-h-dvh w-full">
        {children}
      </main>
    </div>
  );
}
