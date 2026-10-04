import { z } from "zod";
import { categories, locationSchema } from "./trip";
export const autocompleteInputSchema = z.object({
  query: z.string().trim().min(2).max(200),
  near: locationSchema.optional(),
  sessionToken: z.uuid(),
});
export const placeDetailsInputSchema = z.object({
  placeId: z.string().min(1).max(300),
  sessionToken: z.uuid(),
  category: z.enum(categories).default("attraction"),
});
export const predictionsSchema = z.object({
  source: z.enum(["demo", "live"]),
  suggestions: z.array(
    z.object({
      placeId: z.string(),
      name: z.string(),
      address: z.string(),
    }),
  ),
});
export type PlacePrediction = z.infer<
  typeof predictionsSchema
>["suggestions"][number];
