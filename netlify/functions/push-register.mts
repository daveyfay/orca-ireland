import type { Context } from "@netlify/functions";
import { getSupabase, verifySession, jsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { email, sessionToken, pushToken } = body;
  if (!email || !sessionToken || !pushToken) {
    return json({ error: "email, sessionToken and pushToken required" }, 400);
  }

  const supabase = getSupabase();

  // Verify session
  const member = await verifySession(email, null, sessionToken);
  if (!member) return json({ error: "Unauthorised" }, 403);

  // Upsert push token
  const { error } = await supabase
    .from("push_tokens")
    .upsert(
      { member_id: member.id, token: pushToken, updated_at: new Date().toISOString() },
      { onConflict: "member_id,token" }
    );

  if (error) return json({ error: "DB error" }, 500);
  return json({ success: true });
};

export const config = { path: "/api/push-register" };
