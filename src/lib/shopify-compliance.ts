import { hasDatabase, withDb } from "@/lib/db";
import { getTenantByShopifyShopDomain } from "@/lib/tenant-platform";

type ShopifyCustomerPayload = {
  id?: number;
  email?: string;
  phone?: string;
};

export type ShopifyCustomerDataRequestPayload = {
  shop_id: number;
  shop_domain: string;
  orders_requested?: number[];
  customer?: ShopifyCustomerPayload;
  data_request?: { id?: number };
};

export type ShopifyCustomerRedactPayload = {
  shop_id: number;
  shop_domain: string;
  customer?: ShopifyCustomerPayload;
  orders_to_redact?: number[];
};

export type ShopifyShopRedactPayload = {
  shop_id: number;
  shop_domain: string;
};

export type ShopifyCustomerDataRecord = {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  messages: Array<{
    role: string;
    text: string;
  }>;
  visitorProfile: Record<string, unknown> | null;
};

function normalizeShopDomain(input: string | null | undefined): string {
  return String(input || "").trim().toLowerCase();
}

function buildCustomerSearchTerms(input: {
  customer?: ShopifyCustomerPayload;
  orderIds?: number[];
}): string[] {
  const terms = new Set<string>();
  const customer = input.customer;

  if (customer?.email?.trim()) {
    terms.add(customer.email.trim().toLowerCase());
  }
  if (customer?.phone?.trim()) {
    terms.add(customer.phone.trim());
    terms.add(customer.phone.replace(/\D/g, ""));
  }
  if (typeof customer?.id === "number" && Number.isFinite(customer.id)) {
    terms.add(String(customer.id));
  }

  for (const orderId of input.orderIds || []) {
    if (typeof orderId === "number" && Number.isFinite(orderId)) {
      terms.add(String(orderId));
    }
  }

  return [...terms].filter(Boolean);
}

async function resolveTenantId(shopDomain: string): Promise<string | null> {
  const tenant = await getTenantByShopifyShopDomain(shopDomain);
  return tenant?.tenantId || null;
}

async function findCustomerDataRecords(input: {
  tenantId: string;
  searchTerms: string[];
}): Promise<ShopifyCustomerDataRecord[]> {
  if (!hasDatabase() || input.searchTerms.length === 0) return [];

  return withDb(async (client) => {
    const patterns = input.searchTerms.map((term) => `%${term}%`);
    const messageMatchClause = patterns
      .map((_, index) => `(m.text ILIKE $${index + 2} OR m.parts_json::text ILIKE $${index + 2})`)
      .join(" OR ");

    const sessionResult = await client.query<{
      session_row_id: string;
      client_session_id: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT DISTINCT
         s.id AS session_row_id,
         s.client_session_id,
         s.created_at,
         s.updated_at
       FROM sessions_v2 s
       INNER JOIN messages_v2 m ON m.session_id = s.id
       WHERE s.tenant_id = $1
         AND (${messageMatchClause})
       ORDER BY s.updated_at DESC`,
      [input.tenantId, ...patterns]
    );

    const records: ShopifyCustomerDataRecord[] = [];

    for (const session of sessionResult.rows) {
      const messageResult = await client.query<{ role: string; text: string }>(
        `SELECT role, text
         FROM messages_v2
         WHERE session_id = $1
         ORDER BY sort_order ASC`,
        [session.session_row_id]
      );

      const profileResult = await client.query<{ profile_json: Record<string, unknown> }>(
        `SELECT profile_json
         FROM visitor_profiles
         WHERE tenant_id = $1 AND session_id = $2
         LIMIT 1`,
        [input.tenantId, session.client_session_id]
      );

      records.push({
        sessionId: session.client_session_id,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        messages: messageResult.rows.map((row) => ({
          role: row.role,
          text: row.text,
        })),
        visitorProfile: profileResult.rows[0]?.profile_json ?? null,
      });
    }

    return records;
  });
}

async function deleteCustomerSessions(input: {
  tenantId: string;
  searchTerms: string[];
}): Promise<number> {
  if (!hasDatabase() || input.searchTerms.length === 0) return 0;

  return withDb(async (client) => {
    const patterns = input.searchTerms.map((term) => `%${term}%`);
    const messageMatchClause = patterns
      .map((_, index) => `(m.text ILIKE $${index + 2} OR m.parts_json::text ILIKE $${index + 2})`)
      .join(" OR ");

    const sessionResult = await client.query<{ client_session_id: string }>(
      `SELECT DISTINCT s.client_session_id
       FROM sessions_v2 s
       INNER JOIN messages_v2 m ON m.session_id = s.id
       WHERE s.tenant_id = $1
         AND (${messageMatchClause})`,
      [input.tenantId, ...patterns]
    );

    const sessionIds = sessionResult.rows.map((row) => row.client_session_id);
    if (!sessionIds.length) return 0;

    await client.query("BEGIN");
    try {
      for (const sessionId of sessionIds) {
        await client.query(
          `DELETE FROM sessions_v2 WHERE tenant_id = $1 AND client_session_id = $2`,
          [input.tenantId, sessionId]
        );
        await client.query(
          `DELETE FROM conversation_analytics WHERE tenant_id = $1 AND session_id = $2`,
          [input.tenantId, sessionId]
        );
        await client.query(
          `DELETE FROM visitor_profiles WHERE tenant_id = $1 AND session_id = $2`,
          [input.tenantId, sessionId]
        );
      }
      await client.query("COMMIT");
      return sessionIds.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function handleShopifyCustomerDataRequest(
  payload: ShopifyCustomerDataRequestPayload
): Promise<{ records: ShopifyCustomerDataRecord[] }> {
  const shopDomain = normalizeShopDomain(payload.shop_domain);
  const tenantId = await resolveTenantId(shopDomain);
  const searchTerms = buildCustomerSearchTerms({
    customer: payload.customer,
    orderIds: payload.orders_requested,
  });

  const records =
    tenantId && searchTerms.length
      ? await findCustomerDataRecords({ tenantId, searchTerms })
      : [];

  console.log("[shopify compliance] customers/data_request", {
    shopDomain,
    shopId: payload.shop_id,
    dataRequestId: payload.data_request?.id ?? null,
    customerId: payload.customer?.id ?? null,
    customerEmail: payload.customer?.email ?? null,
    recordsFound: records.length,
  });

  return { records };
}

export async function handleShopifyCustomerRedact(
  payload: ShopifyCustomerRedactPayload
): Promise<{ redactedSessionCount: number }> {
  const shopDomain = normalizeShopDomain(payload.shop_domain);
  const tenantId = await resolveTenantId(shopDomain);
  const searchTerms = buildCustomerSearchTerms({
    customer: payload.customer,
    orderIds: payload.orders_to_redact,
  });

  const redactedSessionCount =
    tenantId && searchTerms.length
      ? await deleteCustomerSessions({ tenantId, searchTerms })
      : 0;

  console.log("[shopify compliance] customers/redact", {
    shopDomain,
    shopId: payload.shop_id,
    customerId: payload.customer?.id ?? null,
    customerEmail: payload.customer?.email ?? null,
    redactedSessionCount,
  });

  return { redactedSessionCount };
}

export async function handleShopifyShopRedact(
  payload: ShopifyShopRedactPayload
): Promise<{ deleted: boolean }> {
  const shopDomain = normalizeShopDomain(payload.shop_domain);
  const tenantId = await resolveTenantId(shopDomain);

  if (!tenantId || !hasDatabase()) {
    console.log("[shopify compliance] shop/redact skipped: tenant not found", {
      shopDomain,
      shopId: payload.shop_id,
    });
    return { deleted: false };
  }

  await withDb(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  console.log("[shopify compliance] shop/redact completed", {
    shopDomain,
    shopId: payload.shop_id,
    tenantId,
  });

  return { deleted: true };
}
