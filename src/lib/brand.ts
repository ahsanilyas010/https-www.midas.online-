// Single source of truth for user-visible brand copy — sidebar wordmark,
// login screen, PDF reports, outgoing emails, and a couple of admin-form
// labels. Every one of those call sites reads BRAND.* instead of a
// hardcoded string, so swapping branding is a one-file edit here, not a
// repo-wide grep-and-replace.
export const BRAND = {
  productName: "Midas CRM",
  metaDescription: "Midas CRM — call centre CRM, workforce platform and Zoom meetings in one place",
  loginTagline: "Contact-centre CRM · Live floor · Zoom meetings",
  processorBadgeLabel: "Midas",
  processorLabel: "Midas",
  emailFromName: "Midas",
  emailFromDomainFallback: "mail.midas.online",
  pdfFilenamePrefix: "midas-client-report",
  agentCodePlaceholder: "MD-114",
  website: "https://www.midas.online",
};
