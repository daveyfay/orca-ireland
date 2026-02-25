import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL")!,
  Netlify.env.get("SUPABASE_SERVICE_KEY")!
);

async function getAdmin(username: string) {
  const { data } = await supabase
    .from("members")
    .select("id, first_name, last_name, is_admin")
    .eq("username", username.toLowerCase().trim())
    .single();
  if (!data || !data.is_admin) return null;
  return data;
}

export default async (req: Request, context: Context) => {
  const method = req.method;
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";

  let body: any = {};
  if (method !== "GET") {
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  }

  const username = method === "GET" ? url.searchParams.get("username") : body.username;
  if (!username) return json({ error: "Unauthorized" }, 401);

  const admin = await getAdmin(username);
  if (!admin) return json({ error: "Unauthorized — admin access required" }, 403);

  // ── MEMBERS ──────────────────────────────────────────────────

  if (action === "list-members") {
    const { data, error } = await supabase
      .from("members")
      .select("id, first_name, last_name, username, email, membership_type, expiry_date, is_admin, suspended, created_at")
      .order("last_name", { ascending: true });
    if (error) return json({ error: "DB error" }, 500);
    return json({ members: data });
  }

  if (action === "toggle-admin") {
    const { memberId, isAdmin } = body;
    if (!memberId) return json({ error: "memberId required" }, 400);
    // Prevent removing own admin
    if (memberId === admin.id && !isAdmin) return json({ error: "Cannot remove your own admin access" }, 400);
    const { error } = await supabase.from("members").update({ is_admin: isAdmin }).eq("id", memberId);
    if (error) return json({ error: "DB error" }, 500);
    return json({ success: true });
  }

  if (action === "toggle-suspend") {
    const { memberId, suspended } = body;
    if (!memberId) return json({ error: "memberId required" }, 400);
    if (memberId === admin.id) return json({ error: "Cannot suspend yourself" }, 400);
    const { error } = await supabase.from("members").update({ suspended }).eq("id", memberId);
    if (error) return json({ error: "DB error" }, 500);
    return json({ success: true });
  }

  if (action === "remove-member") {
    const { memberId } = body;
    if (!memberId) return json({ error: "memberId required" }, 400);
    if (memberId === admin.id) return json({ error: "Cannot remove yourself" }, 400);
    const { error } = await supabase.from("members").delete().eq("id", memberId);
    if (error) return json({ error: "DB error" }, 500);
    return json({ success: true });
  }

  // ── EVENTS ────────────────────────────────────────────────────

  if (action === "list-events") {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("event_date", { ascending: true });
    if (error) return json({ error: "DB error" }, 500);
    return json({ events: data });
  }

  if (action === "save-event") {
    const { id, name, event_date, description, location } = body;
    if (!name || !event_date) return json({ error: "name and event_date required" }, 400);
    let result;
    if (id) {
      result = await supabase.from("events").update({ name, event_date, description, location, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    } else {
      result = await supabase.from("events").insert({ name, event_date, description, location }).select().single();
    }
    if (result.error) return json({ error: "DB error" }, 500);
    return json({ success: true, event: result.data });
  }

  if (action === "delete-event") {
    const { id } = body;
    if (!id) return json({ error: "id required" }, 400);
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) return json({ error: "DB error" }, 500);
    return json({ success: true });
  }

  // ── GALLERY ────────────────────────────────────────────────────

  if (action === "list-gallery") {
    const { data, error } = await supabase
      .from("gallery")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) return json({ error: "DB error" }, 500);
    return json({ images: data });
  }

  if (action === "save-gallery-item") {
    const { id, url: imgUrl, caption, is_large, sort_order } = body;
    if (!imgUrl) return json({ error: "url required" }, 400);
    let result;
    if (id) {
      result = await supabase.from("gallery").update({ url: imgUrl, caption, is_large: !!is_large, sort_order: sort_order || 0 }).eq("id", id).select().single();
    } else {
      result = await supabase.from("gallery").insert({ url: imgUrl, caption, is_large: !!is_large, sort_order: sort_order || 0 }).select().single();
    }
    if (result.error) return json({ error: "DB error" }, 500);
    return json({ success: true, image: result.data });
  }

  if (action === "delete-gallery-item") {
    const { id } = body;
    if (!id) return json({ error: "id required" }, 400);
    const { error } = await supabase.from("gallery").delete().eq("id", id);
    if (error) return json({ error: "DB error" }, 500);
    return json({ success: true });
  }

  // ── GUIDES ────────────────────────────────────────────────────

  if (action === "list-guides") {
    const { data, error } = await supabase
      .from("guides")
      .select("id, title, slug, updated_at")
      .order("title", { ascending: true });
    if (error) return json({ error: "DB error" }, 500);
    return json({ guides: data });
  }

  if (action === "get-guide") {
    const slug = url.searchParams.get("slug") || body.slug;
    if (!slug) return json({ error: "slug required" }, 400);
    const { data, error } = await supabase.from("guides").select("*").eq("slug", slug).single();
    if (error) return json({ error: "Not found" }, 404);
    return json({ guide: data });
  }

  if (action === "save-guide") {
    const { id, title, slug, content } = body;
    if (!title || !slug || !content) return json({ error: "title, slug and content required" }, 400);
    let result;
    if (id) {
      result = await supabase.from("guides").update({ title, slug, content, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    } else {
      result = await supabase.from("guides").insert({ title, slug, content }).select().single();
    }
    if (result.error) return json({ error: result.error.message || "DB error" }, 500);
    return json({ success: true, guide: result.data });
  }

  return json({ error: "Unknown action" }, 400);
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
}

export const config = { path: "/api/admin" };
