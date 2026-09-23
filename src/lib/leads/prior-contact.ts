// Leads imported from a pre-worked source sheet carry disposition/remarks
// history in `leads.custom` rather than in call_attempts (no real call has
// happened through this app yet) — this reads that history back out so an
// agent can see what they already found before dialing (or re-dialing) a
// lead, instead of it looking untouched.
export function priorContact(custom: unknown): { disposition: string | null; remarks: string | null } {
  const c = (custom as Record<string, unknown> | null) ?? {};
  const disposition = typeof c.prior_disposition === "string" ? c.prior_disposition : null;
  const remarks = [c.new_remarks, c.reply_outcome, c.source_notes, c.agent_notes]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" — ");
  return { disposition, remarks: remarks || null };
}
