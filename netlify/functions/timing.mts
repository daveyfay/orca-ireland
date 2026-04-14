// ORCA Ireland — Race Timing API
import type { Context } from "@netlify/functions";
import { getSupabase, verifySessionToken } from "./auth-utils.mts";

const supabase = getSupabase();

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST",
      "Access-Control-Allow-Headers": "Content-Type",
    }});
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = body.action || "events";

  const sessionToken = body.sessionToken || null;
  const member = sessionToken ? await verifySessionToken(sessionToken) : null;
  const isAdmin = member?.is_admin === true;

  // ── PUBLIC: upcoming events ──────────────────────────────────────────────
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

  // ── PUBLIC: entry list ───────────────────────────────────────────────────
  if (action === "entries") {
    const { eventId } = body;
    if (!eventId) return json({ error: "eventId required" }, 400);
    const { data, error } = await supabase
      .from("event_entries")
      .select(`id, class, transponder,
        members(first_name, last_name),
        cars(nickname, make, model, transponder, class)`)
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

  // ── PUBLIC: verify session & role ────────────────────────────────────────
  if (action === "whoami") {
    if (!member) return json({ loggedIn: false, isAdmin: false });
    return json({ loggedIn: true, isAdmin: member.is_admin,
      name: `${member.first_name} ${member.last_name}` });
  }

  // ── PUBLIC: get current live state (fallback for non-Realtime clients) ──
  if (action === "live-state") {
    const { data, error } = await supabase
      .from("timing_live")
      .select("*")
      .eq("id", "current")
      .single();
    if (error) return json({ error: "No live session" }, 404);
    return json({ state: data });
  }

  // ── ADMIN: push live state to Supabase (called on every crossing) ────────
  if (action === "push") {
    if (!isAdmin) return json({ error: "Admin required" }, 403);
    const {
      eventName, eventDate,
      sessKey, sessLabel, sessType,
      timerRemaining, timerTotal, timerRunning,
      qualMethod,
      leaderboard, crossings, heatTimers,
    } = body;

    const { error } = await supabase
      .from("timing_live")
      .upsert({
        id: "current",
        event_name:       eventName   || null,
        event_date:       eventDate   || null,
        sess_key:         sessKey     || null,
        sess_label:       sessLabel   || null,
        sess_type:        sessType    || null,
        timer_remaining:  timerRemaining ?? 0,
        timer_total:      timerTotal     ?? 0,
        timer_running:    timerRunning   ?? false,
        qual_method:      qualMethod  || "best3consec",
        leaderboard:      leaderboard || [],
        crossings:        crossings   || [],
        heat_timers:      heatTimers  || {},
        updated_at:       new Date().toISOString(),
      }, { onConflict: "id" });

    if (error) return json({ error: "DB error: " + error.message }, 500);
    return json({ success: true });
  }

  // ── ADMIN: publish results ───────────────────────────────────────────────
  if (action === "publish") {
    if (!isAdmin) return json({ error: "Admin required" }, 403);
    const { eventName, eventDate, finishers } = body;
    if (!eventName || !eventDate || !finishers) return json({ error: "Missing fields" }, 400);
    const { error } = await supabase.from("race_events").insert({
      event_name: eventName, event_date: eventDate, finishers,
    });
    if (error) return json({ error: "DB error: " + error.message }, 500);
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 400);
};

export const config = { path: "/api/timing" };
