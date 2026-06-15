import type { Metadata } from "next";
import Link from "next/link";
import {
  MERCHANT_PRIVACY_ADDENDUM,
  PRIVACY_POLICY,
  PRIVACY_POLICY_SECTIONS,
} from "@/content/privacy-policy";

export const metadata: Metadata = {
  title: "Privacy Policy | Shop Assist",
  description:
    "U.S. Privacy Policy for Shop Assist, the AI shopping assistant for online storefronts.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPolicyPage() {
  return (
    <main
      className="min-h-screen px-4 py-12 sm:px-6 lg:px-8"
      style={{
        backgroundColor: "var(--widget-surface-alt)",
        color: "var(--widget-text)",
        fontFamily: "var(--widget-font-family)",
      }}
    >
      <article className="mx-auto max-w-3xl rounded-[28px] border bg-white px-6 py-10 shadow-sm sm:px-10 sm:py-12">
        <header className="border-b pb-8" style={{ borderColor: "var(--widget-border)" }}>
          <p
            className="text-sm font-medium uppercase tracking-[0.18em]"
            style={{ color: "var(--widget-text-muted)" }}
          >
            {PRIVACY_POLICY.productName}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Privacy Policy (United States)
          </h1>
          <p className="mt-4 text-sm leading-6" style={{ color: "var(--widget-text-muted)" }}>
            Effective date: {PRIVACY_POLICY.effectiveDate}
            <span className="mx-2">·</span>
            Last updated: {PRIVACY_POLICY.lastUpdated}
          </p>
          <p className="mt-4 text-[15px] leading-7">
            This policy is intended for U.S. merchants and shoppers. If you use Shop Assist on a
            merchant&apos;s website, that merchant&apos;s privacy policy applies together with this
            policy.
          </p>
        </header>

        <div className="space-y-10 pt-8">
          {PRIVACY_POLICY_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-8">
              <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
              <div className="mt-4 space-y-4 text-[15px] leading-7 text-[var(--widget-text)]">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets ? (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
                {section.quote ? (
                  <pre
                    className="overflow-x-auto rounded-2xl border px-4 py-4 text-sm leading-6 whitespace-pre-wrap"
                    style={{
                      borderColor: "var(--widget-border)",
                      backgroundColor: "var(--widget-surface-alt)",
                    }}
                  >
                    {section.quote}
                  </pre>
                ) : null}
              </div>
            </section>
          ))}

          <section id="contact-details" className="scroll-mt-8">
            <div
              className="rounded-2xl border px-5 py-4 text-[15px] leading-7"
              style={{
                borderColor: "var(--widget-border)",
                backgroundColor: "var(--widget-surface-alt)",
              }}
            >
              <p className="font-medium">{PRIVACY_POLICY.operatorName}</p>
              <p className="mt-2">{PRIVACY_POLICY.operatorCountry}</p>
              <p className="mt-2">
                Email:{" "}
                <a
                  href={`mailto:${PRIVACY_POLICY.contactEmail}`}
                  className="underline underline-offset-4"
                  style={{ color: "var(--widget-accent)" }}
                >
                  {PRIVACY_POLICY.contactEmail}
                </a>
              </p>
            </div>
          </section>

          <section id="merchant-copy-block" className="scroll-mt-8">
            <h2 className="text-xl font-semibold tracking-tight">Quick copy for merchants</h2>
            <p className="mt-4 text-[15px] leading-7">
              Merchants may paste the following into their storefront privacy policy:
            </p>
            <pre
              className="mt-4 overflow-x-auto rounded-2xl border px-4 py-4 text-sm leading-6 whitespace-pre-wrap"
              style={{
                borderColor: "var(--widget-border)",
                backgroundColor: "var(--widget-surface-alt)",
              }}
            >
              {MERCHANT_PRIVACY_ADDENDUM}
            </pre>
          </section>
        </div>

        <footer
          className="mt-10 border-t pt-6 text-sm"
          style={{ borderColor: "var(--widget-border)", color: "var(--widget-text-muted)" }}
        >
          <Link href="/" className="underline underline-offset-4">
            Back to home
          </Link>
        </footer>
      </article>
    </main>
  );
}
