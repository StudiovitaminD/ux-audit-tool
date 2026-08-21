"use client";

import { PropsWithChildren } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/navbar";

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const isAuthRoute = pathname === "/sign-in" || pathname === "/sign-up";

  useEffect(() => {
    const root = document.body;
    root.classList.toggle("app-route", !isAuthRoute);
    root.classList.toggle("auth-route", isAuthRoute);

    return () => {
      root.classList.remove("app-route", "auth-route");
    };
  }, [isAuthRoute]);

  return (
    <div className={isAuthRoute ? "h-dvh overflow-hidden" : "min-h-dvh"}>
      <Navbar />
      <main
        id="main"
        className={
          isAuthRoute
            ? "fixed inset-x-0 bottom-0 top-[104px] w-full overflow-hidden pt-0"
            : "mt-20 mx-16 mb-16 min-h-dvh w-[calc(100%-8rem)] pt-0"
        }
      >
        {children}
      </main>
    </div>
  );
}
