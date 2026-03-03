import type { Context } from "@netlify/functions";
import { getSupabase } from "./auth-utils.mts";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: Netlify.env.get("GMAIL_USER")!,
    pass: Netlify.env.get("GMAIL_APP_PASSWORD")!,
  },
});

// Verify Stripe webhook signature
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = sigHeader.split(",");
    const timestamp = parts.find((p) => p.startsWith("t="))?.split("=")[1];
    const signature = parts.find((p) => p.startsWith("v1="))?.split("=")[1];
    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const expected = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return expected === signature;
  } catch {
    return false;
  }
}

function getMembershipExpiry(): string {
  // Membership valid until end of current calendar year
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  expiry.setMonth(11); // December
  expiry.setDate(31);
  return expiry.toISOString().split("T")[0];
}

async function sendWelcomeEmail(
  email: string,
  firstName: string,
  isRenewal: boolean,
  expiryDate: string
) {
  const subject = isRenewal
    ? "ORCA Ireland — Membership Renewed ✅"
    : "Welcome to ORCA Ireland! 🏁";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f0f0f;color:#ffffff;border-radius:8px;overflow:hidden;">
      <div style="background:#1a1a1a;padding:24px 32px;border-bottom:3px solid #ff6b00;">
        <div style="font-size:1.4rem;font-weight:700;letter-spacing:3px;color:#ff6b00;">ORCA IRELAND</div>
        <div style="font-size:0.75rem;color:#888;letter-spacing:2px;margin-top:4px;">OFFROAD RC ASSOCIATION</div>
      </div>
      <div style="padding:32px;">
        <h2 style="color:#ffffff;margin:0 0 16px;">${isRenewal ? "Membership Renewed!" : "Welcome to the Club!"}</h2>
        <p style="color:#cccccc;line-height:1.6;">Hi ${firstName},</p>
        <p style="color:#cccccc;line-height:1.6;">
          ${isRenewal
            ? "Your ORCA Ireland membership has been successfully renewed."
            : "Your payment has been received and your ORCA Ireland membership is now active."}
        </p>
        <div style="background:#1a1a1a;border:1px solid rgba(255,107,0,0.3);border-radius:8px;padding:20px;margin:24px 0;">
          <div style="color:#ff6b00;font-size:0.75rem;letter-spacing:2px;font-weight:700;margin-bottom:12px;">MEMBERSHIP DETAILS</div>
          <div style="color:#cccccc;font-size:0.9rem;">Valid until: <strong style="color:#ffffff;">${new Date(expiryDate).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })}</strong></div>
          <div style="color:#cccccc;font-size:0.9rem;margin-top:6px;">Type: <strong style="color:#ffffff;">Full Membership</strong></div>
        </div>
        <p style="color:#cccccc;line-height:1.6;">
          You can log in to the members area at <a href="https://orca-ireland.com" style="color:#ff6b00;">orca-ireland.com</a> to view race entries, results, and your garage.
        </p>
        <p style="color:#cccccc;line-height:1.6;">
          Race days are held at St Anne's Park, Dublin. See you on the track! 🏁
        </p>
      </div>
      <div style="background:#141414;padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);font-size:0.75rem;color:#666;">
        ORCA Ireland · St Anne's Park, Dublin · orca-ireland.com
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
    to: email,
    subject,
    html,
  });
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhookSecret = Netlify.env.get("STRIPE_WEBHOOK_SECRET");
  const sigHeader = req.headers.get("stripe-signature") || "";
  const payload = await req.text();

  // Verify signature if secret is configured
  if (webhookSecret) {
    const valid = await verifyStripeSignature(payload, sigHeader, webhookSecret);
    if (!valid) {
      console.error("Stripe webhook signature verification failed");
      return new Response("Invalid signature", { status: 400 });
    }
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Only handle successful payments
  if (event.type !== "checkout.session.completed" && event.type !== "payment_intent.succeeded") {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  try {
    const session = event.data.object;

    // Extract username from custom field
    let username: string | null = null;
    const customFields = session.custom_fields || [];
    for (const field of customFields) {
      if (field.key === "orca_username" || field.label?.custom?.toLowerCase().includes("username")) {
        username = field.text?.value?.trim().toLowerCase() || null;
        break;
      }
    }

    // Also try metadata
    if (!username && session.metadata?.username) {
      username = session.metadata.username.trim().toLowerCase();
    }

    if (!username) {
      console.error("Stripe webhook: no username found in payment", session.id);
      return new Response(JSON.stringify({ received: true, warning: "no username" }), { status: 200 });
    }

    const supabase = getSupabase();

    // Look up member
    const { data: member, error: lookupError } = await supabase
      .from("members")
      .select("id, first_name, last_name, email, expiry_date, membership_status")
      .eq("username", username)
      .single();

    if (lookupError || !member) {
      console.error("Stripe webhook: member not found for username", username);
      return new Response(JSON.stringify({ received: true, warning: "member not found" }), { status: 200 });
    }

    const isRenewal = member.membership_status === "active";
    const newExpiry = getMembershipExpiry();

    // Activate / renew membership
    const { error: updateError } = await supabase
      .from("members")
      .update({
        membership_status: "active",
        expiry_date: newExpiry,
        suspended: false,
      })
      .eq("id", member.id);

    if (updateError) {
      console.error("Stripe webhook: failed to update member", updateError);
      return new Response(JSON.stringify({ error: "DB update failed" }), { status: 500 });
    }

    // Send welcome/renewal email
    try {
      await sendWelcomeEmail(member.email, member.first_name, isRenewal, newExpiry);
    } catch (emailErr) {
      console.error("Stripe webhook: email send failed", emailErr);
      // Don't fail the webhook over email issues
    }

    console.log(`Stripe webhook: activated member ${username}, expiry ${newExpiry}`);
    return new Response(JSON.stringify({ received: true, activated: username }), { status: 200 });

  } catch (err) {
    console.error("Stripe webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
};
