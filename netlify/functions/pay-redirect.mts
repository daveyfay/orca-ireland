import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL")!,
  Netlify.env.get("SUPABASE_SERVICE_KEY")!
);

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  const siteUrl = Netlify.env.get("SITE_URL") || "https://orca-ireland.com";

  if (!token) {
    return Response.redirect(siteUrl, 302);
  }

  // Find member by token
  const { data: member, error } = await supabase
    .from("members")
    .select("id, membership_type, payment_clicked_at")
    .eq("pay_token", token)
    .single();

  if (error || !member) {
    return Response.redirect(siteUrl, 302);
  }

  // Log the click (only update if not already clicked — preserve first click time)
  if (!member.payment_clicked_at) {
    await supabase
      .from("members")
      .update({ payment_clicked_at: new Date().toISOString() })
      .eq("id", member.id);
  }

  // Redirect to correct Revolut link based on membership type
  const isJunior = member.membership_type === "junior";
  const payLink = isJunior
    ? "https://checkout.revolut.com/pay/427f6965-cc16-41c4-ad4f-daf595e1b2fd"
    : "https://checkout.revolut.com/pay/6f7d1000-f489-48f5-a322-527d113130eb";

  return Response.redirect(payLink, 302);
};

export const config = { path: "/pay" };
