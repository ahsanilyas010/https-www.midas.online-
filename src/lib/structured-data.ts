import { COMPANY } from "@/lib/brand";
import { absoluteUrl, siteUrl } from "@/lib/site";

// schema.org Organization for Assorted Business LLC, shared by the public
// pages' JSON-LD.
export function organizationJsonLd() {
  const a = COMPANY.address;
  return {
    "@type": "Organization",
    "@id": absoluteUrl("/#organization"),
    name: COMPANY.legalName,
    url: siteUrl(),
    logo: absoluteUrl("/icon"),
    address: {
      "@type": "PostalAddress",
      streetAddress: a.street,
      addressLocality: a.city,
      addressRegion: a.region,
      postalCode: a.postalCode,
      addressCountry: a.countryCode,
    },
    ...(COMPANY.email ? { email: COMPANY.email } : {}),
    ...(COMPANY.phone ? { telephone: COMPANY.phone } : {}),
    ...(COMPANY.whatsappUrl ? { sameAs: [COMPANY.whatsappUrl] } : {}),
  };
}

// Serialise JSON-LD for a <script> tag; "<" is escaped so the payload can't
// close the tag early.
export function jsonLdHtml(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
