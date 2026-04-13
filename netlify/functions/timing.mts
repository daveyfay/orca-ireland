// ORCA Ireland — Race Timing API
// Public endpoint (no auth) — returns event and entry data for the timing system
// Called from /timing.html on race day

import type { Context } from "@netlify/functions";
import { getSupabase } from "./auth-utils.mts";

const supabase = getSupabase();

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST", "Access-Control-Allow-Headers": "Content-Type" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = body.action || "events";

  // GET upcoming events
  if (action === "events") {
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("events")
      .select("id, name, event_date, description")
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(10);
    if (error) return json({ error: "DB error" }, 500);
    return json({ events: data || [] });
  }

  // GET entries for an event — returns driver names, classes, transponders
  if (action === "entries") {
    const { eventId } = body;
    if (!eventId) return json({ error: "eventId required" }, 400);

    const { data, error } = await supabase
      .from("event_entries")
      .select(`
        id,
        class,
        transponder,
        members(first_name, last_name),
        cars(nickname, make, model, transponder, class)
      `)
      .eq("event_id", eventId)
      .order("class", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return json({ error: "DB error" }, 500);

    const drivers = (data || []).map((e: any) => ({
      id: e.id,
      name: `${e.members.first_name} ${e.members.last_name}`,
      class: e.class,
      transponder: e.transponder || e.cars?.transponder || null,
      carName: `${e.cars?.make || ""} ${e.cars?.model || ""}`.trim(),
    }));

    return json({ drivers });
  }

  // POST results — save timing results back to race_events table
  if (action === "publish") {
    const { eventName, eventDate, finishers } = body;
    if (!eventName || !eventDate || !finishers) return json({ error: "Missing fields" }, 400);

    const { error } = await supabase.from("race_events").insert({
      event_name: eventName,
      event_date: eventDate,
      finishers,
    });
    if (error) return json({ error: "DB error: " + error.message }, 500);
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 400);
};

export const config = { path: "/api/timing" };
