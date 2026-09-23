import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Database } from "@/lib/supabase/types";

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await checkRateLimit("unsubscribe", ip, 30, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const email = request.nextUrl.searchParams.get("email");
  const token = request.nextUrl.searchParams.get("token");

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    return NextResponse.json({ error: "Invalid or expired unsubscribe link." }, { status: 400 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { error } = await supabase
    .from("email_suppression")
    .upsert({ email: email.toLowerCase(), reason: "unsubscribed" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(
    `<!doctype html><html><body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;text-align:center;">
      <h1 style="font-size:1.1rem;">You've been unsubscribed</h1>
      <p style="color:#6B7482;">${email} won't receive further emails from us.</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
