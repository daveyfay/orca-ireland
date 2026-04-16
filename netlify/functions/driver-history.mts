import type { Context } from "@netlify/functions";
import { getSupabase, jsonResponse, cachedJsonResponse } from "./auth-utils.mts";

const json = jsonResponse;

interface Finisher {
  class: string;
  position: number;
  name: string;
  fastest_lap: number;
  best_consec: number;
  lap_times: number[];
}

interface RaceEvent {
  id: string;
  event_name: string;
  event_date: string;
  finishers: Finisher[];
}

interface DriverHistoryEntry {
  event_name: string;
  event_date: string;
  class: string;
  position: number;
  fastest_lap: number;
  best_consec: number;
}

interface DriverOverviewEntry {
  driver_name: string;
  events_entered: number;
  best_ever_lap: number;
  best_ever_consec: number;
  wins: number;
  podiums: number;
  history: DriverHistoryEntry[];
}

interface DriverDetailedHistory extends DriverOverviewEntry {
  all_lap_times: Record<string, number[]>;
}

export default async (req: Request, context: Context) => {
  const method = req.method;
  const url = new URL(req.url);
  const supabase = getSupabase();

  if (method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Query all race events ordered by date descending
  const { data: events, error } = await supabase
    .from("race_events")
    .select("id, event_name, event_date, finishers")
    .order("event_date", { ascending: false });

  if (error) {
    return json({ error: "DB error", detail: error.message }, 500);
  }

  if (!events || events.length === 0) {
    return cachedJsonResponse([], 300);
  }

  // Check if a specific driver is requested
  const driverParam = url.searchParams.get("driver");

  if (driverParam) {
    // Return detailed history for one driver including all lap times
    const history = compileDetailedDriverHistory(
      events as RaceEvent[],
      driverParam
    );

    if (!history) {
      return json({ error: "Driver not found" }, 404);
    }

    return cachedJsonResponse(history, 300);
  }

  // Return overview for all drivers
  const allDrivers = compileAllDriversOverview(events as RaceEvent[]);
  const sorted = allDrivers.sort(
    (a, b) => a.best_ever_lap - b.best_ever_lap
  );

  return cachedJsonResponse(sorted, 300);
};

/**
 * Compile overview for all drivers, sorted by best_ever_lap ascending
 */
function compileAllDriversOverview(
  events: RaceEvent[]
): DriverOverviewEntry[] {
  const driverMap = new Map<string, DriverOverviewEntry>();

  for (const event of events) {
    if (!event.finishers || !Array.isArray(event.finishers)) {
      continue;
    }

    for (const finisher of event.finishers) {
      const { name, class: driverClass, position, fastest_lap, best_consec } =
        finisher;

      if (!name) continue;

      if (!driverMap.has(name)) {
        driverMap.set(name, {
          driver_name: name,
          events_entered: 0,
          best_ever_lap: Infinity,
          best_ever_consec: Infinity,
          wins: 0,
          podiums: 0,
          history: [],
        });
      }

      const driver = driverMap.get(name)!;
      driver.events_entered += 1;

      // Track best ever lap and best consec across all events
      if (fastest_lap !== null && fastest_lap !== undefined && fastest_lap < driver.best_ever_lap) {
        driver.best_ever_lap = fastest_lap;
      }
      if (best_consec !== null && best_consec !== undefined && best_consec < driver.best_ever_consec) {
        driver.best_ever_consec = best_consec;
      }

      // Count wins (position === 1 within their class)
      if (position === 1) {
        driver.wins += 1;
      }

      // Count podiums (position <= 3)
      if (position <= 3) {
        driver.podiums += 1;
      }

      // Add to history
      driver.history.push({
        event_name: event.event_name,
        event_date: event.event_date,
        class: driverClass,
        position,
        fastest_lap: fastest_lap || 0,
        best_consec: best_consec || 0,
      });
    }
  }

  // Convert to array and handle infinite values
  return Array.from(driverMap.values()).map((driver) => ({
    ...driver,
    best_ever_lap:
      driver.best_ever_lap === Infinity ? 0 : driver.best_ever_lap,
    best_ever_consec:
      driver.best_ever_consec === Infinity ? 0 : driver.best_ever_consec,
  }));
}

/**
 * Compile detailed history for a single driver including all lap times per event
 */
function compileDetailedDriverHistory(
  events: RaceEvent[],
  driverName: string
): DriverDetailedHistory | null {
  const normalizedName = driverName.trim().toLowerCase();
  let found: DriverDetailedHistory | null = null;

  for (const event of events) {
    if (!event.finishers || !Array.isArray(event.finishers)) {
      continue;
    }

    for (const finisher of event.finishers) {
      if (!finisher.name) continue;

      if (finisher.name.trim().toLowerCase() !== normalizedName) {
        continue;
      }

      if (!found) {
        found = {
          driver_name: finisher.name,
          events_entered: 0,
          best_ever_lap: Infinity,
          best_ever_consec: Infinity,
          wins: 0,
          podiums: 0,
          history: [],
          all_lap_times: {},
        };
      }

      const { class: driverClass, position, fastest_lap, best_consec, lap_times } =
        finisher;

      found.events_entered += 1;

      // Track best ever lap and best consec
      if (fastest_lap !== null && fastest_lap !== undefined && fastest_lap < found.best_ever_lap) {
        found.best_ever_lap = fastest_lap;
      }
      if (best_consec !== null && best_consec !== undefined && best_consec < found.best_ever_consec) {
        found.best_ever_consec = best_consec;
      }

      // Count wins and podiums
      if (position === 1) {
        found.wins += 1;
      }
      if (position <= 3) {
        found.podiums += 1;
      }

      // Add to history
      found.history.push({
        event_name: event.event_name,
        event_date: event.event_date,
        class: driverClass,
        position,
        fastest_lap: fastest_lap || 0,
        best_consec: best_consec || 0,
      });

      // Store lap times by event
      if (lap_times && Array.isArray(lap_times)) {
        found.all_lap_times[event.event_name] = lap_times;
      }
    }
  }

  if (!found) {
    return null;
  }

  // Handle infinite values
  return {
    ...found,
    best_ever_lap:
      found.best_ever_lap === Infinity ? 0 : found.best_ever_lap,
    best_ever_consec:
      found.best_ever_consec === Infinity ? 0 : found.best_ever_consec,
  };
}

export const config = { path: "/api/driver-history" };
