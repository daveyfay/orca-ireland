import type { Context } from "@netlify/functions";
import { getSupabase, verifyAdmin, jsonResponse } from "./auth-utils.mts";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: Netlify.env.get("GMAIL_USER")!,
    pass: Netlify.env.get("GMAIL_APP_PASSWORD")!,
  },
});

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

  if (action === "activate-member") {
    const { memberId } = body;
    if (!memberId) return json({ error: "memberId required" }, 400);
    const { data: m, error: fetchErr } = await supabase
      .from("members").select("expiry_date, first_name, email, username").eq("id", memberId).single();
    if (fetchErr || !m) return json({ error: "Member not found" }, 404);
    const base = new Date(m.expiry_date) > new Date() ? new Date(m.expiry_date) : new Date();
    base.setFullYear(base.getFullYear() + 1);
    const newExpiry = base.toISOString().split("T")[0];
    const { error } = await supabase.from("members").update({ expiry_date: newExpiry, suspended: false }).eq("id", memberId);
    if (error) return json({ error: "DB error" }, 500);

    // Send activation email
    const siteUrl = Netlify.env.get("SITE_URL") || "https://orcaireland.com";
    const formattedExpiry = new Date(newExpiry).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;background:#0a0a0a;color:#f0f0f0;margin:0;padding:0}
.wrapper{max-width:580px;margin:0 auto;padding:32px 16px}
.header{background:#141414;border-top:3px solid #ff6b00;border-radius:8px 8px 0 0;padding:32px;text-align:center}
.header h1{font-size:28px;letter-spacing:4px;color:#ff6b00;margin:0 0 4px}
.header p{color:#888;font-size:13px;margin:0;letter-spacing:2px;text-transform:uppercase}
.body{background:#1a1a1a;padding:32px;border-radius:0 0 8px 8px}
.highlight{background:rgba(255,107,0,0.08);border:1px solid rgba(255,107,0,0.2);border-radius:8px;padding:20px 24px;margin:20px 0;text-align:center}
.highlight .amount{font-size:2rem;font-weight:900;color:#ff6b00;letter-spacing:2px;display:block;margin-bottom:4px}
.highlight .label{font-size:0.8rem;color:#888;letter-spacing:1px;text-transform:uppercase}
.cta{display:block;background:#ff6b00;color:#000;text-align:center;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;letter-spacing:2px;text-transform:uppercase;margin:24px 0}
.info-box{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 20px;margin:16px 0;font-size:13px;color:#bbb;line-height:1.7}
.footer{text-align:center;padding:24px 0 0;color:#555;font-size:12px}
.footer a{color:#ff6b00;text-decoration:none}
</style></head>
<body><div class="wrapper">
<div class="header">
  <h1>ORCA IRELAND</h1>
  <p>Off Road Car Association</p>
</div>
<div class="body">
  <p>Hi ${m.first_name},</p>
  <p>Great news — an ORCA Ireland admin has granted you a <strong style="color:#fff;">complimentary membership</strong>. You now have full access to the members area.</p>
  <div class="highlight">
    <span class="amount">FREE MEMBERSHIP</span>
    <span class="label">Valid until ${formattedExpiry}</span>
  </div>
  <div class="info-box">
    <strong style="color:#fff;">Your login details:</strong><br>
    Username: <strong style="color:#ff6b00;">${m.username}</strong><br>
    Password: your existing password (or use the reset link if you've forgotten it)
  </div>
  <a href="${siteUrl}/#members" class="cta">Access Members Area →</a>
  <p style="font-size:13px;color:#888;margin-top:8px;">Once logged in you can enter races, view results, manage your garage and access all club guides.</p>
</div>
<div class="footer">
  <p>© 2026 ORCA Ireland · <a href="${siteUrl}">orcaireland.com</a></p>
</div>
</div></body></html>`;

    try {
      await transporter.sendMail({
        from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
        to: m.email,
        subject: "ORCA Ireland — You've been given a free membership! 🎉",
        html,
      });
    } catch (e) { console.error("Activation email failed:", e); }

    return json({ success: true, newExpiry });
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

  if (action === "payment-reminder") {
    const { memberId, memberName, memberEmail, membershipType } = body;
    if (!memberEmail) return json({ error: "memberEmail required" }, 400);

    const isJunior = membershipType === "junior";
    const fee = isJunior ? "€25" : "€50";
    const payLink = isJunior
      ? "https://checkout.revolut.com/pay/427f6965-cc16-41c4-ad4f-daf595e1b2fd"
      : "https://checkout.revolut.com/pay/6f7d1000-f489-48f5-a322-527d113130eb";
    const siteUrl = Netlify.env.get("SITE_URL") || "https://orca-ireland.com";
    const firstName = (memberName || "").split(" ")[0] || "Member";

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#111;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#1a1a1a;border-radius:8px;overflow:hidden;">
  <div style="background:#111;padding:24px 32px;border-bottom:3px solid #ff6b00;text-align:center;">
    <div style="font-size:1.8rem;font-weight:900;color:#fff;letter-spacing:2px;">ORCA <span style="color:#ff6b00;">IRELAND</span></div>
    <div style="color:#888;font-size:0.8rem;margin-top:4px;">Off Road Car Association</div>
  </div>
  <div style="padding:32px;">
    <p style="color:#fff;font-size:1rem;">Hi ${firstName},</p>
    <p style="color:#bbb;line-height:1.6;">Just a quick reminder that your <strong style="color:#fff;">ORCA Ireland membership renewal</strong> is due. Your membership fee is <strong style="color:#ff6b00;">${fee}/year</strong> — paid securely via Revolut.</p>
    <div style="background:#222;border:1px solid rgba(255,107,0,0.2);border-radius:8px;padding:20px 24px;margin:24px 0;text-align:center;">
      <div style="color:#888;font-size:0.78rem;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">Membership Fee</div>
      <div style="color:#ff6b00;font-size:2rem;font-weight:900;">${fee}</div>
      <div style="color:#666;font-size:0.8rem;margin-top:4px;">${isJunior ? "Junior Membership (Under 16)" : "Full Membership"} · Per year</div>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${payLink}" style="display:inline-block;background:#ff6b00;color:#000;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:1rem;letter-spacing:1px;">PAY NOW via Revolut →</a>
    </div>
    <p style="color:#bbb;font-size:0.88rem;line-height:1.6;">Once payment is confirmed, your membership will be renewed and you'll have full access to the members area, race entry, and club events for another year.</p>
    <p style="color:#bbb;font-size:0.88rem;line-height:1.6;">Any questions? Just reply to this email or message us on WhatsApp.</p>
    <hr style="border:none;border-top:1px solid #333;margin:28px 0;">
    <p style="color:#555;font-size:0.78rem;margin:0;">ORCA Ireland · St Anne's Park, Raheny, Dublin · <a href="${siteUrl}" style="color:#ff6b00;">${siteUrl.replace("https://","")}</a></p>
  </div>
</div>
</body></html>`;

    try {
      await transporter.sendMail({
        from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
        to: memberEmail,
        subject: "ORCA Ireland — Membership Renewal Reminder 🏁",
        html,
      });
      return json({ success: true });
    } catch (e) {
      console.error("Payment reminder email failed:", e);
      return json({ error: "Failed to send email" }, 500);
    }
  }

  return json({ error: "Unknown action" }, 400);
};

export const config = { path: "/api/admin" };
