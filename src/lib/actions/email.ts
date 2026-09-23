"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEmailProvider } from "@/lib/email/provider";
import { renderTemplate } from "@/lib/email/merge";
import { signUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { BRAND } from "@/lib/brand";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

export async function createEmailTemplate(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const campaignId = String(formData.get("campaign_id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const bodyHtml = String(formData.get("body_html") ?? "").trim();
  const fromName = String(formData.get("from_name") ?? BRAND.emailFromName);

  if (!name || !subject || !bodyHtml) {
    return { error: "Name, subject and body are required." };
  }

  const { error } = await supabase.from("email_templates").insert({
    campaign_id: campaignId,
    name,
    subject,
    body_html: bodyHtml,
    from_name: fromName,
    from_email: `hello@${process.env.EMAIL_FROM_DOMAIN ?? BRAND.emailFromDomainFallback}`,
    // Auto-approved by the manager creating it — a separate approver flow
    // (someone other than the author) is a reasonable Phase-6-era
    // hardening, not blocking Phase 5's core send path.
    requires_approval: false,
    approved_by: user.id,
    approved_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/campaigns", "layout");
  return { ok: true };
}

export interface SendEmailResult extends ActionResult {
  provider?: string;
}

export async function sendLeadEmail(
  leadId: string,
  templateId: string,
): Promise<SendEmailResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).single();
  if (!lead) return { error: "Lead not found." };
  if (!lead.email) return { error: "This lead has no email address on file." };

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("clients(contact_email)")
    .eq("id", lead.campaign_id)
    .single();
  const clientCc =
    (campaign as { clients?: { contact_email: string | null } | null } | null)?.clients
      ?.contact_email ?? undefined;

  const { data: suppressed } = await supabase
    .from("email_suppression")
    .select("email")
    .eq("email", lead.email.toLowerCase())
    .maybeSingle();
  if (suppressed) return { error: `${lead.email} has unsubscribed — sending is blocked.` };

  const { data: template } = await supabase
    .from("email_templates")
    .select("*")
    .eq("id", templateId)
    .single();
  if (!template) return { error: "Template not found." };
  if (template.requires_approval && !template.approved_at) {
    return { error: "This template hasn't been approved yet." };
  }

  const unsubToken = signUnsubscribeToken(lead.email);
  const unsubUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/api/unsubscribe?email=${encodeURIComponent(lead.email)}&token=${unsubToken}`;

  const mergeData = {
    first_name: lead.first_name,
    last_name: lead.last_name,
    company_name: lead.company_name,
    phone: lead.phone_e164,
    unsubscribe_url: unsubUrl,
  };

  const subject = renderTemplate(template.subject, mergeData);
  const html =
    renderTemplate(template.body_html, mergeData) +
    `<hr><p style="font-size:11px;color:#6B7482;">${BRAND.productName}, on behalf of the client named above. ` +
    `<a href="${unsubUrl}">Unsubscribe</a></p>`;

  const fromEmail = template.from_email ?? `hello@${process.env.EMAIL_FROM_DOMAIN ?? BRAND.emailFromDomainFallback}`;
  const fromName = template.from_name ?? BRAND.emailFromName;

  const { data: sendRow, error: insertError } = await supabase
    .from("email_sends")
    .insert({
      lead_id: leadId,
      campaign_id: lead.campaign_id,
      template_id: templateId,
      agent_id: user.id,
      to_email: lead.email,
      subject_sent: subject,
      body_sent_html: html,
      status: "queued",
    })
    .select()
    .single();

  if (insertError) return { error: insertError.message };

  const provider = getEmailProvider();
  const result = await provider.send({
    to: lead.email,
    from: `${fromName} <${fromEmail}>`,
    replyTo: template.reply_to ?? undefined,
    cc: clientCc,
    subject,
    html,
  });

  await supabase
    .from("email_sends")
    .update(
      result.ok
        ? { status: "sent", sent_at: new Date().toISOString(), provider_message_id: result.providerMessageId }
        : { status: "failed", provider_error: result.error },
    )
    .eq("id", sendRow.id);

  revalidatePath("/admin/campaigns", "layout");

  if (!result.ok) {
    return { error: result.error, ok: false };
  }
  return { ok: true, provider: "resend" };
}
