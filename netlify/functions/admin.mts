import type { Context } from "@netlify/functions";
import { getSupabase, verifyAdmin, jsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  const method = req.method;
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = body.action || "";

  // Require username + password — no session forgery possible
  const username = body.username;
  const password = body.password;

  const admin = await verifyAdmin(username, password);
  if (!admin) return json({ error: "Unauthorized" }, 403);

  const supabase = getSupabase();

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
    if (memberId === admin.id && !isAdmin) return json({ error: "Cannot remove your own admin access" }, 400);
    const { error } = await supabase.from("members").update({ is_admin: !!isAdmin }).eq("id", memberId);
    if (error) return json({ error: "DB error" }, 500);
    return json({ success: true });
  }

  if (action === "toggle-suspend") {
    const { memberId, suspended } = body;
    if (!memberId) return json({ error: "memberId required" }, 400);
    if (memberId === admin.id) return json({ error: "Cannot suspend yourself" }, 400);
    const { error } = await supabase.from("members").update({ suspended: !!suspended }).eq("id", memberId);
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
      .from("events").select("*").order("event_date", { ascending: true });
    if (error) return json({ error: "DB error" }, 500);
    return json({ events: data });
  }

  if (action === "save-event") {
    const { id, name, event_date, description, location } = body;
    if (!name || !event_date) return json({ error: "name and event_date required" }, 400);
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date)) return json({ error: "Invalid date format" }, 400);
    const payload = {
      name: name.trim().slice(0, 100),
      event_date,
      description: description?.trim().slice(0, 500) || null,
      location: location?.trim().slice(0, 100) || "St Anne's Park, Dublin",
      updated_at: new Date().toISOString(),
    };
    let result;
    if (id) {
      result = await supabase.from("events").update(payload).eq("id", id).select().single();
    } else {
      result = await supabase.from("events").insert(payload).select().single();
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
      .from("gallery").select("*").order("sort_order", { ascending: true });
    if (error) return json({ error: "DB error" }, 500);
    return json({ images: data });
  }

  if (action === "save-gallery-item") {
    const { id, url: imgUrl, caption, is_large, sort_order } = body;
    if (!imgUrl) return json({ error: "url required" }, 400);
    // Only allow relative paths or https URLs — block javascript: and data: URIs
    const urlStr = String(imgUrl).trim();
    if (!/^(https?:\/\/|\/)/i.test(urlStr)) return json({ error: "Invalid image URL" }, 400);
    const payload = {
      url: urlStr.slice(0, 500),
      caption: caption?.trim().slice(0, 100) || null,
      is_large: !!is_large,
      sort_order: Number(sort_order) || 0,
    };
    let result;
    if (id) {
      result = await supabase.from("gallery").update(payload).eq("id", id).select().single();
    } else {
      result = await supabase.from("gallery").insert(payload).select().single();
    }
    if (result.error) return json({ error: "DB error: " + result.error.message }, 500);
    return json({ success: true, image: result.data });
  }

  if (action === "delete-gallery-item") {
    const { id } = body;
    if (!id) return json({ error: "id required" }, 400);
    const { error } = await supabase.from("gallery").delete().eq("id", id);
    if (error) return json({ error: "DB error: " + error.message }, 500);
    return json({ success: true });
  }

  // ── GUIDES ────────────────────────────────────────────────────

  if (action === "list-guides") {
    const { data, error } = await supabase
      .from("guides").select("id, title, slug, updated_at").order("title", { ascending: true });
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
    if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: "slug must be lowercase letters, numbers, and hyphens only" }, 400);
    let result;
    if (id) {
      result = await supabase.from("guides").update({ title: title.trim().slice(0, 100), slug, content, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    } else {
      result = await supabase.from("guides").insert({ title: title.trim().slice(0, 100), slug, content }).select().single();
    }
    if (result.error) return json({ error: "DB error" }, 500);
    return json({ success: true, guide: result.data });
  }

  return json({ error: "Unknown action" }, 400);
};

export const config = { path: "/api/admin" };
