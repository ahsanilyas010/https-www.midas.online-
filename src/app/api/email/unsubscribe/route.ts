import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyUnsubscribeToken } from "@/lib/email/send";

// Public, session-free — the link every sent email carries (spec:
// "unsubscribe link"). Signature-verified, not a lookup, so it works even
// years after the email was sent with no token-expiry bookkeeping.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("w");
  const email = url.searchParams.get("e");
  const signature = url.searchParams.get("s");

  if (!workspaceId || !email || !signature || !verifyUnsubscribeToken(workspaceId, email, signature)) {
    return new NextResponse("Invalid or expired unsubscribe link.", { status: 400 });
  }

  const admin = createServiceClient();
  await admin.from("email_suppression").upsert({ workspace_id: workspaceId, email });

  return new NextResponse(
    `<!doctype html><html><body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#1a1a2e">
      <h1 style="font-size:20px">You're unsubscribed</h1>
      <p style="color:#666">${email} won't receive any further emails from this sender.</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
