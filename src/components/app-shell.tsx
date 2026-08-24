"use client";

import { PropsWithChildren } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/navbar";

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const isAuthRoute = pathname === "/sign-in" || pathname === "/sign-up";
  const isPrintRoute = pathname?.startsWith("/report/") && pathname?.endsWith("/print");

  useEffect(() => {
    const root = document.body;
    root.classList.toggle("app-route", !isAuthRoute && !isPrintRoute);
    root.classList.toggle("auth-route", isAuthRoute);

    return () => {
      root.classList.remove("app-route", "auth-route");
    };
  }, [isAuthRoute, isPrintRoute]);

  return (
    <div
      className={
        isAuthRoute
          ? "h-dvh overflow-hidden"
          : isPrintRoute
            ? "min-h-dvh bg-white"
            : "min-h-dvh"
      }
    >
      {isAuthRoute || isPrintRoute ? null : <Navbar />}
      <main
        id="main"
        className={
          isAuthRoute
            ? "fixed inset-0 w-full overflow-hidden pt-0"
            : isPrintRoute
              ? "mx-0 mb-0 mt-0 min-h-dvh w-full overflow-visible pt-0"
            : "mt-20 mx-16 mb-16 min-h-dvh w-[calc(100%-8rem)] pt-0"
        }
      >
        {children}
      </main>
    </div>
  );
}
