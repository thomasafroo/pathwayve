import type { CalendarEvent } from "@/types/calendar";

export function calendarConflict(
  events: CalendarEvent[],
  start: number,
  end: number,
) {
  if (end <= start) return undefined;
  return events
    .filter(
      (event) =>
        event.busy &&
        Date.parse(event.start) < end &&
        Date.parse(event.end) > start,
    )
    .sort((a, b) => Date.parse(b.end) - Date.parse(a.end))[0];
}
