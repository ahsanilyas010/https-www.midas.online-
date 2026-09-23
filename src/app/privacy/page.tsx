import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { BRAND, COMPANY, companyAddressLine } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${COMPANY.legalName} collects, uses and protects personal data in ${BRAND.productName}.`,
  alternates: { canonical: "/privacy" },
};

// Starting draft — have it reviewed by counsel before relying on it.
export default function PrivacyPage() {
  const p = BRAND.productName;
  return (
    <LegalPage title="Privacy Policy" updated="September 2026">
      <p>
        {p} is operated by {COMPANY.legalName}, {companyAddressLine()} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy explains what personal data
        we collect through our website and service, why, and the choices you have.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details</strong> when you sign up: your name, company, work email, password (stored only as a secure hash by our
          authentication provider), and optionally your phone number and team size.
        </li>
        <li>
          <strong>How you found us</strong>: advertising campaign parameters (such as utm tags and the Meta click ID) and the page you arrived on,
          so we can measure which campaigns work.
        </li>
        <li>
          <strong>Data you put into {p}</strong>: the leads, calls, campaigns and people your team manages. You control this data; we process it
          on your behalf.
        </li>
        <li>
          <strong>Billing details</strong> if you upgrade. Card payments are handled by Stripe; we never see or store your full card number.
        </li>
        <li>
          <strong>Usage and device data</strong> such as IP address, browser type and pages visited, collected through server logs and cookies.
        </li>
      </ul>

      <h2>Cookies and advertising</h2>
      <p>
        We use essential cookies to keep you signed in. On our public pages we may use the Meta Pixel to measure the results of our Facebook and
        Instagram ads (for example, that a visitor who clicked an ad later created an account). Meta may combine this with other data it holds
        under its own privacy policy. You can control ad personalisation in your Meta ad settings and block these cookies in your browser.
      </p>

      <h2>How we use data</h2>
      <ul>
        <li>To create and run your account and workspace, and to provide support.</li>
        <li>To bill you if you choose a paid plan.</li>
        <li>To secure the service, prevent abuse and meet legal obligations.</li>
        <li>To understand and improve our marketing and product.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        Service providers that run {p} for us, under contract: Google Firebase (authentication and database), Vercel (hosting), Stripe
        (payments) and Meta (ad measurement). We don&apos;t sell personal data.
      </p>

      <h2>Retention and your rights</h2>
      <p>
        We keep account data while your account is open and for a reasonable period afterwards for legal and accounting purposes. Depending on
        where you live you may have the right to access, correct, delete or export your data, or to object to certain processing. To make a
        request, <Link href="/contact" className="text-brand-blue underline">contact us</Link>.
      </p>

      <h2>Changes</h2>
      <p>We&apos;ll post any changes on this page and update the date above.</p>
    </LegalPage>
  );
}
