// Single source of truth for user-visible brand copy — sidebar wordmark,
// login screen, PDF reports, outgoing emails, and a couple of admin-form
// labels. Every one of those call sites reads BRAND.* instead of a
// hardcoded string, so swapping branding is a one-file edit here, not a
// repo-wide grep-and-replace.
export const BRAND = {
  productName: "DialDesk",
  metaDescription: "DialDesk — call centre CRM and workforce platform",
  loginTagline: "DialDesk — call centre floor",
  processorBadgeLabel: "DialDesk",
  processorLabel: "DialDesk",
  emailFromName: "DialDesk",
  emailFromDomainFallback: "mail.assorted.group",
  pdfFilenamePrefix: "dialdesk-client-report",
  agentCodePlaceholder: "DD-014",
};
