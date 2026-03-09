import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL")!,
  Netlify.env.get("SUPABASE_SERVICE_KEY")!
);

export default async (req: Request, context: Context) => {
  const { data, error } = await supabase
    .from("gallery")
    .select("id, url, caption, is_large, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: "DB error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ images: data || [] }), {
    status: 200, headers: {
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=600, stale-while-revalidate=60",
    },
  });
};

export const config = { path: "/api/gallery" };
