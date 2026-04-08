import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { sendPushToMembers } from "./push-utils.mts";

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

const SITE_URL = Netlify.env.get("SITE_URL") || "https://orca-ireland.com";

function dateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

function formatDate(ds: string) {
  return new Date(ds).toLocaleDateString("en-IE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatCutoff(eventDate: string) {
  const d = new Date(eventDate);
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-IE", {
    weekday: "long", day: "numeric", month: "long",
  }) + " at 6:00 PM";
}

function buildReminderEmail(
  firstName: string,
  eventName: string,
  eventDate: string,
  reminderType: "14day" | "7day" | "cutoff",
  enteredNames: string[]
) {
  const formattedDate = formatDate(eventDate);
  const cutoffStr = formatCutoff(eventDate);
  const membersLink = `${SITE_URL}/#members`;

  let subjectPrefix = "";
  let headerColor = "#ff6b00";
  let urgencyLine = "";
  let socialProof = "";

  if (reminderType === "14day") {
    subjectPrefix = "2 Weeks to Go — Entry Now Open";
    urgencyLine = "Entry is now open — secure your spot early and pay your €10 entry fee in the members area.";
  } else if (reminderType === "7day") {
    subjectPrefix = "1 Week to Go — Don't Forget to Enter";
    urgencyLine = "One week to go and you haven't entered yet! Log in to the members area to enter and pay your €10 entry fee before it closes.";
    headerColor = "#e65c00";
  } else {
    subjectPrefix = "Last Chance — Entry Closes Tonight";
    urgencyLine = "Entry closes at 6:00 PM tonight. This is your final chance — log in now and pay your €10 entry fee to secure your spot.";
    headerColor = "#cc3300";

    if (enteredNames.length > 0) {
      const nameList = enteredNames.slice(0, 8).join(", ") +
        (enteredNames.length > 8 ? ` and ${enteredNames.length - 8} more` : "");
      socialProof = `
        <div style="background:#1a1a1a;border-left:3px solid #ff6b00;padding:16px 20px;margin:24px 0;border-radius:0 6px 6px 0;">
          <p style="margin:0;color:#cccccc;font-size:0.9rem;line-height:1.6;">
            <strong style="color:#ff6b00;">Already entered:</strong><br>
            ${nameList}<br><br>
            <span style="color:#999;">Don't miss out on championship points — enter now before it's too late!</span>
          </p>
        </div>`;
    }
  }

  const subject = `ORCA Ireland — ${subjectPrefix} — ${eventName}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#111111;">
    <div style="background:${headerColor};padding:32px 40px;text-align:center;">
      <div style="font-size:0.7rem;letter-spacing:3px;color:rgba(255,255,255,0.8);text-transform:uppercase;margin-bottom:8px;">ORCA Ireland</div>
      <h1 style="margin:0;color:#ffffff;font-size:1.6rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${subjectPrefix}</h1>
    </div>
    <div style="padding:36px 40px;">
      <p style="color:#cccccc;font-size:1rem;margin:0 0 8px;">Hi ${firstName},</p>
      <h2 style="color:#ffffff;font-size:1.3rem;margin:16px 0 8px;">${eventName}</h2>
      <p style="color:#ff6b00;font-size:0.9rem;margin:0 0 24px;font-weight:600;">${formattedDate} &nbsp;·&nbsp; St Anne's Park, Dublin</p>
      <p style="color:#cccccc;font-size:0.95rem;line-height:1.7;margin:0 0 20px;">${urgencyLine}</p>
      <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#888;font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;padding:6px 0;width:140px;">Race Date</td>
            <td style="color:#ffffff;font-size:0.9rem;padding:6px 0;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="color:#888;font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;padding:6px 0;">Venue</td>
            <td style="color:#ffffff;font-size:0.9rem;padding:6px 0;">St Anne's Park, Dublin</td>
          </tr>
          <tr>
            <td style="color:#888;font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;padding:6px 0;">Entry Fee</td>
            <td style="color:#ff6b00;font-size:0.9rem;font-weight:600;padding:6px 0;">€10 — pay online in the members area</td>
          </tr>
          <tr>
            <td style="color:#888;font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;padding:6px 0;">Entry Closes</td>
            <td style="color:#ff6b00;font-size:0.9rem;font-weight:600;padding:6px 0;">${cutoffStr}</td>
          </tr>
        </table>
      </div>
      ${socialProof}
      <div style="text-align:center;margin:32px 0;">
        <a href="${membersLink}"
           style="display:inline-block;background:#ff6b00;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:4px;font-size:1rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;">
          Enter &amp; Pay Now →
        </a>
        <p style="color:#666;font-size:0.75rem;margin:12px 0 0;">Log in to the Members Area · Enter Race tab</p>
      </div>
      <hr style="border:none;border-top:1px solid #222;margin:32px 0;">
      <p style="color:#666;font-size:0.8rem;line-height:1.6;margin:0;">
        You're receiving this because you're an active ORCA Ireland member who hasn't entered this event yet.
        Questions? Reply to this email or contact us at ${Netlify.env.get("GMAIL_USER")}.
      </p>
    </div>
    <div style="background:#0a0a0a;padding:20px 40px;text-align:center;border-top:1px solid #1a1a1a;">
      <p style="color:#444;font-size:0.75rem;margin:0;">ORCA Ireland · St Anne's Park, Dublin · <a href="${SITE_URL}" style="color:#666;text-decoration:none;">orca-ireland.com</a></p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

export default async (req: Request, context: Context) => {
  const secret = req.headers.get("x-cron-secret");
  const expectedSecret = Netlify.env.get("CRON_SECRET") || "orca2026-cron-xK9mP3qR7vL2";
  if (secret !== expectedSecret) {
    return new Response("Unauthorised", { status: 401 });
  }

  const now = new Date();
  const today = dateStr(now);

  const in14 = new Date(now); in14.setDate(in14.getDate() + 14);
  const in7  = new Date(now); in7.setDate(in7.getDate() + 7);
  const in1  = new Date(now); in1.setDate(in1.getDate() + 1);

  const target14 = dateStr(in14);
  const target7  = dateStr(in7);
  const target1  = dateStr(in1);

  // Load upcoming events
  const { data: events } = await supabase
    .from("events")
    .select("id, name, event_date")
    .gte("event_date", today)
    .order("event_date", { ascending: true });

  if (!events || events.length === 0) {
    return new Response("No upcoming events", { status: 200 });
  }

  // Load all active members
  const { data: members } = await supabase
    .from("members")
    .select("id, first_name, email, expiry_date, suspended")
    .eq("suspended", false);

  const activeMembers = (members || []).filter(m => new Date(m.expiry_date) >= now);

  if (activeMembers.length === 0) {
    return new Response("No active members", { status: 200 });
  }

  let emailsSent = 0;
  const results: string[] = [];

  for (const event of events) {
    const evDate = event.event_date;
    let reminderType: "14day" | "7day" | "cutoff" | null = null;

    if (evDate === target14) reminderType = "14day";
    else if (evDate === target7) reminderType = "7day";
    else if (evDate === target1) reminderType = "cutoff";

    if (!reminderType) continue;

    console.log(`Processing ${reminderType} reminder for ${event.name} (${evDate})`);

    // Get all member IDs who have already entered this event
    const { data: entries } = await supabase
      .from("event_entries")
      .select("member_id, members(first_name)")
      .eq("event_id", event.id);

    const enteredMemberIds = new Set((entries || []).map((e: any) => e.member_id));
    const enteredNames = (entries || []).map((e: any) => e.members?.first_name).filter(Boolean);

    // Only send to members who have NOT entered yet
    const notEnteredMembers = activeMembers.filter(m => !enteredMemberIds.has(m.id));

    if (notEnteredMembers.length === 0) {
      console.log(`All active members already entered for ${event.name} — skipping`);
      results.push(`${reminderType} for "${event.name}" — all members already entered, skipped`);
      continue;
    }

    console.log(`Sending ${reminderType} reminder for ${event.name} to ${notEnteredMembers.length} members (${enteredMemberIds.size} already entered)`);

    for (const member of notEnteredMembers) {
      const { subject, html } = buildReminderEmail(
        member.first_name,
        event.name,
        evDate,
        reminderType,
        enteredNames
      );
      try {
        await transporter.sendMail({
          from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
          to: member.email,
          subject,
          html,
        });
        emailsSent++;
      } catch (err) {
        console.error(`Failed to email ${member.email}:`, err);
      }
    }

    results.push(`${reminderType} for "${event.name}" → ${notEnteredMembers.length} not-yet-entered (${enteredMemberIds.size} already in)`);

    // Push notifications only to non-entered members
    try {
      const pushed = await sendPushToMembers(
        supabase,
        notEnteredMembers.map((m: any) => m.id),
        { title: `🏁 ${event.name}`, body: `You haven't entered yet — entry closes ${formatCutoff(evDate)}!`, data: { screen: "events" } }
      );
      if (pushed > 0) results.push(`push to ${pushed} devices`);
    } catch (e) {
      console.error("Push notification failed:", e);
    }
  }

  const summary = emailsSent > 0
    ? `Sent ${emailsSent} emails: ${results.join("; ")}`
    : "No reminders due today.";

  console.log(summary);
  return new Response(summary, { status: 200 });
};

export const config = { path: "/api/run-event-reminders" };
