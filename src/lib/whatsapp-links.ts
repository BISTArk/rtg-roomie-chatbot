import { randomUUID } from "crypto";
import { ensurePlatformSchema, hasDatabase, withDb } from "@/lib/db";

export type WhatsAppLinkRecord = {
  id: string;
  tenantId: string;
  clientSessionId: string;
  phoneE164: string;
  activeChannel: "web" | "whatsapp";
  consentAt: string;
  linkedAt: string;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
};

function mapRow(row: {
  id: string;
  tenant_id: string;
  client_session_id: string;
  phone_e164: string;
  active_channel: string;
  consent_at: string;
  linked_at: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
}): WhatsAppLinkRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientSessionId: row.client_session_id,
    phoneE164: row.phone_e164,
    activeChannel: row.active_channel === "web" ? "web" : "whatsapp",
    consentAt: row.consent_at,
    linkedAt: row.linked_at,
    lastInboundAt: row.last_inbound_at,
    lastOutboundAt: row.last_outbound_at,
  };
}

export async function upsertWhatsAppLink(input: {
  tenantId: string;
  clientSessionId: string;
  phoneE164: string;
  consentAt?: string;
}): Promise<WhatsAppLinkRecord> {
  if (!hasDatabase()) {
    throw new Error("DATABASE_URL is required for WhatsApp linking.");
  }
  await ensurePlatformSchema();
  const id = randomUUID();
  const consentAt = input.consentAt || new Date().toISOString();

  return withDb(async (client) => {
    await client.query(
      `DELETE FROM whatsapp_links
       WHERE tenant_id = $1
         AND phone_e164 = $2
         AND client_session_id <> $3`,
      [input.tenantId, input.phoneE164, input.clientSessionId]
    );

    const result = await client.query<{
      id: string;
      tenant_id: string;
      client_session_id: string;
      phone_e164: string;
      active_channel: string;
      consent_at: string;
      linked_at: string;
      last_inbound_at: string | null;
      last_outbound_at: string | null;
    }>(
      `INSERT INTO whatsapp_links (
         id, tenant_id, client_session_id, phone_e164, active_channel, consent_at, linked_at
       ) VALUES ($1, $2, $3, $4, 'whatsapp', $5, NOW())
       ON CONFLICT (tenant_id, client_session_id)
       DO UPDATE SET
         phone_e164 = EXCLUDED.phone_e164,
         active_channel = 'whatsapp',
         consent_at = EXCLUDED.consent_at,
         linked_at = NOW()
       RETURNING *`,
      [id, input.tenantId, input.clientSessionId, input.phoneE164, consentAt]
    );
    return mapRow(result.rows[0]);
  });
}

export async function getWhatsAppLinkByPhone(input: {
  tenantId: string;
  phoneE164: string;
}): Promise<WhatsAppLinkRecord | null> {
  if (!hasDatabase()) return null;
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const result = await client.query<{
      id: string;
      tenant_id: string;
      client_session_id: string;
      phone_e164: string;
      active_channel: string;
      consent_at: string;
      linked_at: string;
      last_inbound_at: string | null;
      last_outbound_at: string | null;
    }>(
      `SELECT *
       FROM whatsapp_links
       WHERE tenant_id = $1 AND phone_e164 = $2
       LIMIT 1`,
      [input.tenantId, input.phoneE164]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  });
}

export async function findWhatsAppLinkByPhone(phoneE164: string): Promise<WhatsAppLinkRecord | null> {
  if (!hasDatabase()) return null;
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const result = await client.query<{
      id: string;
      tenant_id: string;
      client_session_id: string;
      phone_e164: string;
      active_channel: string;
      consent_at: string;
      linked_at: string;
      last_inbound_at: string | null;
      last_outbound_at: string | null;
    }>(
      `SELECT *
       FROM whatsapp_links
       WHERE phone_e164 = $1
       ORDER BY linked_at DESC
       LIMIT 1`,
      [phoneE164]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  });
}

export async function getWhatsAppLinkBySession(input: {
  tenantId: string;
  clientSessionId: string;
}): Promise<WhatsAppLinkRecord | null> {
  if (!hasDatabase()) return null;
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const result = await client.query<{
      id: string;
      tenant_id: string;
      client_session_id: string;
      phone_e164: string;
      active_channel: string;
      consent_at: string;
      linked_at: string;
      last_inbound_at: string | null;
      last_outbound_at: string | null;
    }>(
      `SELECT *
       FROM whatsapp_links
       WHERE tenant_id = $1 AND client_session_id = $2
       LIMIT 1`,
      [input.tenantId, input.clientSessionId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  });
}

export async function touchWhatsAppLinkActivity(input: {
  tenantId: string;
  phoneE164: string;
  direction: "inbound" | "outbound";
}): Promise<void> {
  if (!hasDatabase()) return;
  await ensurePlatformSchema();
  await withDb(async (client) => {
    const column =
      input.direction === "inbound" ? "last_inbound_at" : "last_outbound_at";
    await client.query(
      `UPDATE whatsapp_links
       SET ${column} = NOW()
       WHERE tenant_id = $1 AND phone_e164 = $2`,
      [input.tenantId, input.phoneE164]
    );
  });
}

export async function deleteWhatsAppLinksByPhone(input: {
  tenantId: string;
  phoneTerms: string[];
}): Promise<number> {
  if (!hasDatabase() || input.phoneTerms.length === 0) return 0;
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const patterns = input.phoneTerms.flatMap((term) => {
      const digits = term.replace(/\D/g, "");
      const values = [term.trim()];
      if (digits) values.push(digits, `+${digits}`);
      return values.filter(Boolean);
    });
    const uniquePatterns = [...new Set(patterns)];
    if (!uniquePatterns.length) return 0;

    const clauses = uniquePatterns.map((_, index) => `phone_e164 ILIKE $${index + 2}`);
    const result = await client.query<{ id: string }>(
      `DELETE FROM whatsapp_links
       WHERE tenant_id = $1 AND (${clauses.join(" OR ")})
       RETURNING id`,
      [input.tenantId, ...uniquePatterns.map((pattern) => `%${pattern}%`)]
    );
    return result.rowCount ?? 0;
  });
}

export async function deleteWhatsAppLinksForSessions(input: {
  tenantId: string;
  sessionIds: string[];
}): Promise<void> {
  if (!hasDatabase() || input.sessionIds.length === 0) return;
  await ensurePlatformSchema();
  await withDb(async (client) => {
    await client.query(
      `DELETE FROM whatsapp_links
       WHERE tenant_id = $1 AND client_session_id = ANY($2::text[])`,
      [input.tenantId, input.sessionIds]
    );
  });
}
