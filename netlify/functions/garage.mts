import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL")!,
  Netlify.env.get("SUPABASE_SERVICE_KEY")!
);

// Simple session check — get member from username in request
async function getMember(username: string) {
  const { data } = await supabase
    .from("members")
    .select("id, first_name, last_name, expiry_date")
    .eq("username", username.toLowerCase().trim())
    .single();
  return data;
}

export default async (req: Request, context: Context) => {
  const method = req.method;
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "list";

  if (!["GET", "POST", "PUT", "DELETE"].includes(method)) {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: any = {};
  if (method !== "GET") {
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  }

  // Auth — require username
  const username = method === "GET" ? url.searchParams.get("username") : body.username;
  if (!username) return json({ error: "Unauthorized" }, 401);

  const member = await getMember(username);
  if (!member) return json({ error: "Unauthorized" }, 401);

  // LIST CARS
  if (method === "GET" && action === "list") {
    const { data: cars, error } = await supabase
      .from("cars")
      .select("*")
      .eq("member_id", member.id)
      .order("created_at", { ascending: true });
    if (error) return json({ error: "Database error" }, 500);
    return json({ cars });
  }

  // ADD CAR
  if (method === "POST" && action === "add") {
    const { nickname, make, model, color, carClass, transponder, notes } = body;
    if (!nickname || !make || !model || !color || !carClass) {
      return json({ error: "Missing required fields" }, 400);
    }
    const { data, error } = await supabase.from("cars").insert({
      member_id: member.id,
      nickname: nickname.trim(),
      make: make.trim(),
      model: model.trim(),
      color: color.trim(),
      class: carClass,
      transponder: transponder?.trim() || null,
      notes: notes?.trim() || null,
    }).select().single();
    if (error) return json({ error: "Database error" }, 500);
    return json({ success: true, car: data });
  }

  // UPDATE CAR
  if (method === "PUT" && action === "update") {
    const { carId, nickname, make, model, color, carClass, transponder, notes } = body;
    if (!carId) return json({ error: "Car ID required" }, 400);

    // Verify ownership
    const { data: existing } = await supabase.from("cars").select("member_id").eq("id", carId).single();
    if (!existing || existing.member_id !== member.id) return json({ error: "Not found" }, 404);

    const { data, error } = await supabase.from("cars").update({
      nickname: nickname?.trim(),
      make: make?.trim(),
      model: model?.trim(),
      color: color?.trim(),
      class: carClass,
      transponder: transponder?.trim() || null,
      notes: notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", carId).select().single();
    if (error) return json({ error: "Database error" }, 500);
    return json({ success: true, car: data });
  }

  // DELETE CAR
  if (method === "DELETE" && action === "delete") {
    const { carId } = body;
    if (!carId) return json({ error: "Car ID required" }, 400);

    const { data: existing } = await supabase.from("cars").select("member_id").eq("id", carId).single();
    if (!existing || existing.member_id !== member.id) return json({ error: "Not found" }, 404);

    const { error } = await supabase.from("cars").delete().eq("id", carId);
    if (error) return json({ error: "Database error" }, 500);
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 400);
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { path: "/api/garage" };
