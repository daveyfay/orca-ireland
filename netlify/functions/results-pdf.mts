import type { Context } from "@netlify/functions";
import { getSupabase, jsonResponse } from "./auth-utils.mts";
import PDFDocument from "pdfkit";

const json = jsonResponse;

/**
 * Format time values for display
 * If >= 60 seconds, show as M:SS.mmm, else SS.mmm
 */
function formatTime(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toFixed(3).padStart(6, "0")}`;
  }
  return seconds.toFixed(3).padStart(6, "0");
}

/**
 * Format class name for display (GT, GP, etc.)
 */
function formatClassName(classStr: string): string {
  return classStr.toUpperCase();
}

/**
 * Group finishers by class
 */
interface Finisher {
  class: string;
  position: number;
  name: string;
  fastest_lap: number;
  best_consec: number;
  lap_times?: number[];
}

function groupByClass(finishers: Finisher[]): Map<string, Finisher[]> {
  const grouped = new Map<string, Finisher[]>();
  for (const finisher of finishers) {
    const classKey = finisher.class.toLowerCase();
    if (!grouped.has(classKey)) {
      grouped.set(classKey, []);
    }
    grouped.get(classKey)!.push(finisher);
  }
  // Sort each class by position
  for (const drivers of grouped.values()) {
    drivers.sort((a, b) => a.position - b.position);
  }
  return grouped;
}

export default async (req: Request, context: Context) => {
  const method = req.method;
  const url = new URL(req.url);

  // Only accept GET requests
  if (method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const eventId = url.searchParams.get("event_id");
  if (!eventId) {
    return json({ error: "event_id parameter required" }, 400);
  }

  const supabase = getSupabase();

  // Fetch race event
  const { data: eventData, error: eventError } = await supabase
    .from("race_events")
    .select("id, event_name, event_date, finishers")
    .eq("id", eventId)
    .single();

  if (eventError || !eventData) {
    return json({ error: "Event not found" }, 404);
  }

  // Fetch track records
  const { data: recordsData, error: recordsError } = await supabase
    .from("track_records")
    .select("class_name, holder_name, lap_time, set_at_event");

  if (recordsError) {
    return json({ error: "Error fetching track records" }, 500);
  }

  // Build a map of class -> track record
  const recordsByClass = new Map<string, any>();
  if (recordsData && Array.isArray(recordsData)) {
    for (const record of recordsData) {
      recordsByClass.set(record.class_name.toLowerCase(), record);
    }
  }

  // Parse finishers
  let finishers: Finisher[] = [];
  if (eventData.finishers && Array.isArray(eventData.finishers)) {
    finishers = eventData.finishers;
  }

  // Create PDF
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  // Setup response headers for PDF download
  const filename = `${eventData.event_name.replace(/\s+/g, "-")}-results.pdf`;
  const response = new Response(doc as any, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });

  // Write to response stream
  doc.pipe(response.body! as any);

  // ──── Header ────
  doc.fillColor("#ff6b00").fontSize(28).font("Helvetica-Bold").text("ORCA Ireland");
  doc.fillColor("#333333").fontSize(12).font("Helvetica").text("Race Results", { underline: true });
  doc.moveDown(0.5);

  // ──── Event Info ────
  doc.fontSize(16).font("Helvetica-Bold").text(eventData.event_name);
  const eventDate = new Date(eventData.event_date);
  const dateStr = eventDate.toLocaleDateString("en-IE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.fontSize(11).font("Helvetica").text(`Date: ${dateStr}`);
  doc.moveDown(1);

  // ──── Results by Class ────
  const groupedByClass = groupByClass(finishers);
  const classKeys = Array.from(groupedByClass.keys()).sort();

  for (const classKey of classKeys) {
    const drivers = groupedByClass.get(classKey)!;
    const className = formatClassName(classKey);

    // Class header
    doc
      .fillColor("#ff6b00")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text(`Class: ${className}`, { underline: true });

    // Check for track record
    const trackRecord = recordsByClass.get(classKey);
    if (trackRecord) {
      const recordTime = formatTime(trackRecord.lap_time);
      doc
        .fillColor("#d84315")
        .fontSize(10)
        .font("Helvetica-Oblique")
        .text(`Track Record: ${recordTime} by ${trackRecord.holder_name}`);
    }

    doc.moveDown(0.5);

    // Check if any driver broke the track record
    const recordLapTime = trackRecord?.lap_time;
    const recordBreakers = recordLapTime
      ? drivers.filter((d) => d.fastest_lap < recordLapTime)
      : [];

    // Results table
    const startY = doc.y;
    const colX = [40, 100, 200, 300, 380];
    const colWidths = [60, 100, 100, 80, 60];
    const rowHeight = 20;

    // Table header
    doc.fillColor("#f5f5f5").rect(colX[0], doc.y, 500, rowHeight).fill();
    doc
      .fillColor("#333333")
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("Pos", colX[0] + 5, doc.y + 5, { width: colWidths[0] - 10 })
      .text("Driver", colX[1] + 5, doc.y - 15, { width: colWidths[1] - 10 })
      .text("Fastest Lap", colX[2] + 5, doc.y - 15, { width: colWidths[2] - 10 })
      .text("Best 3 Consec", colX[3] + 5, doc.y - 15, { width: colWidths[3] - 10 })
      .text("Record", colX[4] + 5, doc.y - 15, { width: colWidths[4] - 10 });

    doc.y = startY + rowHeight;

    // Table rows
    for (const driver of drivers) {
      const isRecordBreaker = recordBreakers.includes(driver);

      // Row background
      if (driver.position % 2 === 0) {
        doc.fillColor("#fafafa").rect(colX[0], doc.y, 500, rowHeight).fill();
      }

      // Row text
      const bgColor = isRecordBreaker ? "#e8f5e9" : "#ffffff";
      if (isRecordBreaker) {
        doc.fillColor(bgColor).rect(colX[0], doc.y, 500, rowHeight).fill();
      }

      doc
        .fillColor("#333333")
        .fontSize(9)
        .font("Helvetica")
        .text(`${driver.position}`, colX[0] + 5, doc.y + 5, { width: colWidths[0] - 10 })
        .text(driver.name, colX[1] + 5, doc.y - 15, { width: colWidths[1] - 10 })
        .text(formatTime(driver.fastest_lap), colX[2] + 5, doc.y - 15, {
          width: colWidths[2] - 10,
        })
        .text(formatTime(driver.best_consec), colX[3] + 5, doc.y - 15, {
          width: colWidths[3] - 10,
        });

      // Mark track record breakers
      if (isRecordBreaker) {
        doc.fillColor("#d84315").font("Helvetica-Bold").text("✓ NEW", colX[4] + 5, doc.y - 15, {
          width: colWidths[4] - 10,
        });
      }

      doc.y += rowHeight;
    }

    doc.moveDown(1);

    // Add page break if there are more classes
    const remainingClasses = classKeys.indexOf(classKey) < classKeys.length - 1;
    if (remainingClasses && doc.y > 700) {
      doc.addPage();
    }
  }

  // ──── Footer ────
  doc.moveTo(40, doc.page.height - 60).lineTo(doc.page.width - 40, doc.page.height - 60).stroke();
  doc
    .fillColor("#999999")
    .fontSize(9)
    .font("Helvetica")
    .text("Generated from orca-ireland.com", 40, doc.page.height - 50, { align: "center" });

  // Finalize PDF
  doc.end();

  return response;
};

export const config = { path: "/api/results-pdf" };
