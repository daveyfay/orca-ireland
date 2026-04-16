// ORCA Ireland — Race Timing API
import type { Context } from "@netlify/functions";
import nodemailer from "nodemailer";
import { getSupabase, verifySessionToken } from "./auth-utils.mts";

const supabase = getSupabase();

// Lazy mailer — only built if we actually need to send (national publish).
function buildMailer() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: Netlify.env.get("GMAIL_USER")!,
      pass: Netlify.env.get("GMAIL_APP_PASSWORD")!,
    },
  });
}

// Format a raw seconds number ("12.345") for the email table. Mirrors the
// public results page so the values look the same in the inbox as on site.
function fmtSec(n: any): string {
  const v = typeof n === "number" ? n : parseFloat(n);
  if (!isFinite(v)) return "—";
  if (v >= 60) {
    const m = Math.floor(v / 60);
    const s = (v - m * 60).toFixed(3).padStart(6, "0");
    return `${m}:${s}`;
  }
  return v.toFixed(3);
}

// Compose and send the national-results email to RC CAOI HQ. Best-effort —
// failure here does NOT block the publish (results are already in the DB).
async function sendNationalResultsEmail(opts: {
  eventName: string;
  eventDate: string;
  finishers: any[];
  sentBy: string;
}) {
  const { eventName, eventDate, finishers, sentBy } = opts;

  // Group finishers by class for the email table.
  const byClass: Record<string, any[]> = {};
  for (const f of finishers) {
    const cls = f.class || "Unclassified";
    (byClass[cls] = byClass[cls] || []).push(f);
  }
  for (const cls of Object.keys(byClass)) {
    byClass[cls].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  }

  const tableHtml = Object.entries(byClass).map(([cls, rows]) => `
    <h3 style="font-family:Arial,sans-serif;color:#ff6b00;margin:24px 0 8px;">${cls}</h3>
    <table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;color:#fff;">
      <thead>
        <tr style="background:#222;">
          <th align="left" style="border-bottom:1px solid #444;">Pos</th>
          <th align="left" style="border-bottom:1px solid #444;">Driver</th>
          <th align="right" style="border-bottom:1px solid #444;">Fastest Lap</th>
          <th align="right" style="border-bottom:1px solid #444;">Best 3 Consec</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr style="background:${i % 2 ? "#1a1a1a" : "#111"};">
            <td>${r.position ?? i + 1}</td>
            <td>${(r.name || "").replace(/[<>&]/g, "")}</td>
            <td align="right">${fmtSec(r.fastest_lap)}</td>
            <td align="right">${fmtSec(r.best_consec)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `).join("");

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#111;font-family:Arial,sans-serif;">
<div style="max-width:680px;margin:0 auto;background:#1a1a1a;padding:0;">
  <div style="background:#111;padding:24px 32px;border-bottom:3px solid #ff6b00;text-align:center;">
    <div style="font-size:1.6rem;font-weight:900;color:#fff;letter-spacing:2px;">ORCA <span style="color:#ff6b00;">IRELAND</span></div>
    <div style="color:#888;font-size:0.78rem;margin-top:4px;">National Race Results</div>
  </div>
  <div style="padding:28px 32px;color:#ddd;">
    <p style="margin:0 0 6px;font-size:15px;"><strong style="color:#fff;">Event:</strong> ${eventName.replace(/[<>&]/g, "")}</p>
    <p style="margin:0 0 6px;font-size:15px;"><strong style="color:#fff;">Date:</strong> ${eventDate}</p>
    <p style="margin:0 0 18px;font-size:13px;color:#888;">Sent by ${sentBy.replace(/[<>&]/g, "")} from race control.</p>
    ${tableHtml}
    <p style="margin-top:32px;font-size:12px;color:#666;">
      Full results also visible at
      <a href="https://orca-ireland.com/#results" style="color:#ff6b00;">orca-ireland.com</a>.
    </p>
  </div>
</div>
</body></html>`;

  // Plain-text fallback.
  const textLines: string[] = [];
  textLines.push(`ORCA Ireland — National Race Results`);
  textLines.push(`Event: ${eventName}`);
  textLines.push(`Date:  ${eventDate}`);
  textLines.push(`Sent by: ${sentBy}`);
  textLines.push("");
  for (const [cls, rows] of Object.entries(byClass)) {
    textLines.push(`== ${cls} ==`);
    for (const r of rows) {
      textLines.push(
        `  ${String(r.position ?? "").padStart(2, " ")}. ${r.name}` +
        `   FL ${fmtSec(r.fastest_lap)}` +
        `   3C ${fmtSec(r.best_consec)}`
      );
    }
    textLines.push("");
  }

  const mailer = buildMailer();
  await mailer.sendMail({
    from: `"ORCA Ireland" <${Netlify.env.get("GMAIL_USER")}>`,
    to: "info@rccaoi.com",
    subject: `[ORCA Ireland] National Results — ${eventName} (${eventDate})`,
    text: textLines.join("\n"),
    html,
  });
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST",
      "Access-Control-Allow-Headers": "Content-Type",
    }});
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = body.action || "events";

  const sessionToken = body.sessionToken || null;
  const member = sessionToken ? await verifySessionToken(sessionToken) : null;
  const isAdmin = member?.is_admin === true;

  // ── PUBLIC: upcoming events ──────────────────────────────────────────────
  if (action === "events") {
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("events")
      .select("id, name, event_date, description")
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(10);
    if (error) return json({ error: "DB error" }, 500);
    return json({ events: data || [] });
  }

  // ── PUBLIC: entry list ───────────────────────────────────────────────────
  if (action === "entries") {
    const { eventId } = body;
    if (!eventId) return json({ error: "eventId required" }, 400);
    const { data, error } = await supabase
      .from("event_entries")
      .select(`id, class, transponder,
        members(first_name, last_name),
        cars(nickname, make, model, transponder, class)`)
      .eq("event_id", eventId)
      .order("class", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return json({ error: "DB error" }, 500);
    const drivers = (data || []).map((e: any) => ({
      id: e.id,
      name: `${e.members.first_name} ${e.members.last_name}`,
      class: e.class,
      transponder: e.transponder || e.cars?.transponder || null,
      carName: `${e.cars?.make || ""} ${e.cars?.model || ""}`.trim(),
    }));
    return json({ drivers });
  }

  // ── PUBLIC: verify session & role ────────────────────────────────────────
  if (action === "whoami") {
    if (!member) return json({ loggedIn: false, isAdmin: false });
    return json({ loggedIn: true, isAdmin: member.is_admin,
      name: `${member.first_name} ${member.last_name}` });
  }

  // ── ADMIN: list all club members + their cars (for the driver picker) ───
  if (action === "club-drivers") {
    if (!isAdmin) return json({ error: "Admin required" }, 403);
    const { data, error } = await supabase
      .from("members")
      .select(`id, first_name, last_name, suspended,
        cars(id, nickname, make, model, class, transponder)`)
      .eq("suspended", false)
      .order("last_name", { ascending: true });
    if (error) return json({ error: "DB error: " + error.message }, 500);
    const drivers = (data || []).map((m: any) => ({
      memberId: m.id,
      name: `${m.first_name} ${m.last_name}`.trim(),
      cars: (m.cars || []).map((c: any) => ({
        id: c.id,
        nickname: c.nickname || null,
        label: `${c.make || ""} ${c.model || ""}`.trim(),
        class: c.class || null,
        transponder: c.transponder || null,
      })),
    }));
    return json({ drivers });
  }

  // ── PUBLIC: get current live state (fallback for non-Realtime clients) ──
  if (action === "live-state") {
    const { data, error } = await supabase
      .from("timing_live")
      .select("*")
      .eq("id", "current")
      .single();
    if (error) return json({ error: "No live session" }, 404);
    return json({ state: data });
  }

  // ── ADMIN: push live state to Supabase (called on every crossing) ────────
  if (action === "push") {
    if (!isAdmin) return json({ error: "Admin required" }, 403);
    const {
      eventName, eventDate,
      sessKey, sessLabel, sessType,
      timerRemaining, timerTotal, timerRunning,
      qualMethod,
      leaderboard, crossings, heatTimers,
      gap,                        // {active,remaining,total,nextLabel,upNext} or null
      stateSnapshot,              // full admin-side `state` for resume-on-refresh
    } = body;

    // stateSnapshot is optional so older clients still work during a rolling deploy.
    const row: any = {
      id: "current",
      event_name:       eventName   || null,
      event_date:       eventDate   || null,
      sess_key:         sessKey     || null,
      sess_label:       sessLabel   || null,
      sess_type:        sessType    || null,
      timer_remaining:  timerRemaining ?? 0,
      timer_total:      timerTotal     ?? 0,
      timer_running:    timerRunning   ?? false,
      qual_method:      qualMethod  || "best3consec",
      leaderboard:      leaderboard || [],
      crossings:        crossings   || [],
      heat_timers:      heatTimers  || {},
      // Stash the gap inside heat_timers under a reserved key so we don't have
      // to add a new column. The live page strips it out before rendering.
      // Tolerated by older live pages because they ignore extra keys.
      updated_at:       new Date().toISOString(),
    };
    if (gap && gap.active) {
      row.heat_timers = { ...row.heat_timers, __gap: gap };
    }
    if (stateSnapshot !== undefined) row.state_snapshot = stateSnapshot;

    const { error } = await supabase
      .from("timing_live")
      .upsert(row, { onConflict: "id" });

    if (error) return json({ error: "DB error: " + error.message }, 500);
    return json({ success: true });
  }

  // ── ADMIN: mark the day as started (any admin can then join and resume) ──
  if (action === "start-day") {
    if (!isAdmin) return json({ error: "Admin required" }, 403);
    const { eventName, eventDate, stateSnapshot } = body;
    const startedBy = `${member.first_name} ${member.last_name}`.trim();
    const row: any = {
      id: "current",
      is_active:    true,
      started_at:   new Date().toISOString(),
      finished_at:  null,
      started_by:   startedBy,
      event_name:   eventName || null,
      event_date:   eventDate || null,
      updated_at:   new Date().toISOString(),
    };
    if (stateSnapshot !== undefined) row.state_snapshot = stateSnapshot;
    const { error } = await supabase
      .from("timing_live")
      .upsert(row, { onConflict: "id" });
    if (error) return json({ error: "DB error: " + error.message }, 500);
    return json({ success: true, startedBy });
  }

  // ── ADMIN: mark the day as finished; optionally publish results ──────────
  if (action === "finish-day") {
    if (!isAdmin) return json({ error: "Admin required" }, 403);
    const { publishResults, emailRccaoi, eventName, eventDate, finishers,
            championshipRound, updateRecords } = body;

    let emailSent = false;
    let emailError: string | null = null;
    let champScored = 0;
    let recordsUpdated = 0;

    if (publishResults) {
      if (!eventName || !eventDate || !finishers) {
        return json({ error: "Missing fields for publish" }, 400);
      }
      const { error: pubErr } = await supabase.from("race_events").insert({
        event_name: eventName, event_date: eventDate, finishers,
      });
      if (pubErr) return json({ error: "Publish failed: " + pubErr.message }, 500);

      // ── Auto-score championships ─────────────────────────────────────
      // If a round number is provided, upsert every finisher's score into
      // each active championship that matches their class. Points are
      // IFMAR-style: 1st=100, 2nd=99, 3rd=98… (high is good, best-N-of-M
      // picks the highest). Capped at 1 point minimum for any finisher.
      if (championshipRound) {
        const round = Number(championshipRound);
        const season = new Date(eventDate).getFullYear().toString();
        const { data: champs } = await supabase
          .from("championships")
          .select("id, name")
          .eq("season", season)
          .eq("active", true);

        if (champs?.length) {
          // Map championship name → championship row. The convention is
          // championship names contain the class label, e.g. "GT Pro Club",
          // "1/8 On Road National". We match finishers by checking if their
          // class label appears in the championship name (case-insensitive).
          for (const champ of champs) {
            const champLower = champ.name.toLowerCase();
            // Determine which class this championship covers
            const classFinishers = finishers.filter((f: any) => {
              const cls = (f.class || "").toLowerCase();
              return champLower.includes(cls) || champLower.includes(cls.replace(/[_-]/g, " "));
            });
            // If the championship name doesn't match any class, try scoring
            // ALL finishers (catch-all championship like "Open Class").
            const toScore = classFinishers.length ? classFinishers : finishers;

            for (const f of toScore) {
              const pos = f.position ?? 99;
              const score = Math.max(1, 101 - pos); // 1st=100, 2nd=99, …

              // Upsert: fetch existing scores for this driver
              const { data: existing } = await supabase
                .from("championship_scores")
                .select("id, round_scores")
                .eq("championship_id", champ.id)
                .eq("driver_name", f.name)
                .single();

              const roundScores = existing?.round_scores || {};
              roundScores[round.toString()] = score;

              if (existing) {
                await supabase.from("championship_scores")
                  .update({ round_scores: roundScores })
                  .eq("id", existing.id);
              } else {
                await supabase.from("championship_scores")
                  .insert({
                    championship_id: champ.id,
                    driver_name: f.name,
                    round_scores: roundScores,
                  });
              }
              champScored++;
            }
          }
        }
      }

      // ── Auto-update track records ────────────────────────────────────
      // Check each finisher's fastest lap against the current track record
      // for their class. If beaten, update the record.
      if (updateRecords !== false) {
        const { data: records } = await supabase
          .from("track_records")
          .select("id, class_name, lap_time");

        const recordMap: Record<string, { id: string; time: number }> = {};
        for (const r of records || []) {
          const t = parseFloat(r.lap_time);
          if (isFinite(t)) recordMap[r.class_name.toLowerCase()] = { id: r.id, time: t };
        }

        for (const f of finishers) {
          if (!f.fastest_lap || !isFinite(f.fastest_lap)) continue;
          const cls = (f.class || "").toLowerCase();
          const existing = recordMap[cls];
          if (existing && f.fastest_lap < existing.time) {
            await supabase.from("track_records")
              .update({
                holder_name: f.name,
                lap_time: f.fastest_lap.toFixed(3),
                set_at_event: eventName,
              })
              .eq("id", existing.id);
            recordsUpdated++;
            recordMap[cls] = { id: existing.id, time: f.fastest_lap };
          } else if (!existing) {
            // New class record
            await supabase.from("track_records")
              .insert({
                class_name: f.class || "Unknown",
                holder_name: f.name,
                lap_time: f.fastest_lap.toFixed(3),
                set_at_event: eventName,
              });
            recordsUpdated++;
          }
        }
      }

      // Best-effort email to RC CAOI HQ for national events. Failure here
      // does NOT roll back the publish — results are already in the DB.
      if (emailRccaoi) {
        try {
          await sendNationalResultsEmail({
            eventName, eventDate, finishers,
            sentBy: `${member?.first_name ?? ""} ${member?.last_name ?? ""}`.trim() || "race control",
          });
          emailSent = true;
        } catch (e: any) {
          emailError = e?.message || String(e);
          console.error("[timing] RC CAOI email failed:", emailError);
        }
      }
    }

    const { error } = await supabase
      .from("timing_live")
      .update({
        is_active:      false,
        finished_at:    new Date().toISOString(),
        state_snapshot: null,
        updated_at:     new Date().toISOString(),
      })
      .eq("id", "current");
    if (error) return json({ error: "DB error: " + error.message }, 500);
    return json({
      success: true,
      published: !!publishResults,
      emailSent,
      emailError,
      champScored,
      recordsUpdated,
    });
  }

  // ── ADMIN: publish results ───────────────────────────────────────────────
  if (action === "publish") {
    if (!isAdmin) return json({ error: "Admin required" }, 403);
    const { eventName, eventDate, finishers, emailRccaoi } = body;
    if (!eventName || !eventDate || !finishers) return json({ error: "Missing fields" }, 400);
    const { error } = await supabase.from("race_events").insert({
      event_name: eventName, event_date: eventDate, finishers,
    });
    if (error) return json({ error: "DB error: " + error.message }, 500);

    let emailSent = false;
    let emailError: string | null = null;
    if (emailRccaoi) {
      try {
        await sendNationalResultsEmail({
          eventName, eventDate, finishers,
          sentBy: `${member?.first_name ?? ""} ${member?.last_name ?? ""}`.trim() || "race control",
        });
        emailSent = true;
      } catch (e: any) {
        emailError = e?.message || String(e);
        console.error("[timing] RC CAOI email failed:", emailError);
      }
    }
    return json({ success: true, emailSent, emailError });
  }

  return json({ error: "Unknown action" }, 400);
};

export const config = { path: "/api/timing" };
