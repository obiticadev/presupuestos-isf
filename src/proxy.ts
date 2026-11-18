import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { authCookiePrefix } from "@/modules/auth/cookies";

// Optimistic check only: the real session check happens in requireUser() on the server.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request, { cookiePrefix: authCookiePrefix })) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/auth|api/health|_next/static|_next/image|favicon.ico|logo-isf.svg).*)"],
};
