import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import type { PersistedChatMessage } from "@/lib/chat-types";
import type { SessionHistoryItem, SessionState } from "@/lib/platform-types";
import type { VisitorProfile } from "@/lib/visitor-profile";
import { ensurePlatformSchema, hasDatabase, withDb } from "@/lib/db";

function sanitizeMessages(messages: PersistedChatMessage[] | null | undefined): PersistedChatMessage[] {
  if (!Array.isArray(messages)) return [];
  const seen = new Set<string>();
  const normalized: PersistedChatMessage[] = [];

  for (const message of messages) {
    if (
      typeof message !== "object" ||
      message === null ||
      typeof message.id !== "string" ||
      message.id === "welcome" ||
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.text !== "string" ||
      seen.has(message.id)
    ) {
      continue;
    }
    seen.add(message.id);
    normalized.push(message);
  }

  return normalized
    .map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      ...(Array.isArray(message.parts) && message.parts.length > 0
        ? { parts: message.parts }
        : {}),
    }))
    .slice(-100);
}

function buildSessionTitle(messages: PersistedChatMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user" && message.text.trim());
  if (!firstUser) return "New Chat";
  return firstUser.text.slice(0, 50) + (firstUser.text.length > 50 ? "..." : "");
}

function buildSessionPreview(messages: PersistedChatMessage[]): string {
  const lastMessage = [...messages].reverse().find((message) => message.text.trim());
  if (!lastMessage) return "";
  return lastMessage.text.slice(0, 80) + (lastMessage.text.length > 80 ? "..." : "");
}

function sanitizeSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

export async function ensureSessionRecord(
  client: PoolClient,
  input: {
    tenantId: string;
    clientSessionId: string;
    hostOrigin?: string | null;
    lastPageUrl?: string | null;
    title?: string;
    previewText?: string;
  }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO sessions_v2 (
      id, tenant_id, client_session_id, host_origin, last_page_url, title, preview_text
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (tenant_id, client_session_id)
    DO UPDATE SET
      host_origin = COALESCE(EXCLUDED.host_origin, sessions_v2.host_origin),
      last_page_url = COALESCE(EXCLUDED.last_page_url, sessions_v2.last_page_url),
      title = COALESCE(NULLIF(EXCLUDED.title, ''), sessions_v2.title),
      preview_text = COALESCE(NULLIF(EXCLUDED.preview_text, ''), sessions_v2.preview_text),
      updated_at = NOW()
    RETURNING id`,
    [
      randomUUID(),
      input.tenantId,
      input.clientSessionId,
      input.hostOrigin ?? null,
      input.lastPageUrl ?? null,
      input.title ?? "New Chat",
      input.previewText ?? "",
    ]
  );

  return result.rows[0].id;
}

export async function loadAiSdkSessionState(
  tenantId: string,
  clientSessionId: string
): Promise<SessionState> {
  if (!hasDatabase()) {
    return { sessionId: clientSessionId, messages: [], visitorProfile: null };
  }

  await ensurePlatformSchema();
  return withDb(async (client) => {
    const sessionResult = await client.query<{
      id: string;
      updated_at: string;
      suggestions_json: string[] | null;
    }>(
      `SELECT id, updated_at, suggestions_json
       FROM sessions_v2
       WHERE tenant_id = $1 AND client_session_id = $2
       LIMIT 1`,
      [tenantId, clientSessionId]
    );
    const session = sessionResult.rows[0];

    let messages: PersistedChatMessage[] = [];
    if (session) {
      const rows = await client.query<{
        id: string;
        role: "user" | "assistant";
        text: string;
        parts_json: PersistedChatMessage["parts"] | null;
      }>(
        `SELECT id, role, text, parts_json
         FROM messages_v2
         WHERE session_id = $1
         ORDER BY sort_order ASC`,
        [session.id]
      );
      messages = rows.rows.map((row) => ({
        id: row.id,
        role: row.role,
        text: row.text,
        ...(row.parts_json ? { parts: row.parts_json } : {}),
      }));
    }

    const profileResult = await client.query<{ profile_json: VisitorProfile }>(
      `SELECT profile_json FROM visitor_profiles WHERE tenant_id = $1 AND session_id = $2 LIMIT 1`,
      [tenantId, clientSessionId]
    );

    return {
      sessionId: clientSessionId,
      messages,
      visitorProfile: profileResult.rows[0]?.profile_json ?? null,
      suggestions: sanitizeSuggestions(session?.suggestions_json),
      updatedAt: session?.updated_at,
    };
  });
}

export async function saveAiSdkSessionState(input: {
  tenantId: string;
  sessionId: string;
  hostOrigin?: string | null;
  lastPageUrl?: string | null;
  messages: PersistedChatMessage[];
  visitorProfile?: VisitorProfile | null;
  suggestions?: string[] | null;
}): Promise<void> {
  if (!hasDatabase()) return;
  await ensurePlatformSchema();

  const sanitizedMessages = sanitizeMessages(input.messages);
  const sanitizedSuggestions =
    input.suggestions === undefined
      ? undefined
      : sanitizeSuggestions(input.suggestions);
  const title = buildSessionTitle(sanitizedMessages);
  const previewText = buildSessionPreview(sanitizedMessages);

  await withDb(async (client) => {
    await client.query("BEGIN");
    try {
      const sessionRowId = await ensureSessionRecord(client, {
        tenantId: input.tenantId,
        clientSessionId: input.sessionId,
        hostOrigin: input.hostOrigin,
        lastPageUrl: input.lastPageUrl,
        title,
        previewText,
      });

      if (sanitizedSuggestions !== undefined) {
        await client.query(
          `UPDATE sessions_v2
           SET suggestions_json = $1::jsonb, updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(sanitizedSuggestions), sessionRowId]
        );
      }

      await client.query(`DELETE FROM messages_v2 WHERE session_id = $1`, [sessionRowId]);

      for (let index = 0; index < sanitizedMessages.length; index++) {
        const message = sanitizedMessages[index];
        await client.query(
          `INSERT INTO messages_v2 (id, session_id, sort_order, role, text, parts_json)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            message.id || randomUUID(),
            sessionRowId,
            index,
            message.role,
            message.text,
            message.parts?.length ? JSON.stringify(message.parts) : null,
          ]
        );
      }

      if (input.visitorProfile) {
        await client.query(
          `INSERT INTO visitor_profiles (id, tenant_id, session_id, profile_json)
           VALUES ($1, $2, $3, $4::jsonb)
           ON CONFLICT (tenant_id, session_id)
           DO UPDATE SET profile_json = EXCLUDED.profile_json, updated_at = NOW()`,
          [randomUUID(), input.tenantId, input.sessionId, JSON.stringify(input.visitorProfile)]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function listAiSdkSessionHistory(
  tenantId: string,
  limit = 20
): Promise<SessionHistoryItem[]> {
  if (!hasDatabase()) return [];
  await ensurePlatformSchema();

  return withDb(async (client) => {
    const sessions = await client.query<{
      client_session_id: string;
      title: string;
      preview_text: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT client_session_id, title, preview_text, created_at, updated_at
       FROM sessions_v2
       WHERE tenant_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [tenantId, Math.max(1, Math.min(limit, 100))]
    );

    const items: SessionHistoryItem[] = [];
    for (const row of sessions.rows) {
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM messages_v2 m
         INNER JOIN sessions_v2 s ON s.id = m.session_id
         WHERE s.tenant_id = $1 AND s.client_session_id = $2`,
        [tenantId, row.client_session_id]
      );

      items.push({
        sessionId: row.client_session_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        title: row.title || "New Chat",
        previewText: row.preview_text || "",
        messageCount: Number.parseInt(countResult.rows[0]?.count || "0", 10),
      });
    }

    return items;
  });
}

export async function deleteAiSdkSessionHistory(input: {
  tenantId: string;
  sessionId: string;
}): Promise<void> {
  if (!hasDatabase()) return;
  await ensurePlatformSchema();

  await withDb(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `DELETE FROM sessions_v2 WHERE tenant_id = $1 AND client_session_id = $2`,
        [input.tenantId, input.sessionId]
      );

      await client.query(
        `DELETE FROM conversation_analytics WHERE tenant_id = $1 AND session_id = $2`,
        [input.tenantId, input.sessionId]
      );
      await client.query(
        `DELETE FROM visitor_profiles WHERE tenant_id = $1 AND session_id = $2`,
        [input.tenantId, input.sessionId]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
