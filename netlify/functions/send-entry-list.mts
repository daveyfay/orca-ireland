import type { Context } from "@netlify/functions";
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

export default async (req: Request, context: Context) => {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== Netlify.env.get("CRON_SECRET")) {
    return new Response("Unauthorised", { status: 401 });
  }
  const now = new Date();

  // Load events from DB
  const { data: dbEvents } = await supabase
    .from("events")
    .select("id, name, event_date")
    .order("event_date", { ascending: true });

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const todaysEvents = (dbEvents || [])
    .filter(e => e.event_date === tomorrowStr)
    .map(e => ({ id: e.id, name: e.name, date: e.event_date }));

  if (todaysEvents.length === 0) {
    console.log(`No events tomorrow (${tomorrowStr}) — skipping entry list email`);
    return new Response("No events tomorrow", { status: 200 });
  }

  for (const event of todaysEvents) {
    await sendEntryList(event, now);
  }

  return new Response("Entry lists sent", { status: 200 });
};

async function sendEntryList(event: { id: string; name: string; date: string }, now: Date) {
  const { data: entries, error } = await supabase
    .from("event_entries")
    .select(`
      id, class, transponder, created_at,
      members(first_name, last_name, email, membership_type),
      cars(nickname, make, model, color, transponder)
    `)
    .eq("event_id", event.id)
    .order("class", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase error fetching entries:", error);
    return;
  }

  const eventDateFormatted = new Date(event.date).toLocaleDateString("en-IE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const gt = (entries || []).filter(e => e.class === "gt");
  const gp = (entries || []).filter(e => e.class === "gp");
  const total = (entries || []).length;

  console.log(`Sending entry list for ${event.name}: ${total} entries (${gt.length} GT, ${gp.length} GP)`);

  function entryRows(list: any[]) {
    if (list.length === 0) {
      return `<tr><td colspan="5" style="padding:14px;text-align:center;color:#555;font-style:italic;">No entries</td></tr>`;
    }
    return list.map((e, i) => {
      const transponder = e.transponder || e.cars?.transponder;
      const transponderCell = transponder
        ? `<span style="font-family:monospace;color:#ff6b00;font-weight:700;">${transponder}</span>`
        : `<span style="color:#e63946;">⚠️ NOT SET</span>`;
      return `
        <tr style="border-bottom:1px solid #1e1e1e;">
          <td style="padding:11px 14px;color:#666;">${i + 1}</td>
          <td style="padding:11px 14px;color:#f0f0f0;font-weight:600;">${e.members.first_name} ${e.members.last_name}</td>
          <td style="padding:11px 14px;color:#bbb;">${e.cars.make} ${e.cars.model}<br><span style="font-size:11px;color:#666;">${e.cars.color} · ${e.cars.nickname}</span></td>
          <td style="padding:11px 14px;">${transponderCell}</td>
          <td style="padding:11px 14px;color:#666;font-size:12px;">${e.members.membership_type}</td>
        </tr>`;
    }).join("");
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#0a0a0a;color:#f0f0f0;margin:0;padding:0;}
  .wrap{max-width:680px;margin:0 auto;padding:28px 16px;}
  .hdr{background:#141414;border-top:4px solid #ff6b00;border-radius:8px 8px 0 0;padding:28px 32px;text-align:center;}
  .hdr h1{font-size:24px;letter-spacing:4px;color:#ff6b00;margin:0 0 4px;}
  .hdr .sub{color:#666;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin:0;}
  .body{background:#141414;padding:28px 32px;border-radius:0 0 8px 8px;}
  .summary{display:flex;gap:12px;margin:20px 0;}
  .stat{flex:1;background:#0a0a0a;border:1px solid #222;border-radius:6px;padding:14px;text-align:center;}
  .stat-num{font-size:28px;font-weight:700;color:#ff6b00;line-height:1;}
  .stat-label{font-size:11px;color:#666;letter-spacing:2px;text-transform:uppercase;margin-top:4px;}
  h2{font-size:14px;letter-spacing:3px;text-transform:uppercase;color:#ff6b00;margin:28px 0 10px;padding-bottom:8px;border-bottom:1px solid #222;}
  table{width:100%;border-collapse:collapse;background:#0a0a0a;border-radius:6px;overflow:hidden;}
  th{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#ff6b00;background:rgba(255,107,0,0.08);padding:10px 14px;text-align:left;border-bottom:1px solid #222;}
  .footer{text-align:center;padding:20px 0 0;color:#444;font-size:11px;}
  .footer a{color:#ff6b00;text-decoration:none;}
  .note{background:rgba(255,107,0,0.06);border:1px solid rgba(255,107,0,0.15);border-radius:6px;padding:12px 16px;margin-top:20px;font-size:12px;color:#888;line-height:1.6;}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>ORCA IRELAND</h1>
    <p class="sub">Entry List — Race Control Copy</p>
  </div>
  <div class="body">
    <p style="font-size:14px;color:#bbb;margin:0 0 4px;">Entry list for:</p>
    <p style="font-size:18px;font-weight:700;color:#fff;margin:0 0 4px;">${event.name}</p>
    <p style="font-size:13px;color:#888;margin:0;">${eventDateFormatted}</p>
    <p style="font-size:11px;color:#555;margin:6px 0 0;">Generated: ${now.toLocaleString("en-IE", { dateStyle: "medium", timeStyle: "short" })}</p>

    <div class="summary">
      <div class="stat"><div class="stat-num">${total}</div><div class="stat-label">Total</div></div>
      <div class="stat"><div class="stat-num">${gt.length}</div><div class="stat-label">GT</div></div>
      <div class="stat"><div class="stat-num">${gp.length}</div><div class="stat-label">GP</div></div>
    </div>

    <h2>1/8 GT — ${gt.length} ${gt.length === 1 ? "entry" : "entries"}</h2>
    <table>
      <thead><tr>
        <th>#</th><th>Driver</th><th>Car</th><th>Transponder</th><th>Type</th>
      </tr></thead>
      <tbody>${entryRows(gt)}</tbody>
    </table>

    <h2>1/8 GP — ${gp.length} ${gp.length === 1 ? "entry" : "entries"}</h2>
    <table>
      <thead><tr>
        <th>#</th><th>Driver</th><th>Car</th><th>Transponder</th><th>Type</th>
      </tr></thead>
      <tbody>${entryRows(gp)}</tbody>
    </table>

    ${(entries || []).some(e => !e.transponder && !e.cars?.transponder) ? `
    <div class="note">
      ⚠️ <strong style="color:#ffb366;">Missing transponders</strong> — some drivers have not set a transponder number.
      Contact them before the event or they will need to update their garage profile.
    </div>` : ""}
  </div>
  <div class="footer">
    <p>© 2026 ORCA Ireland · <a href="https://orcaireland.com">orcaireland.com</a></p>
  </div>
</div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
    to: Netlify.env.get("GMAIL_USER")!,
    subject: `🏁 ORCA Entry List — ${event.name} (${total} entries)`,
    html,
  });

  console.log(`Entry list sent for ${event.name}`);
}

// Called by Supabase pg_cron — no Netlify schedule
export const config = { path: "/api/run-send-entry-list" };
