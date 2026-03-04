import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import crypto from "crypto";

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

function membershipLabel(type: string): string {
  return type === "junior" ? "Junior Membership (Under 16) — €25" : "Full Membership — €50";
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { firstName, lastName, email, membershipType } = body;
  if (!firstName || !lastName || !email || !membershipType) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
  }

  const emailLower = email.toLowerCase().trim();

  // Rate limit: max 5 registration attempts per IP per hour
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentAttempts } = await supabase
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .eq("success", false)
    .gte("attempted_at", windowStart) as any;
  if ((recentAttempts ?? 0) >= 5) {
    return new Response(JSON.stringify({ error: "Too many attempts. Please try again later." }), { status: 429 });
  }

  // Check if already a member (active or legacy)
  const { data: existing } = await supabase
    .from("members")
    .select("id, legacy_member, password_hash")
    .eq("email", emailLower)
    .single();

  // Active account with a real password — block re-registration
  if (existing && existing.password_hash && !existing.legacy_member) {
    return new Response(
      JSON.stringify({ error: "An account with this email already exists. Use the Members Area to log in." }),
      { status: 409 }
    );
  }

  const isLegacy = !!(existing?.legacy_member);

  // Legacy member re-registering — clear old record so fresh one gets created
  if (isLegacy) {
    await supabase.from("members").delete().eq("email", emailLower);
  }

  // Delete any previous pending registration for this email
  await supabase.from("pending_registrations").delete().eq("email", emailLower);

  // Create secure token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from("pending_registrations").insert({
    token,
    first_name: firstName,
    last_name: lastName,
    email: emailLower,
    membership_type: membershipType,
    expires_at: expiresAt,
    is_legacy: isLegacy,
  });

  if (insertError) {
    console.error("Pending insert error:", insertError);
    return new Response(JSON.stringify({ error: "Database error" }), { status: 500 });
  }

  const siteUrl = Netlify.env.get("SITE_URL") || "https://orcaireland.com";
  const confirmUrl = `${siteUrl}/complete-registration.html?token=${token}`;
  const label = membershipLabel(membershipType);

  try {
    await transporter.sendMail({
      from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
      to: emailLower,
      subject: isLegacy ? "Welcome back to ORCA Ireland! 🏁 Confirm your email" : "ORCA Ireland — Confirm your email to complete registration 🏁",
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#0a0a0a;color:#f0f0f0;margin:0;padding:0}
  .wrapper{max-width:580px;margin:0 auto;padding:32px 16px}
  .header{background:#141414;border-top:3px solid #ff6b00;border-radius:8px 8px 0 0;padding:32px;text-align:center}
  .header h1{font-size:28px;letter-spacing:4px;color:#ff6b00;margin:0 0 4px}
  .header p{color:#888;font-size:13px;margin:0;letter-spacing:2px;text-transform:uppercase}
  .body{background:#1a1a1a;padding:32px;border-radius:0 0 8px 8px}
  .cta{display:block;background:#ff6b00;color:#000!important;text-align:center;padding:16px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;letter-spacing:2px;text-transform:uppercase;margin:28px 0}
  .info-box{background:rgba(255,107,0,0.06);border:1px solid rgba(255,107,0,0.15);border-radius:6px;padding:16px 20px;margin:16px 0;font-size:13px;color:#bbb;line-height:1.6}
  .expire{font-size:12px;color:#666;text-align:center;margin-top:8px}
  .footer{text-align:center;padding:24px 0 0;color:#555;font-size:12px}
  .footer a{color:#ff6b00;text-decoration:none}
</style>
</head><body>
<div class="wrapper">
  <div class="header"><h1>ORCA IRELAND</h1><p>On Road Circuit Association</p></div>
  <div class="body">
    <p>Hi ${firstName},</p>
    <p>${isLegacy ? 'Welcome back! Your details were carried over from our old system.' : 'Thanks for starting your ORCA Ireland membership!'} You've chosen <strong style="color:#ff6b00;">${label}</strong>.</p>
    <p>Click below to confirm your email and complete registration — we just need your phone number and an emergency contact, then straight to payment.</p>
    <a href="${confirmUrl}" class="cta">Complete My Registration →</a>
    <p class="expire">This link expires in 24 hours.</p>
    <div class="info-box"><strong style="color:#ff6b00;">What happens next?</strong><br>
    You'll fill in your contact details, then pay your membership fee securely via Stripe. Once paid, your Members Area account will be automatically activated.</div>
    <div class="info-box"><strong style="color:#ff6b00;">Questions?</strong><br>
    Just reply to this email or find us on <a href="https://www.facebook.com/ORCAIreland" style="color:#ff6b00;">Facebook</a>.</div>
  </div>
  <div class="footer">
    <p>© 2026 ORCA Ireland · <a href="${siteUrl}">orcaireland.com</a></p>
    <p style="margin-top:8px;">If you didn't request this, you can safely ignore this email.</p>
  </div>
</div>
</body></html>`,
    });
  } catch (emailErr) {
    console.error("Email error:", emailErr);
    return new Response(JSON.stringify({ error: "Failed to send confirmation email. Please try again." }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ success: true, message: "Check your email to complete registration." }),
    { status: 200 }
  );
};

export const config = { path: "/api/register" };
