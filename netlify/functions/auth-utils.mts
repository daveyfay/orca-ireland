// ─── Shared auth utilities ────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

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

/** Create a secure session token for a member after successful login. */
export async function createSession(memberId: string, ip?: string): Promise<string> {
  const supabase = getSupabase();
  const token = crypto.randomBytes(32).toString("hex"); // 256-bit token
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await supabase.from("sessions").insert({
    member_id: memberId,
    token,
    expires_at: expiresAt.toISOString(),
    ip_address: ip || null,
  });
  return token;
}

/** Verify a session token, returning the member or null. */
export async function verifySessionToken(token: string | null | undefined): Promise<SessionMember | null> {
  if (!token) return null;
  const supabase = getSupabase();

  const { data: session } = await supabase
    .from("sessions")
    .select("member_id, expires_at")
    .eq("token", token)
    .single();

  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    // Expired — clean up
    await supabase.from("sessions").delete().eq("token", token);
    return null;
  }

  const { data: member } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, expiry_date, membership_type, is_admin, suspended")
    .eq("id", session.member_id)
    .single();

  if (!member || member.suspended) return null;

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
 * Verify request auth — accepts either:
 *   { sessionToken } — new secure token-based auth
 *   { username, password } — legacy credential auth (still supported)
 */
export async function verifySession(
  username: string | null | undefined,
  password: string | null | undefined,
  sessionToken?: string | null
): Promise<SessionMember | null> {
  // Prefer token auth
  if (sessionToken) {
    return verifySessionToken(sessionToken);
  }

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

  const isHashed = member.password_hash.startsWith("$2");
  const passwordOk = isHashed
    ? await bcrypt.compare(password, member.password_hash)
    : member.password_hash === password;
  if (!passwordOk) return null;

  // Auto-upgrade plain-text password to bcrypt
  if (!isHashed) {
    const newHash = await bcrypt.hash(password, 12);
    await getSupabase().from("members").update({ password_hash: newHash }).eq("id", member.id);
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

/** Verify session AND require is_admin = true. */
export async function verifyAdmin(
  username: string | null | undefined,
  password: string | null | undefined,
  sessionToken?: string | null
): Promise<SessionMember | null> {
  const member = await verifySession(username, password, sessionToken);
  if (!member || !member.is_admin) return null;
  return member;
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}


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
