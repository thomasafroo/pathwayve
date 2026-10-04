import { z } from "zod";
import { tripRequestSchema, type TripState } from "./trip";
import { calendarSelectionSchema, type CalendarEvent } from "./calendar";

const instant = z.iso.datetime({ offset: true });
const zone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Invalid timezone.");
export const preferencesSchema = z.object({
  budget: z.enum(["any", "budget", "moderate", "premium"]),
  interests: z.array(z.string().max(80)).max(20),
  routing_priority: z.enum(["fastest", "less_walking", "fewer_transfers"]),
  notes: z.string().max(1000),
});
export const itemIntentSchema = z.object({
  kind: z.enum(["visit", "task"]),
  title: z.string().trim().min(1).max(160),
  place_query: z.string().trim().min(2).max(200).nullable(),
  duration_minutes: z.number().int().min(5).max(180),
  priority: z.enum(["required", "preferred", "optional"]),
  timing_type: z.enum(["flexible", "window", "fixed"]),
  fixed_start_at: instant.nullable(),
  earliest_start_at: instant.nullable(),
  latest_end_at: instant.nullable(),
  preferred_sequence: z.number().int().min(0).max(11).nullable(),
  order_locked: z.boolean(),
  requirements: z.object({
    seating: z.boolean(),
    quiet: z.boolean(),
    wifi: z.boolean(),
  }),
});

// Gemini produces intentions, not SQL text, ownership IDs, or invented route estimates.
export const generatedScheduleSchema = z.object({
  schema_version: z.literal(1),
  clarification: z.string().max(500).nullable(),
  schedules: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        origin_query: z.string().trim().min(2).max(200),
        destination_query: z.string().trim().min(2).max(200),
        starts_at: instant,
        ends_at: instant,
        time_zone: z.string(),
        transportation: z.enum(["walking", "driving", "transit"]),
        preferences: preferencesSchema,
      }),
    )
    .max(1),
  schedule_items: z.array(itemIntentSchema).max(12),
});
export type GeneratedSchedule = z.infer<typeof generatedScheduleSchema>;
export const promptRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  timeZone: zone,
  requestId: z.uuid(),
  context: tripRequestSchema.nullable().optional(),
  googleCalendar: calendarSelectionSchema.nullable().optional(),
});
export type PromptRequest = z.infer<typeof promptRequestSchema>;
export const savedScheduleSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  name: z.string().min(1).max(160),
  origin_place_id: z.string().min(1),
  destination_place_id: z.string().min(1),
  starts_at: instant,
  ends_at: instant,
  time_zone: zone,
  transportation: z.enum(["walking", "driving", "transit"]),
  preferences: preferencesSchema,
  version: z.number().int().positive(),
  created_at: instant,
  updated_at: instant,
});
export const savedItemSchema = itemIntentSchema
  .omit({ place_query: true })
  .extend({
    id: z.uuid(),
    schedule_id: z.uuid(),
    place_id: z.string().nullable(),
    // Retain unresolved intent so tasks can be placed on a later run.
    place_query: z.string().nullable(),
  });
export type SavedSchedule = z.infer<typeof savedScheduleSchema>;
export type SavedItem = z.infer<typeof savedItemSchema>;
export type Placement = {
  item_id: string;
  place_id: string;
  sequence: number;
  starts_at: string;
  ends_at: string;
};
export type UnscheduledItem = {
  item_id: string;
  reason_code: string;
  reason: string;
};
export type RunResult = {
  calendar_events?: CalendarEvent[];
  // Display-only snapshot, including provider geometry. Older saves may omit it.
  map_trip?: TripState;
  placements: Placement[];
  travel_legs: {
    sequence: number;
    from_place_id: string;
    to_place_id: string;
    transportation: string;
    departs_at: string;
    arrives_at: string;
    duration_seconds: number;
    distance_meters: number;
  }[];
  unscheduled_items: UnscheduledItem[];
  destination_arrival_at: string | null;
  warnings: string[];
};
export type SavedRun = {
  id: string;
  schedule_id: string;
  schedule_version: number;
  calculated_at: string;
  status: "feasible" | "infeasible" | "failed";
  result: RunResult;
};
export type ScheduleDocument = {
  schema_version: 1;
  schedules: SavedSchedule[];
  schedule_items: SavedItem[];
  schedule_runs: SavedRun[];
};

export function validateIntent(value: unknown): GeneratedSchedule {
  const draft = generatedScheduleSchema.parse(value);
  if (draft.clarification) {
    if (draft.schedules.length || draft.schedule_items.length)
      throw new Error("A clarification must not contain a schedule.");
    return draft;
  }
  if (draft.schedules.length !== 1)
    throw new Error("Exactly one schedule is required.");
  const schedule = draft.schedules[0];
  zone.parse(schedule.time_zone);
  const start = Date.parse(schedule.starts_at),
    end = Date.parse(schedule.ends_at);
  if (end <= start || end - start > 31 * 86400000)
    throw new Error("Schedule must finish after departure and within 31 days.");
  const sequences = new Set<number>();
  for (const item of draft.schedule_items) {
    if (item.preferred_sequence !== null) {
      if (sequences.has(item.preferred_sequence))
        throw new Error("Duplicate sequence positions.");
      sequences.add(item.preferred_sequence);
    }
    if (item.order_locked && item.preferred_sequence === null)
      throw new Error("An order lock needs a sequence position.");
    if (item.timing_type === "fixed") {
      if (!item.fixed_start_at || item.earliest_start_at || item.latest_end_at)
        throw new Error("Fixed items require only a fixed start.");
    } else if (item.timing_type === "window") {
      if (
        item.fixed_start_at ||
        !item.earliest_start_at ||
        !item.latest_end_at ||
        Date.parse(item.latest_end_at) - Date.parse(item.earliest_start_at) <
          item.duration_minutes * 60000
      )
        throw new Error("Invalid activity time window.");
    } else if (
      item.fixed_start_at ||
      item.earliest_start_at ||
      item.latest_end_at
    )
      throw new Error("Flexible items cannot carry fixed times.");
  }
  return draft;
}
