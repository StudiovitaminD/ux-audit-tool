import { PropsWithChildren } from "react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-dvh">
      <Navbar />
      <main id="main" className="mainContent">
        {children}
      </main>
      <Footer />
    </div>
  );
}
