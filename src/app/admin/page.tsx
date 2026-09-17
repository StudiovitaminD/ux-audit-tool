import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminDashboardClient } from "@/components/admin/admin-dashboard-client";
import { getAccountSessionFromRequest } from "@/lib/account-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieHeader = cookies()
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const session = await getAccountSessionFromRequest(
    new Request("http://localhost/admin", {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    }),
  );

  if (!session) {
    redirect("/sign-in?returnTo=/admin");
  }
  if (session.role !== "admin") {
    redirect("/audit");
  }

  return (
    <div className="min-h-screen bg-[#dedede] px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-[1600px] overflow-hidden rounded-[44px] bg-[#f8f8f7] shadow-[0_30px_100px_rgba(25,25,25,0.08)]">
        <AdminDashboardClient session={{ email: session.email, name: session.name }} />
      </div>
    </div>
  );
}
