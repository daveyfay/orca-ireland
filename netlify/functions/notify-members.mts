import type { Context } from "@netlify/functions";
import { getSupabase, jsonResponse } from "./auth-utils.mts";
import nodemailer from "nodemailer";

const json = jsonResponse;
const SITE_URL = Netlify.env.get("SITE_URL") || "https://orca-ireland.com";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: Netlify.env.get("GMAIL_USER")!,
    pass: Netlify.env.get("GMAIL_APP_PASSWORD")!,
  },
});

function baseTemplate(title: string, preheader: string, body: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#111;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#1a1a1a;border-radius:8px;overflow:hidden;">
  <div style="background:#111;padding:24px 32px;border-bottom:3px solid #ff6b00;text-align:center;">
    <div style="font-size:1.8rem;font-weight:900;color:#fff;letter-spacing:2px;">ORCA <span style="color:#ff6b00;">IRELAND</span></div>
    <div style="color:#888;font-size:0.8rem;margin-top:4px;">On Road Circuit Association</div>
  </div>
  <div style="padding:32px;">
    ${body}
    <hr style="border:none;border-top:1px solid #333;margin:28px 0;">
    <p style="color:#555;font-size:0.78rem;margin:0;">You're receiving this because you're an ORCA Ireland member.
    <a href="${SITE_URL}/#members" style="color:#ff6b00;">Visit members area →</a></p>
  </div>
</div>
</body></html>`;
}

async function sendNewArticleEmails(articleTitle: string, articleCategory: string, articleIntro: string) {
  const supabase = getSupabase();
  const today = new Date().toISOString().split("T")[0];
  const { data: members, error } = await supabase
    .from("members")
    .select("first_name, email")
    .gte("expiry_date", today)
    .eq("suspended", false)
    .eq("no_marketplace_emails", false);

  if (error || !members?.length) return { sent: 0 };

  const categoryLabel = articleCategory === "technical" ? "Technical Guide" :
    articleCategory === "news" ? "Club News" :
    articleCategory === "race-day" ? "Race Day" : "Article";

  const body = `
    <p style="color:#ff6b00;font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">New ${categoryLabel}</p>
    <h2 style="color:#fff;margin:0 0 16px;font-size:1.4rem;">${articleTitle}</h2>
    <p style="color:#bbb;line-height:1.6;margin:0 0 24px;">${articleIntro}</p>
    <a href="${SITE_URL}/#members" style="display:inline-block;background:#ff6b00;color:#000;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:0.9rem;letter-spacing:1px;">READ IN MEMBERS AREA →</a>`;

  let sent = 0;
  for (const m of members) {
    try {
      await transporter.sendMail({
        from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
        to: m.email,
        subject: `New ${categoryLabel}: ${articleTitle}`,
        html: baseTemplate(articleTitle, `New ${categoryLabel} — ${articleTitle}`, body.replace("{{name}}", m.first_name || "Member")),
      });
      sent++;
    } catch (e) { console.error("Email failed for", m.email, e); }
  }
  return { sent };
}

async function sendNewListingEmails(listingTitle: string, listingPrice: number, sellerName: string, imageUrl: string | null) {
  const supabase = getSupabase();
  const today = new Date().toISOString().split("T")[0];
  const { data: members, error } = await supabase
    .from("members")
    .select("first_name, email")
    .gte("expiry_date", today)
    .eq("suspended", false)
    .eq("no_marketplace_emails", false);

  if (error || !members?.length) return { sent: 0 };

  const imgHtml = imageUrl
    ? `<img src="${imageUrl}" alt="${listingTitle}" style="width:100%;max-height:280px;object-fit:cover;border-radius:6px;margin-bottom:20px;display:block;">`
    : `<div style="width:100%;height:120px;background:#222;border-radius:6px;margin-bottom:20px;display:flex;align-items:center;justify-content:center;font-size:2rem;">🏎️</div>`;

  const body = `
    <p style="color:#ff6b00;font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">New Item For Sale</p>
    <h2 style="color:#fff;margin:0 0 16px;font-size:1.4rem;">${listingTitle}</h2>
    ${imgHtml}
    <div style="display:flex;gap:16px;margin-bottom:20px;">
      <div style="background:#222;padding:12px 16px;border-radius:6px;flex:1;">
        <div style="color:#888;font-size:0.75rem;margin-bottom:4px;">PRICE</div>
        <div style="color:#ff6b00;font-size:1.3rem;font-weight:700;">€${listingPrice}</div>
      </div>
      <div style="background:#222;padding:12px 16px;border-radius:6px;flex:1;">
        <div style="color:#888;font-size:0.75rem;margin-bottom:4px;">SELLER</div>
        <div style="color:#fff;font-size:1rem;font-weight:600;">${sellerName}</div>
      </div>
    </div>
    <a href="${SITE_URL}/#forsale" style="display:inline-block;background:#ff6b00;color:#000;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:0.9rem;letter-spacing:1px;">VIEW LISTING →</a>`;

  let sent = 0;
  for (const m of members) {
    try {
      await transporter.sendMail({
        from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
        to: m.email,
        subject: `For Sale: ${listingTitle} — €${listingPrice}`,
        html: baseTemplate(listingTitle, `New listing — ${listingTitle} €${listingPrice}`, body),
      });
      sent++;
    } catch (e) { console.error("Email failed for", m.email, e); }
  }
  return { sent };
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const secret = req.headers.get("x-notify-secret");
  const expectedSecret = Netlify.env.get("CRON_SECRET") || "orca2026-cron-xK9mP3qR7vL2";
  if (secret !== expectedSecret) return json({ error: "Unauthorised" }, 403);

  const { type } = body;

  if (type === "new_article") {
    const { title, category, intro } = body;
    if (!title || !category) return json({ error: "title and category required" }, 400);
    const result = await sendNewArticleEmails(title, category, intro || "");
    return json({ ok: true, ...result });
  }

  if (type === "new_listing") {
    const { title, price, seller_name, image_url } = body;
    if (!title || !price) return json({ error: "title and price required" }, 400);
    const result = await sendNewListingEmails(title, price, seller_name || "ORCA Member", image_url || null);
    return json({ ok: true, ...result });
  }

  return json({ error: "Unknown type" }, 400);
};

export const config = { path: "/api/notify-members" };
