import type { Context } from "@netlify/functions";
import nodemailer from "nodemailer";
import { getSupabase, verifySession } from "./auth-utils.mts";

const supabase = getSupabase();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: Netlify.env.get("GMAIL_USER")!,
    pass: Netlify.env.get("GMAIL_APP_PASSWORD")!,
  },
});

function isEntryClosed(eventDate: string): boolean {
  // Closes at 18:00 Irish time the day before
  const event = new Date(eventDate);
  const cutoff = new Date(event);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(18, 0, 0, 0);
  return new Date() > cutoff;
}

function formatCutoff(eventDate: string): string {
  const event = new Date(eventDate);
  const cutoff = new Date(event);
  cutoff.setDate(cutoff.getDate() - 1);
  return cutoff.toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" }) + " at 6:00pm";
}

async function sendEntryConfirmation(member: any, entry: any, car: any) {
  const siteUrl = Netlify.env.get("SITE_URL") || "https://orcaireland.com";
  const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#0a0a0a;color:#f0f0f0;margin:0;padding:0}
  .wrapper{max-width:580px;margin:0 auto;padding:32px 16px}
  .header{background:#141414;border-top:3px solid #ff6b00;border-radius:8px 8px 0 0;padding:32px;text-align:center}
  .header h1{font-size:28px;letter-spacing:4px;color:#ff6b00;margin:0 0 4px}
  .header p{color:#888;font-size:13px;margin:0;letter-spacing:2px;text-transform:uppercase}
  .body{background:#1a1a1a;padding:32px;border-radius:0 0 8px 8px}
  .detail-box{background:#0a0a0a;border:1px solid rgba(255,107,0,0.3);border-radius:8px;padding:20px 24px;margin:20px 0}
  .detail-box h3{color:#ff6b00;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 14px}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
  .row:last-child{border-bottom:none}
  .lbl{color:#888;font-size:13px}.val{color:#f0f0f0;font-weight:bold;font-size:13px}
  .footer{text-align:center;padding:24px 0 0;color:#555;font-size:12px}
  .footer a{color:#ff6b00;text-decoration:none}
</style>
</head><body>
<div class="wrapper">
  <div class="header"><h1>ORCA IRELAND</h1><p>On Road Circuit Association</p></div>
  <div class="body">
    <p>Hi ${member.first_name},</p>
    <p>Your entry for <strong>${entry.event_name}</strong> has been confirmed. See you on race day! 🏁</p>
    <div class="detail-box">
      <h3>Entry Details</h3>
      <div class="row"><span class="lbl">Event</span><span class="val">${entry.event_name}</span></div>
      <div class="row"><span class="lbl">Date</span><span class="val">${new Date(entry.event_date).toLocaleDateString("en-IE",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span></div>
      <div class="row"><span class="lbl">Class</span><span class="val">${entry.class.toUpperCase()}</span></div>
      <div class="row"><span class="lbl">Car</span><span class="val">${car.nickname} (${car.make} ${car.model})</span></div>
      <div class="row"><span class="lbl">Transponder</span><span class="val">${entry.transponder || "Not set — update in your garage"}</span></div>
    </div>
    <p style="font-size:13px;color:#888;">If you need to withdraw your entry, log in to the members area before the entry deadline.</p>
  </div>
  <div class="footer"><p>© 2026 ORCA Ireland · <a href="${siteUrl}">orcaireland.com</a></p></div>
</div></body></html>`;

  await transporter.sendMail({
    from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
    to: member.email,
    subject: `ORCA Entry Confirmed — ${entry.event_name}`,
    html,
  });
}

async function sendAdminEntryList(eventId: string, eventName: string, eventDate: string) {
  // Get all entries for this event with member and car details
  const { data: entries } = await supabase
    .from("event_entries")
    .select(`
      *,
      members(first_name, last_name, email, membership_type),
      cars(nickname, make, model, color, class, transponder)
    `)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (!entries || entries.length === 0) return;

  const eventDateFormatted = new Date(eventDate).toLocaleDateString("en-IE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  // Group by class
  const gt = entries.filter(e => e.class === "gt");
  const gp = entries.filter(e => e.class === "gp");

  function entryRows(list: any[]) {
    if (list.length === 0) return "<tr><td colspan='5' style='color:#666;text-align:center;padding:12px'>No entries</td></tr>";
    return list.map((e, i) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #222;color:#bbb">${i + 1}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #222;color:#f0f0f0;font-weight:600">${e.members.first_name} ${e.members.last_name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #222;color:#bbb">${e.cars.make} ${e.cars.model} (${e.cars.color})</td>
        <td style="padding:10px 14px;border-bottom:1px solid #222;color:#ff6b00;font-weight:700;font-family:monospace">${e.transponder || e.cars.transponder || "⚠️ NOT SET"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #222;color:#888">${e.members.membership_type}</td>
      </tr>`).join("");
  }

  const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#0a0a0a;color:#f0f0f0;margin:0;padding:0}
  .wrapper{max-width:700px;margin:0 auto;padding:32px 16px}
  .header{background:#141414;border-top:3px solid #ff6b00;border-radius:8px 8px 0 0;padding:32px;text-align:center}
  h1{font-size:26px;letter-spacing:4px;color:#ff6b00;margin:0 0 4px}
  .sub{color:#888;font-size:13px;margin:0;letter-spacing:2px;text-transform:uppercase}
  .body{background:#1a1a1a;padding:32px;border-radius:0 0 8px 8px}
  h2{font-size:18px;letter-spacing:2px;color:#ff6b00;margin:24px 0 12px;border-bottom:2px solid #ff6b00;padding-bottom:8px;display:inline-block}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  th{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#ff6b00;background:rgba(255,107,0,0.1);padding:10px 14px;text-align:left}
  .summary{background:#0a0a0a;border:1px solid rgba(255,107,0,0.2);border-radius:6px;padding:16px 20px;margin-bottom:24px;font-size:14px;color:#bbb}
</style>
</head><body>
<div class="wrapper">
  <div class="header"><h1>ORCA IRELAND</h1><p class="sub">Entry List — Race Control</p></div>
  <div class="body">
    <p>Entry list for <strong>${eventName}</strong> — ${eventDateFormatted}.</p>
    <div class="summary">
      Total entries: <strong style="color:#f0f0f0">${entries.length}</strong> &nbsp;|&nbsp;
      GT: <strong style="color:#f0f0f0">${gt.length}</strong> &nbsp;|&nbsp;
      GP: <strong style="color:#f0f0f0">${gp.length}</strong>
    </div>

    <h2>1/8 GT — ${gt.length} entries</h2>
    <table>
      <thead><tr>
        <th>#</th><th>Driver</th><th>Car</th><th>Transponder</th><th>Membership</th>
      </tr></thead>
      <tbody>${entryRows(gt)}</tbody>
    </table>

    <h2>1/8 GP — ${gp.length} entries</h2>
    <table>
      <thead><tr>
        <th>#</th><th>Driver</th><th>Car</th><th>Transponder</th><th>Membership</th>
      </tr></thead>
      <tbody>${entryRows(gp)}</tbody>
    </table>
  </div>
</div></body></html>`;

  await transporter.sendMail({
    from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
    to: Netlify.env.get("GMAIL_USER")!,
    subject: `ORCA Entry List — ${eventName} (${entries.length} entries)`,
    html,
  });
}

export default async (req: Request, context: Context) => {
  const method = req.method;
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "list";

  let body: any = {};
  if (method !== "GET") {
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  }

  const username = method === "GET" ? url.searchParams.get("username") : body.username;
  const password = method === "GET" ? url.searchParams.get("password") : body.password;

  const member = await verifySession(username, password);
  if (!member) return json({ error: "Unauthorized" }, 401);

  // GET — list upcoming events and member's entries
  if (method === "GET" && action === "list") {
    const { data: entries } = await supabase
      .from("event_entries")
      .select("*, cars(nickname, make, model, color, transponder)")
      .eq("member_id", member.id);
    return json({ entries: entries || [] });
  }

  // GET -- all entries for a specific event (members only, transponders hidden)
  if (method === "GET" && action === "event-entries") {
    const eventId = url.searchParams.get("eventId");
    if (!eventId) return json({ error: "eventId required" }, 400);
    const { data: entries } = await supabase
      .from("event_entries")
      .select(`id, class, created_at, members(first_name, last_name, membership_type), cars(nickname, make, model, color, class)`)
      .eq("event_id", eventId)
      .order("class", { ascending: true })
      .order("created_at", { ascending: true });
    return json({ entries: entries || [] });
  }

  // POST — enter an event
  if (method === "POST" && action === "enter") {
    const { eventId, eventName, eventDate, carId, carClass, notes } = body;
    if (!eventId || !eventName || !eventDate || !carId || !carClass) {
      return json({ error: "Missing required fields" }, 400);
    }

    // Check membership is valid
    if (new Date(member.expiry_date) < new Date()) {
      return json({ error: "Your membership has expired. Please renew to enter events." }, 403);
    }

    // Check cutoff
    if (isEntryClosed(eventDate)) {
      return json({ error: `Entry for this event closed on ${formatCutoff(eventDate)}.` }, 400);
    }

    // Get car and verify ownership
    const { data: car } = await supabase
      .from("cars")
      .select("*")
      .eq("id", carId)
      .eq("member_id", member.id)
      .single();
    if (!car) return json({ error: "Car not found" }, 404);

    // Check not already entered
    const { data: existing } = await supabase
      .from("event_entries")
      .select("id")
      .eq("event_id", eventId)
      .eq("member_id", member.id)
      .single();
    if (existing) return json({ error: "You are already entered in this event." }, 409);

    const { data: entry, error } = await supabase.from("event_entries").insert({
      event_id: eventId,
      event_name: eventName,
      event_date: eventDate,
      member_id: member.id,
      car_id: carId,
      class: carClass,
      transponder: car.transponder || null,
      notes: notes?.trim() || null,
    }).select().single();

    if (error) return json({ error: "Database error" }, 500);

    // Send confirmation email
    try { await sendEntryConfirmation(member, entry, car); } catch (e) { console.error("Email error:", e); }

    return json({ success: true, entry });
  }

  // DELETE — withdraw from event
  if (method === "DELETE" && action === "withdraw") {
    const { entryId, eventDate } = body;
    if (!entryId) return json({ error: "Entry ID required" }, 400);

    if (isEntryClosed(eventDate)) {
      return json({ error: `The entry deadline has passed. Contact the club to withdraw.` }, 400);
    }

    const { data: existing } = await supabase
      .from("event_entries")
      .select("member_id")
      .eq("id", entryId)
      .single();
    if (!existing || existing.member_id !== member.id) return json({ error: "Not found" }, 404);

    const { error } = await supabase.from("event_entries").delete().eq("id", entryId);
    if (error) return json({ error: "Database error" }, 500);
    return json({ success: true });
  }

  // POST — send entry list to admin (called by scheduled function or manually)
  if (method === "POST" && action === "send-list") {
    const { eventId, eventName, eventDate } = body;
    if (!eventId || !eventName || !eventDate) return json({ error: "Missing event details" }, 400);
    try {
      await sendAdminEntryList(eventId, eventName, eventDate);
      return json({ success: true });
    } catch (e) {
      console.error("Email error:", e);
      return json({ error: "Failed to send entry list" }, 500);
    }
  }

  return json({ error: "Unknown action" }, 400);
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
}

export const config = { path: "/api/entries" };
