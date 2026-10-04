import "server-only";
import { randomUUID } from "node:crypto";
import {
  type GeneratedSchedule,
  type SavedItem,
  type ScheduleDocument,
  type RunResult,
} from "@/types/schedule";
import {
  type CandidatePlace,
  type RouteLeg,
  type TripStop,
  tripStateSchema,
} from "@/types/trip";
import { type WorkspaceTrip } from "@/types/workspace";
import { searchPlaces } from "./place-search";
import { computeScheduleLeg } from "./schedule-routing";
import { mapsMode } from "./server/env";
import { AppError } from "./server/http";

export async function materializeSchedule(
  draft: GeneratedSchedule,
  owner: string,
): Promise<{ document: ScheduleDocument; workspace: WorkspaceTrip | null }> {
  const intent = draft.schedules[0];
  if (!intent)
    throw new AppError(
      "INCOMPLETE_SCHEDULE",
      "A complete schedule is required.",
    );
  if (Date.parse(intent.starts_at) < Date.now() - 60000)
    throw new AppError(
      "PAST_DEPARTURE",
      "Choose a future departure, then send the prompt again.",
      422,
    );
  const source = mapsMode();
  const find = async (query: string, near?: CandidatePlace["location"]) => {
    const response = await searchPlaces({
      query,
      category: "attraction",
      budget: "any",
      near,
    });
    return response.places[0] ?? null;
  };
  const [origin, destination] = await Promise.all([
    find(intent.origin_query),
    find(intent.destination_query),
  ]);
  if (!origin || !destination)
    throw new AppError(
      "LOCATION_NOT_FOUND",
      "Could not resolve the starting point or destination. Include a specific place and city.",
      422,
    );
  const id = randomUUID(),
    now = new Date().toISOString();
  const schedule = {
    id,
    user_id: owner,
    name: intent.name,
    origin_place_id: origin.id,
    destination_place_id: destination.id,
    starts_at: intent.starts_at,
    ends_at: intent.ends_at,
    time_zone: intent.time_zone,
    transportation: intent.transportation,
    preferences: intent.preferences,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  const items: SavedItem[] = draft.schedule_items.map((item) => ({
    ...item,
    id: randomUUID(),
    schedule_id: id,
    place_id: null,
  }));
  const places = new Map<string, CandidatePlace>();
  // Preserve every intention, including tasks with no assigned place.
  for (const item of items) {
    if (item.place_query) {
      const place = await find(item.place_query, destination.location);
      if (place) {
        item.place_id = place.id;
        places.set(item.id, place);
      }
    }
  }
  const request = {
    origin: {
      name: origin.name,
      location: origin.location,
      placeId: origin.id,
    },
    destination: {
      name: destination.name,
      location: destination.location,
      placeId: destination.id,
    },
    startTime: intent.starts_at,
    endTime: intent.ends_at,
    timeZone: intent.time_zone,
    transportation: intent.transportation,
    activities: [],
    preferences: intent.preferences.notes,
    routingPriority: intent.preferences.routing_priority,
    budget: intent.preferences.budget,
  };
  const result: RunResult = {
    placements: [],
    travel_legs: [],
    unscheduled_items: [],
    destination_arrival_at: null,
    warnings: [],
  };
  const ordered = [...items].sort(
    (a, b) => (a.preferred_sequence ?? 100) - (b.preferred_sequence ?? 100),
  );
  const unavailable = (item: SavedItem, code: string, reason: string) =>
    result.unscheduled_items.push({
      item_id: item.id,
      reason_code: code,
      reason,
    });
  const stops: TripStop[] = [],
    legs: RouteLeg[] = [];
  let cursor = origin,
    time = Date.parse(schedule.starts_at),
    failed = false;
  const addLeg = (
    from: CandidatePlace,
    to: CandidatePlace,
    leg: RouteLeg,
    departure: number,
  ) => {
    legs.push(leg);
    result.travel_legs.push({
      sequence: result.travel_legs.length,
      from_place_id: from.id,
      to_place_id: to.id,
      transportation: leg.mode ?? intent.transportation,
      departs_at: new Date(departure).toISOString(),
      arrives_at: new Date(
        departure + leg.durationMinutes * 60000,
      ).toISOString(),
      duration_seconds: leg.durationMinutes * 60,
      distance_meters: leg.distanceMeters,
    });
  };
  try {
    for (const item of ordered) {
      if (
        item.order_locked &&
        item.preferred_sequence !== result.placements.length
      ) {
        unavailable(
          item,
          "ORDER_LOCK_CONFLICT",
          "The locked position cannot be preserved because an earlier activity could not be placed.",
        );
        continue;
      }
      const place = places.get(item.id);
      if (!place) {
        unavailable(
          item,
          "NEEDS_PLACE",
          "Saved for later: choose a place for this activity.",
        );
        continue;
      }
      if (
        item.kind === "task" &&
        Object.values(item.requirements).some(Boolean)
      ) {
        unavailable(
          item,
          "REQUIREMENTS_UNVERIFIED",
          "Saved for later: confirm this place meets the task’s seating, quietness, or wifi requirements.",
        );
        continue;
      }
      if (stops.length >= 6 || stops.some((stop) => stop.id === place.id)) {
        unavailable(
          item,
          "PLACE_CAPACITY",
          "Saved for later: this route supports six distinct places.",
        );
        continue;
      }
      const leg = await computeScheduleLeg(
        cursor,
        place,
        request,
        new Date(time).toISOString(),
      );
      const arrival = time + leg.durationMinutes * 60000;
      const start = item.fixed_start_at
        ? Date.parse(item.fixed_start_at)
        : Math.max(
            arrival,
            item.earliest_start_at
              ? Date.parse(item.earliest_start_at)
              : arrival,
          );
      const finish = start + item.duration_minutes * 60000;
      if (
        start < arrival ||
        finish > Date.parse(schedule.ends_at) ||
        (item.latest_end_at && finish > Date.parse(item.latest_end_at))
      ) {
        unavailable(
          item,
          "TIME_CONFLICT",
          "This activity does not fit its time constraints in the proposed order.",
        );
        continue;
      }
      // Check the destination too before admitting a stop; never promise a late arrival.
      const onward = await computeScheduleLeg(
        place,
        destination,
        request,
        new Date(finish).toISOString(),
      );
      if (
        finish + onward.durationMinutes * 60000 >
        Date.parse(schedule.ends_at)
      ) {
        unavailable(
          item,
          "INSUFFICIENT_TIME",
          "Not enough time for this activity and travel to the destination.",
        );
        continue;
      }
      addLeg(cursor, place, leg, time);
      result.placements.push({
        item_id: item.id,
        place_id: place.id,
        sequence: result.placements.length,
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(finish).toISOString(),
      });
      stops.push({
        ...place,
        arrivalTime: new Date(start).toISOString(),
        durationMinutes: item.duration_minutes,
        priority: item.priority,
        locked: item.order_locked,
        reason: item.title,
      });
      cursor = place;
      time = finish;
    }
    const last = await computeScheduleLeg(
      cursor,
      destination,
      request,
      new Date(time).toISOString(),
    );
    addLeg(cursor, destination, last, time);
    result.destination_arrival_at = new Date(
      time + last.durationMinutes * 60000,
    ).toISOString();
  } catch (error) {
    const code = error instanceof AppError ? error.code : "ROUTE_UNAVAILABLE";
    const reason =
      error instanceof AppError
        ? `${error.message} Your activities are saved, but this route could not be calculated.`
        : "Route calculation failed. Your activities are saved; try planning again later.";
    console.error("Schedule routing failed", {
      code,
      name: error instanceof Error ? error.name : "UnknownError",
    });
    result.warnings.push(reason);
    failed = true;
    result.placements = [];
    result.travel_legs = [];
    result.destination_arrival_at = null;
    result.unscheduled_items = items.map((item) => ({
      item_id: item.id,
      reason_code: code,
      reason,
    }));
  }
  const missingRequired = result.unscheduled_items.some((entry) =>
    items.some(
      (item) =>
        item.id === entry.item_id &&
        (item.priority === "required" || item.order_locked),
    ),
  );
  const late =
    !result.destination_arrival_at ||
    Date.parse(result.destination_arrival_at) > Date.parse(schedule.ends_at);
  const status = failed
    ? "failed"
    : missingRequired || late
      ? "infeasible"
      : "feasible";
  result.warnings.push(
    "Place matches were selected from search results. Review them before travelling; opening hours and availability are not verified.",
  );
  if (source === "demo")
    result.warnings.push(
      "Sample geography and estimated travel times. Not navigation directions.",
    );
  if (status === "infeasible")
    result.warnings.push(
      "The proposed order cannot fit every required constraint. Adjust the window or activities and generate a new schedule.",
    );
  if (!failed) {
    result.map_trip = tripStateSchema.parse({
      id,
      request: { ...request, selectedStops: stops },
      stops,
      legs,
      status: "ready",
      source,
      summary: intent.name,
      warnings: [...result.warnings],
      arrivalTime: result.destination_arrival_at,
      lastUpdated: now,
    });
  }
  const document: ScheduleDocument = {
    schema_version: 1,
    schedules: [schedule],
    schedule_items: items,
    schedule_runs: [
      {
        id: randomUUID(),
        schedule_id: id,
        schedule_version: 1,
        calculated_at: new Date().toISOString(),
        status,
        result,
      },
    ],
  };
  // Timed appointments/standalone tasks use the saved schedule view, whose constraints
  // cannot be represented faithfully by the older editable TripState contract.
  const canUseWorkspace =
    status === "feasible" &&
    items.every(
      (item) => item.kind === "visit" && item.timing_type === "flexible",
    );
  const workspace: WorkspaceTrip | null =
    canUseWorkspace && result.map_trip
      ? {
          version: 0,
          activities: [],
          trip: result.map_trip,
        }
      : null;
  return { document, workspace };
}
