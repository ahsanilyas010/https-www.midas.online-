// Single source of truth for user-visible brand copy — sidebar wordmark,
// login screen, PDF reports, outgoing emails, and a couple of admin-form
// labels. Every one of those call sites reads BRAND.* instead of a
// hardcoded string, so swapping branding is a one-file edit here, not a
// repo-wide grep-and-replace.
export const BRAND = {
  productName: "CallMilalo",
  metaDescription: "CallMilalo — call centre CRM, workforce platform and Zoom meetings in one place",
  loginTagline: "Contact-centre CRM · Live floor · Zoom meetings",
  processorBadgeLabel: "CallMilalo",
  processorLabel: "CallMilalo",
  emailFromName: "CallMilalo",
  emailFromDomainFallback: "mail.callmilalo.demo",
  pdfFilenamePrefix: "callmilalo-client-report",
  agentCodePlaceholder: "CM-114",
  website: "https://callmilalo.demo",
};
