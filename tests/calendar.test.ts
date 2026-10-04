import { describe, expect, it } from "vitest";
import ICAL from "ical.js";
import {
  calendarEntries,
  editCalendarEvent,
  mergeCalendars,
  readCalendar,
  savedScheduleCalendar,
  workspaceCalendar,
} from "@/lib/calendar";
import { exampleRequest } from "@/lib/fixtures";
import { planTrip } from "@/lib/planner";
import { applyModifications, createWorkspace } from "@/lib/trip-workspace";
import type { ScheduleDocument } from "@/types/schedule";

const file = (event: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\nUID:meeting@example.com\r\n${event}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const timed = file(
  "DTSTART:20301004T160000Z\r\nDTEND:20301004T170000Z\r\nSUMMARY:Meeting",
);

describe("calendar exchange", () => {
  it("imports and edits UTC events without shifting their time, escaping text", () => {
    const updated = editCalendarEvent(timed, 0, {
      title: "Coffee, tea; notes\nsecond line",
      location: "Cafe",
      start: "2030-10-04T17:00",
      end: "2030-10-04T18:00",
    });
    const event = new ICAL.Event(
      readCalendar(updated).getFirstSubcomponent("vevent")!,
    );
    expect(event.startDate.toJSDate().toISOString()).toBe(
      "2030-10-04T17:00:00.000Z",
    );
    expect(event.summary).toBe("Coffee, tea; notes\nsecond line");
    expect(event.uid).toBe("meeting@example.com");
    expect(event.sequence).toBe(1);
  });
  it("preserves all-day dates and exclusive end dates", () => {
    const text = file(
      "DTSTART;VALUE=DATE:20301004\r\nDTEND;VALUE=DATE:20301006\r\nSUMMARY:Holiday",
    );
    const updated = editCalendarEvent(text, 0, {
      title: "Holiday",
      location: "",
      start: "2030-10-05",
      end: "2030-10-07",
    });
    expect(calendarEntries(updated)[0]).toMatchObject({
      allDay: true,
      start: "2030-10-05",
      end: "2030-10-07",
    });
    expect(updated).toContain("DTEND;VALUE=DATE:20301007");
  });
  it("retains recurrence, exceptions and alarms while editing a series title", () => {
    const text = file(
      "DTSTART:20301004T160000Z\r\nDTEND:20301004T170000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEXDATE:20301011T160000Z\r\nSUMMARY:Meeting\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT10M\r\nDESCRIPTION:Reminder\r\nEND:VALARM",
    );
    const updated = editCalendarEvent(text, 0, {
      title: "Weekly meeting",
      location: "Office",
      start: "2030-10-05T17:00",
      end: "2030-10-05T18:00",
    });
    expect(updated).toContain("RRULE:FREQ=WEEKLY;COUNT=3");
    expect(updated).toContain("EXDATE:20301011T160000Z");
    expect(updated).toContain("BEGIN:VALARM");
    expect(calendarEntries(updated)[0].start).toBe("2030-10-04T16:00:00");
  });
  it("preserves TZID when editing wall-clock times", () => {
    const text = file(
      "DTSTART;TZID=America/Vancouver:20301004T090000\r\nDTEND;TZID=America/Vancouver:20301004T100000\r\nSUMMARY:Meeting",
    );
    const updated = editCalendarEvent(text, 0, {
      title: "Meeting",
      location: "",
      start: "2030-10-04T10:00",
      end: "2030-10-04T11:00",
    });
    expect(updated).toContain("DTSTART;TZID=America/Vancouver:20301004T100000");
    expect(updated).toContain("DTEND;TZID=America/Vancouver:20301004T110000");
  });
  it("rejects malformed, empty, oversized and backwards inputs", () => {
    expect(() => readCalendar("not a calendar")).toThrow();
    expect(() => readCalendar("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toThrow();
    expect(() => readCalendar("x".repeat(1_000_001))).toThrow("1 MB");
    expect(() =>
      editCalendarEvent(timed, 0, {
        title: "Meeting",
        location: "",
        start: "2030-10-04T18:00",
        end: "2030-10-04T17:00",
      }),
    ).toThrow("End must");
  });
  it("merges repeated exports without duplicating UIDs", () => {
    expect(
      readCalendar(mergeCalendars(timed, timed)).getAllSubcomponents("vevent"),
    ).toHaveLength(1);
  });
  it("exports edited itinerary durations, travel and stable event IDs", async () => {
    const original = createWorkspace(await planTrip(exampleRequest()));
    const stop = original.trip.stops[0];
    const edited = applyModifications(original, {
      tripId: original.trip.id,
      baseVersion: original.version,
      modifications: [
        { type: "CHANGE_DURATION", stopId: stop.id, minutes: 45 },
      ],
    });
    const events = readCalendar(workspaceCalendar(edited))
      .getAllSubcomponents("vevent")
      .map((component) => new ICAL.Event(component));
    const exported = events.find((event) =>
      event.uid.includes(`stop-${stop.id}@`),
    )!;
    expect(exported.duration.toSeconds()).toBe(45 * 60);
    expect(events.some((event) => event.summary.startsWith("Travel:"))).toBe(
      true,
    );
    expect(workspaceCalendar(edited)).toContain(exported.uid);
  });
  it("exports only placed saved items, never unscheduled intentions", () => {
    const document = {
      schedules: [{ id: "schedule", name: "My day" }],
      schedule_items: [
        { id: "placed", title: "Coffee" },
        { id: "missing", title: "Unscheduled" },
      ],
      schedule_runs: [
        {
          status: "infeasible",
          result: {
            placements: [
              {
                item_id: "placed",
                starts_at: "2030-10-04T16:00:00Z",
                ends_at: "2030-10-04T17:00:00Z",
              },
            ],
            travel_legs: [],
          },
        },
      ],
    } as unknown as ScheduleDocument;
    const text = savedScheduleCalendar(document);
    expect(text).toContain("SUMMARY:Coffee");
    expect(text).not.toContain("Unscheduled");
  });
});
