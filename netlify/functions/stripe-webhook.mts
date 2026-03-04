import type { Context } from "@netlify/functions";
import { getSupabase } from "./auth-utils.mts";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import crypto from "crypto";

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
  const base = `${clean(firstName)}_${clean(lastName)}`;
  return base || `member_${Date.now()}`;
}

async function sendConfirmEmail(email: string, firstName: string, token: string) {
  const siteUrl = Netlify.env.get("SITE_URL") || "https://orca-ireland.com";
  const confirmUrl = `${siteUrl}/set-password?token=${token}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#ffffff;border-radius:8px;overflow:hidden;">
      <div style="background:#1a1a1a;padding:24px 32px;border-bottom:3px solid #ff6b00;">
        <div style="font-size:1.4rem;font-weight:700;letter-spacing:3px;color:#ff6b00;">ORCA IRELAND</div>
        <div style="font-size:0.75rem;color:#888;letter-spacing:2px;margin-top:4px;">OFFROAD RC ASSOCIATION</div>
      </div>
      <div style="padding:32px;">
        <h2 style="color:#ffffff;margin:0 0 16px;">Welcome to the Club! 🏁</h2>
        <p style="color:#cccccc;line-height:1.6;">Hi ${firstName},</p>
        <p style="color:#cccccc;line-height:1.6;">Your payment has been received — one last step to activate your account. Click below to confirm your email and set your password.</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${confirmUrl}" style="display:inline-block;background:#ff6b00;color:#000;font-weight:700;font-size:1rem;letter-spacing:1px;padding:16px 36px;border-radius:6px;text-decoration:none;">Confirm Account &amp; Set Password →</a>
        </div>
        <div style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px 20px;margin:24px 0;">
          <div style="color:#888;font-size:0.8rem;margin-bottom:4px;">Or copy this link:</div>
          <div style="color:#ff6b00;font-size:0.78rem;word-break:break-all;">${confirmUrl}</div>
        </div>
        <p style="color:#888;font-size:0.82rem;">This link expires in 24 hours.</p>
      </div>
      <div style="background:#141414;padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);font-size:0.75rem;color:#666;">
        ORCA Ireland · St Anne's Park, Dublin · orca-ireland.com
      </div>
    </div>`;
  await transporter.sendMail({
    from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
    to: email,
    subject: "Welcome to ORCA Ireland — Confirm Your Account 🏁",
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

    console.log("Stripe webhook: payment for", customerEmail);

    if (!customerEmail) {
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
      .select("id, first_name, email, expiry_date")
      .eq("email", customerEmail)
      .single();

    if (existing) {
      // RENEWAL — extend expiry
      const currentExpiry = new Date(existing.expiry_date);
      const base = currentExpiry > new Date() ? currentExpiry : new Date();
      base.setFullYear(base.getFullYear() + 1);
      const renewedExpiry = base.toISOString().split("T")[0];

      await supabase.from("members").update({
        expiry_date: renewedExpiry,
        suspended: false,
      }).eq("id", existing.id);

      try { await sendRenewalEmail(existing.email, existing.first_name, renewedExpiry); }
      catch (e) { console.error("Renewal email failed", e); }

      console.log("Stripe: renewed", customerEmail, "until", renewedExpiry);
      return new Response(JSON.stringify({ received: true, renewed: customerEmail }), { status: 200 });

    } else {
      // NEW MEMBER — create account with confirm token stored in pay_token
      const confirmToken = crypto.randomBytes(32).toString("hex");
      const placeholderHash = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10);

      // Ensure unique username
      let username = generateUsername(firstName, lastName);
      let suffix = 2;
      while (true) {
        const { data: clash } = await supabase.from("members").select("id").eq("username", username).single();
        if (!clash) break;
        username = `${generateUsername(firstName, lastName)}${suffix++}`;
      }

      const { error: insertError } = await supabase.from("members").insert({
        first_name: firstName,
        last_name: lastName,
        email: customerEmail,
        username,
        password_hash: placeholderHash,
        membership_type: "full",
        expiry_date: newExpiry,
        suspended: true,           // suspended until they set password
        is_admin: false,
        pay_token: confirmToken,   // reuse pay_token as confirm token
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error("Stripe: DB insert failed", insertError.message);
        return new Response(JSON.stringify({ error: "DB insert failed", detail: insertError.message }), { status: 500 });
      }

      try { await sendConfirmEmail(customerEmail, firstName, confirmToken); }
      catch (e) { console.error("Confirm email failed", e); }

      console.log("Stripe: created member", customerEmail, username);
      return new Response(JSON.stringify({ received: true, created: customerEmail }), { status: 200 });
    }

  } catch (err: any) {
    console.error("Stripe webhook error:", err?.message);
    return new Response(JSON.stringify({ error: "Internal error", detail: err?.message }), { status: 500 });
  }
};

export const config = { path: "/api/stripe-webhook" };
