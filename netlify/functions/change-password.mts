import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { verifySessionToken } from "./auth-utils.mts";
import bcrypt from "bcryptjs";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL")!,
  Netlify.env.get("SUPABASE_SERVICE_KEY")!
);

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { username, email, currentPassword, newPassword, sessionToken } = await req.json();
    const identifier = (email || username || "").toLowerCase().trim();

    if (!identifier || !currentPassword || !newPassword) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    // Require a valid session — password alone is not enough
    if (!sessionToken) {
      return new Response(JSON.stringify({ error: "Session token required" }), { status: 401 });
    }
    const session = await verifySessionToken(sessionToken);
    if (!session) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401 });
    }

    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400 });
    }

    const isEmail = identifier.includes("@");

    // Fetch member by email or username
    const { data: member, error } = await supabase
      .from("members")
      .select("id, password_hash, suspended")
      .eq(isEmail ? "email" : "username", identifier)
      .single();

    if (error || !member) {
      return new Response(JSON.stringify({ error: "Member not found" }), { status: 404 });
    }

    if (member.suspended) {
      return new Response(JSON.stringify({ error: "Account suspended" }), { status: 403 });
    }

    // Verify current password (supports bcrypt and legacy plain-text)
    const valid = member.password_hash.startsWith("$2")
      ? await bcrypt.compare(currentPassword, member.password_hash)
      : member.password_hash === currentPassword;
    if (!valid) {
      return new Response(JSON.stringify({ error: "Current password is incorrect" }), { status: 401 });
    }

    // Hash new password
    const newHash = await bcrypt.hash(newPassword, 12);

    // Update in DB
    const { error: updateError } = await supabase
      .from("members")
      .update({ password_hash: newHash })
      .eq("id", member.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e: any) {
    console.error("change-password error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
