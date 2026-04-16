// ─── ORCA Ireland — Pre-Registration API ──────────────────────────────────────
// Handles driver pre-registration for upcoming events.
//
// pre_registrations table schema:
// - id: uuid primary key
// - event_id: uuid references events(id)
// - member_id: uuid references members(id) (nullable for guest entries)
// - driver_name: text not null
// - class: text not null (GT or GP)
// - transponder: text (optional)
// - car_number: int (optional)
// - created_at: timestamptz default now()
// - status: text default 'registered' (registered, confirmed, cancelled)

import type { Context } from "@netlify/functions";
import { getSupabase, verifySessionToken, jsonResponse } from "./auth-utils.mts";

const supabase = getSupabase();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

/**
 * Ensure the pre_registrations table exists.
 * This is a graceful check — the function continues even if the table doesn't exist yet.
 */
async function ensureTableExists() {
  try {
    await supabase.from("pre_registrations").select("id").limit(1);
  } catch (err) {
    // Table doesn't exist yet — log but don't fail
    console.log("pre_registrations table not yet created; some features may be unavailable.");
  }
}

interface PreRegistrationRequest {
  action: "register" | "list" | "cancel" | "confirm" | "load-grid";
  eventId?: string;
  driverName?: string;
  class?: string;
  transponder?: string;
  carNumber?: number;
  sessionToken?: string;
  id?: string;
  ids?: string[];
}

/**
 * Register a new driver for an event.
 * If sessionToken is provided, link to member_id; otherwise guest entry.
 */
async function handleRegister(req: PreRegistrationRequest) {
  const { eventId, driverName, class: driverClass, transponder, carNumber, sessionToken } = req;

  if (!eventId || !driverName || !driverClass) {
    return jsonResponse({ error: "Missing eventId, driverName, or class" }, 400);
  }

  if (!["GT", "GP"].includes(driverClass)) {
    return jsonResponse({ error: "class must be GT or GP" }, 400);
  }

  let memberId: string | null = null;
  if (sessionToken) {
    const member = await verifySessionToken(sessionToken);
    if (!member) {
      return jsonResponse({ error: "Invalid or expired session token" }, 401);
    }
    memberId = member.id;
  }

  try {
    const { data, error } = await supabase
      .from("pre_registrations")
      .insert({
        event_id: eventId,
        member_id: memberId,
        driver_name: driverName,
        class: driverClass,
        transponder: transponder || null,
        car_number: carNumber || null,
        status: "registered",
      })
      .select("id")
      .single();

    if (error) throw error;

    return jsonResponse({ success: true, id: data.id }, 201);
  } catch (err: any) {
    console.error("Registration error:", err);
    return jsonResponse(
      { error: "Failed to register: " + (err.message || "Unknown error") },
      500
    );
  }
}

/**
 * List all pre-registrations for an event, sorted by created_at.
 */
async function handleList(req: PreRegistrationRequest) {
  const { eventId } = req;

  if (!eventId) {
    return jsonResponse({ error: "Missing eventId" }, 400);
  }

  try {
    const { data, error } = await supabase
      .from("pre_registrations")
      .select("id, member_id, driver_name, class, transponder, car_number, created_at, status")
      .eq("event_id", eventId)
      .eq("status", "registered")
      .order("created_at", { ascending: true });

    if (error) throw error;

    return jsonResponse({ entries: data || [] }, 200);
  } catch (err: any) {
    console.error("List error:", err);
    return jsonResponse({ error: "Failed to list registrations", entries: [] }, 500);
  }
}

/**
 * Cancel a pre-registration.
 * Only the registrant (via sessionToken) or an admin can cancel.
 */
async function handleCancel(req: PreRegistrationRequest) {
  const { id, sessionToken } = req;

  if (!id || !sessionToken) {
    return jsonResponse({ error: "Missing id or sessionToken" }, 400);
  }

  const member = await verifySessionToken(sessionToken);
  if (!member) {
    return jsonResponse({ error: "Invalid or expired session token" }, 401);
  }

  try {
    // Fetch the registration to check ownership
    const { data: reg, error: fetchErr } = await supabase
      .from("pre_registrations")
      .select("member_id")
      .eq("id", id)
      .single();

    if (fetchErr || !reg) {
      return jsonResponse({ error: "Registration not found" }, 404);
    }

    // Check authorization: owner or admin
    if (reg.member_id !== member.id && !member.is_admin) {
      return jsonResponse({ error: "Unauthorized to cancel this registration" }, 403);
    }

    // Mark as cancelled
    const { error: updateErr } = await supabase
      .from("pre_registrations")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (updateErr) throw updateErr;

    return jsonResponse({ success: true }, 200);
  } catch (err: any) {
    console.error("Cancel error:", err);
    return jsonResponse({ error: "Failed to cancel registration" }, 500);
  }
}

/**
 * Admin confirms entries (marks as confirmed).
 * Only admins can perform this action.
 */
async function handleConfirm(req: PreRegistrationRequest) {
  const { ids, sessionToken } = req;

  if (!ids || ids.length === 0 || !sessionToken) {
    return jsonResponse({ error: "Missing ids or sessionToken" }, 400);
  }

  const member = await verifySessionToken(sessionToken);
  if (!member || !member.is_admin) {
    return jsonResponse({ error: "Admin access required" }, 403);
  }

  try {
    const { error } = await supabase
      .from("pre_registrations")
      .update({ status: "confirmed" })
      .in("id", ids);

    if (error) throw error;

    return jsonResponse({ success: true, count: ids.length }, 200);
  } catch (err: any) {
    console.error("Confirm error:", err);
    return jsonResponse({ error: "Failed to confirm registrations" }, 500);
  }
}

/**
 * Admin loads confirmed pre-registrations into the timing grid format.
 * Returns drivers array ready for injection into timing system state.drivers.
 */
async function handleLoadGrid(req: PreRegistrationRequest) {
  const { eventId, sessionToken } = req;

  if (!eventId || !sessionToken) {
    return jsonResponse({ error: "Missing eventId or sessionToken" }, 400);
  }

  const member = await verifySessionToken(sessionToken);
  if (!member || !member.is_admin) {
    return jsonResponse({ error: "Admin access required" }, 403);
  }

  try {
    const { data, error } = await supabase
      .from("pre_registrations")
      .select("driver_name, class, transponder, car_number")
      .eq("event_id", eventId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Transform to timing grid format
    const drivers = (data || []).map((entry: any) => ({
      name: entry.driver_name,
      class: entry.class,
      transponder: entry.transponder || "",
      carNumber: entry.car_number || null,
    }));

    return jsonResponse({ drivers }, 200);
  } catch (err: any) {
    console.error("Load grid error:", err);
    return jsonResponse({ error: "Failed to load grid", drivers: [] }, 500);
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
    const body = (await request.json()) as PreRegistrationRequest;
    const { action } = body;

    switch (action) {
      case "register":
        return await handleRegister(body);
      case "list":
        return await handleList(body);
      case "cancel":
        return await handleCancel(body);
      case "confirm":
        return await handleConfirm(body);
      case "load-grid":
        return await handleLoadGrid(body);
      default:
        return jsonResponse({ error: "Unknown action: " + action }, 400);
    }
  } catch (err: any) {
    console.error("Handler error:", err);
    return jsonResponse({ error: "Invalid request" }, 400);
  }
}
