import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calendarDateRange,
  exportGoogleEvents,
  googleExportEvents,
  loadGoogleEvents,
  normalizeGoogleEvent,
} from "@/lib/server/google-calendar";
import { calendarEventsFile, readCalendar } from "@/lib/calendar";
import { calendarConflict } from "@/lib/calendar-availability";
import { calendarSelectionSchema } from "@/types/calendar";

vi.mock("@/lib/server/google-calendar-auth", () => ({
  googleAccessToken: vi.fn(async () => "test-access-token"),
}));
afterEach(() => vi.unstubAllGlobals());
const calendar = {
  id: "user@example.com",
  summary: "Work",
  timeZone: "America/Vancouver",
  accessRole: "owner",
};
const selection = {
  calendarId: calendar.id,
  startDate: "2030-03-10",
  endDate: "2030-03-10",
};
const raw = {
  id: "event-one",
  summary: "Appointment",
  location: "Office",
  start: { dateTime: "2030-03-10T10:00:00-07:00" },
  end: { dateTime: "2030-03-10T11:00:00-07:00" },
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("Google Calendar import and export", () => {
  it("uses calendar-local day boundaries across DST and exclusive all-day ends", () => {
    const range = calendarDateRange(selection, calendar.timeZone);
    expect((Date.parse(range.end) - Date.parse(range.start)) / 3600000).toBe(
      23,
    );
    const event = normalizeGoogleEvent(
      { ...raw, start: { date: "2030-03-10" }, end: { date: "2030-03-11" } },
      calendar.id,
      calendar.timeZone,
    )!;
    expect(event.start).toBe(range.start);
    expect(event.end).toBe(range.end);
    expect(calendarEventsFile([event])).toContain("DTEND;VALUE=DATE:20300311");
    expect(
      calendarConflict(
        [event],
        Date.parse(range.start) + 100,
        Date.parse(range.end),
      ),
    ).toBe(event);
  });
  it("skips canceled and declined events and respects free events", () => {
    expect(
      normalizeGoogleEvent(
        { id: "cancelled", status: "cancelled" },
        calendar.id,
        "UTC",
      ),
    ).toBeNull();
    expect(
      normalizeGoogleEvent(
        { ...raw, attendees: [{ self: true, responseStatus: "declined" }] },
        calendar.id,
        "UTC",
      ),
    ).toBeNull();
    const event = normalizeGoogleEvent(
      { ...raw, transparency: "transparent" },
      calendar.id,
      "UTC",
    )!;
    expect(
      calendarConflict([event], Date.parse(event.start), Date.parse(event.end)),
    ).toBeUndefined();
  });
  it("paginates events, expanding recurrences on Google with bounded dates", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ items: [calendar] }))
      .mockResolvedValueOnce(json({ items: [raw], nextPageToken: "next" }))
      .mockResolvedValueOnce(json({ items: [{ ...raw, id: "event-two" }] }));
    vi.stubGlobal("fetch", fetch);
    const result = await loadGoogleEvents("owner", selection);
    expect(result.events).toHaveLength(2);
    expect(String(fetch.mock.calls[1][0])).toContain("singleEvents=true");
    expect(String(fetch.mock.calls[2][0])).toContain("pageToken=next");
    expect(result.events[0].uid).not.toBe(result.events[1].uid);
  });
  it("rejects invalid import ranges", () => {
    expect(
      calendarSelectionSchema.safeParse({ ...selection, endDate: "2030-05-01" })
        .success,
    ).toBe(false);
    expect(
      calendarSelectionSchema.safeParse({ ...selection, endDate: "2030-03-09" })
        .success,
    ).toBe(false);
  });
  it("creates stable, valid Google IDs, isolating owners and destination calendars", () => {
    const event = normalizeGoogleEvent(raw, calendar.id, "UTC")!;
    const file = calendarEventsFile([event]);
    const first = googleExportEvents(file, "UTC", "one", "primary")[0];
    expect(first.id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(googleExportEvents(file, "UTC", "one", "primary")[0].id).toBe(
      first.id,
    );
    expect(googleExportEvents(file, "UTC", "two", "primary")[0].id).not.toBe(
      first.id,
    );
    expect(googleExportEvents(file, "UTC", "one", "secondary")[0].id).not.toBe(
      first.id,
    );
    expect(first.start.dateTime).toBe("2030-03-10T17:00:00Z");
  });
  it("updates only previously exported PathWayve events on repeated exports", async () => {
    const file = calendarEventsFile([
      normalizeGoogleEvent(raw, calendar.id, "UTC")!,
    ]);
    const body = googleExportEvents(
      file,
      calendar.timeZone,
      "owner",
      calendar.id,
    )[0];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ items: [calendar] }))
      .mockResolvedValueOnce(json({}, 409))
      .mockResolvedValueOnce(json(body))
      .mockResolvedValueOnce(json(body));
    vi.stubGlobal("fetch", fetch);
    expect(await exportGoogleEvents("owner", calendar.id, file)).toMatchObject({
      created: 0,
      updated: 1,
      complete: true,
    });
    expect(fetch.mock.calls[3][1].method).toBe("PATCH");
  });
  it("reports partial failure and refuses to overwrite an unrelated event", async () => {
    const file = calendarEventsFile([
      normalizeGoogleEvent(raw, calendar.id, "UTC")!,
    ]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ items: [calendar] }))
      .mockResolvedValueOnce(json({}, 409))
      .mockResolvedValueOnce(json({ summary: "Unrelated" }));
    vi.stubGlobal("fetch", fetch);
    expect(await exportGoogleEvents("owner", calendar.id, file)).toMatchObject({
      created: 0,
      updated: 0,
      complete: false,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("rejects read-only destinations before writing any event", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({ items: [{ ...calendar, accessRole: "reader" }] }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      exportGoogleEvents("owner", calendar.id, "irrelevant"),
    ).rejects.toThrow("can edit");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects recurring file exports before making partial writes", () => {
    const file = calendarEventsFile([
      normalizeGoogleEvent(raw, calendar.id, "UTC")!,
    ]);
    const parsed = readCalendar(file);
    parsed
      .getFirstSubcomponent("vevent")!
      .addPropertyWithValue("rrule", "FREQ=DAILY");
    expect(() =>
      googleExportEvents(parsed.toString(), "UTC", "owner", "primary"),
    ).toThrow("recurring");
  });
});
