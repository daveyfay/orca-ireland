import type { Context } from "@netlify/functions";
import { getSupabase, jsonResponse } from "./auth-utils.mts";
import bcrypt from "bcryptjs";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // Accept email (new) or username (legacy fallback)
  const identifier = (body.email || body.username || "").toLowerCase().trim();
  const { password } = body;
  if (!identifier || !password) {
    return jsonResponse({ error: "Missing credentials" }, 400);
  }

  const supabase = getSupabase();

  // Rate limit: max 10 failed attempts per IP per 15 minutes
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { count: recentFailures } = await supabase
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .eq("success", false)
    .gte("attempted_at", windowStart) as any;

  if ((recentFailures ?? 0) >= 10) {
    return jsonResponse({ error: "Too many failed attempts. Please try again in 15 minutes." }, 429);
  }

  // Look up by email first, fallback to username for legacy accounts
  const isEmail = identifier.includes("@");
  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq(isEmail ? "email" : "username", identifier)
    .single();

  // Verify password (supports bcrypt hashes and legacy plain-text)
  let passwordOk = false;
  if (member) {
    const isHashed = member.password_hash.startsWith("$2");
    passwordOk = isHashed
      ? await bcrypt.compare(password, member.password_hash)
      : member.password_hash === password;

    // Auto-upgrade plain-text password to bcrypt on successful login
    if (passwordOk && !isHashed) {
      const newHash = await bcrypt.hash(password, 12);
      await supabase.from("members").update({ password_hash: newHash }).eq("id", member.id);
    }
  }

  if (!member || !passwordOk) {
    await supabase.from("login_attempts").insert({
      ip_address: ip,
      username: identifier.slice(0, 50),
      success: false,
      attempted_at: new Date().toISOString(),
    });
    return jsonResponse({ error: "Incorrect email or password." }, 401);
  }

  if (member.suspended) {
    return jsonResponse({ error: "Your account has been suspended. Please contact the club." }, 403);
  }

  // Log successful attempt
  await supabase.from("login_attempts").insert({
    ip_address: ip,
    username: member.email,
    success: true,
    attempted_at: new Date().toISOString(),
  });

  const expiry = new Date(member.expiry_date);
  const now = new Date();
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    const baseLink = member.membership_type === "junior"
      ? "https://buy.stripe.com/28E7sKcAvbMS22CcTK4ko03"
      : "https://buy.stripe.com/7sYaEW58304a7mWdXO4ko00";
    const renewLink = `${baseLink}?prefilled_email=${encodeURIComponent(member.email)}`;
    return jsonResponse({
      error: "expired",
      message: `Your membership expired on ${expiry.toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })}.`,
      renewLink,
      price: member.membership_type === "junior" ? "€25" : "€50",
    }, 403);
  }

  const expiryFormatted = expiry.toLocaleDateString("en-IE", {
    day: "numeric", month: "long", year: "numeric",
  });

  return jsonResponse({
    success: true,
    member: {
      firstName: member.first_name,
      lastName: member.last_name,
      username: member.username,
      email: member.email,
      membershipType: member.membership_type,
      expiryDate: expiryFormatted,
      daysLeft,
      expiringSoon: daysLeft <= 61,
      isAdmin: !!member.is_admin,
    },
  });
};

export const config = {
  path: "/api/login",
};
