import { NextRequest, NextResponse } from "next/server";

export const ADMIN_COOKIE = "admin_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const session = request.cookies.get(ADMIN_COOKIE);
  const password = process.env.ADMIN_PASSWORD;

  if (!password || session?.value !== password) {
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
