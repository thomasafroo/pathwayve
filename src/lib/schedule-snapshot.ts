import "server-only";
import { randomUUID } from "node:crypto";
import type { SaveRequest, ScheduleDocument } from "@/types/schedule";
import { validateWorkspace } from "./trip-workspace";

// Persist an exact snapshot; never regenerate routes or ask Gemini during save.
export function ownedSnapshot(
  input: SaveRequest,
  owner: string,
): ScheduleDocument {
  if (input.document) {
    const document = structuredClone(input.document);
    const id = randomUUID();
    document.schedules[0] = {
      ...document.schedules[0],
      id,
      user_id: owner,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const ids = new Map(
      document.schedule_items.map((item) => [item.id, randomUUID()]),
    );
    document.schedule_items = document.schedule_items.map((item) => ({
      ...item,
      id: ids.get(item.id)!,
      schedule_id: id,
    }));
    const run = document.schedule_runs[0];
    run.id = randomUUID();
    run.schedule_id = id;
    run.result.placements = run.result.placements.map((p) => ({
      ...p,
      item_id: ids.get(p.item_id) ?? p.item_id,
    }));
    run.result.unscheduled_items = run.result.unscheduled_items.map((p) => ({
      ...p,
      item_id: ids.get(p.item_id) ?? p.item_id,
    }));
    return document;
  }
  const workspace = validateWorkspace(input.workspace);
  const { trip } = workspace,
    { request } = trip;
  const id = randomUUID(),
    now = new Date().toISOString();
  const items = trip.stops.map((stop, index) => ({
    id: randomUUID(),
    schedule_id: id,
    kind: "visit" as const,
    title: stop.name,
    place_id: stop.id,
    place_query: stop.name,
    duration_minutes: stop.durationMinutes,
    priority: stop.priority ?? ("required" as const),
    timing_type: "flexible" as const,
    fixed_start_at: null,
    earliest_start_at: null,
    latest_end_at: null,
    preferred_sequence: index,
    order_locked: stop.locked,
    requirements: { seating: false, quiet: false, wifi: false },
  }));
  return {
    schema_version: 1,
    schedules: [
      {
        id,
        user_id: owner,
        name: `${request.origin.name} to ${request.destination.name}`.slice(
          0,
          160,
        ),
        origin_place_id: request.origin.placeId || request.origin.name,
        destination_place_id:
          request.destination.placeId || request.destination.name,
        starts_at: request.startTime,
        ends_at: request.endTime,
        time_zone: request.timeZone,
        transportation: request.transportation,
        preferences: {
          budget: request.budget ?? "any",
          interests: request.interestTags ?? [],
          routing_priority: request.routingPriority ?? "fastest",
          notes: request.preferences,
        },
        version: 1,
        created_at: now,
        updated_at: now,
      },
    ],
    schedule_items: items,
    schedule_runs: [
      {
        id: randomUUID(),
        schedule_id: id,
        schedule_version: 1,
        calculated_at: trip.lastUpdated,
        status:
          Date.parse(trip.arrivalTime) <= Date.parse(request.endTime)
            ? "feasible"
            : "infeasible",
        result: {
          map_trip: trip,
          placements: items.map((item, index) => ({
            item_id: item.id,
            place_id: item.place_id,
            sequence: index,
            starts_at: trip.stops[index].arrivalTime,
            ends_at: new Date(
              Date.parse(trip.stops[index].arrivalTime) +
                item.duration_minutes * 60000,
            ).toISOString(),
          })),
          travel_legs: [],
          unscheduled_items: [],
          destination_arrival_at: trip.arrivalTime,
          warnings: trip.warnings,
        },
      },
    ],
  };
}
