import type { Context } from "@netlify/functions";
import { getSupabase, verifyAdmin, jsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

// Calculate best N scores from a round_scores object
// round_scores: { "1": 96, "2": 100, "3": null, "4": 98 }
function calcStandings(scores: championship_scores[], roundsToCount: number, totalRounds: number) {
  return scores.map(driver => {
    const roundArr: (number | null)[] = [];
    for (let r = 1; r <= totalRounds; r++) {
      const v = driver.round_scores?.[r.toString()];
      roundArr.push(typeof v === 'number' ? v : null);
    }
    const valid = roundArr.filter((v): v is number => v !== null).sort((a, b) => b - a);
    const best = valid.slice(0, roundsToCount);
    const total = best.reduce((sum, v) => sum + v, 0);
    return { ...driver, round_scores: roundArr, total, rounds_counted: best.length };
  }).sort((a, b) => b.total - a.total || b.rounds_counted - a.rounds_counted);
}

interface championship_scores {
  id: string;
  driver_name: string;
  club_number?: string;
  car_make?: string;
  car_model?: string;
  round_scores: Record<string, number | null>;
}

export default async (req: Request, context: Context) => {
  const method = req.method;
  const url = new URL(req.url);
  const supabase = getSupabase();

  // ── GET: fetch all championships with standings ───────────────
  if (method === "GET") {
    const season = url.searchParams.get("season") || new Date().getFullYear().toString();

    const { data: championships, error: cErr } = await supabase
      .from("championships")
      .select("id, name, season, total_rounds, rounds_to_count, sort_order")
      .eq("season", season)
      .eq("active", true)
      .order("sort_order");

    if (cErr) return json({ error: "DB error" }, 500);

    const results = await Promise.all((championships || []).map(async (champ) => {
      const { data: scores } = await supabase
        .from("championship_scores")
        .select("id, driver_name, club_number, car_make, car_model, round_scores")
        .eq("championship_id", champ.id);

      const standings = calcStandings(scores || [], champ.rounds_to_count, champ.total_rounds);
      return { ...champ, standings };
    }));

    return json(results);
  }

  // ── All write operations require admin ────────────────────────
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const admin = await verifyAdmin(body.username, body.password);
  if (!admin) return json({ error: "Unauthorised" }, 403);

  // ── POST: upsert a driver's round score ───────────────────────
  if (method === "POST") {
    const { championship_id, driver_name, club_number, car_make, car_model, round, score } = body;
    if (!championship_id || !driver_name || !round) {
      return json({ error: "championship_id, driver_name and round are required" }, 400);
    }

    // Fetch existing record if any
    const { data: existing } = await supabase
      .from("championship_scores")
      .select("id, round_scores")
      .eq("championship_id", championship_id)
      .eq("driver_name", driver_name)
      .single();

    const currentScores = existing?.round_scores || {};
    const updatedScores = {
      ...currentScores,
      [round.toString()]: score === null || score === "" ? null : Number(score)
    };

    if (existing) {
      const { error } = await supabase
        .from("championship_scores")
        .update({ round_scores: updatedScores, club_number, car_make, car_model })
        .eq("id", existing.id);
      if (error) return json({ error: "DB error", detail: error.message }, 500);
    } else {
      const { error } = await supabase
        .from("championship_scores")
        .insert({ championship_id, driver_name, club_number, car_make, car_model, round_scores: updatedScores });
      if (error) return json({ error: "DB error", detail: error.message }, 500);
    }

    return json({ saved: true });
  }

  // ── PATCH: update championship settings (rounds etc) ─────────
  if (method === "PATCH") {
    const { championship_id, total_rounds, rounds_to_count } = body;
    if (!championship_id) return json({ error: "championship_id required" }, 400);
    const { error } = await supabase
      .from("championships")
      .update({ total_rounds, rounds_to_count })
      .eq("id", championship_id);
    if (error) return json({ error: "DB error" }, 500);
    return json({ updated: true });
  }

  // ── DELETE: remove a driver from a championship ───────────────
  if (method === "DELETE") {
    const { score_id } = body;
    if (!score_id) return json({ error: "score_id required" }, 400);
    const { error } = await supabase.from("championship_scores").delete().eq("id", score_id);
    if (error) return json({ error: "DB error" }, 500);
    return json({ deleted: true });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/championships" };
