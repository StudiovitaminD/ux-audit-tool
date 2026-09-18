import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminDashboardClient } from "@/components/admin/admin-dashboard-client";
import { getAccountSessionFromRequest } from "@/lib/account-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieHeader = (await cookies())
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
    <div className="min-h-screen w-full">
      <div className="w-full overflow-hidden">
        <AdminDashboardClient session={{ email: session.email, name: session.name }} />
      </div>
    </div>
  );
}
