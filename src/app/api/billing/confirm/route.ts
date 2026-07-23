import { NextResponse } from "next/server";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import { confirmRazorpayPayment } from "@/lib/razorpay-billing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const accountSession = await getAccountSessionFromRequest(req);
    if (!accountSession) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      orderId?: string;
      paymentId?: string;
      signature?: string;
    } | null;

    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
    const paymentId = typeof body?.paymentId === "string" ? body.paymentId.trim() : "";
    const signature = typeof body?.signature === "string" ? body.signature.trim() : "";

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json({ error: "Razorpay payment details are required." }, { status: 400 });
    }

    const result = await confirmRazorpayPayment({
      orderId,
      paymentId,
      signature,
      currentUserId: accountSession.id,
    });

    return NextResponse.json({ session: result.session, reportLimit: result.reportLimit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to confirm payment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
