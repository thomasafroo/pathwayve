import ICAL from "ical.js";
import type { ScheduleDocument } from "@/types/schedule";
import type { WorkspaceTrip } from "@/types/workspace";
import type { CalendarEvent } from "@/types/calendar";

export function calendarEventsFile(events: CalendarEvent[]) {
  const calendar = new ICAL.Component("vcalendar");
  calendar.updatePropertyWithValue("version", "2.0");
  calendar.updatePropertyWithValue("prodid", "-//PathWayve//Calendar//EN");
  for (const item of events) {
    const event = new ICAL.Event();
    event.uid = item.uid;
    event.summary = item.title;
    event.location = item.location;
    event.startDate = item.allDay
      ? ICAL.Time.fromString(item.dateStart!, undefined)
      : ICAL.Time.fromJSDate(new Date(item.start), true);
    event.endDate = item.allDay
      ? ICAL.Time.fromString(item.dateEnd!, undefined)
      : ICAL.Time.fromJSDate(new Date(item.end), true);
    event.component.updatePropertyWithValue(
      "transp",
      item.busy ? "OPAQUE" : "TRANSPARENT",
    );
    event.component.updatePropertyWithValue(
      "dtstamp",
      ICAL.Time.fromJSDate(new Date(), true),
    );
    calendar.addSubcomponent(event.component);
  }
  return calendar.toString();
}

export const MAX_CALENDAR_BYTES = 1_000_000;

export function readCalendar(text: string) {
  if (new TextEncoder().encode(text).length > MAX_CALENDAR_BYTES)
    throw new Error("Choose a calendar smaller than 1 MB.");
  let calendar;
  try {
    calendar = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new Error("This file is not a valid iCalendar (.ics) file.");
  }
  if (calendar.name !== "vcalendar")
    throw new Error("Choose an iCalendar (.ics) file.");
  const components = calendar.getAllSubcomponents("vevent");
  if (!components.length || components.length > 200)
    throw new Error("Import a calendar containing between 1 and 200 events.");
  for (const component of components) {
    const event = new ICAL.Event(component);
    if (!event.uid || !component.hasProperty("dtstart"))
      throw new Error("Every event needs an ID and a start date.");
    if (event.endDate.compare(event.startDate) < 0)
      throw new Error("An event ends before it starts.");
  }
  return calendar;
}

export function calendarEntries(text: string) {
  return readCalendar(text)
    .getAllSubcomponents("vevent")
    .map((component, index) => {
      const event = new ICAL.Event(component);
      return {
        index,
        title: event.summary || "Untitled event",
        location: event.location || "",
        start: event.startDate.toString().replace(/Z$/, ""),
        end: event.endDate.toString().replace(/Z$/, ""),
        allDay: event.startDate.isDate,
        zone: String(
          component.getFirstProperty("dtstart")?.getParameter("tzid") ||
            (event.startDate.zone.tzid === "UTC" ? "UTC" : "Local time"),
        ),
        recurring: event.isRecurring() || event.isRecurrenceException(),
      };
    });
}

export function editCalendarEvent(
  text: string,
  index: number,
  update: {
    title: string;
    location: string;
    start: string;
    end: string;
  },
) {
  const calendar = readCalendar(text);
  const component = calendar.getAllSubcomponents("vevent")[index];
  if (!component) throw new Error("Event no longer exists.");
  const event = new ICAL.Event(component);
  if (!update.title.trim()) throw new Error("Enter an event title.");
  event.summary = update.title.trim();
  event.location = update.location.trim();
  // Keep original TZID parameters, recurrence rules, exceptions and alarms.
  if (!event.isRecurring() && !event.isRecurrenceException()) {
    const parseTime = (value: string, original: typeof event.startDate) => {
      const parsed = ICAL.Time.fromString(
        value.length === 16 ? `${value}:00` : value,
        undefined,
      );
      parsed.zone = original.zone;
      return parsed;
    };
    const start = parseTime(update.start, event.startDate);
    const end = parseTime(update.end, event.endDate);
    if (start.isDate !== end.isDate || end.compare(start) <= 0)
      throw new Error(
        "End must be after start (all-day end dates are exclusive).",
      );
    component.getFirstProperty("dtstart")!.setValue(start);
    component.removeAllProperties("duration");
    const endProperty = component.getFirstProperty("dtend");
    if (endProperty) endProperty.setValue(end);
    else event.endDate = end;
  }
  event.sequence = (event.sequence || 0) + 1;
  component.updatePropertyWithValue(
    "dtstamp",
    ICAL.Time.fromJSDate(new Date(), true),
  );
  return calendar.toString();
}

type ExportEvent = {
  uid: string;
  title: string;
  location?: string;
  description?: string;
  start: string;
  end: string;
};

function buildCalendar(events: ExportEvent[]) {
  const calendar = new ICAL.Component("vcalendar");
  calendar.updatePropertyWithValue("version", "2.0");
  calendar.updatePropertyWithValue("prodid", "-//PathWayve//Calendar//EN");
  for (const item of events) {
    if (
      !Number.isFinite(Date.parse(item.start)) ||
      !Number.isFinite(Date.parse(item.end)) ||
      Date.parse(item.end) <= Date.parse(item.start)
    )
      continue;
    const event = new ICAL.Event();
    event.uid = item.uid;
    event.summary = item.title;
    event.location = item.location || "";
    event.description = item.description || "";
    event.startDate = ICAL.Time.fromJSDate(new Date(item.start), true);
    event.endDate = ICAL.Time.fromJSDate(new Date(item.end), true);
    event.component.updatePropertyWithValue(
      "dtstamp",
      ICAL.Time.fromJSDate(new Date(), true),
    );
    calendar.addSubcomponent(event.component);
  }
  return calendar.toString();
}

export function workspaceCalendar(workspace: WorkspaceTrip) {
  const { trip } = workspace;
  const events: ExportEvent[] = trip.stops.map((stop) => ({
    uid: `${trip.id}-stop-${stop.id}@pathwayve`,
    title: stop.name,
    location: stop.address || stop.name,
    description: [
      stop.reason,
      ...workspace.activities
        .filter((a) => a.stopId === stop.id)
        .map((a) => `${a.title} (${a.durationMinutes} min)`),
    ].join("\n"),
    start: stop.arrivalTime,
    end: new Date(
      Date.parse(stop.arrivalTime) + stop.durationMinutes * 60000,
    ).toISOString(),
  }));
  let departure = trip.request.startTime;
  trip.legs.forEach((leg, index) => {
    const end = new Date(
      Date.parse(departure) + leg.durationMinutes * 60000,
    ).toISOString();
    events.push({
      uid: `${trip.id}-travel-${index}@pathwayve`,
      title: `Travel: ${leg.from} to ${leg.to}`,
      start: departure,
      end,
    });
    const stop = trip.stops[index];
    departure = stop
      ? new Date(
          Date.parse(stop.arrivalTime) + stop.durationMinutes * 60000,
        ).toISOString()
      : end;
  });
  return buildCalendar(events);
}

export function savedScheduleCalendar(document: ScheduleDocument) {
  const schedule = document.schedules[0];
  const run = document.schedule_runs[0];
  if (!schedule || !run || run.status === "failed")
    throw new Error("This schedule has no calculated events to export.");
  const events: ExportEvent[] = run.result.placements.map((placement) => {
    const item = document.schedule_items.find(
      (item) => item.id === placement.item_id,
    );
    return {
      uid: `${schedule.id}-item-${placement.item_id}@pathwayve`,
      title: item?.title || schedule.name,
      location: item?.place_query || "",
      start: placement.starts_at,
      end: placement.ends_at,
    };
  });
  run.result.travel_legs.forEach((leg) => {
    const mapped = run.result.map_trip?.legs[leg.sequence];
    events.push({
      uid: `${schedule.id}-travel-${leg.sequence}@pathwayve`,
      title: mapped ? `Travel: ${mapped.from} to ${mapped.to}` : "Travel",
      start: leg.departs_at,
      end: leg.arrives_at,
    });
  });
  const planned = buildCalendar(events);
  return run.result.calendar_events?.length
    ? mergeCalendars(calendarEventsFile(run.result.calendar_events), planned)
    : planned;
}

export function mergeCalendars(imported: string, planned: string) {
  const result = new ICAL.Component(ICAL.parse(imported));
  const added = new ICAL.Component(ICAL.parse(planned));
  for (const component of added.getAllSubcomponents("vevent")) {
    const uid = component.getFirstPropertyValue("uid");
    for (const existing of result.getAllSubcomponents("vevent")) {
      if (existing.getFirstPropertyValue("uid") === uid)
        result.removeSubcomponent(existing);
    }
    result.addSubcomponent(component);
  }
  return result.toString();
}

export function downloadCalendar(text: string, name = "pathwayve-calendar") {
  const url = URL.createObjectURL(
    new Blob([text + "\r\n"], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
