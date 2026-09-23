import { NextResponse, type NextRequest } from "next/server";
import { PRIVATE_PATH_PREFIXES } from "@/lib/site";

// DEMO BUILD: sign-in is a cookie naming one of the seeded demo users (set
// by the login page's persona picker). No Supabase session to refresh.
const DEMO_COOKIE = "callmilalo_demo_user";
const PUBLIC_PATHS = ["/login", "/reset-password", "/api/unsubscribe", "/api/leads/inbound"];

// The signed-in app is never meant for search results.
function isPrivate(pathname: string) {
  return PRIVATE_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function noindex(res: NextResponse) {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get(DEMO_COOKIE)?.value);
  // "/" is the public landing page (exact match — a prefix match would make
  // every route public).
  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Only the app's own routes need a sign-in. Anything else (an unknown or
  // mistyped URL) falls through to a real 404 instead of a login redirect,
  // which search engines would treat as a soft 404.
  if (!signedIn && !isPublic && isPrivate(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return noindex(NextResponse.redirect(url));
  }

  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/start";
    url.search = "";
    return noindex(NextResponse.redirect(url));
  }

  const res = NextResponse.next({ request });
  return isPrivate(pathname) ? noindex(res) : res;
}

export const config = {
  // Static assets and the crawler/metadata files (robots.txt, sitemap.xml,
  // manifest, icons, social images) are served without the auth check.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|twitter-image|robots.txt|sitemap.xml|manifest.webmanifest|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
