import "server-only";
import { createHash } from "node:crypto";
import ICAL from "ical.js";
import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { readCalendar } from "@/lib/calendar";
import type {
  CalendarEvent,
  CalendarSelection,
  GoogleCalendarSummary,
} from "@/types/calendar";
import { AppError } from "./http";
import { googleAccessToken } from "./google-calendar-auth";

export async function calendarRequest(
  owner: string,
  path: string,
  init: RequestInit = {},
) {
  let token = await googleAccessToken(owner);
  const send = () =>
    fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  let response = await send();
  if (response.status === 401) {
    token = await googleAccessToken(owner, true);
    response = await send();
  }
  return response;
}
async function checkedJson(response: Response) {
  if (!response.ok) {
    if (response.status === 401)
      throw new AppError(
        "GOOGLE_RECONNECT",
        "Reconnect Google Calendar to renew access.",
        401,
      );
    if (response.status === 403)
      throw new AppError(
        "GOOGLE_PERMISSION",
        "Google denied access. Check calendar permissions and that the Calendar API is enabled.",
        403,
      );
    if (response.status === 404)
      throw new AppError(
        "GOOGLE_NOT_FOUND",
        "This Google calendar is no longer available.",
        404,
      );
    if (response.status === 429)
      throw new AppError(
        "GOOGLE_RATE_LIMIT",
        "Google Calendar is busy. Wait a moment and retry.",
        429,
      );
    throw new AppError(
      "GOOGLE_CALENDAR",
      "Google Calendar could not complete this request. Please retry.",
      502,
    );
  }
  return response.json();
}
const calendarSchema = z.object({
  id: z.string(),
  summary: z.string().default("Calendar"),
  timeZone: z.string().default("UTC"),
  accessRole: z.string(),
  primary: z.boolean().optional(),
});
export async function listGoogleCalendars(
  owner: string,
): Promise<GoogleCalendarSummary[]> {
  const calendars: GoogleCalendarSummary[] = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({
      maxResults: "250",
      minAccessRole: "reader",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const data = await checkedJson(
      await calendarRequest(owner, `users/me/calendarList?${query}`),
    );
    calendars.push(...z.array(calendarSchema).parse(data.items || []));
    pageToken = data.nextPageToken || "";
    if (!pageToken) return calendars;
  }
  throw new AppError("GOOGLE_LIMIT", "Too many calendars to list.", 422);
}
export function calendarDateRange(
  selection: CalendarSelection,
  timeZone: string,
) {
  return {
    start: Temporal.PlainDate.from(selection.startDate)
      .toZonedDateTime(timeZone)
      .toInstant()
      .toString(),
    end: Temporal.PlainDate.from(selection.endDate)
      .add({ days: 1 })
      .toZonedDateTime(timeZone)
      .toInstant()
      .toString(),
  };
}
const eventTime = z.object({
  date: z.iso.date().optional(),
  dateTime: z.iso.datetime({ offset: true }).optional(),
});
const googleEventSchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  location: z.string().optional(),
  status: z.string().optional(),
  transparency: z.string().optional(),
  start: eventTime,
  end: eventTime,
  attendees: z
    .array(
      z.object({
        self: z.boolean().optional(),
        responseStatus: z.string().optional(),
      }),
    )
    .optional(),
});
export function normalizeGoogleEvent(
  value: unknown,
  calendarId: string,
  timeZone: string,
): CalendarEvent | null {
  // Canceled instances can omit their original start and end.
  if (
    typeof value === "object" &&
    value &&
    "status" in value &&
    value.status === "cancelled"
  )
    return null;
  const event = googleEventSchema.parse(value);
  if (
    event.attendees?.some(
      (attendee) => attendee.self && attendee.responseStatus === "declined",
    )
  )
    return null;
  const allDay = Boolean(event.start.date);
  const start = allDay
    ? Temporal.PlainDate.from(event.start.date!)
        .toZonedDateTime(timeZone)
        .toInstant()
        .toString()
    : event.start.dateTime;
  const end = allDay
    ? Temporal.PlainDate.from(event.end.date!)
        .toZonedDateTime(timeZone)
        .toInstant()
        .toString()
    : event.end.dateTime;
  if (!start || !end || Date.parse(end) <= Date.parse(start))
    throw new AppError(
      "GOOGLE_EVENT",
      "A Google event has invalid start or end times.",
      422,
    );
  return {
    uid: `google-${createHash("sha256").update(`${calendarId}:${event.id}`).digest("hex")}@pathwayve`,
    title: (event.summary || "Busy").slice(0, 160),
    location: (event.location || "").slice(0, 300),
    start,
    end,
    allDay,
    dateStart: event.start.date,
    dateEnd: event.end.date,
    busy: event.transparency !== "transparent",
  };
}
export async function loadGoogleEvents(
  owner: string,
  selection: CalendarSelection,
) {
  const calendars = await listGoogleCalendars(owner);
  const calendar = calendars.find(
    (calendar) => calendar.id === selection.calendarId,
  );
  if (!calendar)
    throw new AppError(
      "GOOGLE_NOT_FOUND",
      "Choose an available Google calendar.",
      404,
    );
  const range = calendarDateRange(selection, calendar.timeZone);
  const events: CalendarEvent[] = [];
  let pageToken = "";
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({
      timeMin: range.start,
      timeMax: range.end,
      singleEvents: "true",
      orderBy: "startTime",
      showDeleted: "false",
      maxResults: "250",
      timeZone: calendar.timeZone,
    });
    if (pageToken) query.set("pageToken", pageToken);
    const data = await checkedJson(
      await calendarRequest(
        owner,
        `calendars/${encodeURIComponent(calendar.id)}/events?${query}`,
      ),
    );
    for (const value of data.items || []) {
      const event = normalizeGoogleEvent(value, calendar.id, calendar.timeZone);
      if (event) events.push(event);
    }
    if (events.length > 200)
      throw new AppError(
        "GOOGLE_LIMIT",
        "More than 200 events in this range. Choose fewer days.",
        422,
      );
    pageToken = data.nextPageToken || "";
    if (!pageToken) return { calendar, events, range };
  }
  throw new AppError(
    "GOOGLE_LIMIT",
    "Too many events. Choose a smaller date range.",
    422,
  );
}

export function googleExportEvents(
  text: string,
  timeZone: string,
  owner: string,
  calendarId: string,
) {
  let calendar;
  try {
    calendar = readCalendar(text);
  } catch (error) {
    throw new AppError(
      "CALENDAR_FILE",
      error instanceof Error ? error.message : "Invalid calendar file.",
      422,
    );
  }
  const events = calendar
    .getAllSubcomponents("vevent")
    .filter(
      (component) => component.getFirstPropertyValue("status") !== "CANCELLED",
    )
    .map((component) => {
      const event = new ICAL.Event(component);
      if (event.isRecurring() || event.isRecurrenceException())
        throw new AppError(
          "CALENDAR_RECURRENCE",
          "Export recurring series as an .ics file, or import a date range from Google first.",
          422,
        );
      const time = (
        name: "dtstart" | "dtend",
        value: typeof event.startDate,
      ) => {
        if (value.isDate) return { date: value.toString() };
        const zone = String(
          component.getFirstProperty(name)?.getParameter("tzid") || timeZone,
        );
        if (value.zone.tzid === "UTC") return { dateTime: value.toString() };
        try {
          return {
            dateTime: Temporal.PlainDateTime.from(value.toString())
              .toZonedDateTime(zone, { disambiguation: "reject" })
              .toInstant()
              .toString(),
            timeZone: zone,
          };
        } catch {
          throw new AppError(
            "CALENDAR_TIMEZONE",
            "An event has an unknown time zone or an ambiguous time. Choose an explicit time before exporting.",
            422,
          );
        }
      };
      if (event.endDate.compare(event.startDate) <= 0)
        throw new AppError(
          "CALENDAR_TIME",
          "Every exported event must end after it starts.",
          422,
        );
      const key = createHash("sha256")
        .update(JSON.stringify([owner, calendarId, event.uid]))
        .digest("hex");
      return {
        id: `pv${key}`,
        summary: event.summary || "PathWayve event",
        location: event.location || "",
        description: event.description || "",
        start: time("dtstart", event.startDate),
        end: time("dtend", event.endDate),
        transparency:
          component.getFirstPropertyValue("transp") === "TRANSPARENT"
            ? "transparent"
            : "opaque",
        extendedProperties: { private: { pathwayveKey: key } },
      };
    });
  if (new Set(events.map((event) => event.id)).size !== events.length)
    throw new AppError(
      "CALENDAR_DUPLICATE",
      "The calendar contains duplicate event IDs.",
      422,
    );
  return events;
}
export async function exportGoogleEvents(
  owner: string,
  calendarId: string,
  text: string,
) {
  const calendar = (await listGoogleCalendars(owner)).find(
    (item) => item.id === calendarId,
  );
  if (!calendar || !["owner", "writer"].includes(calendar.accessRole))
    throw new AppError(
      "GOOGLE_READ_ONLY",
      "Choose a calendar you can edit.",
      403,
    );
  const events = googleExportEvents(text, calendar.timeZone, owner, calendarId);
  const base = `calendars/${encodeURIComponent(calendarId)}/events`;
  let created = 0,
    updated = 0;
  for (const event of events) {
    try {
      const response = await calendarRequest(
        owner,
        `${base}?sendUpdates=none`,
        { method: "POST", body: JSON.stringify(event) },
      );
      if (response.status === 409) {
        const existing = await checkedJson(
          await calendarRequest(owner, `${base}/${event.id}`),
        );
        if (
          existing.extendedProperties?.private?.pathwayveKey !==
          event.extendedProperties.private.pathwayveKey
        )
          throw new AppError(
            "GOOGLE_EVENT_CONFLICT",
            "An existing event cannot be updated by PathWayve.",
            409,
          );
        await checkedJson(
          await calendarRequest(owner, `${base}/${event.id}?sendUpdates=none`, {
            method: "PATCH",
            body: JSON.stringify(event),
          }),
        );
        updated++;
      } else {
        await checkedJson(response);
        created++;
      }
    } catch (error) {
      return {
        created,
        updated,
        total: events.length,
        complete: false,
        error:
          error instanceof AppError
            ? error.message
            : "Google Calendar is unavailable. Retry to finish exporting.",
      };
    }
  }
  return { created, updated, total: events.length, complete: true };
}
