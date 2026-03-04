import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL")!,
  Netlify.env.get("SUPABASE_SERVICE_KEY")!
);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: Netlify.env.get("GMAIL_USER")!,
    pass: Netlify.env.get("GMAIL_APP_PASSWORD")!,
  },
});

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function getExpiryDate(fromDate: Date): string {
  const month = fromDate.getMonth();
  const year = fromDate.getFullYear();
  const expiryYear = month >= 10 ? year + 1 : year;
  return `${expiryYear}-12-31`;
}

function membershipLabel(type: string): string {
  return type === "junior" ? "Junior Membership (Under 16)" : "Full Membership";
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);

  // GET: validate token and return pending registration data
  if (req.method === "GET") {
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), { status: 400 });
    }

    const { data: pending, error } = await supabase
      .from("pending_registrations")
      .select("*")
      .eq("token", token)
      .single();

    if (error || !pending) {
      return new Response(JSON.stringify({ error: "Invalid or expired link. Please register again." }), { status: 404 });
    }

    if (new Date(pending.expires_at) < new Date()) {
      await supabase.from("pending_registrations").delete().eq("token", token);
      return new Response(JSON.stringify({ error: "This link has expired. Please register again." }), { status: 410 });
    }

    return new Response(JSON.stringify({
      firstName: pending.first_name,
      lastName: pending.last_name,
      email: pending.email,
      membershipType: pending.membership_type,
      isLegacy: pending.is_legacy || false,
    }), { status: 200 });
  }

  // POST: complete registration with phone/ICE details
  if (req.method === "POST") {
    let body: any;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
    }

    const { token, phone, iceName, icePhone } = body;

    if (!token || !phone || !iceName || !icePhone) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    // Look up pending registration
    const { data: pending, error: pendingError } = await supabase
      .from("pending_registrations")
      .select("*")
      .eq("token", token)
      .single();

    if (pendingError || !pending) {
      return new Response(JSON.stringify({ error: "Invalid or expired link. Please register again." }), { status: 404 });
    }

    if (new Date(pending.expires_at) < new Date()) {
      await supabase.from("pending_registrations").delete().eq("token", token);
      return new Response(JSON.stringify({ error: "This link has expired. Please register again." }), { status: 410 });
    }

    // Check email not already registered (race condition guard)
    const { data: existing } = await supabase
      .from("members")
      .select("id")
      .eq("email", pending.email)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "An account with this email already exists." }),
        { status: 409 }
      );
    }

    // Generate credentials
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    const expiryDate = getExpiryDate(now);

    // Generate username from name
    const baseUsername = `${pending.first_name}${pending.last_name}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 18);

    // Ensure unique username
    let username = baseUsername;
    let suffix = 1;
    while (true) {
      const { data: taken } = await supabase
        .from("members")
        .select("id")
        .eq("username", username)
        .single();
      if (!taken) break;
      username = `${baseUsername}${suffix++}`;
    }

    // Create member
    const { error: insertError } = await supabase.from("members").insert({
      first_name: pending.first_name,
      last_name: pending.last_name,
      email: pending.email,
      username,
      password_hash: passwordHash,
      membership_type: pending.membership_type,
      expiry_date: expiryDate,
      phone,
      ice_name: iceName,
      ice_phone: icePhone,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    if (insertError) {
      console.error("Member insert error:", insertError);
      return new Response(JSON.stringify({ error: "Database error. Please try again." }), { status: 500 });
    }

    // Delete pending record
    await supabase.from("pending_registrations").delete().eq("token", token);

    // Send welcome email with credentials
    const siteUrl = Netlify.env.get("SITE_URL") || "https://orcaireland.com";
    const label = membershipLabel(pending.membership_type);
    const expFormatted = new Date(expiryDate).toLocaleDateString("en-IE", {
      day: "numeric", month: "long", year: "numeric",
    });

    try {
      await transporter.sendMail({
        from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
        to: pending.email,
        subject: pending.is_legacy ? 'Welcome back to ORCA Ireland! 🏁 Your membership details' : 'Welcome to ORCA Ireland! 🏁 Your membership details',
        html: `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#0a0a0a;color:#f0f0f0;margin:0;padding:0}
  .wrapper{max-width:580px;margin:0 auto;padding:32px 16px}
  .header{background:#141414;border-top:3px solid #ff6b00;border-radius:8px 8px 0 0;padding:32px;text-align:center}
  .header h1{font-size:28px;letter-spacing:4px;color:#ff6b00;margin:0 0 4px}
  .header p{color:#888;font-size:13px;margin:0;letter-spacing:2px;text-transform:uppercase}
  .body{background:#1a1a1a;padding:32px;border-radius:0 0 8px 8px}
  .credentials{background:#0a0a0a;border:1px solid rgba(255,107,0,0.3);border-radius:8px;padding:20px 24px;margin:24px 0}
  .credentials h3{color:#ff6b00;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 16px}
  .cred-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
  .cred-row:last-child{border-bottom:none}
  .cred-label{color:#888;font-size:13px}
  .cred-value{color:#f0f0f0;font-weight:bold;font-size:13px;font-family:monospace}
  .cta{display:block;background:#ff6b00;color:#000!important;text-align:center;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;letter-spacing:2px;text-transform:uppercase;margin:24px 0}
  .info-box{background:rgba(255,107,0,0.06);border:1px solid rgba(255,107,0,0.15);border-radius:6px;padding:16px 20px;margin:16px 0;font-size:13px;color:#bbb;line-height:1.6}
  .footer{text-align:center;padding:24px 0 0;color:#555;font-size:12px}
  .footer a{color:#ff6b00;text-decoration:none}
</style>
</head><body>
<div class="wrapper">
  <div class="header"><h1>ORCA IRELAND</h1><p>On Road Circuit Association</p></div>
  <div class="body">
    <p>Hi ${pending.first_name},</p>
    <p>${pending.is_legacy ? "🏁 Welcome back! Great to have you back on the grid. Your account is all set up on the new system." : "🏁 You're in! Welcome to ORCA Ireland — Ireland's home of 1/8 scale on-road RC racing. We'll see you at the track!"}</p>
    <div class="credentials">
      <h3>Your Membership Details</h3>
      <div class="cred-row"><span class="cred-label">Membership</span><span class="cred-value">${label}</span></div>
      <div class="cred-row"><span class="cred-label">Valid Until</span><span class="cred-value">${expFormatted}</span></div>
      <div class="cred-row"><span class="cred-label">Username</span><span class="cred-value">${username}</span></div>
      <div class="cred-row"><span class="cred-label">Password</span><span class="cred-value">${password}</span></div>
    </div>
    <a href="${siteUrl}/#members" class="cta">Access Members Area →</a>
    <div class="info-box"><strong style="color:#ff6b00;">Race Entry</strong><br>
    Race entry is €10 per event, paid on the website. You must be a current member to enter.</div>
    <div class="info-box"><strong style="color:#ff6b00;">Track Location</strong><br>
    St Anne's Park, Raheny, Dublin 5. Check the website for the full 2026 calendar.</div>
    <p style="font-size:13px;color:#888;">Questions? Reply to this email or contact us at <a href="mailto:orcaireland25@gmail.com" style="color:#ff6b00;">orcaireland25@gmail.com</a>.</p>
  </div>
  <div class="footer">
    <p>© 2026 ORCA Ireland · <a href="${siteUrl}">orcaireland.com</a> ·
    <a href="https://www.facebook.com/ORCAIreland">Facebook</a></p>
  </div>
</div>
</body></html>`,
      });

      // Notify admin
      await transporter.sendMail({
        from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
        to: Netlify.env.get("GMAIL_USER")!,
        subject: `ORCA — New Member: ${pending.first_name} ${pending.last_name}`,
        text: `NEW MEMBER\n\nName: ${pending.first_name} ${pending.last_name}\nEmail: ${pending.email}\nUsername: ${username}\nPhone: ${phone}\nICE: ${iceName} — ${icePhone}\nMembership: ${label}\nExpiry: ${expiryDate}\n`,
      });
    } catch (emailErr) {
      console.error("Email error:", emailErr);
      // Member is saved — don't fail
    }

    return new Response(
      JSON.stringify({
        success: true,
        username,
        membershipType: pending.membership_type,
        stripeLink: `https://buy.stripe.com/7sYaEW58304a7mWdXO4ko00`,
      }),
      { status: 200 }
    );
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
};

export const config = { path: "/api/complete-registration" };
