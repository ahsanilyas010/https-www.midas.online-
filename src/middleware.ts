import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { PRIVATE_PATH_PREFIXES } from "@/lib/site";

// Sales-demo persona cookie (src/lib/actions/demo.ts) — no Supabase session
// behind it at all.
const DEMO_COOKIE = "leadcallient_demo_user";

function hasRealSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

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

  let response = NextResponse.next({ request });
  let signedIn = Boolean(request.cookies.get(DEMO_COOKIE)?.value);

  // Only bother constructing a real Supabase client (and refreshing its
  // session) when a real auth cookie might actually be present — keeps a
  // pure sales-demo deployment, with no Supabase env vars configured,
  // working without ever touching the network here.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && hasRealSessionCookie(request)) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
            response = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = signedIn || Boolean(user);
  }

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

  // A stale or revoked sign-in lands here; clear both cookie schemes so the
  // login page shows instead of bouncing back into the app.
  if (pathname === "/login" && request.nextUrl.searchParams.has("signed_out")) {
    const res = noindex(NextResponse.next({ request }));
    res.cookies.delete(DEMO_COOKIE);
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && hasRealSessionCookie(request)) {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (cookiesToSet) => {
              for (const { name, value, options } of cookiesToSet) res.cookies.set(name, value, options);
            },
          },
        },
      );
      await supabase.auth.signOut();
    }
    return res;
  }

  if (signedIn && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/start";
    url.search = "";
    return noindex(NextResponse.redirect(url));
  }

  return isPrivate(pathname) ? noindex(response) : response;
}

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/reset-password",
  "/api/unsubscribe",
  "/api/leads/inbound",
  "/api/billing/webhook",
  "/api/email/unsubscribe",
  "/api/twilio",
];

export const config = {
  // Static assets and the crawler/metadata files (robots.txt, sitemap.xml,
  // manifest, icons, social images) are served without the auth check.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|twitter-image|robots.txt|sitemap.xml|manifest.webmanifest|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
