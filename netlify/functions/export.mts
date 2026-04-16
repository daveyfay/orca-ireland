// ORCA Ireland — Export Race Results API
import type { Context } from "@netlify/functions";
import { getSupabase, jsonResponse } from "./auth-utils.mts";

const supabase = getSupabase();

interface Finisher {
  class: string;
  position: number;
  name: string;
  fastest_lap: number;
  best_consec: number;
  lap_times: number[];
  penalty_seconds: number;
  warnings: number;
  disqualified: boolean;
}

interface RaceEventRow {
  id: string;
  event_name: string;
  event_date: string;
  finishers: Finisher[];
}

// Format a time value as M:SS.sss or SS.sss based on magnitude
function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !isFinite(seconds)) {
    return "";
  }
  const v = typeof seconds === "number" ? seconds : parseFloat(String(seconds));
  if (!isFinite(v)) return "";

  if (v >= 60) {
    const m = Math.floor(v / 60);
    const s = (v - m * 60).toFixed(3).padStart(6, "0");
    return `${m}:${s}`;
  }
  return v.toFixed(3);
}

// Calculate average of an array of numbers
function calculateAverage(times: number[] | null | undefined): number {
  if (!times || times.length === 0) return 0;
  const valid = times.filter((t) => isFinite(t));
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// Calculate standard deviation (consistency)
function calculateStdDev(times: number[] | null | undefined): number {
  if (!times || times.length === 0) return 0;
  const valid = times.filter((t) => isFinite(t));
  if (valid.length === 0) return 0;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / valid.length;
  return Math.sqrt(variance);
}

// Convert finishers array to CSV string
function generateCSV(finishers: Finisher[], eventName: string): string {
  const lines: string[] = [];

  // CSV Header
  lines.push(
    "Position,Driver,Class,Fastest Lap,Best 3 Consec,Laps,Penalty Seconds,DQ,Warnings"
  );

  // Data rows
  for (const f of finishers) {
    const row = [
      String(f.position || ""),
      `"${(f.name || "").replace(/"/g, '""')}"`, // Escape quotes
      f.class || "",
      formatTime(f.fastest_lap),
      formatTime(f.best_consec),
      f.lap_times ? String(f.lap_times.length) : "0",
      String(f.penalty_seconds || 0),
      f.disqualified ? "Yes" : "No",
      String(f.warnings || 0),
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

// Build JSON export response
function generateJSON(eventData: RaceEventRow) {
  const finishers = eventData.finishers || [];

  // Compute aggregate stats for each finisher
  const enrichedFinishers = finishers.map((f) => ({
    ...f,
    averageLap: calculateAverage(f.lap_times),
    consistency: calculateStdDev(f.lap_times),
  }));

  return {
    event: {
      id: eventData.id,
      name: eventData.event_name,
      date: eventData.event_date,
    },
    finishers: enrichedFinishers,
  };
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const method = req.method;

  // Only GET is allowed
  if (method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const eventId = url.searchParams.get("event_id");
  const format = url.searchParams.get("format") || "json";
  const filterClass = url.searchParams.get("class");

  // event_id is required
  if (!eventId) {
    return jsonResponse({ error: "event_id parameter required" }, 400);
  }

  // Validate format
  if (!["json", "csv"].includes(format)) {
    return jsonResponse({ error: "format must be json or csv" }, 400);
  }

  try {
    // Fetch event by ID
    const { data: eventData, error } = await supabase
      .from("race_events")
      .select("id, event_name, event_date, finishers")
      .eq("id", eventId)
      .single();

    if (error || !eventData) {
      return jsonResponse({ error: "Event not found" }, 404);
    }

    const event = eventData as RaceEventRow;

    // Filter finishers by class if requested
    let finishers = event.finishers || [];
    if (filterClass) {
      finishers = finishers.filter((f) => f.class === filterClass);
    }

    // Sort by position
    finishers.sort((a, b) => (a.position || 0) - (b.position || 0));

    // Generate response based on format
    if (format === "csv") {
      const csv = generateCSV(finishers, event.event_name);
      const filename = `ORCA-Results-${event.event_name.replace(/\s+/g, "-")}-${event.event_date}.csv`;

      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // JSON format (default)
    const eventDataForJson: RaceEventRow = {
      ...event,
      finishers,
    };

    const jsonOutput = generateJSON(eventDataForJson);

    return new Response(JSON.stringify(jsonOutput, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: "Server error", detail: message }, 500);
  }
};

export const config = { path: "/api/export" };
