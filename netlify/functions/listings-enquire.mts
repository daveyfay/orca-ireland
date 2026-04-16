import type { Context } from "@netlify/functions";
import { getSupabase, jsonResponse } from "./auth-utils.mts";
import nodemailer from "nodemailer";

const json = jsonResponse;

function esc(s: string): string {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: Netlify.env.get("GMAIL_USER")!,
    pass: Netlify.env.get("GMAIL_APP_PASSWORD")!,
  },
});

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { listing_id, enquirer_name: rawName, enquirer_phone: rawPhone } = body;
  if (!listing_id || !rawName || !rawPhone) {
    return json({ error: "listing_id, enquirer_name and enquirer_phone are required" }, 400);
  }

  // Rate limit: max 5 enquiries per IP per hour.
  // Track by inserting a row per enquiry and counting recent ones.
  const supabase = getSupabase();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .eq("identifier", "__enquiry__")
    .gte("attempted_at", windowStart) as any;
  if ((recentCount ?? 0) >= 5) {
    return json({ error: "Too many requests. Please try again later." }, 429);
  }
  // Log this enquiry for rate-limit tracking
  await supabase.from("login_attempts").insert({
    ip_address: ip,
    identifier: "__enquiry__",
    success: true,
    attempted_at: new Date().toISOString(),
  }).catch(() => {});

  // Sanitise and limit input lengths
  const enquirer_name = esc(String(rawName).slice(0, 100));
  const enquirer_phone = esc(String(rawPhone).slice(0, 30));
  const { data: listing, error } = await supabase
    .from("marketplace_listings")
    .select("id, title, price, seller_name, seller_email, active")
    .eq("id", listing_id)
    .single();

  if (error || !listing) return json({ error: "Listing not found" }, 404);
  if (!listing.active) return json({ error: "This listing is no longer active" }, 410);

  try {
    await transporter.sendMail({
      from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
      to: listing.seller_email,
      subject: `Enquiry about your listing: ${listing.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#111;color:#fff;border-radius:12px;overflow:hidden;">
          <div style="background:#ff6b00;padding:20px 28px;">
            <h2 style="margin:0;font-size:1.2rem;letter-spacing:2px;">NEW ENQUIRY 🏁</h2>
          </div>
          <div style="padding:28px;">
            <p style="color:#aaa;margin-top:0;">Someone is interested in your listing on <strong style="color:#fff;">ORCA Ireland</strong>:</p>
            <div style="background:#1a1a1a;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
              <div style="font-size:1.1rem;font-weight:700;">${listing.title}</div>
              <div style="color:#ff6b00;font-size:1.2rem;font-weight:700;margin-top:4px;">€${listing.price}</div>
            </div>
            <p style="color:#aaa;">Their contact details:</p>
            <div style="background:#1a1a1a;border-radius:8px;padding:16px 20px;">
              <div><strong>Name:</strong> ${enquirer_name}</div>
              <div style="margin-top:8px;"><strong>Phone:</strong> <a href="tel:${enquirer_phone}" style="color:#ff6b00;">${enquirer_phone}</a></div>
            </div>
            <p style="color:#888;font-size:0.82rem;margin-top:24px;">This enquiry was sent via orca-ireland.com. Reply directly to the buyer using the phone number above.</p>
          </div>
        </div>`,
    });

    return json({ sent: true });
  } catch (err) {
    console.error("Email error:", err);
    return json({ error: "Failed to send email" }, 500);
  }
};

export const config = { path: "/api/listings-enquire" };
