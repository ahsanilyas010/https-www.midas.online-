"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { sendTemplatedEmail } from "@/lib/email/send";

export interface EmailActionState {
  error?: string;
  ok?: boolean;
}

const templateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  subject: z.string().trim().min(2).max(200),
  body_md: z.string().trim().min(2).max(5000),
});

export async function createEmailTemplate(_prev: EmailActionState, formData: FormData): Promise<EmailActionState> {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") {
    return { error: "Only an admin can create email templates." };
  }
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    subject: formData.get("subject"),
    body_md: formData.get("body_md"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid template." };

  const supabase = await createRealClient();
  const { error } = await supabase.from("email_templates").insert({ workspace_id: profile.workspace_id, ...parsed.data });
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/email", "page");
  return { ok: true };
}

export async function approveEmailTemplate(id: string): Promise<{ error?: string }> {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") {
    return { error: "Only an admin can approve a template." };
  }
  const supabase = await createRealClient();
  const { error } = await supabase
    .from("email_templates")
    .update({ approved: true, approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/email", "page");
  return {};
}

export async function sendLeadEmail(leadId: string, templateId: string): Promise<{ error?: string }> {
  const profile = await requireRealProfile();
  if (!["super_admin", "ops_manager", "team_lead", "agent"].includes(profile.role)) {
    return { error: "Only staff can send email." };
  }
  const supabase = await createRealClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("full_name, email")
    .eq("id", leadId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!lead) return { error: "Lead not found." };
  if (!lead.email) return { error: "This lead has no email address on file." };

  const result = await sendTemplatedEmail({
    workspaceId: profile.workspace_id,
    leadId,
    templateId,
    toEmail: lead.email,
    fields: { lead_name: lead.full_name ?? "there", agent_name: profile.full_name },
    sentBy: profile.id,
  });
  revalidatePath("/dial", "page");
  return result;
}
