import type { Context } from "@netlify/functions";
import { getSupabase, verifySession, jsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const member = await verifySession(body.username, null, body.sessionToken);
  if (!member) return json({ error: "Unauthorized" }, 401);

  const { eventId, eventName, eventDate, carId, carClass } = body;
  if (!eventId || !eventName || !eventDate || !carId || !carClass) {
    return json({ error: "Missing required fields" }, 400);
  }

  const supabase = getSupabase();

  // Check membership valid
  if (new Date(member.expiry_date) < new Date()) {
    return json({ error: "Your membership has expired. Please renew to enter events." }, 403);
  }

  // Check entry not already closed
  const eventDateObj = new Date(eventDate);
  const cutoff = new Date(eventDateObj);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(18, 0, 0, 0);
  if (new Date() > cutoff) {
    return json({ error: "Entry deadline has passed for this event." }, 400);
  }

  // Check not already entered
  const { data: existing } = await supabase
    .from("event_entries")
    .select("id")
    .eq("event_id", eventId)
    .eq("member_id", member.id)
    .single();
  if (existing) return json({ error: "You are already entered in this event." }, 409);

  // Verify car ownership
  const { data: car } = await supabase
    .from("cars")
    .select("*")
    .eq("id", carId)
    .eq("member_id", member.id)
    .single();
  if (!car) return json({ error: "Car not found." }, 404);

  // Create Stripe checkout session
  const stripeSecret = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecret) return json({ error: "Stripe not configured." }, 500);

  const siteUrl = Netlify.env.get("SITE_URL") || "https://orca-ireland.com";

  const params = new URLSearchParams({
    "mode": "payment",
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][product_data][name]": `Race Entry — ${eventName}`,
    "line_items[0][price_data][product_data][description]": `${eventDate} · ${carClass.toUpperCase()} class · ${car.nickname}`,
    "line_items[0][price_data][unit_amount]": "1000", // €10.00
    "line_items[0][quantity]": "1",
    "customer_email": member.email,
    "metadata[event_id]": eventId,
    "metadata[event_name]": eventName,
    "metadata[event_date]": eventDate,
    "metadata[member_id]": member.id,
    "metadata[car_id]": carId,
    "metadata[car_class]": carClass,
    "metadata[type]": "event_entry",
    "success_url": `${siteUrl}/#members?entry=success&event=${encodeURIComponent(eventName)}`,
    "cancel_url": `${siteUrl}/#members?tab=entries`,
  });

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${stripeSecret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const session = await stripeRes.json() as any;
  if (!stripeRes.ok) {
    console.error("Stripe error:", session);
    return json({ error: session.error?.message || "Stripe error" }, 500);
  }

  return json({ url: session.url });
};

export const config = { path: "/api/entry-checkout" };
