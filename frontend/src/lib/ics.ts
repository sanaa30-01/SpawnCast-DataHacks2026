import type { TripItem } from "./trip-store";

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toICSDate(iso: string, time: "start" | "end"): string {
  // All-day-ish event: use 06:00 UTC for start, 18:00 UTC for end
  const d = new Date(iso + "T00:00:00Z");
  const h = time === "start" ? 6 : 18;
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(h)}0000Z`;
}

function escapeICS(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildICS(items: TripItem[]): string {
  const now = new Date();
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const events = items
    .map((item, i) => {
      const uid = `${item.zoneId}-${item.species}-${item.addedAt}-${i}@spawncast`;
      const summary = `Fishing Op: High Yield ${item.species}`;
      const location = `${item.zoneName} (${item.lat}, ${item.lon})`;
      const description =
        `Expected Yield: ${(item.yield * 100).toFixed(0)}%\\n` +
        `Confidence Score: ${(item.confidence * 100).toFixed(0)}%\\n` +
        `Intelligence Summary: ${escapeICS(item.explanation)}`;
      return [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${toICSDate(item.windowStart, "start")}`,
        `DTEND:${toICSDate(item.windowEnd, "end")}`,
        `SUMMARY:${escapeICS(summary)}`,
        `LOCATION:${escapeICS(location)}`,
        `DESCRIPTION:${description}`,
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SpawnCast//Trip Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadICS(items: TripItem[], filename = "fishing-trip.ics") {
  const ics = buildICS(items);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
