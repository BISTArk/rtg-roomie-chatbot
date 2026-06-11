import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Shopping Assistant Demo",
  description:
    "Preview a reusable storefront shopping assistant widget with configurable theming and branding.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shopifyApiKey = process.env.SHOPIFY_API_KEY?.trim() || "";

  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <head>
        {shopifyApiKey ? (
          <>
            <meta name="shopify-api-key" content={shopifyApiKey} />
            <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
          </>
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
