import { generateText } from "ai";
import initSqlJs, {
  type Database,
  type SqlJsStatic,
} from "sql.js/dist/sql-asm.js";
import {
  CATALOG_COLUMN_TO_HEADER,
  CATALOG_COLUMNS,
  CATALOG_DB_BASE64,
} from "@/data/catalog-db";
import type {
  BrowsingHistoryEntry,
  ConversationStage,
  PageContext,
  VisitorProfile,
} from "@/lib/system-prompt";

const PRODUCT_RESULT_LIMIT = 12;
const ACCESSORY_RESULT_LIMIT = 3;
const ACCESSORY_CATEGORY_ORDER = ["LIFESTYLE_BASE", "PROTECTOR", "PILLOW", "SHEETS"] as const;
const NO_CATALOG_NOTE = "No catalog rows were injected for this turn. Use page context, conversation history, and the active skill unless a product subset is provided below.";

const COLUMN_TO_HEADER = CATALOG_COLUMN_TO_HEADER as Record<string, string>;
const HEADER_TO_COLUMN = Object.fromEntries(
  Object.entries(COLUMN_TO_HEADER).map(([column, header]) => [header, column])
) as Record<string, string>;

type PlannerModel = Parameters<typeof generateText>[0]["model"];

export type CatalogIntentMode =
  | "none"
  | "product_search"
  | "comparison"
  | "accessory_search"
  | "exact_product";

export type CatalogIntentSort =
  | "relevance"
  | "price_asc"
  | "price_desc"
  | "discount_desc";

export interface CatalogIntent {
  mode: CatalogIntentMode;
  intent_summary: string;
  category: string | null;
  product_names: string[];
  brands: string[];
  mattress_sizes: string[];
  mattress_types: string[];
  sleep_positions: string[];
  support_levels: string[];
  temperature_management: string[];
  comfort: string[];
  discount_only: boolean;
  price_min: number | null;
  price_max: number | null;
  sort: CatalogIntentSort;
  limit: number;
}

export interface RetrievedCatalogRow {
  [column: string]: string | number | null;
}

export interface RetrievedCatalogContext {
  stage: ConversationStage;
  rawUserRequest: string;
  pageContext?: PageContext;
  browsingHistory?: BrowsingHistoryEntry[];
  visitorProfile?: VisitorProfile;
}

export interface CatalogQueryExecution {
  rows: RetrievedCatalogRow[];
  sql: string;
  params: Array<string | number>;
  appliedFilters: string[];
  relaxed: boolean;
}

export type CatalogMode = "retrieval" | "full";

let sqlModulePromise: Promise<SqlJsStatic> | null = null;
let catalogDbBytes: Uint8Array | null = null;

const INTEGER_COLUMNS = new Set(["count_of_reviews"]);
const REAL_COLUMNS = new Set(["avg_star_rating", "sale_price", "regular_price", "discount_percent"]);

function getSqlModule(): Promise<SqlJsStatic> {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs();
  }
  return sqlModulePromise;
}

function getCatalogDbBytes(): Uint8Array {
  if (!catalogDbBytes) {
    catalogDbBytes = Uint8Array.from(Buffer.from(CATALOG_DB_BASE64, "base64"));
  }
  return catalogDbBytes;
}

export async function loadCatalogDb(): Promise<Database> {
  const SQL = await getSqlModule();
  return new SQL.Database(getCatalogDbBytes());
}

function normalizeKey(value: string): string {
  return String(value || "")
    .trim()
    .replace(/[%]/g, " percent ")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toLowerCase();
}

function coerceValueForColumn(column: string, value: unknown): string | number | null {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return null;

  if (INTEGER_COLUMNS.has(column)) {
    const parsed = Number.parseInt(raw.replace(/[^0-9-]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (REAL_COLUMNS.has(column)) {
    const parsed = Number.parseFloat(raw.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return raw;
}

function normalizeRowForCatalogColumns(
  row: Record<string, string | number | null | undefined>
): RetrievedCatalogRow {
  const lookup = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    lookup.set(normalizeKey(key), value);
  }

  const normalized: RetrievedCatalogRow = {};
  for (const column of CATALOG_COLUMNS) {
    const header = COLUMN_TO_HEADER[column] ?? column;
    const value =
      lookup.get(normalizeKey(column)) ??
      lookup.get(normalizeKey(header));
    normalized[column] = coerceValueForColumn(column, value);
  }
  return normalized;
}

function getColumnType(column: string): "TEXT" | "INTEGER" | "REAL" {
  if (INTEGER_COLUMNS.has(column)) return "INTEGER";
  if (REAL_COLUMNS.has(column)) return "REAL";
  return "TEXT";
}

async function buildCatalogDbFromRows(
  rows: Array<Record<string, string | number | null | undefined>>
): Promise<Database> {
  const SQL = await getSqlModule();
  const db = new SQL.Database();
  db.run(
    `CREATE TABLE catalog_products (${CATALOG_COLUMNS.map((column) => `"${column}" ${getColumnType(column)}`).join(", ")});`
  );

  const insertSql = `INSERT INTO catalog_products (${CATALOG_COLUMNS.map((column) => `"${column}"`).join(", ")}) VALUES (${CATALOG_COLUMNS.map(() => "?").join(", ")});`;
  const stmt = db.prepare(insertSql);
  for (const row of rows) {
    const normalized = normalizeRowForCatalogColumns(row);
    stmt.run(CATALOG_COLUMNS.map((column) => normalized[column] ?? null));
  }
  stmt.free();

  return db;
}

export function resolveCatalogMode(rawMode: string | undefined): CatalogMode {
  return rawMode?.trim().toLowerCase() === "full" ? "full" : "retrieval";
}

function sanitizeMode(value: unknown): CatalogIntentMode {
  const allowed: CatalogIntentMode[] = ["none", "product_search", "comparison", "accessory_search", "exact_product"];
  return allowed.includes(value as CatalogIntentMode) ? (value as CatalogIntentMode) : "none";
}

function sanitizeSort(value: unknown): CatalogIntentSort {
  const allowed: CatalogIntentSort[] = ["relevance", "price_asc", "price_desc", "discount_desc"];
  return allowed.includes(value as CatalogIntentSort) ? (value as CatalogIntentSort) : "relevance";
}

function sanitizeStringArray(value: unknown, cap = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean)
    .slice(0, cap);
}

function sanitizeNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeIntent(raw: unknown): CatalogIntent {
  const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    mode: sanitizeMode(input.mode),
    intent_summary: String(input.intent_summary ?? "").trim() || "No catalog lookup needed.",
    category: input.category ? String(input.category).trim() : null,
    product_names: sanitizeStringArray(input.product_names),
    brands: sanitizeStringArray(input.brands),
    mattress_sizes: sanitizeStringArray(input.mattress_sizes),
    mattress_types: sanitizeStringArray(input.mattress_types),
    sleep_positions: sanitizeStringArray(input.sleep_positions),
    support_levels: sanitizeStringArray(input.support_levels),
    temperature_management: sanitizeStringArray(input.temperature_management),
    comfort: sanitizeStringArray(input.comfort),
    discount_only: Boolean(input.discount_only),
    price_min: sanitizeNumber(input.price_min),
    price_max: sanitizeNumber(input.price_max),
    sort: sanitizeSort(input.sort),
    limit: Math.min(Math.max(sanitizeNumber(input.limit) ?? PRODUCT_RESULT_LIMIT, 0), PRODUCT_RESULT_LIMIT),
  };
}

function buildPlannerPrompt(input: {
  stage: ConversationStage;
  messages: Array<{ role: string; text: string }>;
  pageContext?: PageContext;
  browsingHistory?: BrowsingHistoryEntry[];
}): string {
  const latestMessages = input.messages.slice(-8);
  const conversation = latestMessages
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n");
  const history = (input.browsingHistory ?? [])
    .slice(0, 5)
    .map((entry) => `${entry.productName}${entry.productPrice ? ` (${entry.productPrice})` : ""}`)
    .join("; ");

  return [
    `Stage: ${input.stage}`,
    `Current page context: ${JSON.stringify({
      page: input.pageContext?.page,
      productName: input.pageContext?.productName,
      productPrice: input.pageContext?.productPrice,
      productType: input.pageContext?.productType,
      category: input.pageContext?.category,
      cartItems: input.pageContext?.cartItems ?? [],
    })}`,
    `Recent browsing history: ${history || "(none)"}`,
    "Recent conversation:",
    conversation || "(none)",
    "",
    "Return strict JSON only.",
  ].join("\n");
}

export async function planCatalogIntent(input: {
  model: PlannerModel;
  stage: ConversationStage;
  messages: Array<{ role: string; text: string }>;
  pageContext?: PageContext;
  browsingHistory?: BrowsingHistoryEntry[];
}): Promise<CatalogIntent> {
  const plannerSystem = [
    "You are a catalog retrieval planner for a mattress shopping assistant.",
    "Your job is to decide whether a SQL catalog lookup is needed, and if so produce structured filters.",
    "Return JSON only. No markdown, no prose.",
    "Use this exact schema:",
    JSON.stringify({
      mode: "none | product_search | comparison | accessory_search | exact_product",
      intent_summary: "short text",
      category: "string | null",
      product_names: ["string"],
      brands: ["string"],
      mattress_sizes: ["string"],
      mattress_types: ["string"],
      sleep_positions: ["string"],
      support_levels: ["string"],
      temperature_management: ["string"],
      comfort: ["string"],
      discount_only: false,
      price_min: null,
      price_max: null,
      sort: "relevance | price_asc | price_desc | discount_desc",
      limit: PRODUCT_RESULT_LIMIT,
    }),
    "Rules:",
    "- Use mode='none' when the turn is greeting, re-engagement, generic support, or does not need product retrieval.",
    "- Use mode='comparison' when the user is comparing named products.",
    "- Use mode='exact_product' when the user asks about one named product or the current PDP item.",
    "- Use mode='accessory_search' only when the request is explicitly about protectors, pillows, lifestyle bases, or sheets.",
    "- Use mode='product_search' for recommendations, alternatives, similar products, bestsellers, deals, or budget-driven product searches.",
    "- Prefer null/empty arrays over guessing.",
    "- Limit must be between 0 and 12.",
  ].join("\n");

  const result = await generateText({
    model: input.model,
    system: plannerSystem,
    prompt: buildPlannerPrompt(input),
  });

  try {
    return normalizeIntent(JSON.parse(cleanJsonPayload(result.text)));
  } catch {
    return {
      mode: "none",
      intent_summary: "Planner output was invalid JSON. Skipping catalog retrieval.",
      category: null,
      product_names: [],
      brands: [],
      mattress_sizes: [],
      mattress_types: [],
      sleep_positions: [],
      support_levels: [],
      temperature_management: [],
      comfort: [],
      discount_only: false,
      price_min: null,
      price_max: null,
      sort: "relevance",
      limit: 0,
    };
  }
}

function buildWhereAnyLike(column: string, values: string[], params: Array<string | number>): string | null {
  if (values.length === 0) return null;
  const sql = values
    .map(() => `LOWER("${column}") LIKE ?`)
    .join(" OR ");
  for (const value of values) {
    params.push(`%${value.toLowerCase()}%`);
  }
  return `(${sql})`;
}

function buildWhereAnyProductName(values: string[], params: Array<string | number>): string | null {
  if (values.length === 0) return null;
  const clauses: string[] = [];
  for (const value of values) {
    clauses.push(`(LOWER("customer_description") LIKE ? OR LOWER("theme") LIKE ?)`);
    const likeValue = `%${value.toLowerCase()}%`;
    params.push(likeValue, likeValue);
  }
  return `(${clauses.join(" OR ")})`;
}

function buildQueryExecution(intent: CatalogIntent): Omit<CatalogQueryExecution, "rows" | "relaxed"> {
  const params: Array<string | number> = [];
  const where: string[] = [];
  const appliedFilters: string[] = [];

  if (intent.category) {
    where.push(`LOWER("category") = ?`);
    params.push(intent.category.toLowerCase());
    appliedFilters.push(`category=${intent.category}`);
  }

  const productNameClause = buildWhereAnyProductName(intent.product_names, params);
  if (productNameClause) {
    where.push(productNameClause);
    appliedFilters.push(`product_names=${intent.product_names.join(", ")}`);
  }

  const brandsClause = buildWhereAnyLike("specialty_brand", intent.brands, params);
  if (brandsClause) {
    where.push(brandsClause);
    appliedFilters.push(`brands=${intent.brands.join(", ")}`);
  }

  const sizeClause = buildWhereAnyLike("mattress_size", intent.mattress_sizes, params);
  if (sizeClause) {
    where.push(sizeClause);
    appliedFilters.push(`mattress_sizes=${intent.mattress_sizes.join(", ")}`);
  }

  const typeClause = buildWhereAnyLike("mattress_type", intent.mattress_types, params);
  if (typeClause) {
    where.push(typeClause);
    appliedFilters.push(`mattress_types=${intent.mattress_types.join(", ")}`);
  }

  const positionClause = buildWhereAnyLike("sleep_position", intent.sleep_positions, params);
  if (positionClause) {
    where.push(positionClause);
    appliedFilters.push(`sleep_positions=${intent.sleep_positions.join(", ")}`);
  }

  const supportClause = buildWhereAnyLike("support_level", intent.support_levels, params);
  if (supportClause) {
    where.push(supportClause);
    appliedFilters.push(`support_levels=${intent.support_levels.join(", ")}`);
  }

  const tempClause = buildWhereAnyLike("temperature_management", intent.temperature_management, params);
  if (tempClause) {
    where.push(tempClause);
    appliedFilters.push(`temperature_management=${intent.temperature_management.join(", ")}`);
  }

  const comfortClause = buildWhereAnyLike("comfort", intent.comfort, params);
  if (comfortClause) {
    where.push(comfortClause);
    appliedFilters.push(`comfort=${intent.comfort.join(", ")}`);
  }

  if (intent.discount_only) {
    where.push(`LOWER(COALESCE("discount", '')) = 'yes'`);
    appliedFilters.push("discount_only=yes");
  }

  if (intent.price_min != null) {
    where.push(`"sale_price" >= ?`);
    params.push(intent.price_min);
    appliedFilters.push(`price_min=${intent.price_min}`);
  }

  if (intent.price_max != null) {
    where.push(`"sale_price" <= ?`);
    params.push(intent.price_max);
    appliedFilters.push(`price_max=${intent.price_max}`);
  }

  const orderBy =
    intent.sort === "price_asc"
      ? `COALESCE("sale_price", 999999) ASC, COALESCE("avg_star_rating", 0) DESC`
      : intent.sort === "price_desc"
        ? `COALESCE("sale_price", 0) DESC, COALESCE("avg_star_rating", 0) DESC`
        : intent.sort === "discount_desc"
          ? `CASE WHEN LOWER(COALESCE("discount", '')) = 'yes' THEN 1 ELSE 0 END DESC, COALESCE("discount_percent", 0) DESC, COALESCE("sale_price", 999999) ASC`
          : `COALESCE("avg_star_rating", 0) DESC, COALESCE("count_of_reviews", 0) DESC, COALESCE("discount_percent", 0) DESC, COALESCE("sale_price", 999999) ASC`;

  const sql = [
    `SELECT ${CATALOG_COLUMNS.map((column) => `"${column}"`).join(", ")}`,
    `FROM "catalog_products"`,
    where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    `ORDER BY ${orderBy}`,
    `LIMIT ${Math.min(Math.max(intent.limit || PRODUCT_RESULT_LIMIT, 1), PRODUCT_RESULT_LIMIT)}`,
  ]
    .filter(Boolean)
    .join(" ");

  return { sql, params, appliedFilters };
}

function executeSql(db: Database, sql: string, params: Array<string | number>): RetrievedCatalogRow[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: RetrievedCatalogRow[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function looksLikeSimilarRequest(text: string): boolean {
  return /\bsimilar\b|\balternative\b|\balternatives\b|\blike this\b|\bothers like\b/i.test(text);
}

function buildRelaxedIntent(intent: CatalogIntent): CatalogIntent {
  return {
    ...intent,
    brands: [],
    sleep_positions: [],
    support_levels: [],
    temperature_management: [],
    comfort: [],
    discount_only: false,
    sort: intent.sort === "discount_desc" ? "relevance" : intent.sort,
  };
}

function findSimilarRows(db: Database, anchorName: string, limit: number): RetrievedCatalogRow[] {
  const anchorSql = `
    SELECT ${CATALOG_COLUMNS.map((column) => `"${column}"`).join(", ")}
    FROM "catalog_products"
    WHERE LOWER("customer_description") LIKE ? OR LOWER("theme") LIKE ?
    ORDER BY COALESCE("avg_star_rating", 0) DESC, COALESCE("count_of_reviews", 0) DESC
    LIMIT 1
  `;
  const likeValue = `%${anchorName.toLowerCase()}%`;
  const anchorRows = executeSql(db, anchorSql, [likeValue, likeValue]);
  const anchor = anchorRows[0];
  if (!anchor) return [];

  const params: Array<string | number> = [];
  const where: string[] = [];
  if (anchor.category) {
    where.push(`LOWER("category") = ?`);
    params.push(String(anchor.category).toLowerCase());
  }
  if (anchor.mattress_type) {
    where.push(`LOWER(COALESCE("mattress_type", '')) = ?`);
    params.push(String(anchor.mattress_type).toLowerCase());
  }
  if (anchor.temperature_management) {
    where.push(`LOWER(COALESCE("temperature_management", '')) = ?`);
    params.push(String(anchor.temperature_management).toLowerCase());
  }
  if (anchor.comfort) {
    where.push(`LOWER(COALESCE("comfort", '')) = ?`);
    params.push(String(anchor.comfort).toLowerCase());
  }
  if (anchor.customer_description) {
    where.push(`LOWER("customer_description") != ?`);
    params.push(String(anchor.customer_description).toLowerCase());
  }

  const sql = [
    `SELECT ${CATALOG_COLUMNS.map((column) => `"${column}"`).join(", ")}`,
    `FROM "catalog_products"`,
    where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    `ORDER BY COALESCE("avg_star_rating", 0) DESC, COALESCE("count_of_reviews", 0) DESC, COALESCE("sale_price", 999999) ASC`,
    `LIMIT ${Math.max(1, Math.min(limit, PRODUCT_RESULT_LIMIT))}`,
  ].filter(Boolean).join(" ");

  return executeSql(db, sql, params);
}

function runCatalogQueryWithDb(
  db: Database,
  intent: CatalogIntent,
  context: RetrievedCatalogContext
): CatalogQueryExecution {
  if (intent.mode === "none" || intent.limit === 0) {
    return {
      rows: [],
      sql: "-- no catalog query executed",
      params: [],
      appliedFilters: [],
      relaxed: false,
    };
  }

  if (looksLikeSimilarRequest(context.rawUserRequest) && intent.product_names.length > 0) {
    const rows = findSimilarRows(db, intent.product_names[0], intent.limit || PRODUCT_RESULT_LIMIT);
    if (rows.length > 0) {
      return {
        rows,
        sql: "-- similar-product expansion query",
        params: [intent.product_names[0]],
        appliedFilters: [`similar_to=${intent.product_names[0]}`],
        relaxed: false,
      };
    }
  }

  const firstPass = buildQueryExecution(intent);
  let rows = executeSql(db, firstPass.sql, firstPass.params);
  if (rows.length > 0) {
    return {
      rows,
      sql: firstPass.sql,
      params: firstPass.params,
      appliedFilters: firstPass.appliedFilters,
      relaxed: false,
    };
  }

  const relaxedIntent = buildRelaxedIntent(intent);
  const secondPass = buildQueryExecution(relaxedIntent);
  rows = executeSql(db, secondPass.sql, secondPass.params);
  return {
    rows,
    sql: secondPass.sql,
    params: secondPass.params,
    appliedFilters: secondPass.appliedFilters,
    relaxed: true,
  };
}

export async function queryCatalog(
  intent: CatalogIntent,
  context: RetrievedCatalogContext
): Promise<CatalogQueryExecution> {
  const db = await loadCatalogDb();
  try {
    return runCatalogQueryWithDb(db, intent, context);
  } finally {
    db.close();
  }
}

export async function queryCatalogFromRows(
  rows: Array<Record<string, string | number | null | undefined>>,
  intent: CatalogIntent,
  context: RetrievedCatalogContext
): Promise<CatalogQueryExecution> {
  const db = await buildCatalogDbFromRows(rows);
  try {
    return runCatalogQueryWithDb(db, intent, context);
  } finally {
    db.close();
  }
}

export async function queryFullCatalog(limit = 5000): Promise<CatalogQueryExecution> {
  const db = await loadCatalogDb();
  try {
    const sql = [
      `SELECT ${CATALOG_COLUMNS.map((column) => `"${column}"`).join(", ")}`,
      `FROM "catalog_products"`,
      `ORDER BY COALESCE("avg_star_rating", 0) DESC, COALESCE("count_of_reviews", 0) DESC, COALESCE("sale_price", 999999) ASC`,
      `LIMIT ${Math.max(1, Math.min(limit, 5000))}`,
    ].join(" ");

    return {
      rows: executeSql(db, sql, []),
      sql,
      params: [],
      appliedFilters: ["full_catalog=yes"],
      relaxed: false,
    };
  } finally {
    db.close();
  }
}

function formatValue(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).trim();
}

export function buildCatalogPlaceholder(note = NO_CATALOG_NOTE): string {
  return [
    "# RETRIEVED CATALOG CONTEXT",
    "",
    note,
    "",
    "## CATALOG DATA",
    "",
    "(none)",
  ].join("\n");
}

export function formatRetrievedCatalog(
  execution: CatalogQueryExecution,
  options: { intent: CatalogIntent }
): string {
  if (execution.rows.length === 0) {
    return [
      "# RETRIEVED CATALOG CONTEXT",
      "",
      `- **Intent summary:** ${options.intent.intent_summary}`,
      `- **Applied filters:** ${execution.appliedFilters.length > 0 ? execution.appliedFilters.join("; ") : "(none)"}`,
      `- **Result count:** 0`,
      `- **Relaxed filters:** ${execution.relaxed ? "yes" : "no"}`,
      "",
      "## CATALOG DATA",
      "",
      "(none)",
    ].join("\n");
  }

  const headers = CATALOG_COLUMNS.map((column) => COLUMN_TO_HEADER[column]);
  const headerLine = headers.join(" | ");
  const separatorLine = headers.map(() => "---").join(" | ");
  const dataLines = execution.rows.map((row) =>
    CATALOG_COLUMNS.map((column) => formatValue(row[column])).join(" | ")
  );

  return [
    "# RETRIEVED CATALOG CONTEXT",
    "",
    `- **Intent summary:** ${options.intent.intent_summary}`,
    `- **Applied filters:** ${execution.appliedFilters.length > 0 ? execution.appliedFilters.join("; ") : "(none)"}`,
    `- **Result count:** ${execution.rows.length}`,
    `- **Relaxed filters:** ${execution.relaxed ? "yes" : "no"}`,
    "",
    "## CATALOG DATA",
    "",
    headerLine,
    separatorLine,
    ...dataLines,
  ].join("\n");
}

function rowMatchesCart(row: RetrievedCatalogRow, cartItems: string[]): boolean {
  const haystacks = [
    formatValue(row.customer_description).toLowerCase(),
    formatValue(row.theme).toLowerCase(),
    formatValue(row.sku_number).toLowerCase(),
  ];

  return cartItems.some((item) => {
    const needle = item.toLowerCase();
    return haystacks.some((haystack) => haystack && (haystack.includes(needle) || needle.includes(haystack)));
  });
}

function formatAccessoryRow(row: RetrievedCatalogRow): string {
  const price =
    row.sale_price && row.regular_price && row.sale_price !== row.regular_price
      ? `$${row.sale_price} (reg $${row.regular_price})`
      : row.sale_price
        ? `$${row.sale_price}`
        : row.regular_price
          ? `$${row.regular_price}`
          : "n/a";

  return [
    formatValue(row.customer_description) || "(no description)",
    row.specialty_brand ? `Brand: ${row.specialty_brand}` : null,
    row.mattress_size ? `Size: ${row.mattress_size}` : null,
    `Price: ${price}`,
    row.discount ? `Discount: ${row.discount}` : null,
    row.discount_percent ? `Discount %: ${row.discount_percent}` : null,
    row.sku_number ? `SKU: ${row.sku_number}` : null,
    row.image_1 ? `Image: ${row.image_1}` : null,
    row.product_link ? `Link: ${row.product_link}` : null,
    row.shopify_variant_id ? `Shopify Variant ID: ${row.shopify_variant_id}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function fetchAccessoryRows(category: string): Promise<RetrievedCatalogRow[]> {
  const db = await loadCatalogDb();
  try {
    const sql = `
      SELECT ${CATALOG_COLUMNS.map((column) => `"${column}"`).join(", ")}
      FROM "catalog_products"
      WHERE LOWER("category") = ?
      ORDER BY CASE WHEN LOWER(COALESCE("discount", '')) = 'yes' THEN 1 ELSE 0 END DESC,
               COALESCE("discount_percent", 0) DESC,
               COALESCE("sale_price", 999999) ASC
      LIMIT 12
    `;
    return executeSql(db, sql, [category.toLowerCase()]);
  } finally {
    db.close();
  }
}

export async function getAccessorySubset(context: { cartItems?: string[] | null }): Promise<string> {
  const cartItems = (context.cartItems ?? []).map((item) => item.trim()).filter(Boolean);
  const sections: string[] = ["# ACCESSORY CATALOG", ""];
  sections.push(
    "All accessory products come from the same Upload sheet as the mattresses, filtered by category and current cart context. Use the Shopify Variant ID for Add to Cart exactly as you would for a mattress.",
    ""
  );

  for (const category of ACCESSORY_CATEGORY_ORDER) {
    const rows = (await fetchAccessoryRows(category))
      .filter((row) => !rowMatchesCart(row, cartItems))
      .slice(0, ACCESSORY_RESULT_LIMIT);
    if (rows.length === 0) continue;

    if (category === "LIFESTYLE_BASE") {
      sections.push("## LIFESTYLE BASES");
      sections.push(
        "Best suggested for customers with back discomfort, hip discomfort, reflux, snoring, or lifestyle upgrade (reading, TV, elevated legs). Match size to the customer's mattress.",
        "Tier guide:",
        "- BaseLogic Silver: Entry-level (head/foot articulation).",
        "- BaseLogic Platinum: Mid-tier (adds massage, USB, wireless remote).",
        "- Tempur-Ergo 3.0 / 3.0 Smart / ProSmart: Premium tier.",
        "- Adapt Pro-LO / Pro-HI / ProAdjust: Tempur-Pedic-compatible premium bases.",
        "- House-label performance tiers: merchant-specific premium adjustable-base lineup.",
        "- EASE 4.0: Stearns & Foster base option.",
        ""
      );
    } else if (category === "PROTECTOR") {
      sections.push("## MATTRESS PROTECTORS");
      sections.push(
        "Three BEDGEAR tiers — always match the size to the customer's mattress size:",
        "- iProtect: Entry-level waterproof protection. Reliable, affordable.",
        "- Dri-Tec: Moisture-wicking, breathable. Default for most customers.",
        "- Ver-Tex: Premium breathable cover with active temperature management. Best for hot sleepers.",
        ""
      );
    } else if (category === "PILLOW") {
      sections.push("## PILLOWS");
      sections.push(
        "BEDGEAR loft number maps to sleep position:",
        "- 0.0 = Stomach sleepers (flattest)",
        "- 1.0 = Side sleepers, lighter build",
        "- 2.0 = Side sleepers, average/heavier (default for side sleepers)",
        "- 3.0 = Back sleepers",
        "- Combo sleepers → 2.0 default",
        "Night Ice: hot sleepers. Storm: all-around. Aspen: entry-level. Tempurpedic Breeze: premium hot-sleeper. Tempurpedic Adapt: premium conforming. Casper Snow: temperature-managed at mid-price.",
        ""
      );
    } else if (category === "SHEETS") {
      sections.push("## SHEETS");
      sections.push(
        "Match sheet size to the customer's mattress size. Reference the catalog rows below for exact products.",
        ""
      );
    }

    sections.push(...rows.map((row) => `- ${formatAccessoryRow(row)}`), "");
  }

  return sections.join("\n");
}

export async function fetchContextualCatalogData(pageContext?: PageContext): Promise<string> {
  if (!pageContext?.productName) {
    return buildCatalogPlaceholder();
  }

  const intent: CatalogIntent = {
    mode: "exact_product",
    intent_summary: `Fetch exact row for current PDP item: ${pageContext.productName}`,
    category: pageContext.category ?? null,
    product_names: [pageContext.productName],
    brands: [],
    mattress_sizes: pageContext.productSku ? [] : [],
    mattress_types: pageContext.productType ? [pageContext.productType] : [],
    sleep_positions: [],
    support_levels: [],
    temperature_management: [],
    comfort: [],
    discount_only: false,
    price_min: null,
    price_max: null,
    sort: "relevance",
    limit: 1,
  };

  const execution = await queryCatalog(intent, {
    stage: "contextual",
    rawUserRequest: pageContext.productName,
    pageContext,
  });
  return execution.rows.length > 0
    ? formatRetrievedCatalog(execution, { intent })
    : buildCatalogPlaceholder();
}

export function needsCatalogRetrieval(stage: ConversationStage): boolean {
  return !["returning", "reengagement", "interjection", "new-session", "complaint", "upsell"].includes(stage);
}

export function getLastUserText(messages: Array<{ role: string; text: string }>): string {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  return lastUser?.text ?? "";
}

export function getContextualMissingProductFields(pageContext?: PageContext): boolean {
  if (!pageContext?.productName) return false;
  return !pageContext.productPrice || !pageContext.productDescription || !pageContext.productType || !pageContext.productVendor;
}

export function mapRowsToHeaders(rows: RetrievedCatalogRow[]): Array<Record<string, string | number | null>> {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([column, value]) => [COLUMN_TO_HEADER[column] ?? column, value])
    )
  );
}

export const CATALOG_HEADER_TO_COLUMN = HEADER_TO_COLUMN;
