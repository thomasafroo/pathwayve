import { z } from "zod";
import { tripStateSchema } from "@/types/trip";
import { workspaceSchema, type WorkspaceTrip } from "@/types/workspace";
import {
  savedScheduleSchema,
  savedItemSchema,
  type ScheduleDocument,
} from "@/types/schedule";
const instant = z.iso.datetime({ offset: true });
export const documentSchema = z.object({
  schema_version: z.literal(1),
  schedules: z.array(savedScheduleSchema).length(1),
  schedule_items: z.array(savedItemSchema).max(30),
  schedule_runs: z
    .array(
      z.object({
        id: z.uuid(),
        schedule_id: z.uuid(),
        schedule_version: z.number().int().positive(),
        calculated_at: instant,
        status: z.enum(["feasible", "infeasible", "failed"]),
        result: z.object({
          map_trip: tripStateSchema.optional(),
          workspace_snapshot: workspaceSchema.optional(),
          placements: z
            .array(
              z.object({
                item_id: z.uuid(),
                place_id: z.string(),
                sequence: z.number().int().nonnegative(),
                starts_at: instant,
                ends_at: instant,
              }),
            )
            .max(30),
          travel_legs: z
            .array(
              z.object({
                sequence: z.number().int().nonnegative(),
                from_place_id: z.string(),
                to_place_id: z.string(),
                transportation: z.string(),
                departs_at: instant,
                arrives_at: instant,
                duration_seconds: z.number().nonnegative(),
                distance_meters: z.number().nonnegative(),
              }),
            )
            .max(31),
          unscheduled_items: z
            .array(
              z.object({
                item_id: z.uuid(),
                reason_code: z.string(),
                reason: z.string(),
              }),
            )
            .max(30),
          destination_arrival_at: instant.nullable(),
          warnings: z.array(z.string()).max(100),
        }),
      }),
    )
    .length(1),
});
export function workspaceDocument(
  workspace: WorkspaceTrip,
  owner: string,
): ScheduleDocument {
  const { trip } = workspace,
    request = trip.request;
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  const items = trip.stops.map((stop, index) => ({
    id: crypto.randomUUID(),
    schedule_id: id,
    kind: "visit" as const,
    title: stop.name,
    place_id: stop.id,
    place_query: stop.name,
    duration_minutes: stop.durationMinutes,
    priority: stop.priority ?? ("optional" as const),
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
        name: `Trip to ${request.destination.name}`,
        origin_place_id: request.origin.placeId ?? "coordinate:origin",
        destination_place_id:
          request.destination.placeId ?? "coordinate:destination",
        starts_at: request.startTime,
        ends_at: request.endTime,
        time_zone: request.timeZone,
        transportation: request.transportation,
        preferences: {
          budget: request.budget ?? "any",
          interests: request.interestTags ?? request.activities,
          routing_priority: request.routingPriority ?? "fastest",
          order_policy: request.orderPolicy,
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
        id: crypto.randomUUID(),
        schedule_id: id,
        schedule_version: 1,
        calculated_at: trip.lastUpdated,
        status:
          Date.parse(trip.arrivalTime) <= Date.parse(request.endTime)
            ? "feasible"
            : "infeasible",
        result: {
          map_trip: trip,
          workspace_snapshot: workspace,
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
export function copyDocument(
  source: ScheduleDocument,
  owner: string,
): ScheduleDocument {
  const result = structuredClone(source),
    id = crypto.randomUUID(),
    now = new Date().toISOString();
  const itemIds = new Map(
    result.schedule_items.map((item) => [item.id, crypto.randomUUID()]),
  );
  result.schedules[0] = {
    ...result.schedules[0],
    id,
    user_id: owner,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  result.schedule_items = result.schedule_items.map((item) => ({
    ...item,
    id: itemIds.get(item.id)!,
    schedule_id: id,
  }));
  const run = result.schedule_runs[0];
  run.id = crypto.randomUUID();
  run.schedule_id = id;
  run.schedule_version = 1;
  run.result.placements.forEach((item) => {
    item.item_id = itemIds.get(item.item_id)!;
  });
  run.result.unscheduled_items.forEach((item) => {
    item.item_id = itemIds.get(item.item_id)!;
  });
  return result;
}
