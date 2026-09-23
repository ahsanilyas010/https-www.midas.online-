import { NextResponse, type NextRequest } from "next/server";

// DEMO BUILD: sign-in is a cookie naming one of the seeded demo users (set
// by the login page's persona picker). No Supabase session to refresh.
const DEMO_COOKIE = "callmilalo_demo_user";
const PUBLIC_PATHS = ["/login", "/reset-password", "/api/unsubscribe", "/api/leads/inbound"];

export async function middleware(request: NextRequest) {
  const signedIn = Boolean(request.cookies.get(DEMO_COOKIE)?.value);
  // "/" is the public landing page (exact match — a prefix match would make
  // every route public).
  const isPublic =
    request.nextUrl.pathname === "/" || PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/start";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|brand/|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
