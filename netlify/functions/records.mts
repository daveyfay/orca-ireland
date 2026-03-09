import type { Context } from "@netlify/functions";
import { getSupabase, verifyAdmin, jsonResponse, cachedJsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  const method = req.method;
  const supabase = getSupabase();

  // ── GET: public list of all class records ─────────────────────
  if (method === "GET") {
    const { data, error } = await supabase
      .from("track_records")
      .select("id, class_name, holder_name, lap_time, set_at_event, updated_at")
      .order("class_name");
    if (error) return json({ error: "DB error" }, 500);
    return cachedJsonResponse({ records: data || [] }, 300);
  }

  // ── POST: admin only — upsert a class record ──────────────────
  if (method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const admin = await verifyAdmin(body.username, body.password, body.sessionToken);
  if (!admin) return json({ error: "Unauthorised" }, 403);

  const { class_name, holder_name, lap_time, set_at_event } = body;
  if (!class_name || !holder_name || !lap_time) {
    return json({ error: "class_name, holder_name and lap_time are required" }, 400);
  }

  // Upsert — if a record for this class already exists, update it
  const { data, error } = await supabase
    .from("track_records")
    .upsert(
      { class_name, holder_name, lap_time, set_at_event: set_at_event || null, updated_at: new Date().toISOString() },
      { onConflict: "class_name" }
    )
    .select()
    .single();

  if (error) return json({ error: "DB error", detail: error.message }, 500);
  return json(data);
};

export const config = { path: "/api/records" };
