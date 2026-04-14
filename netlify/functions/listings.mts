import type { Context } from "@netlify/functions";
import { getSupabase, verifyAdmin, jsonResponse, cachedJsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  const method = req.method;
  const url = new URL(req.url);
  const supabase = getSupabase();

  // ── GET: public list of active listings ──────────────────────
  if (method === "GET") {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("id, title, price, seller_name, image_urls, description, created_at, approved, sold, stripe_payment_link, quantity")
      .eq("approved", true)
      .eq("sold", false)
      .eq("active", true)
      .gt("quantity", 0)  // hide out-of-stock items
      .order("created_at", { ascending: false });
    if (error) return json({ error: "DB error" }, 500);
    return json({ listings: data || [] });
  }

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const admin = await verifyAdmin(body.username, body.password, body.sessionToken);
  if (!admin) return json({ error: "Unauthorised" }, 403);

  // ── POST: create listing ──────────────────────────────────────
  if (method === "POST") {
    const { title, price, seller_email, seller_name, image_urls, description, quantity } = body;
    if (!title || !price || !seller_email || !seller_name) {
      return json({ error: "title, price, seller_email and seller_name are required" }, 400);
    }
    const urls = Array.isArray(image_urls) ? image_urls.filter(Boolean) : [];
    const qty = Number.isInteger(quantity) && quantity >= 0 ? quantity : 1;
    const { data, error } = await supabase
      .from("marketplace_listings")
      .insert({
        title,
        price,
        seller_email,
        seller_name,
        image_urls: urls.length ? urls : null,
        description: description?.trim().slice(0, 1000) || null,
        quantity: qty,
        active: true
      })
      .select()
      .single();
    if (error) return json({ error: "DB error: " + error.message }, 500);
    // Notify members of new listing
    try {
      const notifyUrl = (Netlify.env.get("URL") || "") + "/api/notify-members";
      const firstImg = urls.length ? urls[0] : null;
      fetch(notifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-notify-secret": Netlify.env.get("CRON_SECRET") || "" },
        body: JSON.stringify({ type: "new_listing", title, price: parseFloat(String(price)), seller_name, image_url: firstImg }),
      }).catch(e => console.error("Notify (new_listing) failed:", e?.message || e));
    } catch (e) { console.error("Notify failed:", e); }
    return json(data, 201);
  }

  // ── PATCH: update quantity ────────────────────────────────────
  if (method === "PATCH") {
    const { id, quantity } = body;
    if (!id) return json({ error: "id required" }, 400);
    if (typeof quantity !== "number" || quantity < 0) return json({ error: "quantity must be a non-negative integer" }, 400);
    const { error } = await supabase
      .from("marketplace_listings")
      .update({ quantity: Math.floor(quantity) })
      .eq("id", id);
    if (error) return json({ error: "DB error" }, 500);
    return json({ success: true });
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

