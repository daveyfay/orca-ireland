import type { Context } from "@netlify/functions";
import { getSupabase } from "./auth-utils.mts";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: Netlify.env.get("GMAIL_USER")!,
    pass: Netlify.env.get("GMAIL_APP_PASSWORD")!,
  },
});

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts = sigHeader.split(",");
    const timestamp = parts.find((p) => p.startsWith("t="))?.split("=")[1];
    const signature = parts.find((p) => p.startsWith("v1="))?.split("=")[1];
    if (!timestamp || !signature) return false;
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return expected === signature;
  } catch { return false; }
}

function getMembershipExpiry(): string {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  expiry.setMonth(11);
  expiry.setDate(31);
  return expiry.toISOString().split("T")[0];
}

function generateUsername(firstName: string, lastName: string): string {
  const clean = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  return `${clean(firstName)}_${clean(lastName)}`;
}

function generatePassword(): string {
  const words = ["Track", "Nitro", "Race", "Grid", "Fuel", "Turbo", "Apex", "Slick"];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${num}`;
}

async function sendNewMemberEmail(email: string, firstName: string, password: string, expiryDate: string) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#ffffff;border-radius:8px;overflow:hidden;">
      <div style="background:#1a1a1a;padding:24px 32px;border-bottom:3px solid #ff6b00;">
        <div style="font-size:1.4rem;font-weight:700;letter-spacing:3px;color:#ff6b00;">ORCA IRELAND</div>
        <div style="font-size:0.75rem;color:#888;letter-spacing:2px;margin-top:4px;">OFFROAD RC ASSOCIATION</div>
      </div>
      <div style="padding:32px;">
        <h2 style="color:#ffffff;margin:0 0 16px;">Welcome to the Club! 🏁</h2>
        <p style="color:#cccccc;line-height:1.6;">Hi ${firstName},</p>
        <p style="color:#cccccc;line-height:1.6;">Your payment has been received and your ORCA Ireland membership is now active. Here are your login details:</p>
        <div style="background:#1a1a1a;border:1px solid rgba(255,107,0,0.3);border-radius:8px;padding:20px;margin:24px 0;">
          <div style="color:#ff6b00;font-size:0.75rem;letter-spacing:2px;font-weight:700;margin-bottom:16px;">YOUR LOGIN DETAILS</div>
          <div style="color:#cccccc;font-size:0.9rem;margin-bottom:8px;">Email: <strong style="color:#ffffff;">${email}</strong></div>
          <div style="color:#cccccc;font-size:0.9rem;margin-bottom:16px;">Password: <strong style="color:#ffffff;font-size:1.1rem;letter-spacing:2px;">${password}</strong></div>
          <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
            <div style="color:#cccccc;font-size:0.9rem;">Membership valid until: <strong style="color:#ffffff;">${new Date(expiryDate).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })}</strong></div>
          </div>
        </div>
        <a href="https://orca-ireland.com" style="display:inline-block;background:#ff6b00;color:#000;font-weight:700;font-size:0.9rem;letter-spacing:1px;padding:14px 28px;border-radius:6px;text-decoration:none;margin-bottom:24px;">Login to Members Area →</a>
        <p style="color:#cccccc;line-height:1.6;font-size:0.88rem;">We recommend changing your password after first login — go to Members Area → Change Password.</p>
        <p style="color:#cccccc;line-height:1.6;margin-top:12px;">Race days are held at St Anne's Park, Dublin. See you on the track! 🏁</p>
      </div>
      <div style="background:#141414;padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);font-size:0.75rem;color:#666;">
        ORCA Ireland · St Anne's Park, Dublin · orca-ireland.com
      </div>
    </div>`;
  await transporter.sendMail({
    from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
    to: email,
    subject: "Welcome to ORCA Ireland — Your Login Details 🏁",
    html,
  });
}

async function sendRenewalEmail(email: string, firstName: string, expiryDate: string) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#ffffff;border-radius:8px;overflow:hidden;">
      <div style="background:#1a1a1a;padding:24px 32px;border-bottom:3px solid #ff6b00;">
        <div style="font-size:1.4rem;font-weight:700;letter-spacing:3px;color:#ff6b00;">ORCA IRELAND</div>
        <div style="font-size:0.75rem;color:#888;letter-spacing:2px;margin-top:4px;">OFFROAD RC ASSOCIATION</div>
      </div>
      <div style="padding:32px;">
        <h2 style="color:#ffffff;margin:0 0 16px;">Membership Renewed! ✅</h2>
        <p style="color:#cccccc;line-height:1.6;">Hi ${firstName},</p>
        <p style="color:#cccccc;line-height:1.6;">Your ORCA Ireland membership has been successfully renewed.</p>
        <div style="background:#1a1a1a;border:1px solid rgba(255,107,0,0.3);border-radius:8px;padding:20px;margin:24px 0;">
          <div style="color:#ff6b00;font-size:0.75rem;letter-spacing:2px;font-weight:700;margin-bottom:12px;">MEMBERSHIP DETAILS</div>
          <div style="color:#cccccc;font-size:0.9rem;">Valid until: <strong style="color:#ffffff;">${new Date(expiryDate).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })}</strong></div>
        </div>
        <a href="https://orca-ireland.com" style="display:inline-block;background:#ff6b00;color:#000;font-weight:700;font-size:0.9rem;letter-spacing:1px;padding:14px 28px;border-radius:6px;text-decoration:none;">Go to Members Area →</a>
        <p style="color:#cccccc;line-height:1.6;margin-top:24px;">Race days are held at St Anne's Park, Dublin. See you on the track! 🏁</p>
      </div>
      <div style="background:#141414;padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);font-size:0.75rem;color:#666;">
        ORCA Ireland · St Anne's Park, Dublin · orca-ireland.com
      </div>
    </div>`;
  await transporter.sendMail({
    from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
    to: email,
    subject: "ORCA Ireland — Membership Renewed ✅",
    html,
  });
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const webhookSecret = Netlify.env.get("STRIPE_WEBHOOK_SECRET");
  const sigHeader = req.headers.get("stripe-signature") || "";
  const payload = await req.text();

  if (webhookSecret) {
    const valid = await verifyStripeSignature(payload, sigHeader, webhookSecret);
    if (!valid) {
      console.error("Stripe webhook: invalid signature");
      return new Response("Invalid signature", { status: 400 });
    }
  }

  let event: any;
  try { event = JSON.parse(payload); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  try {
    const session = event.data.object;
    const customerEmail = (session.customer_details?.email || session.customer_email || "").toLowerCase().trim();
    const customerName = (session.customer_details?.name || "").trim();

    if (!customerEmail) {
      console.error("Stripe webhook: no email in session", session.id);
      return new Response(JSON.stringify({ received: true, warning: "no email" }), { status: 200 });
    }

    const nameParts = customerName.split(" ");
    const firstName = nameParts[0] || "Member";
    const lastName = nameParts.slice(1).join(" ") || "";

    const supabase = getSupabase();
    const newExpiry = getMembershipExpiry();

    // Check if member already exists
    const { data: existing } = await supabase
      .from("members")
      .select("id, first_name, email")
      .eq("email", customerEmail)
      .single();

    if (existing) {
      // RENEWAL
      await supabase.from("members").update({
        membership_status: "active",
        expiry_date: newExpiry,
        suspended: false,
      }).eq("id", existing.id);

      try { await sendRenewalEmail(existing.email, existing.first_name, newExpiry); }
      catch (e) { console.error("Renewal email failed", e); }

      console.log(`Stripe: renewed ${customerEmail}`);
      return new Response(JSON.stringify({ received: true, renewed: customerEmail }), { status: 200 });

    } else {
      // NEW MEMBER — create account
      const plainPassword = generatePassword();
      const passwordHash = await bcrypt.hash(plainPassword, 10);

      // Ensure unique username
      let baseUsername = generateUsername(firstName, lastName) || `member_${Date.now()}`;
      let username = baseUsername;
      let suffix = 2;
      while (true) {
        const { data: clash } = await supabase.from("members").select("id").eq("username", username).single();
        if (!clash) break;
        username = `${baseUsername}${suffix++}`;
      }

      const { error: insertError } = await supabase.from("members").insert({
        first_name: firstName,
        last_name: lastName,
        email: customerEmail,
        username,
        password_hash: passwordHash,
        membership_type: "full",
        membership_status: "active",
        expiry_date: newExpiry,
        suspended: false,
        is_admin: false,
        registration_complete: true,
        created_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error("Stripe: DB insert failed", insertError);
        return new Response(JSON.stringify({ error: "DB insert failed" }), { status: 500 });
      }

      try { await sendNewMemberEmail(customerEmail, firstName, plainPassword, newExpiry); }
      catch (e) { console.error("Welcome email failed", e); }

      console.log(`Stripe: created new member ${customerEmail} (${username})`);
      return new Response(JSON.stringify({ received: true, created: customerEmail }), { status: 200 });
    }

  } catch (err) {
    console.error("Stripe webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
};

export const config = { path: "/api/stripe-webhook" };
