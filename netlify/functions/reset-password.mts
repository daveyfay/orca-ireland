import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL")!,
  Netlify.env.get("SUPABASE_SERVICE_KEY")!
);

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { token, newPassword } = body;

  if (!token || !newPassword) {
    return new Response(JSON.stringify({ error: "Token and new password required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  if (newPassword.length < 8) {
    return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Find member with this token
  const { data: member, error } = await supabase
    .from("members")
    .select("*")
    .eq("reset_token", token)
    .single();

  if (error || !member) {
    return new Response(JSON.stringify({ error: "Invalid or expired reset link. Please request a new one." }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Check token hasn't expired
  const expiresAt = new Date(member.reset_token_expires);
  if (new Date() > expiresAt) {
    return new Response(JSON.stringify({ error: "This reset link has expired. Please request a new one." }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Hash the new password before storing
  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  // Update password and clear token
  const { error: updateError } = await supabase
    .from("members")
    .update({
      password_hash: newPasswordHash,
      reset_token: null,
      reset_token_expires: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", member.id);

  if (updateError) {
    return new Response(JSON.stringify({ error: "Database error. Please try again." }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ success: true, message: "Password updated successfully. You can now log in." }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/reset-password",
};
