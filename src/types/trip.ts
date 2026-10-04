import { z } from "zod";
import { endOfDay } from "@/lib/time-window";

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
  placeId: z.string().optional(),
});
export const candidatePlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(categories),
  location: locationSchema,
  address: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  ratingCount: z.number().int().nonnegative().optional(),
  priceLevel: z.string().optional(),
  mapsUrl: z.url().optional(),
  attribution: z.string().optional(),
});
export const tripRequestSchema = z
  .object({
    origin: endpointSchema,
    destination: endpointSchema,
    startTime: z.iso.datetime({ offset: true }).optional(),
    endTime: z.iso.datetime({ offset: true }).optional(),
    timeZone: z
      .string()
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Use a valid IANA timezone.")
      .default("America/Vancouver"),
    transportation: z.enum(["driving", "walking", "transit"]),
    activities: z
      .array(z.enum(categories))
      .max(6)
      .refine(
        (items) => new Set(items).size === items.length,
        "Choose each activity once.",
      ),
    preferences: z.string().trim().max(1000).default(""),
    favoritePlaceIds: z.array(z.string().min(1)).max(100).optional(),
    interestTags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    routingPriority: z
      .enum(["fastest", "less_walking", "fewer_transfers"])
      .optional(),
    budget: z.enum(["any", "budget", "moderate", "premium"]).optional(),
    selectedStops: z
      .array(
        candidatePlaceSchema.extend({
          durationMinutes: z.number().int().min(5).max(180).default(30),
          locked: z.boolean().default(false),
          priority: z
            .enum(["required", "preferred", "optional"])
            .default("required"),
        }),
      )
      .max(6)
      .optional(),
    suggestionMode: z.enum(["manual", "suggest"]).optional(),
  })
  .transform((request) => {
    const startTime = request.startTime ?? new Date().toISOString();
    return {
      ...request,
      startTime,
      endTime:
        request.endTime ?? endOfDay(new Date(startTime), request.timeZone),
    };
  })
  .refine(
    (request) => {
      const duration =
        Date.parse(request.endTime) - Date.parse(request.startTime);
      return duration > 0 && duration <= 31 * 24 * 60 * 60 * 1000;
    },
    {
      message: "End time must be after departure and within 31 days.",
      path: ["endTime"],
    },
  );

export const tripStopSchema = candidatePlaceSchema.extend({
  arrivalTime: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(180),
  reason: z.string().min(1).max(1000),
  locked: z.boolean(),
  priority: z.enum(["required", "preferred", "optional"]).optional(),
});
export const routeLegSchema = z.object({
  from: z.string(),
  to: z.string(),
  durationMinutes: z.number().nonnegative(),
  distanceMeters: z.number().nonnegative(),
  path: z.array(locationSchema),
  mode: z.enum(["driving", "walking", "transit"]).optional(),
  steps: z
    .array(
      z.object({
        instruction: z.string(),
        mode: z.string(),
        durationMinutes: z.number().nonnegative(),
        line: z.string().optional(),
      }),
    )
    .optional(),
  warnings: z.array(z.string()).optional(),
});
export const weatherConditionSchema = z.enum([
  "clear",
  "cloudy",
  "rain",
  "snow",
]);
export const weatherContextSchema = z.object({
  location: locationSchema,
  forecastTime: z.iso.datetime({ offset: true }),
  temperatureCelsius: z.number(),
  precipitationProbability: z.number().min(0).max(100),
  condition: weatherConditionSchema,
});
export const bringAdviceSchema = z.object({
  warmth: z.enum([
    "hot",
    "warm",
    "mild",
    "hoodie",
    "jacket",
    "winter_jacket",
    "freezing",
  ]),
  precipitation: z.enum([
    "none",
    "maybe_umbrella",
    "bring_umbrella",
    "rain_gear",
    "snow_gear",
  ]),
  accessories: z.array(
    z.enum([
      "umbrella",
      "rain_jacket",
      "gloves_optional",
      "gloves",
      "hat",
      "waterproof_shoes",
    ]),
  ),
  message: z.string().min(1).max(300),
  facts: z.object({
    minTemperatureCelsius: z.number(),
    maxPrecipitationProbability: z.number().min(0).max(100),
    hasRain: z.boolean(),
    hasSnow: z.boolean(),
  }),
});
export const bringAdviceRequestSchema = z.object({
  weather: z.array(weatherContextSchema).max(96),
});
export const tripStateSchema = z.object({
  id: z.string(),
  request: tripRequestSchema,
  stops: z.array(tripStopSchema).max(6),
  legs: z.array(routeLegSchema).max(7),
  weather: z.array(weatherContextSchema).max(96).optional(),
  bringAdvice: bringAdviceSchema.optional(),
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
export type TripRequestInput = z.input<typeof tripRequestSchema>;
export type TripRequest = z.infer<typeof tripRequestSchema>;
export type CandidatePlace = z.infer<typeof candidatePlaceSchema>;
export type TripStop = z.infer<typeof tripStopSchema>;
export type RouteLeg = z.infer<typeof routeLegSchema>;
export type WeatherContext = z.infer<typeof weatherContextSchema>;
export type BringAdvice = z.infer<typeof bringAdviceSchema>;
export type TripState = z.infer<typeof tripStateSchema>;
export type TripEvent = z.infer<typeof replanRequestSchema>["event"];
export type ApiError = { error: { code: string; message: string } };
