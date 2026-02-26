import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL")!,
  Netlify.env.get("SUPABASE_SERVICE_KEY")!
);

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { username, password } = body;
  if (!username || !password) {
    return new Response(JSON.stringify({ error: "Missing credentials" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { data: member, error } = await supabase
    .from("members")
    .select("*")
    .eq("username", username.toLowerCase().trim())
    .single();

  if (error || !member) {
    return new Response(JSON.stringify({ error: "Incorrect username or password." }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  if (member.suspended) {
    return new Response(JSON.stringify({ error: "Your account has been suspended. Please contact the club." }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  if (member.password_hash !== password) {
    return new Response(JSON.stringify({ error: "Incorrect username or password." }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  // Check expiry
  const expiry = new Date(member.expiry_date);
  const now = new Date();
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    const renewLink = member.membership_type === "junior"
      ? "https://checkout.revolut.com/pay/427f6965-cc16-41c4-ad4f-daf595e1b2fd"
      : "https://checkout.revolut.com/pay/6f7d1000-f489-48f5-a322-527d113130eb";

    return new Response(
      JSON.stringify({
        error: "expired",
        message: `Your membership expired on ${expiry.toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })}.`,
        renewLink,
        price: member.membership_type === "junior" ? "€25" : "€50",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const expiryFormatted = expiry.toLocaleDateString("en-IE", {
    day: "numeric", month: "long", year: "numeric",
  });

  return new Response(
    JSON.stringify({
      success: true,
      member: {
        firstName: member.first_name,
        lastName: member.last_name,
        username: member.username,
        membershipType: member.membership_type,
        expiryDate: expiryFormatted,
        daysLeft,
        expiringSoon: daysLeft <= 61, // Warn from ~Nov 1 onwards for Dec 31 expiry
        isAdmin: !!member.is_admin,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/login",
};
