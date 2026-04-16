// ORCA Ireland — Live Timing API (Public)
import type { Context } from "@netlify/functions";
import { getSupabase, cachedJsonResponse } from "./auth-utils.mts";

const supabase = getSupabase();

interface TimingLiveRow {
  id: string;
  event_name: string;
  event_date: string;
  sess_key: string;
  sess_label: string | null;
  sess_type: string;
  timer_remaining: number;
  timer_total: number;
  timer_running: boolean;
  qual_method: string | null;
  leaderboard: any[];
  crossings: any[];
  heat_timers: Record<string, any>;
  updated_at: string;
  state_snapshot: Record<string, any> | null;
}

interface GapData {
  active: boolean;
  remaining: number;
  total: number;
  nextLabel: string;
}

interface LiveResponse {
  status: "live" | "idle";
  event: { name: string; date: string };
  session: { key: string; label: string; type: string };
  timer: { remaining: number; total: number; running: boolean };
  leaderboard: any[];
  crossings: any[];
  heatTimers: Record<string, any>;
  gap: GapData | null;
  updatedAt: string;
}

interface MinimalResponse {
  status: "live" | "idle";
  sessionLabel: string | null;
  timerRemaining: number;
  top3: any[];
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const format = url.searchParams.get("format");

  try {
    // Fetch the current live timing state (id='current')
    const { data: timingData, error } = await supabase
      .from("timing_live")
      .select("*")
      .eq("id", "current")
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch timing data" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!timingData) {
      // No timing data yet, return idle state
      const idleResponse: LiveResponse = {
        status: "idle",
        event: { name: "", date: "" },
        session: { key: "", label: "", type: "" },
        timer: { remaining: 0, total: 0, running: false },
        leaderboard: [],
        crossings: [],
        heatTimers: {},
        gap: null,
        updatedAt: new Date().toISOString(),
      };
      return cachedJsonResponse(idleResponse, 1);
    }

    const row = timingData as TimingLiveRow;

    // Extract gap from heat_timers if present
    let gapData: GapData | null = null;
    const heatTimersClean: Record<string, any> = {};

    if (row.heat_timers) {
      for (const [key, value] of Object.entries(row.heat_timers)) {
        if (key === "__gap" && value && typeof value === "object") {
          const g = value as any;
          gapData = {
            active: g.active || false,
            remaining: g.remaining || 0,
            total: g.total || 0,
            nextLabel: g.nextLabel || "",
          };
        } else {
          heatTimersClean[key] = value;
        }
      }
    }

    // Determine status based on sess_label
    const status: "live" | "idle" = row.sess_label && row.sess_label.trim() ? "live" : "idle";

    // Build full response
    const fullResponse: LiveResponse = {
      status,
      event: {
        name: row.event_name || "",
        date: row.event_date || "",
      },
      session: {
        key: row.sess_key || "",
        label: row.sess_label || "",
        type: row.sess_type || "",
      },
      timer: {
        remaining: row.timer_remaining || 0,
        total: row.timer_total || 0,
        running: row.timer_running || false,
      },
      leaderboard: row.leaderboard || [],
      crossings: row.crossings || [],
      heatTimers: heatTimersClean,
      gap: gapData,
      updatedAt: row.updated_at || new Date().toISOString(),
    };

    // Handle minimal format for embedded widgets
    if (format === "minimal") {
      const top3 = (row.leaderboard || []).slice(0, 3);
      const minimalResponse: MinimalResponse = {
        status,
        sessionLabel: row.sess_label || null,
        timerRemaining: row.timer_remaining || 0,
        top3,
      };
      return cachedJsonResponse(minimalResponse, 1);
    }

    // Return full response with 1-second cache (CDN-friendly for live updates)
    return cachedJsonResponse(fullResponse, 1);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Server error", detail: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = { path: "/api/live" };
