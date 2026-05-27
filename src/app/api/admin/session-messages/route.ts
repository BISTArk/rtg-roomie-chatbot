import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { queryDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // Verify admin is authenticated
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

    // Fetch messages for the session
    const result = await queryDb(
      `
      SELECT 
        cm.id,
        cm.role,
        cm.text,
        cm.sort_order,
        cm.created_at
      FROM conversation_messages cm
      INNER JOIN conversations c ON c.id = cm.conversation_id
      WHERE c.tenant_id = $1 AND c.session_id = $2
      ORDER BY cm.sort_order ASC
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
