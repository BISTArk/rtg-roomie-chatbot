import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { queryDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const sessionId = searchParams.get("sessionId");

    if (!tenantId || !sessionId) {
      return NextResponse.json(
        { error: "tenantId and sessionId are required" },
        { status: 400 }
      );
    }

    const result = await queryDb(
      `
      SELECT
        m.id,
        m.role,
        m.text,
        m.parts_json,
        m.sort_order,
        m.created_at
      FROM messages_v2 m
      INNER JOIN sessions_v2 s ON s.id = m.session_id
      WHERE s.tenant_id = $1 AND s.client_session_id = $2
      ORDER BY m.sort_order ASC
      `,
      [tenantId, sessionId]
    );

    return NextResponse.json({
      messages: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("Failed to fetch session messages:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch messages",
      },
      { status: 500 }
    );
  }
}
