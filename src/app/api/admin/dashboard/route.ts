import { NextResponse } from "next/server";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import { loadAdminDashboardData } from "@/lib/admin-dashboard-data";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getAccountSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await loadAdminDashboardData();
  return NextResponse.json({
    ...data,
  });
}
