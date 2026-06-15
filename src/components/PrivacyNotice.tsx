"use client";

import { getPrivacyPolicyUrl } from "@/lib/privacy-consent";

type PrivacyNoticeProps = {
  sellerPrivacyPolicyUrl?: string | null;
};

export function PrivacyNotice({ sellerPrivacyPolicyUrl }: PrivacyNoticeProps) {
  const privacyPolicyUrl = getPrivacyPolicyUrl();

  return (
    <p
      className="px-4 pt-3 text-[11px] leading-5"
      style={{ color: "var(--widget-text-muted)" }}
    >
      By using this assistant, you agree to{" "}
      {sellerPrivacyPolicyUrl ? (
        <a
          href={sellerPrivacyPolicyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
          style={{ color: "var(--widget-text)" }}
        >
          this seller&apos;s privacy policy
        </a>
      ) : (
        "this seller's privacy policy"
      )}{" "}
      and the{" "}
      <a
        href={privacyPolicyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
        style={{ color: "var(--widget-text)" }}
      >
        Shop Assist Privacy Policy
      </a>
      .
    </p>
  );
}
