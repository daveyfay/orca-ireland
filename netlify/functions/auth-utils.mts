// ─── Shared auth utilities ────────────────────────────────────────────────────
// All protected endpoints use verifySession() instead of just username lookup.
// The client sends { username, password } on every request and we re-validate
// server-side — no tokens, no cookies, no state to steal or forge.

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

export function getSupabase() {
  return createClient(
    Netlify.env.get("SUPABASE_URL")!,
    Netlify.env.get("SUPABASE_SERVICE_KEY")!
  );
}

export interface SessionMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  expiry_date: string;
  membership_type: string;
  is_admin: boolean;
  suspended: boolean;
}

/**
 * Verify username + password and return the member, or null if invalid.
 * Used by every protected endpoint so auth cannot be bypassed by guessing a username.
 */
export async function verifySession(
  username: string | null | undefined,
  password: string | null | undefined
): Promise<SessionMember | null> {
  if (!username || !password) return null;

  const supabase = getSupabase();
  const identifier = username.toLowerCase().trim();
  const isEmail = identifier.includes("@");

  const { data: member } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, expiry_date, membership_type, password_hash, is_admin, suspended")
    .eq(isEmail ? "email" : "username", identifier)
    .single();

  if (!member) return null;
  if (member.suspended) return null;

  // Support both legacy plain-text passwords (during migration) and bcrypt hashes
  const isHashed = member.password_hash.startsWith("$2");
  const passwordOk = isHashed
    ? await bcrypt.compare(password, member.password_hash)
    : member.password_hash === password;
  if (!passwordOk) return null;

  // Auto-upgrade plain-text password to bcrypt on successful auth
  if (!isHashed) {
    const newHash = await bcrypt.hash(password, 12);
    const supabaseUpgrade = getSupabase();
    await supabaseUpgrade.from("members").update({ password_hash: newHash }).eq("id", member.id);
  }

  return {
    id: member.id,
    first_name: member.first_name,
    last_name: member.last_name,
    email: member.email,
    expiry_date: member.expiry_date,
    membership_type: member.membership_type,
    is_admin: !!member.is_admin,
    suspended: member.suspended,
  };
}

/**
 * Verify session AND require is_admin = true.
 */
export async function verifyAdmin(
  username: string | null | undefined,
  password: string | null | undefined
): Promise<SessionMember | null> {
  const member = await verifySession(username, password);
  if (!member || !member.is_admin) return null;
  return member;
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
