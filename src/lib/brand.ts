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
  // Public address of the deployed site, used for canonical URLs, the
  // sitemap and social previews. On Vercel the production domain is picked
  // up automatically (see src/lib/site.ts); this is the fallback.
  siteUrl: "https://dialbyhand.vercel.app",
  seoTitle: "CallMilalo — Contact-Centre CRM with Your Own Dialer & Zoom",
  seoDescription:
    "CallMilalo is a contact-centre CRM with a dial workspace, bring-your-own dialer (Zoom Phone, Dialpad, Aircall, RingCentral), Zoom meetings, QA and compliance.",
};

// The company behind the product, shown in the landing-page footer and on
// the sign-in page. Leave a field empty ("") and it is simply not shown —
// fill in the street address, phone and email here when they're ready.
export const COMPANY = {
  legalName: "Assorted Business LLC",
  country: "United States",
  address: "", // e.g. "123 Main Street, Suite 100, City, ST 12345"
  phone: "", // e.g. "+1 555 010 0000"
  email: "", // e.g. "hello@callmilalo.com"
};

