import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
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
    const { username, currentPassword, newPassword } = await req.json();

    if (!username || !currentPassword || !newPassword) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400 });
    }

    // Fetch member
    const { data: member, error } = await supabase
      .from("members")
      .select("id, password_hash, suspended")
      .eq("username", username.toLowerCase())
      .single();

    if (error || !member) {
      return new Response(JSON.stringify({ error: "Member not found" }), { status: 404 });
    }

    if (member.suspended) {
      return new Response(JSON.stringify({ error: "Account suspended" }), { status: 403 });
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, member.password_hash);
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
