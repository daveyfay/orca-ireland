// ─── ORCA Ireland — Audit Log API ────────────────────────────────────────────
// Tracks all changes to race scoring, penalties, and results for transparency.
//
// audit_log table schema:
// - id: uuid primary key default gen_random_uuid()
// - event_id: uuid (nullable)
// - event_name: text
// - event_date: text
// - action_type: text not null (penalty_applied, penalty_removed, result_edited,
//   finish_day, championship_scored, bump_up, manual_crossing, session_started, session_ended)
// - actor_name: text not null (who did it)
// - actor_email: text
// - target_driver: text (nullable)
// - details: jsonb (flexible data per action type)
// - created_at: timestamptz default now()

import type { Context } from "@netlify/functions";
import { getSupabase, verifySessionToken, verifyAdmin, jsonResponse } from "./auth-utils.mts";

const supabase = getSupabase();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

/**
 * Ensure the audit_log table exists.
 * This is a graceful check — the function continues even if the table doesn't exist yet.
 */
async function ensureTableExists() {
  try {
    await supabase.from("audit_log").select("id").limit(1);
  } catch (err) {
    // Table doesn't exist yet — log but don't fail
    console.log("audit_log table not yet created; logging may be unavailable.");
  }
}

interface AuditLogRequest {
  action: "log" | "query" | "event-log";
  sessionToken?: string;
  eventId?: string;
  eventName?: string;
  eventDate?: string;
  actionType?: string;
  targetDriver?: string;
  details?: Record<string, any>;
  driver?: string;
  limit?: number;
  offset?: number;
}

/**
 * Valid action types for audit logging.
 */
const VALID_ACTION_TYPES = [
  "penalty_applied",
  "penalty_removed",
  "result_edited",
  "finish_day",
  "championship_scored",
  "bump_up",
  "manual_crossing",
  "session_started",
  "session_ended",
];

/**
 * Log an audit entry. Admin only.
 */
async function handleLog(req: AuditLogRequest) {
  const { sessionToken, eventId, eventName, eventDate, actionType, targetDriver, details } = req;

  if (!sessionToken || !actionType) {
    return jsonResponse({ error: "Missing sessionToken or actionType" }, 400);
  }

  if (!VALID_ACTION_TYPES.includes(actionType)) {
    return jsonResponse({ error: "Invalid actionType: " + actionType }, 400);
  }

  // Verify admin
  const member = await verifySessionToken(sessionToken);
  if (!member || !member.is_admin) {
    return jsonResponse({ error: "Admin access required" }, 403);
  }

  try {
    const { data, error } = await supabase
      .from("audit_log")
      .insert({
        event_id: eventId || null,
        event_name: eventName || "",
        event_date: eventDate || "",
        action_type: actionType,
        actor_name: `${member.first_name} ${member.last_name}`,
        actor_email: member.email,
        target_driver: targetDriver || null,
        details: details || {},
      })
      .select("id")
      .single();

    if (error) throw error;

    return jsonResponse({ success: true, id: data.id }, 201);
  } catch (err: any) {
    console.error("Audit log error:", err);
    return jsonResponse(
      { error: "Failed to log audit entry: " + (err.message || "Unknown error") },
      500
    );
  }
}

/**
 * Query audit log with optional filters.
 * Admins see all entries; non-admins see only non-sensitive entries.
 */
async function handleQuery(req: AuditLogRequest) {
  const { sessionToken, eventId, actionType, driver, limit = 100, offset = 0 } = req;

  let isAdmin = false;
  if (sessionToken) {
    const member = await verifySessionToken(sessionToken);
    if (member) {
      isAdmin = member.is_admin;
    }
  }

  try {
    let query = supabase.from("audit_log").select("*");

    // Apply filters
    if (eventId) {
      query = query.eq("event_id", eventId);
    }
    if (actionType) {
      query = query.eq("action_type", actionType);
    }
    if (driver) {
      query = query.ilike("target_driver", `%${driver}%`);
    }

    // Non-admins: filter to non-sensitive action types
    if (!isAdmin) {
      const publicActions = [
        "penalty_applied",
        "result_edited",
        "finish_day",
        "championship_scored",
        "bump_up",
      ];
      query = query.in("action_type", publicActions);
    }

    // Order and paginate
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return jsonResponse(
      {
        entries: data || [],
        total: count || 0,
        limit,
        offset,
        isAdmin,
      },
      200
    );
  } catch (err: any) {
    console.error("Query error:", err);
    return jsonResponse(
      { error: "Failed to query audit log", entries: [], total: 0 },
      500
    );
  }
}

/**
 * Get full audit trail for an event. Public read (for transparency).
 */
async function handleEventLog(req: AuditLogRequest) {
  const { eventId } = req;

  if (!eventId) {
    return jsonResponse({ error: "Missing eventId" }, 400);
  }

  try {
    // Public read — show all non-sensitive actions for this event
    const publicActions = [
      "penalty_applied",
      "result_edited",
      "finish_day",
      "championship_scored",
      "bump_up",
    ];

    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .eq("event_id", eventId)
      .in("action_type", publicActions)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return jsonResponse({ entries: data || [] }, 200);
  } catch (err: any) {
    console.error("Event log error:", err);
    return jsonResponse({ error: "Failed to fetch event log", entries: [] }, 500);
  }
}

/**
 * Main handler
 */
export default async function handler(context: Context) {
  const { request } = context;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Ensure table exists (gracefully)
  await ensureTableExists();

  try {
    const body = (await request.json()) as AuditLogRequest;
    const { action } = body;

    switch (action) {
      case "log":
        return await handleLog(body);
      case "query":
        return await handleQuery(body);
      case "event-log":
        return await handleEventLog(body);
      default:
        return jsonResponse({ error: "Unknown action: " + action }, 400);
    }
  } catch (err: any) {
    console.error("Handler error:", err);
    return jsonResponse({ error: "Invalid request" }, 400);
  }
}
