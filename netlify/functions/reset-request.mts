import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

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

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 48 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { email } = body;
  if (!email) {
    return new Response(JSON.stringify({ error: "Email required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const emailLower = email.toLowerCase().trim();

  // Rate limit: max 3 reset requests per IP per hour
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentAttempts } = await supabase
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .eq("success", false)
    .gte("attempted_at", windowStart) as any;
  if ((recentAttempts ?? 0) >= 3) {
    return new Response(JSON.stringify({ error: "Too many attempts. Please try again later." }), {
      status: 429, headers: { "Content-Type": "application/json" },
    });
  }

  // Look up member — always return success to avoid email enumeration
  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("email", emailLower)
    .single();

  if (member) {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in Supabase
    await supabase.from("members").update({
      reset_token: token,
      reset_token_expires: expiresAt.toISOString(),
    }).eq("email", emailLower);

    const siteUrl = Netlify.env.get("SITE_URL") || "https://orcaireland.com";
    const resetLink = `${siteUrl}/reset-password.html?token=${token}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #0a0a0a; color: #f0f0f0; margin: 0; padding: 0; }
    .wrapper { max-width: 580px; margin: 0 auto; padding: 32px 16px; }
    .header { background: #141414; border-top: 3px solid #ff6b00; border-radius: 8px 8px 0 0; padding: 32px; text-align: center; }
    .header h1 { font-size: 28px; letter-spacing: 4px; color: #ff6b00; margin: 0 0 4px; }
    .header p { color: #888; font-size: 13px; margin: 0; letter-spacing: 2px; text-transform: uppercase; }
    .body { background: #1a1a1a; padding: 32px; border-radius: 0 0 8px 8px; }
    .cta { display: block; background: #ff6b00; color: #000; text-align: center; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; margin: 24px 0; }
    .info-box { background: rgba(255,107,0,0.06); border: 1px solid rgba(255,107,0,0.15); border-radius: 6px; padding: 16px 20px; margin: 16px 0; font-size: 13px; color: #bbb; line-height: 1.6; }
    .footer { text-align: center; padding: 24px 0 0; color: #555; font-size: 12px; }
    .footer a { color: #ff6b00; text-decoration: none; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>ORCA IRELAND</h1>
    <p>On Road Circuit Association</p>
  </div>
  <div class="body">
    <p>Hi ${member.first_name},</p>
    <p>We received a request to reset your ORCA Ireland members area password. Click the button below to choose a new password.</p>

    <a href="${resetLink}" class="cta">Reset My Password →</a>

    <div class="info-box">
      This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password has not been changed.
    </div>

    <p style="font-size:13px;color:#888;">If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${resetLink}" style="color:#ff6b00;word-break:break-all;">${resetLink}</a></p>
  </div>
  <div class="footer">
    <p>© 2026 ORCA Ireland · On Road Circuit Association<br>
    <a href="${siteUrl}">orcaireland.com</a></p>
  </div>
</div>
</body>
</html>`;

    await transporter.sendMail({
      from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
      to: emailLower,
      subject: "ORCA Ireland — Password Reset Request",
      html,
    });
  }

  // Always return success (don't reveal if email exists)
  return new Response(
    JSON.stringify({ success: true, message: "If that email is registered, a reset link has been sent." }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/reset-request",
};
