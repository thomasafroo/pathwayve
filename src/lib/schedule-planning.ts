import "server-only";
import { visitWindow } from "./opening-hours";
import { refreshPlaceHours } from "./place-hours";
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
import type { PlanningConstraints } from "@/types/planning-constraints";
import { enforceScheduleConstraints } from "./schedule-constraints";
import { optimizeStopOrder } from "./stop-order";
import { discoverRoutePlace, traceRoute } from "./route-discovery";

export async function materializeSchedule(
  draft: GeneratedSchedule,
  owner: string,
  constraints?: PlanningConstraints | null,
): Promise<{ document: ScheduleDocument; workspace: WorkspaceTrip | null }> {
  draft = enforceScheduleConstraints(draft, constraints);
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
  const endpointPlace = (
    endpoint: NonNullable<PlanningConstraints["origin"]>,
  ): CandidatePlace => ({
    id:
      endpoint.placeId ??
      `coordinate:${endpoint.location.lat},${endpoint.location.lng}`,
    name: endpoint.name,
    location: endpoint.location,
    category: "attraction",
  });
  const [origin, destination] = await Promise.all([
    constraints?.origin
      ? endpointPlace(constraints.origin)
      : find(intent.origin_query),
    constraints?.destination
      ? endpointPlace(constraints.destination)
      : find(intent.destination_query),
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
  const genericIds = new Set<string>();
  // Sidebar provider IDs/coordinates are authoritative: never search their names again.
  for (const [index, item] of items.entries()) {
    const model = draft.schedule_items[index];
    const chosen = constraints?.selectedStops.find(
      (stop) => stop.id === model.selected_stop_id,
    );
    if (chosen) {
      item.place_id = chosen.id;
      places.set(item.id, await refreshPlaceHours(chosen));
    } else if (item.place_query && model.location_scope === "along_route") {
      genericIds.add(item.id);
    } else if (item.place_query) {
      const place = await find(item.place_query);
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
    orderPolicy: intent.preferences.order_policy,
    routingPriority:
      intent.preferences.order_policy === "optimize"
        ? ("fastest" as const)
        : intent.preferences.routing_priority,
    budget: intent.preferences.budget,
  };
  const result: RunResult = {
    placements: [],
    travel_legs: [],
    unscheduled_items: [],
    destination_arrival_at: null,
    warnings: [],
  };
  let ordered = [...items].sort(
    (a, b) => (a.preferred_sequence ?? 100) - (b.preferred_sequence ?? 100),
  );
  if (request.orderPolicy === "optimize") {
    const resolved = ordered.filter((item) => places.has(item.id));
    if (
      resolved.length <= 6 &&
      resolved.every((item) => item.kind === "visit")
    ) {
      const optimized = await optimizeStopOrder(
        resolved,
        (item) => item.order_locked,
        (order) =>
          traceRoute(
            origin,
            destination,
            order.map((item) => ({ item, place: places.get(item.id)! })),
            request,
          ),
      );
      const queue = [...optimized.order];
      ordered = ordered.map((item) =>
        places.has(item.id) ? queue.shift()! : item,
      );
      ordered.forEach((item, index) => {
        if (!item.order_locked) item.preferred_sequence = index;
      });
      result.warnings.push(
        optimized.result
          ? `Compared ${optimized.evaluated} stop orders using ${mapsMode() === "live" ? "Google Routes travel times" : "demo estimates"}. Chose the earliest feasible arrival among these orders; larger trips use a bounded search.`
          : "No feasible optimized order found; the original order is checked below.",
      );
    } else
      result.warnings.push(
        "Stop-order optimization is available for up to six resolved visits. Task schedules retain their sequence.",
      );
  }
  const discoveryProblems = new Map<string, string>();
  if (genericIds.size) {
    const pending = ordered.filter((item) => genericIds.has(item.id));
    ordered = ordered.filter((item) => !genericIds.has(item.id));
    for (const item of pending) {
      try {
        const anchors = ordered.flatMap((existing) => {
          const place = places.get(existing.id);
          const unverifiedTask =
            existing.kind === "task" &&
            Object.values(existing.requirements).some(Boolean);
          return place && !unverifiedTask ? [{ place, item: existing }] : [];
        });
        const addition = await discoverRoutePlace({
          query: item.place_query!,
          item,
          origin,
          destination,
          anchors,
          request,
          radiusMeters: constraints?.routeRadiusMeters ?? 1000,
        });
        if (addition) {
          item.place_id = addition.place.id;
          places.set(item.id, addition.place);
          const before = anchors[addition.index]?.item;
          const insertionIndex = before
            ? ordered.findIndex((i) => i.id === before.id)
            : ordered.length;
          ordered.splice(insertionIndex, 0, item);
        } else {
          discoveryProblems.set(
            item.id,
            `No feasible match found within ${constraints?.routeRadiusMeters ?? 1000} m of the route that preserves existing stops, their times, and the chosen travel mode.`,
          );
        }
      } catch (error) {
        discoveryProblems.set(
          item.id,
          error instanceof AppError
            ? error.message
            : "Route-area discovery failed. Your selected places are preserved.",
        );
      }
    }
    ordered.push(...pending.filter((item) => !places.has(item.id)));
    ordered.forEach((item, index) => {
      if (!item.order_locked) item.preferred_sequence = index;
    });
  }
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
          discoveryProblems.has(item.id) ? "NO_ROUTE_MATCH" : "NEEDS_PLACE",
          discoveryProblems.get(item.id) ??
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
      let start = item.fixed_start_at
        ? Date.parse(item.fixed_start_at)
        : Math.max(
            arrival,
            item.earliest_start_at
              ? Date.parse(item.earliest_start_at)
              : arrival,
          );
      const window = visitWindow(
        place,
        start,
        item.duration_minutes,
        Math.min(
          Date.parse(schedule.ends_at),
          item.latest_end_at ? Date.parse(item.latest_end_at) : Infinity,
        ),
        !!item.fixed_start_at,
      );
      if (!window) {
        unavailable(
          item,
          "OPENING_HOURS",
          "The complete visit cannot fit this place’s opening hours within the requested time window.",
        );
        continue;
      }
      start = window.start;
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
      if (window.status === "unknown")
        result.warnings.push(
          `${place.name}: opening hours unavailable; visit is unverified.`,
        );
      if (window.status === "regular")
        result.warnings.push(
          `${place.name}: regular opening hours used; holiday changes may differ.`,
        );
      stops.push({
        ...place,
        arrivalTime: new Date(start).toISOString(),
        hoursStatus: window.status,
        waitMinutes: Math.ceil((start - arrival) / 60000),
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
    "Place matches were selected from search results. Review place matches before travelling. Availability is not verified; opening-hours checks are shown per stop.",
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
