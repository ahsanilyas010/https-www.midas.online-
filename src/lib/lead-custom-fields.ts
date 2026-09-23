// Labels for keys stored under leads.custom by the vendor-CSV import path
// (src/lib/connectors/vendor-csv.ts) — split into its own client-safe
// module since the import dialog (server-only pipeline) and the lead
// details view (client component) both need these labels.
export const CUSTOM_FIELD_LABELS: Record<string, string> = {
  council: "Council",
  project_name: "Name",
  project_type: "Project type",
  units: "Units",
  summary: "Summary",
  decision: "Decision",
  decision_date: "Decision date",
  contact_name_address: "Contact name & address",
  portal_url: "Portal URL",
  source_notes: "Notes (from source)",
  // Worked-lead history carried over from a pre-existing outreach
  // spreadsheet (agent-compiled call/email log), rather than produced by
  // this app's own call-attempt/email-send pipeline — kept as read-only
  // source context, not treated as a live disposition or send record.
  prior_disposition: "Prior disposition (source)",
  email_status_source: "Email status (source)",
  reply_outcome: "Reply / outcome (source)",
  new_remarks: "Agent remarks (source)",
  appointment_set: "Appointment noted (source)",
  follow_up_date_source: "Follow-up date (source)",
  source_sheet: "Source sheet",
  source_row: "Source row #",
  // Planning-application tracker fields — src/lib/connectors/vendor-csv.ts
  application_date: "Application date",
  authority: "Authority",
  category: "Category",
  application_type: "Application type",
  proposal: "Proposal",
  architect_name: "Architect Name",
  web: "Web",
  contact: "Contact",
  comments: "Comments",
  source_contact_email: "Contact email (source)",
  // Written by the agent-facing edit form (src/app/(app)/workspace/leads) —
  // the one custom key that's live/editable rather than imported history.
  agent_notes: "My notes",
  // unphoned_contacts.custom — the building-intelligence contacts export
  // (no phone number in source), surfaced via the same details dialog.
  contact_role: "Role on project",
  project_value: "Project value",
  company_ref: "Company ref",
  // "CRM & ERP Local" outreach sheet — kept as the requester's own exact
  // columns (industry/POC/pipeline stage/call script) rather than mapped
  // into this app's generic project_name/source_notes fields.
  industry: "Industry",
  poc: "POC",
  current_status: "Current status",
  crm_stage: "CRM stage",
  priority: "Priority",
  what_to_sell: "What to sell",
  call_hook: "Call hook (exact line)",
  next_action: "Next action",
};
