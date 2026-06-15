export const PRIVACY_POLICY_PATH = "/privacy-policy";

export const PRIVACY_POLICY = {
  effectiveDate: "June 8, 2026",
  lastUpdated: "June 8, 2026",
  productName: "Shop Assist",
  operatorName: "Zapsight",
  operatorCountry: "United States",
  contactEmail: "privacy@zapsight.com",
  ccpaTollFree: "",
} as const;

export type PrivacyPolicySection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  quote?: string;
};

export const MERCHANT_PRIVACY_ADDENDUM = `Our website uses Shop Assist, an AI shopping assistant operated by Zapsight ("Shop Assist Provider"). When you use the chat assistant on our site, we and the Shop Assist Provider may collect and process information described in the Shop Assist Privacy Policy at [INSERT YOUR SHOP ASSIST APP URL]/privacy-policy, including chat messages, session identifiers, browsing and cart context, and related technical data. That policy is incorporated into ours by reference. By using Shop Assist on our website, you agree to our privacy policy and the Shop Assist Privacy Policy. To exercise privacy rights related to your use of Shop Assist, you may contact us first or email privacy@zapsight.com.`;

export const PRIVACY_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    id: "introduction",
    title: "Introduction",
    paragraphs: [
      'Zapsight ("Zapsight," "we," "us," or "our") operates Shop Assist, an AI-powered shopping assistant that merchants embed on their U.S. e-commerce websites, including Shopify storefronts.',
      "This Privacy Policy explains how we collect, use, disclose, and retain information when you use Shop Assist. It is written primarily for users in the United States.",
    ],
  },
  {
    id: "merchant-relationship",
    title: "Relationship with merchants and store visitors",
    paragraphs: [
      "If you are shopping on a merchant's website, that merchant is responsible for its own privacy policy and for telling you how it handles personal information on its storefront.",
      "When Shop Assist is enabled on a merchant's site, the merchant's privacy policy should disclose that Shop Assist is used and should incorporate this Privacy Policy by reference. By using Shop Assist on a merchant's website — including opening the chat, sending a message, or clicking a suggested action — you agree to that merchant's privacy policy and this Privacy Policy, to the extent permitted by applicable law.",
      "For most customer chat and browsing data collected through the widget, Zapsight acts as a service provider (and/or processor) on behalf of the merchant. We process that information only to provide, secure, and improve Shop Assist for the merchant, except as otherwise described in this policy or required by law.",
    ],
  },
  {
    id: "who-this-applies-to",
    title: "Who this policy applies to",
    paragraphs: ["This policy applies to:"],
    bullets: [
      "U.S. store visitors and shoppers who use the Shop Assist chat widget on a merchant's website.",
      "Merchants and their authorized staff who install, configure, or administer Shop Assist.",
    ],
  },
  {
    id: "information-we-collect",
    title: "Information we collect",
    paragraphs: [
      "We collect the categories of information below when you or a merchant use Shop Assist. We do not knowingly collect sensitive personal information such as Social Security numbers, driver's license numbers, financial account credentials, precise geolocation, or health data through the widget.",
    ],
    bullets: [
      "Identifiers and session data: browser-generated session IDs, host website origin, timestamps, and similar technical identifiers stored in local storage or session storage.",
      "Customer communications: messages you send to the assistant, assistant responses, conversation history within a session, and suggested follow-up actions.",
      "Commercial and browsing information: pages viewed, product names, prices, categories, cart contents, search queries, and other shopping activity shared with the widget by the merchant's storefront.",
      "Inferences and preferences: visit counts, viewed products and categories, stated shopping preferences, and products added to cart or purchased when that information is available from the storefront context.",
      "Approximate location: city, state, country, timezone, and coarse latitude/longitude inferred from network headers when requests are processed by our U.S. hosting provider. We use this to improve response relevance and do not use it to identify your street address.",
      "Usage and diagnostic data: request types, AI model usage metadata, token counts, error logs, and service performance information.",
      "Merchant account information: shop domain, installation status, OAuth credentials needed to operate the app, synced product catalog data, branding settings, and allowed domains.",
      "Merchant administrator credentials: session cookies used to authenticate access to the Shop Assist admin console.",
    ],
  },
  {
    id: "how-we-use-information",
    title: "How we use information",
    paragraphs: ["We use the information above to:"],
    bullets: [
      "Provide, operate, troubleshoot, and improve Shop Assist.",
      "Generate product recommendations, comparisons, and other AI-assisted responses.",
      "Maintain conversation history and suggested follow-up actions during a session.",
      "Sync merchant product catalogs and display accurate product information.",
      "Detect abuse, protect security, and maintain service reliability.",
      "Comply with law and respond to valid legal and merchant-initiated data requests.",
      "Provide merchants with analytics about assistant usage.",
    ],
  },
  {
    id: "how-we-process-us",
    title: "How we process information in the United States",
    paragraphs: [
      "We process information under U.S. law. Our primary purposes are providing the service under our agreement with the merchant, securing and improving Shop Assist, and complying with legal obligations.",
      "Where a merchant's storefront obtains consent for cookies, analytics, or marketing, the merchant remains responsible for presenting any notice or choice required before Shop Assist collects information on its site.",
    ],
  },
  {
    id: "ai-processing",
    title: "AI processing and service providers",
    paragraphs: [
      "Shop Assist uses third-party AI inference providers to generate responses and suggestion chips. Message content and relevant shopping context may be transmitted to those providers only to deliver the service.",
      "We also use U.S. and international infrastructure providers for hosting, database storage, error monitoring, and Shopify platform integration. They may process information on our behalf under written contracts that limit their use of the data.",
    ],
    bullets: [
      "AI inference providers (for example, via OpenRouter and underlying model providers).",
      "Cloud hosting and edge providers (for example, Vercel).",
      "Database providers (for example, Supabase/PostgreSQL).",
      "Error monitoring providers (for example, Sentry).",
      "Shopify, when the app is installed on a Shopify store.",
    ],
  },
  {
    id: "cookies-and-storage",
    title: "Cookies, local storage, and similar technologies",
    paragraphs: [
      "Shop Assist primarily uses browser storage rather than cross-site advertising cookies. On embedded storefront widgets, session identifiers, visitor profile data, and privacy-notice acceptance may be stored in the merchant site's local storage or session storage through our embed script.",
      "Merchant admin sessions may use HTTP cookies to keep administrators signed in.",
      "We do not use Shop Assist to sell personal information or to build cross-context behavioral advertising profiles.",
    ],
  },
  {
    id: "retention",
    title: "Data retention",
    paragraphs: [
      "We retain chat sessions, messages, visitor profiles, analytics records, and merchant configuration for as long as reasonably necessary to provide the service, support merchants, resolve disputes, enforce our agreements, and comply with law.",
      "When a merchant uninstalls Shop Assist or submits a valid shop deletion request through Shopify's mandatory compliance webhooks, we delete or de-identify associated merchant and customer session data in accordance with our retention procedures and applicable U.S. law.",
    ],
  },
  {
    id: "sharing",
    title: "How we disclose information",
    paragraphs: [
      'We do not "sell" personal information as that term is commonly defined under California and similar U.S. state privacy laws, and we do not "share" personal information for cross-context behavioral advertising.',
      "We may disclose information in the following circumstances:",
    ],
    bullets: [
      "To service providers that help us host, secure, and operate Shop Assist under contract.",
      "To the merchant whose storefront you are visiting, because chat content and shopping context are collected to serve that merchant's customers.",
      "When required by law, regulation, legal process, or governmental request.",
      "To protect the rights, safety, and security of users, merchants, Zapsight, or others.",
      "In connection with a merger, acquisition, financing, reorganization, or sale of assets, subject to appropriate confidentiality protections.",
    ],
  },
  {
    id: "us-state-rights",
    title: "U.S. state privacy rights",
    paragraphs: [
      "Depending on your state of residence, you may have rights regarding your personal information. These may include the right to know, access, correct, delete, and obtain a portable copy of certain personal information, as well as the right to opt out of certain processing where applicable.",
      "Residents of California, Virginia, Colorado, Connecticut, Utah, and other states with comprehensive privacy laws may have additional rights subject to legal exceptions.",
      "Because Shop Assist on a merchant website is usually controlled by the merchant, store visitors should first contact the merchant whose site they visited to submit a privacy request related to chat interactions. We will assist merchants in responding to valid requests where we process data on their behalf.",
      "You may also contact us directly at privacy@zapsight.com. We will verify requests as required by law and respond within the timeframe applicable to your state.",
      "We will not discriminate against you for exercising privacy rights granted by law.",
    ],
  },
  {
    id: "shopify-compliance",
    title: "Shopify merchant compliance",
    paragraphs: [
      "For Shopify merchants, Shop Assist supports Shopify's mandatory compliance webhooks, including customer data request, customer redaction, and shop redaction events.",
      "Merchants must publish a privacy policy on their storefront that discloses use of Shop Assist and incorporates this policy by reference. Merchants are responsible for their own legal compliance, including any notice or consent required before enabling third-party tools on their site.",
    ],
  },
  {
    id: "merchant-addendum",
    title: "Language merchants may add to their privacy policy",
    paragraphs: [
      "Merchants may copy and adapt the following language into their own storefront privacy policy. Replace the bracketed URL with the URL where Shop Assist is hosted for your store.",
    ],
    quote: MERCHANT_PRIVACY_ADDENDUM,
  },
  {
    id: "security",
    title: "Security",
    paragraphs: [
      "We use administrative, technical, and organizational safeguards designed to protect information, including encrypted transport (HTTPS), access controls, tenant isolation, and monitoring. No method of transmission or storage is completely secure.",
    ],
  },
  {
    id: "children",
    title: "Children's privacy",
    paragraphs: [
      "Shop Assist is not directed to children under 13 years of age, and we do not knowingly collect personal information from children under 13 in violation of the Children's Online Privacy Protection Act (COPPA). If you believe a child under 13 has provided personal information through the service, contact us and we will take appropriate steps to delete it.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time. The effective date at the top of this page shows when it was last revised. Material changes will be posted on this page. Your continued use of Shop Assist after an update constitutes acceptance of the revised policy, to the extent permitted by law.",
    ],
  },
  {
    id: "contact",
    title: "Contact us",
    paragraphs: [
      "Questions about this Privacy Policy or our U.S. privacy practices may be sent to:",
    ],
  },
];
