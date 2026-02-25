import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL")!,
  Netlify.env.get("SUPABASE_SERVICE_KEY")!
);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: Netlify.env.get("GMAIL_USER")!,
    pass: Netlify.env.get("GMAIL_APP_PASSWORD")!,
  },
});

export default async (req: Request) => {
  const now = new Date();
  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);

  // Get members expiring in next 30 days
  const { data: expiringSoon } = await supabase
    .from("members")
    .select("first_name, last_name, email, membership_type, expiry_date")
    .gte("expiry_date", now.toISOString().split("T")[0])
    .lte("expiry_date", in30Days.toISOString().split("T")[0])
    .order("expiry_date", { ascending: true });

  // Get already expired (within last 7 days)
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentlyExpired } = await supabase
    .from("members")
    .select("first_name, last_name, email, membership_type, expiry_date")
    .gte("expiry_date", sevenDaysAgo.toISOString().split("T")[0])
    .lt("expiry_date", now.toISOString().split("T")[0])
    .order("expiry_date", { ascending: true });

  if ((!expiringSoon || expiringSoon.length === 0) && (!recentlyExpired || recentlyExpired.length === 0)) {
    console.log("No expiring or recently expired members — skipping email");
    return;
  }

  const formatRow = (m: any) => {
    const exp = new Date(m.expiry_date).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
    return `  ${m.first_name} ${m.last_name} (${m.email}) — ${m.membership_type} — expires ${exp}`;
  };

  let text = `ORCA Ireland — Weekly Membership Report\n${now.toLocaleDateString("en-IE")}\n\n`;

  if (expiringSoon && expiringSoon.length > 0) {
    text += `EXPIRING IN NEXT 30 DAYS (${expiringSoon.length}):\n`;
    text += expiringSoon.map(formatRow).join("\n") + "\n\n";
  }

  if (recentlyExpired && recentlyExpired.length > 0) {
    text += `RECENTLY EXPIRED — LAST 7 DAYS (${recentlyExpired.length}):\n`;
    text += recentlyExpired.map(formatRow).join("\n") + "\n";
  }

  await transporter.sendMail({
    from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
    to: Netlify.env.get("GMAIL_USER")!,
    subject: `ORCA Membership Report — ${expiringSoon?.length ?? 0} expiring soon`,
    text,
  });

  console.log("Weekly membership report sent");
};

export const config: Config = {
  schedule: "0 9 * * 1", // Every Monday at 9am UTC
};
