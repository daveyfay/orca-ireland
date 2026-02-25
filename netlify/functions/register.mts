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

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function addOneYear(fromDate: Date): string {
  const d = new Date(fromDate);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}

function membershipLabel(type: string): string {
  if (type === "junior") return "Junior Membership (Under 16)";
  return "Full Membership";
}

async function sendWelcomeEmail(
  email: string,
  firstName: string,
  username: string,
  password: string,
  membershipType: string,
  expiryDate: string,
  isRenewal: boolean
) {
  const siteUrl = Netlify.env.get("SITE_URL") || "https://orcaireland.com";
  const label = membershipLabel(membershipType);
  const expFormatted = new Date(expiryDate).toLocaleDateString("en-IE", {
    day: "numeric", month: "long", year: "numeric",
  });

  const subject = isRenewal
    ? `ORCA Ireland — Membership Renewed ✅`
    : `Welcome to ORCA Ireland! 🏁 Your membership is confirmed`;

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
    .greeting { font-size: 18px; margin-bottom: 16px; }
    .credentials { background: #0a0a0a; border: 1px solid rgba(255,107,0,0.3); border-radius: 8px; padding: 20px 24px; margin: 24px 0; }
    .credentials h3 { color: #ff6b00; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 16px; }
    .cred-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .cred-row:last-child { border-bottom: none; }
    .cred-label { color: #888; font-size: 13px; }
    .cred-value { color: #f0f0f0; font-weight: bold; font-size: 13px; font-family: monospace; }
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
    <p class="greeting">Hi ${firstName},</p>
    <p>${isRenewal
      ? `Your ORCA Ireland membership has been successfully renewed for another year. See you on the track! 🏁`
      : `Welcome to ORCA Ireland — Ireland's home of 1/8 scale on-road RC racing! Your membership is confirmed and you're now part of the club.`
    }</p>

    <div class="credentials">
      <h3>Your Membership Details</h3>
      <div class="cred-row">
        <span class="cred-label">Membership</span>
        <span class="cred-value">${label}</span>
      </div>
      <div class="cred-row">
        <span class="cred-label">Valid Until</span>
        <span class="cred-value">${expFormatted}</span>
      </div>
      <div class="cred-row">
        <span class="cred-label">Members Area Login</span>
        <span class="cred-value">${username}</span>
      </div>
      <div class="cred-row">
        <span class="cred-label">Password</span>
        <span class="cred-value">${password}</span>
      </div>
    </div>

    <a href="${siteUrl}/#members" class="cta">Access Members Area →</a>

    <div class="info-box">
      <strong style="color:#ff6b00;">Race Entry</strong><br>
      Race entry is €10 per event, paid separately on the website. You must be a current member to enter races.
    </div>

    <div class="info-box">
      <strong style="color:#ff6b00;">Track Location</strong><br>
      St Anne's Park, Raheny, Dublin 5. We race most Sundays — check the website for the full 2026 calendar.
    </div>

    ${!isRenewal ? `<p style="font-size:13px;color:#888;">If you have any questions just reply to this email or contact us at <a href="mailto:orcaireland25@gmail.com" style="color:#ff6b00;">orcaireland25@gmail.com</a>.</p>` : ""}
  </div>
  <div class="footer">
    <p>© 2026 ORCA Ireland · On Road Circuit Association<br>
    <a href="${siteUrl}">orcaireland.com</a> · 
    <a href="https://www.facebook.com/ORCAIreland">Facebook</a> · 
    <a href="https://www.instagram.com/orca.ireland/">Instagram</a></p>
  </div>
</div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
    to: email,
    subject,
    html,
  });
}

async function notifyAdmin(
  email: string,
  firstName: string,
  lastName: string,
  username: string,
  membershipType: string,
  expiryDate: string,
  isRenewal: boolean
) {
  const label = membershipLabel(membershipType);
  await transporter.sendMail({
    from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
    to: Netlify.env.get("GMAIL_USER")!,
    subject: `ORCA — ${isRenewal ? "Renewal" : "New Member"}: ${firstName} ${lastName}`,
    text: `${isRenewal ? "RENEWAL" : "NEW MEMBER"}\n\nName: ${firstName} ${lastName}\nEmail: ${email}\nUsername: ${username}\nMembership: ${label}\nExpiry: ${expiryDate}\n`,
  });
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { firstName, lastName, email, username, membershipType } = body;

  if (!firstName || !lastName || !email || !username || !membershipType) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate username — alphanumeric + underscores only
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return new Response(
      JSON.stringify({ error: "Username must be 3–20 characters, letters/numbers/underscores only." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const emailLower = email.toLowerCase().trim();
  const usernameLower = username.toLowerCase().trim();

  // Check if member already exists by email
  const { data: existingByEmail } = await supabase
    .from("members")
    .select("*")
    .eq("email", emailLower)
    .single();

  // Check if username is taken by someone else
  const { data: existingByUsername } = await supabase
    .from("members")
    .select("*")
    .eq("username", usernameLower)
    .single();

  if (existingByUsername && existingByUsername.email !== emailLower) {
    return new Response(
      JSON.stringify({ error: "That username is already taken. Please choose another." }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  const password = generatePassword();
  const now = new Date();
  const isRenewal = !!existingByEmail;

  let expiryDate: string;

  if (isRenewal) {
    // Extend from current expiry if still valid, otherwise from today
    const currentExpiry = new Date(existingByEmail.expiry_date);
    expiryDate = addOneYear(currentExpiry > now ? currentExpiry : now);

    const { error } = await supabase
      .from("members")
      .update({
        first_name: firstName,
        last_name: lastName,
        username: usernameLower,
        password_hash: password, // plain for now — see notes
        membership_type: membershipType,
        expiry_date: expiryDate,
        updated_at: now.toISOString(),
      })
      .eq("email", emailLower);

    if (error) {
      console.error("Supabase update error:", error);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else {
    expiryDate = addOneYear(now);

    const { error } = await supabase.from("members").insert({
      first_name: firstName,
      last_name: lastName,
      email: emailLower,
      username: usernameLower,
      password_hash: password,
      membership_type: membershipType,
      expiry_date: expiryDate,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    if (error) {
      if (error.code === "23505") {
        return new Response(
          JSON.stringify({ error: "That username is already taken. Please choose another." }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }
      console.error("Supabase insert error:", error);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Send emails
  try {
    await sendWelcomeEmail(emailLower, firstName, usernameLower, password, membershipType, expiryDate, isRenewal);
    await notifyAdmin(emailLower, firstName, lastName, usernameLower, membershipType, expiryDate, isRenewal);
  } catch (emailErr) {
    console.error("Email error:", emailErr);
    // Don't fail the whole request if email fails — member is already saved
  }

  return new Response(
    JSON.stringify({
      success: true,
      isRenewal,
      message: isRenewal
        ? "Membership renewed! Check your email for confirmation."
        : "Welcome to ORCA! Check your email for your login details.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/register",
};
