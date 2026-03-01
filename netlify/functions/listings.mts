import type { Context } from "@netlify/functions";
import { getSupabase, verifyAdmin, jsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  const method = req.method;
  const url = new URL(req.url);
  const supabase = getSupabase();

  // ── GET: public list of active listings ──────────────────────
  if (method === "GET") {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("id, title, price, seller_name, image_url, description, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) return json({ error: "DB error" }, 500);
    return json(data || []);
  }

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const admin = await verifyAdmin(body.username, body.password);
  if (!admin) return json({ error: "Unauthorised" }, 403);

  // ── POST: create listing ──────────────────────────────────────
  if (method === "POST") {
    const { title, price, seller_email, seller_name, image_url, description } = body;
    if (!title || !price || !seller_email || !seller_name) {
      return json({ error: "title, price, seller_email and seller_name are required" }, 400);
    }
    const { data, error } = await supabase
      .from("marketplace_listings")
      .insert({
        title,
        price,
        seller_email,
        seller_name,
        image_url: image_url || null,
        description: description?.trim().slice(0, 1000) || null,
        active: true
      })
      .select()
      .single();
    if (error) return json({ error: "DB error: " + error.message }, 500);
    return json(data, 201);
  }

  // ── DELETE: remove listing ────────────────────────────────────
  if (method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, 400);
    const { error } = await supabase.from("marketplace_listings").delete().eq("id", id);
    if (error) return json({ error: "DB error" }, 500);
    return json({ deleted: true });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/listings" };
