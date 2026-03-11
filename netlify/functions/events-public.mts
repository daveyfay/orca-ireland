import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL")!,
  Netlify.env.get("SUPABASE_SERVICE_KEY")!
);

export default async (req: Request, context: Context) => {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, event_date, description, location, classes, entry_fee, payment_url, status, is_featured, is_national, sort_order")
    .order("sort_order", { ascending: true })
    .order("event_date", { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: "DB error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ events: data || [] }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=300", // 5 min CDN cache
    },
  });
};

export const config = { path: "/api/events-public" };
