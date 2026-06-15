export const PRIVACY_POLICY = {
  effectiveDate: "June 8, 2026",
  lastUpdated: "June 8, 2026",
  productName: "Shop Assist",
  operatorName: "Zapsight",
  contactEmail: "privacy@zapsight.com",
  websiteLabel: "Shop Assist application",
} as const;

export type PrivacyPolicySection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export const PRIVACY_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    id: "introduction",
    title: "Introduction",
    paragraphs: [
      'This Privacy Policy describes how Zapsight ("we," "us," or "our") collects, uses, stores, and shares information when you interact with Shop Assist — an AI-powered shopping assistant that merchants can embed on their online stores, including Shopify storefronts.',
      "Shop Assist may appear as a chat widget on a merchant's website. Depending on how you use the service, either the merchant, Zapsight, or both may process your information. This policy explains what Shop Assist collects and how we handle it.",
    ],
  },
  {
    id: "who-this-applies-to",
    title: "Who this policy applies to",
    paragraphs: ["This policy applies to:"],
    bullets: [
      "Store visitors and shoppers who use the Shop Assist chat widget on a merchant's website.",
      "Merchants and their authorized staff who install, configure, or administer Shop Assist.",
    ],
  },
  {
    id: "information-we-collect",
    title: "Information we collect",
    paragraphs: ["Depending on how you use Shop Assist, we may collect the following categories of information:"],
    bullets: [
      "Chat content: messages you send to the assistant and responses generated for you, including conversation history within a session.",
      "Session and device identifiers: browser-generated session IDs stored in local storage or session storage so the widget can restore your conversation.",
      "Browsing and shopping context: pages viewed, product names, prices, categories, cart contents, search queries, and similar on-site activity shared with the widget by the merchant's storefront.",
      "Visitor profile data: visit counts, viewed products and categories, stated preferences, and products you have purchased or added to cart when that information is available from the storefront context.",
      "Approximate location: city, region, country, timezone, and coarse latitude/longitude inferred from network headers when requests are processed on our hosting provider. We use this to improve relevance of responses and do not use it to identify your precise address.",
      "Technical and usage data: host website origin, timestamps, request types, AI model usage metadata, token counts, error logs, and similar diagnostic information.",
      "Merchant account data: Shopify shop domain, installation status, OAuth credentials needed to operate the app, product catalog data synced for recommendations, and admin configuration such as branding and allowed domains.",
      "Merchant admin credentials: if a merchant signs into the Shop Assist admin console, we use session authentication cookies to protect that console.",
    ],
  },
  {
    id: "how-we-use-information",
    title: "How we use information",
    paragraphs: ["We use collected information to:"],
    bullets: [
      "Provide, operate, and improve the shopping assistant experience.",
      "Generate product recommendations, comparisons, and other AI-assisted responses.",
      "Maintain conversation history and suggested follow-up actions during a session.",
      "Sync merchant product catalogs and display accurate product information.",
      "Monitor performance, prevent abuse, debug errors, and maintain service reliability.",
      "Comply with legal obligations and respond to valid data requests.",
      "Support merchants with analytics about assistant usage at an aggregated or session level.",
    ],
  },
  {
    id: "legal-bases",
    title: "Legal bases for processing",
    paragraphs: [
      "Where applicable under GDPR and similar laws, we rely on one or more of the following bases: performance of a contract with the merchant, our legitimate interests in operating and securing the service, compliance with legal obligations, and consent where required for optional features or cookies.",
      "If you are a store visitor, the merchant's privacy policy may also describe additional legal bases for processing that occurs on their storefront.",
    ],
  },
  {
    id: "ai-processing",
    title: "AI processing and third-party providers",
    paragraphs: [
      "Shop Assist uses third-party AI inference providers to generate responses and suggestion chips. Message content and relevant shopping context may be transmitted to these providers solely to deliver the service.",
      "We use infrastructure and service providers for hosting, database storage, error monitoring, and Shopify platform integration. These providers process data on our behalf under contractual safeguards appropriate to the service.",
    ],
    bullets: [
      "AI inference providers (for example, via OpenRouter and underlying model providers).",
      "Cloud hosting and edge network providers (for example, Vercel).",
      "Database providers (for example, Supabase/PostgreSQL).",
      "Error monitoring providers (for example, Sentry).",
      "Shopify, when the app is installed on a Shopify store.",
    ],
  },
  {
    id: "cookies-and-storage",
    title: "Cookies, local storage, and similar technologies",
    paragraphs: [
      "Shop Assist uses browser storage rather than traditional advertising cookies in most cases. On embedded storefront widgets, session identifiers, visitor profile data, and related state may be stored in the merchant site's local storage or session storage via our embed script.",
      "Merchant admin sessions may use HTTP cookies to keep administrators signed in to the Shop Assist console.",
      "We do not use Shop Assist to run cross-site advertising profiles.",
    ],
  },
  {
    id: "retention",
    title: "Data retention",
    paragraphs: [
      "We retain chat sessions, messages, visitor profiles, analytics records, and merchant configuration for as long as needed to provide the service, support merchants, resolve disputes, enforce agreements, and comply with law.",
      "When a merchant uninstalls Shop Assist or submits a valid shop deletion request through Shopify's compliance webhooks, we delete or de-identify associated merchant and customer session data in accordance with our retention procedures and applicable law.",
    ],
  },
  {
    id: "sharing",
    title: "How we share information",
    paragraphs: [
      "We do not sell personal information. We may share information in the following circumstances:",
    ],
    bullets: [
      "With service providers that help us host, secure, and operate Shop Assist.",
      "With the merchant whose storefront you are visiting, because chat content and shopping context are generated to serve that merchant's customers.",
      "When required by law, regulation, legal process, or governmental request.",
      "To protect the rights, safety, and security of users, merchants, Zapsight, or others.",
      "In connection with a merger, acquisition, financing, or sale of assets, subject to appropriate confidentiality protections.",
    ],
  },
  {
    id: "shopify-compliance",
    title: "Shopify merchant compliance",
    paragraphs: [
      "For Shopify merchants, Shop Assist supports Shopify's mandatory compliance webhooks, including customer data request, customer redaction, and shop redaction events.",
      "Merchants are responsible for providing their own storefront privacy notices and obtaining any required consents from their customers. Shop Assist operates as a service provider/processor on behalf of the merchant for much of the customer interaction data collected through the widget.",
    ],
  },
  {
    id: "your-rights",
    title: "Your privacy rights",
    paragraphs: [
      "Depending on your location, you may have rights to access, correct, delete, restrict, or object to certain processing of your personal information, and to receive a portable copy of information you provided.",
      "Store visitors should contact the merchant whose website they visited to exercise rights related to storefront interactions. We will assist merchants in responding to valid requests where we process data on their behalf.",
      "You may also contact us directly using the details below. We may need to verify your request and may decline requests where an exception applies.",
    ],
  },
  {
    id: "security",
    title: "Security",
    paragraphs: [
      "We use administrative, technical, and organizational measures designed to protect information, including encrypted transport (HTTPS), access controls, tenant isolation, and monitoring. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.",
    ],
  },
  {
    id: "international-transfers",
    title: "International transfers",
    paragraphs: [
      "We and our service providers may process information in the United States and other countries. Where required, we use appropriate safeguards for cross-border transfers of personal information.",
    ],
  },
  {
    id: "children",
    title: "Children's privacy",
    paragraphs: [
      "Shop Assist is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided personal information through the service, contact us and we will take appropriate steps to delete it.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time. The effective date at the top of this page indicates when it last changed. Material changes will be posted on this page. Continued use of Shop Assist after an update means you accept the revised policy, to the extent permitted by law.",
    ],
  },
  {
    id: "contact",
    title: "Contact us",
    paragraphs: [
      "If you have questions about this Privacy Policy or our data practices, contact us at:",
    ],
  },
];
