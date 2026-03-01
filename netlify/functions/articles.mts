import type { Context } from "@netlify/functions";
import { getSupabase, verifyAdmin, jsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  const method = req.method;
  const url = new URL(req.url);
  const supabase = getSupabase();

  // ── GET: fetch articles ───────────────────────────────────────
  if (method === "GET") {
    const category = url.searchParams.get("category");
    const id = url.searchParams.get("id");
    const publicOnly = url.searchParams.get("public") === "true";

    // Single article
    if (id) {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("id", id)
        .eq("published", true)
        .single();
      if (error) return json({ error: "Not found" }, 404);
      return json(data);
    }

    // List
    let query = supabase
      .from("articles")
      .select("id, title, category, template, intro, author_name, public_teaser, created_at")
      .eq("published", true)
      .order("created_at", { ascending: false });

    if (category) query = query.eq("category", category);
    if (publicOnly) query = query.eq("public_teaser", true);

    const { data, error } = await query;
    if (error) return json({ error: "DB error" }, 500);
    return json(data || []);
  }

  // ── All write ops require admin ───────────────────────────────
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const admin = await verifyAdmin(body.username, body.password);
  if (!admin) return json({ error: "Unauthorised" }, 403);

  // ── POST: create article ──────────────────────────────────────
  if (method === "POST") {
    const { title, category, template, intro, content, author_name, published, public_teaser } = body;
    if (!title || !category || !template) {
      return json({ error: "title, category and template required" }, 400);
    }
    const { data, error } = await supabase
      .from("articles")
      .insert({ title, category, template, intro: intro || "", content: content || {}, author_name: author_name || "ORCA Admin", published: published !== false, public_teaser: public_teaser !== false })
      .select()
      .single();
    if (error) return json({ error: "DB error", detail: error.message }, 500);
    // Notify members if published
    if (published !== false) {
      try {
        const notifyUrl = (Netlify.env.get("URL") || "") + "/api/notify-members";
        fetch(notifyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-notify-secret": Netlify.env.get("CRON_SECRET") || "" },
          body: JSON.stringify({ type: "new_article", title, category, intro: intro || "" }),
        }).catch(() => {});
      } catch (e) { console.error("Notify failed:", e); }
    }
    return json(data, 201);
  }

  // ── PATCH: update article ─────────────────────────────────────
  if (method === "PATCH") {
    const { id, title, category, intro, content, author_name, published, public_teaser } = body;
    if (!id) return json({ error: "id required" }, 400);
    const { error } = await supabase
      .from("articles")
      .update({ title, category, intro, content, author_name, published, public_teaser, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return json({ error: "DB error" }, 500);
    return json({ updated: true });
  }

  // ── DELETE: remove article ────────────────────────────────────
  if (method === "DELETE") {
    const { id } = body;
    if (!id) return json({ error: "id required" }, 400);
    const { error } = await supabase.from("articles").delete().eq("id", id);
    if (error) return json({ error: "DB error" }, 500);
    return json({ deleted: true });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/articles" };
