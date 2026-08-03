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
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <AdminDashboardClient session={{ email: session.email, name: session.name }} />
    </div>
  );
}
