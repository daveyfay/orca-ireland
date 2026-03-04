import type { Context } from "@netlify/functions";
import { getSupabase, jsonResponse } from "./auth-utils.mts";
import bcrypt from "bcryptjs";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }

  const { token, action, password } = body;
  if (!token) return jsonResponse({ error: "Token required" }, 400);

  const supabase = getSupabase();

  // Look up member by confirm token
  const { data: member, error } = await supabase
    .from("members")
    .select("id, first_name, email, confirm_token_expires, membership_status")
    .eq("confirm_token", token)
    .single();

  if (error || !member) return jsonResponse({ error: "Invalid or expired link" }, 400);

  // Check token not expired
  const expires = new Date(member.confirm_token_expires);
  if (expires < new Date()) return jsonResponse({ error: "This link has expired. Please contact orcaireland25@gmail.com." }, 400);

  // VERIFY action — just check token is valid
  if (action === "verify") {
    return jsonResponse({ valid: true, firstName: member.first_name });
  }

  // SET action — set password and activate account
  if (action === "set") {
    if (!password || password.length < 8) return jsonResponse({ error: "Password must be at least 8 characters" }, 400);

    const passwordHash = await bcrypt.hash(password, 10);

    const { error: updateError } = await supabase
      .from("members")
      .update({
        password_hash: passwordHash,
        membership_status: "active",
        registration_complete: true,
        confirm_token: null,
        confirm_token_expires: null,
        suspended: false,
      })
      .eq("id", member.id);

    if (updateError) return jsonResponse({ error: "Failed to activate account" }, 500);

    return jsonResponse({ success: true, email: member.email });
  }

  return jsonResponse({ error: "Invalid action" }, 400);
};

export const config = { path: "/api/set-password" };
