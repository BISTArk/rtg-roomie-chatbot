import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..", "..", "..");

function usage() {
  console.error("Usage: node ./scripts/sync-theme-embed-url.mjs <shopify-config-file>");
}

function extractApplicationUrl(toml) {
  const match = toml.match(/^application_url\s*=\s*"([^"]+)"\s*$/m);
  if (!match?.[1]) {
    throw new Error("Could not find application_url in Shopify app config.");
  }

  const value = match[1].trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(value)) {
    throw new Error(`Invalid application_url: ${value}`);
  }

  return value;
}

function renderTemplate(template, appBaseUrl) {
  return template.replace(/__SHOP_ASSIST_APP_BASE_URL__/g, appBaseUrl);
}

const configArg = process.argv[2];

if (!configArg) {
  usage();
  process.exit(1);
}

const configPath = path.resolve(projectRoot, configArg);
const templatePath = path.join(projectRoot, "templates", "shop-assist.template.liquid");
const extensionBlockPath = path.join(projectRoot, "extensions", "chatbot", "blocks", "shop-assist.liquid");
const scaffoldBlockPath = path.join(workspaceRoot, "shopify", "theme-app-extension", "blocks", "shop-assist.liquid");

const applicationUrl = extractApplicationUrl(readFileSync(configPath, "utf8"));
const template = readFileSync(templatePath, "utf8");
const rendered = renderTemplate(template, applicationUrl);

writeFileSync(extensionBlockPath, rendered);
writeFileSync(scaffoldBlockPath, rendered);

console.log(`Synced Shop Assist embed block to ${applicationUrl}`);
