import "server-only";
import { createHmac } from "node:crypto";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/service";
import { siteUrl } from "@/lib/site";
import type { RealTables } from "@/lib/supabase/real-types";

function unsubscribeSecret(): string {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-only-insecure-secret";
}

// A tamper-proof, session-free unsubscribe link (spec: "unsubscribe
// link"). No lookup table of live tokens needed — the signature itself
// is the proof, verified again in verifyUnsubscribeToken().
export function unsubscribeUrl(workspaceId: string, email: string): string {
  const sig = createHmac("sha256", unsubscribeSecret()).update(`${workspaceId}:${email}`).digest("hex");
  const params = new URLSearchParams({ w: workspaceId, e: email, s: sig });
  return `${siteUrl()}/api/email/unsubscribe?${params.toString()}`;
}

export function verifyUnsubscribeToken(workspaceId: string, email: string, signature: string): boolean {
  const expected = createHmac("sha256", unsubscribeSecret()).update(`${workspaceId}:${email}`).digest("hex");
  return expected === signature;
}

function mergeFields(template: string, fields: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => fields[key] ?? "");
}

export interface SendTemplatedEmailInput {
  workspaceId: string;
  leadId: string;
  templateId: string;
  toEmail: string;
  fields: Record<string, string>;
  sentBy: string;
}

// Spec: "Approved templates only, merge fields, unsubscribe link, send
// log per lead, via Resend." Every branch below still writes an
// email_log row — a failed or suppressed send is exactly as auditable as
// a successful one.
export async function sendTemplatedEmail(input: SendTemplatedEmailInput): Promise<{ error?: string }> {
  const admin = createServiceClient();

  const { data: template } = await admin
    .from("email_templates")
    .select("*")
    .eq("id", input.templateId)
    .eq("workspace_id", input.workspaceId)
    .eq("approved", true)
    .maybeSingle();
  if (!template) return { error: "This template isn't approved for sending." };

  const { data: suppressed } = await admin
    .from("email_suppression")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("email", input.toEmail)
    .maybeSingle();
  if (suppressed) {
    await admin.from("email_log").insert({
      workspace_id: input.workspaceId,
      lead_id: input.leadId,
      template_id: input.templateId,
      to_email: input.toEmail,
      status: "suppressed",
      sent_by: input.sentBy,
    });
    return { error: "This recipient has unsubscribed." };
  }

  const unsubLink = unsubscribeUrl(input.workspaceId, input.toEmail);
  const subject = mergeFields(template.subject, input.fields);
  const body = mergeFields(template.body_md, input.fields) + `\n\n---\nUnsubscribe: ${unsubLink}`;

  if (!process.env.RESEND_API_KEY) {
    await admin.from("email_log").insert({
      workspace_id: input.workspaceId,
      lead_id: input.leadId,
      template_id: input.templateId,
      to_email: input.toEmail,
      status: "failed",
      error: "Email isn't configured yet (RESEND_API_KEY missing).",
      sent_by: input.sentBy,
    });
    return { error: "Email isn't configured yet." };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  try {
    const result = await resend.emails.send({ from: fromAddress, to: input.toEmail, subject, text: body });
    await admin.from("email_log").insert({
      workspace_id: input.workspaceId,
      lead_id: input.leadId,
      template_id: input.templateId,
      to_email: input.toEmail,
      status: result.error ? "failed" : "sent",
      provider_message_id: result.data?.id ?? null,
      error: result.error?.message ?? null,
      sent_by: input.sentBy,
    });
    if (result.error) return { error: result.error.message };
    return {};
  } catch (e) {
    await admin.from("email_log").insert({
      workspace_id: input.workspaceId,
      lead_id: input.leadId,
      template_id: input.templateId,
      to_email: input.toEmail,
      status: "failed",
      error: e instanceof Error ? e.message : "Unknown error",
      sent_by: input.sentBy,
    });
    return { error: "Could not send the email." };
  }
}

export type EmailTemplate = RealTables<"email_templates">;
