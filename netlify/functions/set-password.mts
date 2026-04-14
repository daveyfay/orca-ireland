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

  // Look up member by pay_token (reused as confirm token)
  const { data: member, error } = await supabase
    .from("members")
    .select("id, first_name, email, expiry_date, membership_type, created_at")
    .eq("pay_token", token)
    .single();

  if (error || !member) return jsonResponse({ error: "Invalid or expired link" }, 400);

  // Enforce 24-hour token expiry (token set at account creation time)
  const createdAt = new Date(member.created_at);
  const tokenAge = Date.now() - createdAt.getTime();
  if (tokenAge > 24 * 60 * 60 * 1000) {
    return jsonResponse({ error: "This confirmation link has expired. Please contact the club." }, 400);
  }

  if (action === "verify") {
    return jsonResponse({ valid: true, firstName: member.first_name, isJunior: member.membership_type === "junior" });
  }

  if (action === "set") {
    if (!password || password.length < 8) return jsonResponse({ error: "Password must be at least 8 characters" }, 400);

    const { guardianName } = body;
    if (member.membership_type === "junior" && !guardianName?.trim()) {
      return jsonResponse({ error: "Responsible adult name is required for junior memberships" }, 400);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const updateData: any = {
      password_hash: passwordHash,
      suspended: false,
      pay_token: null,
    };
    if (guardianName?.trim()) updateData.guardian_name = guardianName.trim();

    const { error: updateError } = await supabase
      .from("members")
      .update(updateData)
      .eq("id", member.id);

    if (updateError) return jsonResponse({ error: "Failed to activate account" }, 500);

    return jsonResponse({ success: true, email: member.email });
  }

  return jsonResponse({ error: "Invalid action" }, 400);
};

export const config = { path: "/api/set-password" };
