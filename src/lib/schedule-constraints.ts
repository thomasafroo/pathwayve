import "server-only";
import { validateIntent, type GeneratedSchedule } from "@/types/schedule";
import type { PlanningConstraints } from "@/types/planning-constraints";
import { AppError } from "./server/http";

export function enforceScheduleConstraints(
  draft: GeneratedSchedule,
  constraints?: PlanningConstraints | null,
): GeneratedSchedule {
  if (!constraints || draft.clarification) return draft;
  const { selectedStops } = constraints;
  const matches = (
    item: GeneratedSchedule["schedule_items"][number],
    stop: (typeof selectedStops)[number],
  ) =>
    item.selected_stop_id === stop.id ||
    item.place_query?.trim().toLowerCase() === stop.name.trim().toLowerCase();
  const removals = new Set(draft.removed_stop_ids ?? []);
  if ([...removals].some((id) => !selectedStops.some((stop) => stop.id === id)))
    throw new AppError(
      "INVALID_STOP_REMOVAL",
      "The assistant referenced an unknown stop. Please try your request again.",
      422,
    );
  const retained = selectedStops.filter(
    (stop) =>
      stop.locked ||
      (stop.priority ?? "required") === "required" ||
      !removals.has(stop.id),
  );
  const required = retained.map((stop, index) => {
    const modelItem = draft.schedule_items.find((item) => matches(item, stop));
    return {
      ...modelItem,
      kind: "visit" as const,
      title: modelItem?.title ?? stop.name,
      place_query: stop.name,
      selected_stop_id: stop.id,
      location_scope: "specific" as const,
      duration_minutes: stop.durationMinutes,
      priority:
        stop.locked ||
        (stop.priority ?? "required") === "required" ||
        modelItem?.priority === "required"
          ? ("required" as const)
          : stop.priority!,
      timing_type: modelItem?.timing_type ?? ("flexible" as const),
      fixed_start_at: modelItem?.fixed_start_at ?? null,
      earliest_start_at: modelItem?.earliest_start_at ?? null,
      latest_end_at: modelItem?.latest_end_at ?? null,
      preferred_sequence: index,
      order_locked: stop.locked,
      requirements: { seating: false, quiet: false, wifi: false },
    };
  });
  const extras = draft.schedule_items.filter(
    (item) => !selectedStops.some((stop) => matches(item, stop)),
  );
  if (required.length + extras.length > 12)
    throw new AppError(
      "TOO_MANY_ACTIVITIES",
      "Your required stops and extra activities exceed 12. Ask for fewer extras; your selected stops have been kept.",
      422,
    );
  const intent = draft.schedules[0];
  return validateIntent({
    ...draft,
    schedules: [
      {
        ...intent,
        origin_query: constraints.origin?.name ?? intent.origin_query,
        destination_query:
          constraints.destination?.name ?? intent.destination_query,
        transportation: constraints.transportation,
        starts_at: constraints.startTime ?? intent.starts_at,
        ends_at: constraints.endTime ?? intent.ends_at,
        time_zone: constraints.timeZone,
        preferences: {
          ...intent.preferences,
          order_policy: constraints.orderPolicy ?? "preserve",
          routing_priority:
            constraints.orderPolicy === "optimize"
              ? "fastest"
              : constraints.routingPriority,
          budget: constraints.budget,
          interests: [
            ...new Set([
              ...constraints.activities,
              ...constraints.interestTags,
              ...intent.preferences.interests,
            ]),
          ].slice(0, 20),
          notes: [constraints.preferences, intent.preferences.notes]
            .filter(Boolean)
            .join("\n")
            .slice(0, 1000),
        },
      },
    ],
    schedule_items: [
      ...required,
      ...extras.map((item, index) => ({
        ...item,
        selected_stop_id: null,
        preferred_sequence: required.length
          ? required.length + index
          : item.preferred_sequence,
      })),
    ],
  });
}
