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

  if (action === "set-expiry") {
    const { memberId, expiryDate } = body;
    if (!memberId || !expiryDate) return json({ error: "memberId and expiryDate required" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return json({ error: "expiryDate must be YYYY-MM-DD" }, 400);
    const { error } = await supabase.from("members").update({ expiry_date: expiryDate }).eq("id", memberId);
    if (error) return json({ error: "DB error" }, 500);
    return json({ success: true });
  }

  if (action === "send-password-reset") {
    const { memberId } = body;
    if (!memberId) return json({ error: "memberId required" }, 400);
    const { data: member, error: fetchErr } = await supabase
      .from("members").select("first_name, email").eq("id", memberId).single();
    if (fetchErr || !member) return json({ error: "Member not found" }, 404);

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const token = Array.from({ length: 48 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await supabase.from("members").update({ reset_token: token, reset_token_expires: expiresAt.toISOString() }).eq("id", memberId);

    const siteUrl = Netlify.env.get("SITE_URL") || "https://orcaireland.com";
    const resetLink = `${siteUrl}/reset-password.html?token=${token}`;

    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      service: "gmail",
      auth: { user: Netlify.env.get("GMAIL_USER")!, pass: Netlify.env.get("GMAIL_APP_PASSWORD")! },
    });

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;background:#0a0a0a;color:#f0f0f0;margin:0;padding:0}
.wrapper{max-width:580px;margin:0 auto;padding:32px 16px}
.header{background:#141414;border-top:3px solid #ff6b00;border-radius:8px 8px 0 0;padding:32px;text-align:center}
.header h1{font-size:28px;letter-spacing:4px;color:#ff6b00;margin:0 0 4px}
.header p{color:#888;font-size:13px;margin:0;letter-spacing:2px;text-transform:uppercase}
.body{background:#1a1a1a;padding:32px;border-radius:0 0 8px 8px}
.cta{display:block;background:#ff6b00;color:#000;text-align:center;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;letter-spacing:2px;text-transform:uppercase;margin:24px 0}
.info-box{background:rgba(255,107,0,0.06);border:1px solid rgba(255,107,0,0.15);border-radius:6px;padding:16px 20px;margin:16px 0;font-size:13px;color:#bbb;line-height:1.6}
.footer{text-align:center;padding:24px 0 0;color:#555;font-size:12px}
.footer a{color:#ff6b00;text-decoration:none}</style></head>
<body><div class="wrapper">
<div class="header"><h1>ORCA IRELAND</h1><p>On Road Circuit Association</p></div>
<div class="body">
<p>Hi ${member.first_name},</p>
<p>An ORCA Ireland admin has sent you a password reset link. Click below to set a new password for your members area account.</p>
<a href="${resetLink}" class="cta">Set My Password →</a>
<div class="info-box">This link expires in <strong>1 hour</strong>. If you didn't expect this email, please contact an ORCA admin.</div>
<p style="font-size:13px;color:#888;">If the button doesn't work, copy and paste this link:<br>
<a href="${resetLink}" style="color:#ff6b00;word-break:break-all;">${resetLink}</a></p>
</div>
<div class="footer"><p>© 2026 ORCA Ireland · <a href="${siteUrl}">orcaireland.com</a></p></div>
</div></body></html>`;

    await transporter.sendMail({
      from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
      to: member.email,
      subject: "ORCA Ireland — Password Reset",
      html,
    });
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
