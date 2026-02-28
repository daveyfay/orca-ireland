import type { Context } from "@netlify/functions";
import { getSupabase, verifyAdmin, verifySession, jsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  const method = req.method;
  const url = new URL(req.url);
  const supabase = getSupabase();

  // ── GET: public list of all event results ─────────────────────
  if (method === "GET") {
    const { data, error } = await supabase
      .from("race_events")
      .select("id, event_name, event_date, finishers")
      .order("event_date", { ascending: false });
    if (error) return json({ error: "DB error" }, 500);
    return json(data || []);
  }

  // ── POST / DELETE: admin only ─────────────────────────────────
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const admin = await verifyAdmin(body.username, body.password);
  if (!admin) return json({ error: "Unauthorised" }, 403);

  // POST: create new event result
  if (method === "POST") {
    const { event_name, event_date, finishers } = body;
    if (!event_name || !event_date) return json({ error: "event_name and event_date required" }, 400);
    const { data, error } = await supabase
      .from("race_events")
      .insert({ event_name, event_date, finishers: finishers || [] })
      .select()
      .single();
    if (error) return json({ error: "DB error", detail: error.message }, 500);
    return json(data, 201);
  }

  // DELETE: remove event by id
  if (method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, 400);
    const { error } = await supabase.from("race_events").delete().eq("id", id);
    if (error) return json({ error: "DB error" }, 500);
    return json({ deleted: true });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/results" };
