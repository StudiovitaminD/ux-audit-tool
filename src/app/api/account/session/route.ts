import { NextResponse } from "next/server";
import {
  ACCOUNT_SESSION_COOKIE,
  clearAccountSession,
  getAccountSessionFromRequest,
  getCookie,
  signInAccount,
  signUpAccount,
} from "@/lib/account-server";
import { checkRateLimit, rateLimitResponse, requestClientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getAccountSessionFromRequest(req);
  return NextResponse.json({ session });
}

export async function POST(req: Request) {
  try {
    const rate = checkRateLimit(`signup:${requestClientKey(req)}`, 8, 15 * 60_000);
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const body = (await req.json()) as {
      email?: string;
      name?: string;
      password?: string;
    } | null;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (password.length > 128) {
      return NextResponse.json({ error: "Password must be 128 characters or fewer." }, { status: 400 });
    }

    const { sessionId, session } = await signUpAccount({ email, name, password });
    const response = NextResponse.json({ session });
    response.cookies.set(ACCOUNT_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create account.";
    const expected = /already exists|must be provisioned/i.test(message);
    return NextResponse.json(
      { error: expected ? message : "Unable to create the account." },
      { status: expected ? 409 : 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const rate = checkRateLimit(`signin:${requestClientKey(req)}`, 10, 15 * 60_000);
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const body = (await req.json()) as { email?: string; password?: string } | null;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }
    if (password.length > 128) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
    }

    const { sessionId, session } = await signInAccount({ email, password });
    const response = NextResponse.json({ session });
    response.cookies.set(ACCOUNT_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const sid = getCookie(req, ACCOUNT_SESSION_COOKIE);
  if (sid) {
    await clearAccountSession(sid);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCOUNT_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
