import { z } from "zod";

export const categories = [
  "coffee",
  "park",
  "bookstore",
  "food",
  "shopping",
  "attraction",
] as const;
export const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const endpointSchema = z.object({
  name: z.string().trim().min(1).max(200),
  location: locationSchema,
});
export const tripRequestSchema = z
  .object({
    origin: endpointSchema,
    destination: endpointSchema,
    startTime: z.iso.datetime({ offset: true }),
    endTime: z.iso.datetime({ offset: true }),
    transportation: z.enum(["driving", "walking", "transit"]),
    activities: z
      .array(z.enum(categories))
      .min(1)
      .max(6)
      .refine(
        (items) => new Set(items).size === items.length,
        "Choose each activity once.",
      ),
    preferences: z.string().trim().max(1000).default(""),
  })
  .refine(
    (request) => {
      const duration =
        Date.parse(request.endTime) - Date.parse(request.startTime);
      return duration > 0 && duration <= 24 * 60 * 60 * 1000;
    },
    {
      message: "End time must be after departure and within 24 hours.",
      path: ["endTime"],
    },
  );

export const candidatePlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(categories),
  location: locationSchema,
  address: z.string().optional(),
});
export const tripStopSchema = candidatePlaceSchema.extend({
  arrivalTime: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(180),
  reason: z.string().min(1).max(1000),
  locked: z.boolean(),
});
export const routeLegSchema = z.object({
  from: z.string(),
  to: z.string(),
  durationMinutes: z.number().nonnegative(),
  distanceMeters: z.number().nonnegative(),
  path: z.array(locationSchema),
});
export const tripStateSchema = z.object({
  id: z.string(),
  request: tripRequestSchema,
  stops: z.array(tripStopSchema).max(6),
  legs: z.array(routeLegSchema).max(7),
  status: z.literal("ready"),
  source: z.enum(["demo", "live"]),
  summary: z.string().max(2000),
  warnings: z.array(z.string()).max(20),
  arrivalTime: z.iso.datetime({ offset: true }),
  lastUpdated: z.iso.datetime({ offset: true }),
});
export const replanRequestSchema = z.object({
  tripState: tripStateSchema,
  event: z.discriminatedUnion("type", [
    z.object({ type: z.literal("RAIN_EARLY") }),
    z.object({
      type: z.literal("DELAY"),
      minutes: z.number().int().min(1).max(120),
    }),
    z.object({
      type: z.literal("EARLIER_END"),
      endTime: z.iso.datetime({ offset: true }),
    }),
  ]),
});
export type Location = z.infer<typeof locationSchema>;
export type TripRequest = z.infer<typeof tripRequestSchema>;
export type CandidatePlace = z.infer<typeof candidatePlaceSchema>;
export type TripStop = z.infer<typeof tripStopSchema>;
export type RouteLeg = z.infer<typeof routeLegSchema>;
export type TripState = z.infer<typeof tripStateSchema>;
export type TripEvent = z.infer<typeof replanRequestSchema>["event"];
export type ApiError = { error: { code: string; message: string } };
