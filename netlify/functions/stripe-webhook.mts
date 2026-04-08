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

    // Reject webhooks older than 5 minutes to prevent replay attacks
    const webhookAge = Math.abs(Date.now() / 1000 - parseInt(timestamp));
    if (webhookAge > 300) {
      console.error("Stripe webhook: timestamp too old", webhookAge, "seconds");
      return false;
    }

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
        <div style="font-size:0.75rem;color:#888;letter-spacing:2px;margin-top:4px;">ON ROAD CIRCUIT ASSOCIATION</div>
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
        <div style="font-size:0.75rem;color:#888;letter-spacing:2px;margin-top:4px;">ON ROAD CIRCUIT ASSOCIATION</div>
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

    // ── Check if this is a marketplace purchase ──────────────────
    const listingId = session.metadata?.listing_id;
    if (listingId && session.metadata?.source === "orca_marketplace") {
      const supabase = getSupabase();

      // Extract buyer details and shipping address from session
      const buyerName  = session.customer_details?.name || null;
      const buyerEmail = (session.customer_details?.email || "").toLowerCase().trim() || null;
      const sa = session.shipping_details?.address || session.customer_details?.address || null;
      const shippingAddress = sa ? {
        name:     session.shipping_details?.name || buyerName,
        line1:    sa.line1   || null,
        line2:    sa.line2   || null,
        city:     sa.city    || null,
        county:   sa.state   || null,
        postcode: sa.postal_code || null,
        country:  sa.country || null,
      } : null;

      // Fetch listing details before updating
      const { data: listing } = await supabase
        .from("marketplace_listings")
        .select("title, price, seller_name, seller_email, quantity")
        .eq("id", listingId)
        .single();

      // Decrement quantity if tracked; mark sold only when qty drops to 0 (or no qty field)
      const currentQty = listing?.quantity ?? null;
      const newQty = currentQty !== null ? Math.max(0, currentQty - 1) : null;
      const markSold = newQty === null || newQty < 1;

      const updatePayload: any = {};
      if (newQty !== null) updatePayload.quantity = newQty;
      if (markSold) {
        updatePayload.sold = true;
        updatePayload.buyer_name = buyerName;
        updatePayload.buyer_email = buyerEmail;
        updatePayload.buyer_shipping_address = shippingAddress;
      }

      await supabase.from("marketplace_listings").update(updatePayload).eq("id", listingId);

      console.log("Stripe: marked listing sold", listingId, "buyer:", buyerEmail);

      // Email all admins
      if (listing) {
        const { data: admins } = await supabase
          .from("members")
          .select("first_name, email")
          .eq("is_admin", true)
          .eq("suspended", false);

        const siteUrl = Netlify.env.get("SITE_URL") || "https://orca-ireland.com";
        const shippingHtml = shippingAddress
          ? `<tr><td style="color:#888;font-size:13px;padding:6px 0;width:120px;">Ship To</td><td style="color:#f0f0f0;font-size:13px;padding:6px 0;">${shippingAddress.name || buyerName}<br>${[shippingAddress.line1, shippingAddress.line2, shippingAddress.city, shippingAddress.county, shippingAddress.postcode, shippingAddress.country].filter(Boolean).join(", ")}</td></tr>`
          : "";

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#0a0a0a;color:#f0f0f0;margin:0;padding:0}
  .w{max-width:580px;margin:0 auto;padding:32px 16px}
  .h{background:#141414;border-top:3px solid #ff6b00;border-radius:8px 8px 0 0;padding:28px 32px;text-align:center}
  .h h1{font-size:24px;letter-spacing:4px;color:#ff6b00;margin:0 0 4px}
  .h p{color:#888;font-size:12px;margin:0;letter-spacing:2px;text-transform:uppercase}
  .b{background:#1a1a1a;padding:28px 32px;border-radius:0 0 8px 8px}
  .box{background:#0a0a0a;border:1px solid rgba(255,107,0,0.25);border-radius:8px;padding:18px 22px;margin:16px 0}
  .box h3{color:#ff6b00;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px}
  table{width:100%;border-collapse:collapse}
  .footer{text-align:center;padding:20px 0 0;color:#444;font-size:11px}
</style></head><body>
<div class="w">
  <div class="h"><h1>ORCA IRELAND</h1><p>Marketplace Sale</p></div>
  <div class="b">
    <p style="font-size:15px;margin:0 0 20px;">🛒 <strong>A marketplace item has just been sold via Stripe.</strong></p>
    <div class="box">
      <h3>Item Sold</h3>
      <table>
        <tr><td style="color:#888;font-size:13px;padding:6px 0;width:120px;">Item</td><td style="color:#f0f0f0;font-weight:700;font-size:14px;padding:6px 0;">${listing.title}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:6px 0;">Price</td><td style="color:#ff6b00;font-weight:700;font-size:14px;padding:6px 0;">€${listing.price}</td></tr>
        ${newQty !== null ? `<tr><td style="color:#888;font-size:13px;padding:6px 0;">Stock Left</td><td style="color:#f0f0f0;font-size:13px;padding:6px 0;">${newQty === 0 ? "0 — now marked as sold" : newQty + " remaining"}</td></tr>` : ""}
        <tr><td style="color:#888;font-size:13px;padding:6px 0;">Seller</td><td style="color:#f0f0f0;font-size:13px;padding:6px 0;">${listing.seller_name} (${listing.seller_email})</td></tr>
      </table>
    </div>
    <div class="box">
      <h3>Buyer Details</h3>
      <table>
        <tr><td style="color:#888;font-size:13px;padding:6px 0;width:120px;">Name</td><td style="color:#f0f0f0;font-size:13px;padding:6px 0;">${buyerName || "—"}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:6px 0;">Email</td><td style="color:#f0f0f0;font-size:13px;padding:6px 0;">${buyerEmail || "—"}</td></tr>
        ${shippingHtml}
      </table>
    </div>
    <p style="font-size:13px;color:#888;margin:16px 0 0;">The listing has been automatically marked as sold in the admin panel.</p>
  </div>
  <div class="footer">© 2026 ORCA Ireland · <a href="${siteUrl}" style="color:#ff6b00;text-decoration:none;">orca-ireland.com</a></div>
</div></body></html>`;

        for (const admin of admins || []) {
          await transporter.sendMail({
            from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
            to: admin.email,
            subject: `🛒 Marketplace Sale — ${listing.title} (€${listing.price})`,
            html,
          }).catch(e => console.error("Admin sale email failed:", e));
        }
      }

      return new Response(JSON.stringify({ received: true, sold: listingId }), { status: 200 });
    }

    // ── Check if this is an event entry payment ─────────────────
    if (session.metadata?.type === "event_entry") {
      const supabase = getSupabase();
      const { event_id, event_name, event_date, member_id, car_id, car_class } = session.metadata;

      // Check not already entered (webhook may fire twice)
      const { data: existing } = await supabase
        .from("event_entries")
        .select("id")
        .eq("event_id", event_id)
        .eq("member_id", member_id)
        .single();

      if (!existing) {
        // Get car for transponder
        const { data: car } = await supabase.from("cars").select("*").eq("id", car_id).single();
        const { data: member } = await supabase.from("members").select("first_name, last_name, email").eq("id", member_id).single();

        const { data: entry } = await supabase.from("event_entries").insert({
          event_id,
          event_name,
          event_date,
          member_id,
          car_id,
          class: car_class,
          transponder: car?.transponder || null,
        }).select().single();

        console.log("Stripe: event entry confirmed", event_name, "member:", member?.email);

        // Send confirmation email
        if (member && entry && car) {
          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.default.createTransport({
            service: "gmail",
            auth: { user: Netlify.env.get("GMAIL_USER")!, pass: Netlify.env.get("GMAIL_APP_PASSWORD")! },
          });
          const siteUrl = Netlify.env.get("SITE_URL") || "https://orca-ireland.com";
          const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
            body{font-family:Arial,sans-serif;background:#0a0a0a;color:#f0f0f0;margin:0;padding:0}
            .w{max-width:580px;margin:0 auto;padding:32px 16px}
            .h{background:#141414;border-top:3px solid #ff6b00;border-radius:8px 8px 0 0;padding:32px;text-align:center}
            .h h1{font-size:28px;letter-spacing:4px;color:#ff6b00;margin:0 0 4px}
            .h p{color:#888;font-size:13px;margin:0;letter-spacing:2px;text-transform:uppercase}
            .b{background:#1a1a1a;padding:32px;border-radius:0 0 8px 8px}
            .box{background:#0a0a0a;border:1px solid rgba(255,107,0,0.3);border-radius:8px;padding:20px 24px;margin:20px 0}
            .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
            .row:last-child{border-bottom:none}
            .lbl{color:#888;font-size:13px}.val{color:#f0f0f0;font-weight:bold;font-size:13px}
            .footer{text-align:center;padding:24px 0 0;color:#555;font-size:12px}
          </style></head><body><div class="w">
          <div class="h"><h1>ORCA IRELAND</h1><p>Entry Confirmed — Payment Received</p></div>
          <div class="b">
            <p>Hi ${member.first_name},</p>
            <p>Your entry and payment for <strong>${event_name}</strong> have been confirmed. See you on race day! 🏁</p>
            <div class="box">
              <div class="row"><span class="lbl">Event</span><span class="val">${event_name}</span></div>
              <div class="row"><span class="lbl">Date</span><span class="val">${new Date(event_date).toLocaleDateString("en-IE",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span></div>
              <div class="row"><span class="lbl">Class</span><span class="val">${car_class.toUpperCase()}</span></div>
              <div class="row"><span class="lbl">Car</span><span class="val">${car.nickname} (${car.make} ${car.model})</span></div>
              <div class="row"><span class="lbl">Transponder</span><span class="val">${car.transponder || "Not set — update in garage"}</span></div>
              <div class="row"><span class="lbl">Entry Fee Paid</span><span class="val">€10.00 ✓</span></div>
            </div>
          </div>
          <div class="footer">© 2026 ORCA Ireland · <a href="${siteUrl}" style="color:#ff6b00;text-decoration:none;">orca-ireland.com</a></div>
          </div></body></html>`;
          await transporter.sendMail({
            from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
            to: member.email,
            subject: `✅ Entry Confirmed — ${event_name}`,
            html,
          }).catch(e => console.error("Confirmation email failed:", e));
        }
      }

      return new Response(JSON.stringify({ received: true, type: "event_entry" }), { status: 200 });
    }

    // ── Otherwise handle member payment ─────────────────────────
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
      // Determine membership type by amount (junior = €25 = 2500 cents)
      const amountTotal = session.amount_total || 0;
      const isJunior = amountTotal <= 2500;
      const membershipType = isJunior ? "junior" : "full";
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
        membership_type: membershipType,
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
