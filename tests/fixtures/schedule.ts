import type { GeneratedSchedule } from "@/types/schedule";
export const owner = "22222222-2222-4222-8222-222222222222";
export function scheduleIntent(): GeneratedSchedule {
  return {
    schema_version: 1,
    clarification: null,
    schedules: [
      {
        name: "Coffee and a visit",
        origin_query: "Origin",
        destination_query: "Destination",
        starts_at: "2030-10-04T13:00:00-07:00",
        ends_at: "2030-10-04T18:00:00-07:00",
        time_zone: "America/Vancouver",
        transportation: "walking",
        preferences: {
          budget: "any",
          interests: ["coffee"],
          routing_priority: "fastest",
          notes: "",
        },
      },
    ],
    schedule_items: [
      {
        kind: "visit",
        location_scope: "specific",
        selected_stop_id: null,
        title: "Coffee",
        place_query: "Cafe",
        duration_minutes: 30,
        priority: "preferred",
        timing_type: "flexible",
        fixed_start_at: null,
        earliest_start_at: null,
        latest_end_at: null,
        preferred_sequence: 0,
        order_locked: false,
        requirements: { seating: false, quiet: false, wifi: false },
      },
    ],
  };
}
