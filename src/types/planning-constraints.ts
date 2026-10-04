import { z } from "zod";
import { endpointSchema, candidatePlaceSchema, categories } from "./trip";
export const planningConstraintsSchema = z
  .object({
    origin: endpointSchema.nullable(),
    destination: endpointSchema.nullable(),
    transportation: z.enum(["walking", "driving", "transit"]),
    selectedStops: z
      .array(
        candidatePlaceSchema.extend({
          durationMinutes: z.number().int().min(5).max(180),
          locked: z.boolean(),
        }),
      )
      .max(6)
      .refine(
        (stops) => new Set(stops.map((s) => s.id)).size === stops.length,
        "Choose each stop once.",
      ),
    startTime: z.iso.datetime({ offset: true }).optional(),
    endTime: z.iso.datetime({ offset: true }).optional(),
    timeZone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Invalid timezone."),
    orderPolicy: z.enum(["preserve", "optimize"]).optional(),
    routingPriority: z.enum(["fastest", "less_walking", "fewer_transfers"]),
    budget: z.enum(["any", "budget", "moderate", "premium"]),
    activities: z.array(z.enum(categories)).max(6),
    interestTags: z.array(z.string().max(80)).max(20),
    preferences: z.string().max(1000),
    routeRadiusMeters: z.number().int().min(100).max(5000).default(1000),
  })
  .refine(
    (value) =>
      !value.startTime ||
      !value.endTime ||
      Date.parse(value.endTime) > Date.parse(value.startTime),
    "Finish time must be after departure.",
  );
export type PlanningConstraints = z.infer<typeof planningConstraintsSchema>;
