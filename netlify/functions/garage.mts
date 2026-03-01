import type { Context } from "@netlify/functions";
import { getSupabase, verifySession, jsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  const method = req.method;
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = body.action || "list";

  if (!["POST", "PUT", "DELETE"].includes(method)) {
    return json({ error: "Method not allowed" }, 405);
  }

  // Auth — require username + password on every request
  const username = body.username;
  const password = body.password;

  const member = await verifySession(username, password);
  if (!member) return json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase();

  // LIST CARS
  if (method === "POST" && action === "list") {
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
    if (!["gt", "gp"].includes(carClass)) {
      return json({ error: "Invalid car class" }, 400);
    }
    const { data, error } = await supabase.from("cars").insert({
      member_id: member.id,
      nickname: nickname.trim().slice(0, 50),
      make: make.trim().slice(0, 50),
      model: model.trim().slice(0, 50),
      color: color.trim().slice(0, 30),
      class: carClass,
      transponder: transponder?.trim().slice(0, 20) || null,
      notes: notes?.trim().slice(0, 200) || null,
    }).select().single();
    if (error) return json({ error: "Database error" }, 500);
    return json({ success: true, car: data });
  }

  // UPDATE CAR
  if (method === "PUT" && action === "update") {
    const { carId, nickname, make, model, color, carClass, transponder, notes } = body;
    if (!carId) return json({ error: "Car ID required" }, 400);
    if (carClass && !["gt", "gp"].includes(carClass)) {
      return json({ error: "Invalid car class" }, 400);
    }

    // Verify ownership server-side
    const { data: existing } = await supabase.from("cars").select("member_id").eq("id", carId).single();
    if (!existing || existing.member_id !== member.id) return json({ error: "Not found" }, 404);

    const { data, error } = await supabase.from("cars").update({
      nickname: nickname?.trim().slice(0, 50),
      make: make?.trim().slice(0, 50),
      model: model?.trim().slice(0, 50),
      color: color?.trim().slice(0, 30),
      class: carClass,
      transponder: transponder?.trim().slice(0, 20) || null,
      notes: notes?.trim().slice(0, 200) || null,
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

export const config = { path: "/api/garage" };
