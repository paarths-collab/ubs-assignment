import { NextRequest, NextResponse } from "next/server";
import { workspaceReturnTo } from "@/lib/return-to";

export async function proxy(request: NextRequest) {
  const target = new URL("/api/v1/auth/me", process.env.BACKEND_URL ?? "http://127.0.0.1:8000");
  try {
    const response = await fetch(target, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (response.ok) return NextResponse.next();
  } catch { /* Login page offers retry when the service returns. */ }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", workspaceReturnTo(request.nextUrl.pathname + request.nextUrl.search));
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/overview/:path*", "/analyze/:path*", "/datasets/:path*", "/dashboards/:path*"] };
