import type { Context } from "@netlify/functions";
import { getSupabase, jsonResponse } from "./auth-utils.mts";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch {}

  const { sessionToken } = body;
  if (sessionToken) {
    const supabase = getSupabase();
    await supabase.from("sessions").delete().eq("token", sessionToken);
  }

  return jsonResponse({ success: true });
};

export const config = { path: "/api/logout" };
