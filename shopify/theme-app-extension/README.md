# Theme App Embed scaffold

This folder contains a minimal Shopify Theme App Embed block scaffold for the chatbot.

## What it does

- Loads the Vercel-hosted app route `/api/shopify/theme-embed`
- Passes the current shop domain automatically using `shop.permanent_domain`
- Lets Shopify theme editors override a few presentation labels/colors
- Relies on the app backend to resolve the correct tenant from the connected Shopify shop

## File

- `blocks/shop-assist.liquid`

## How to use

1. Create or open your Shopify app extension project.
2. Copy `blocks/shop-assist.liquid` into the extension's `blocks/` folder.
3. Replace the default `app_base_url` value with your production Vercel URL if needed.
4. Deploy the app extension through your Shopify app workflow.
5. In the merchant's Theme Editor, enable the app embed and save.

## Expected backend support

This repo already provides:

- `/api/shopify/theme-embed`
- `/api/widget/public-config`
- `/embed.js`
- shop-domain to tenant resolution

So one Shopify shop maps to one tenant automatically after install.
