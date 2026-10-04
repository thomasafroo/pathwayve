import "server-only";
import {
  providerHoursFields,
  hoursFieldMask,
  readOpeningHours,
} from "@/types/opening-hours";
import { z } from "zod";
import { candidatePlaceSchema, locationSchema, categories } from "@/types/trip";
import { mapsMode, requireEnv } from "./server/env";
import { googlePost } from "./server/http";
import { demoPlaces, endpoints } from "./fixtures";

export const placeSearchSchema = z.object({
  query: z.string().trim().min(2).max(200),
  category: z.enum(categories).default("attraction"),
  near: locationSchema.optional(),
  radiusMeters: z.number().min(100).max(50000).optional(),
  budget: z.enum(["any", "budget", "moderate", "premium"]).default("any"),
});
const googlePlacesSchema = z.object({
  places: z
    .array(
      z.object({
        ...providerHoursFields,
        id: z.string(),
        displayName: z.object({ text: z.string() }),
        location: z
          .object({ latitude: z.number(), longitude: z.number() })
          .optional(),
        formattedAddress: z.string().optional(),
        rating: z.number().optional(),
        userRatingCount: z.number().optional(),
        priceLevel: z.string().optional(),
        googleMapsUri: z.string().optional(),
      }),
    )
    .default([]),
});
export async function searchPlaces(input: z.infer<typeof placeSearchSchema>) {
  if (mapsMode() === "demo") {
    const all = [
      ...demoPlaces,
      ...endpoints.map((p, i) => ({
        ...p,
        id: `demo-endpoint-${i}`,
        category: "attraction" as const,
      })),
    ];
    const words = input.query.toLowerCase().split(/\s+/);
    return {
      source: "demo" as const,
      places: all
        .filter((p) =>
          words.some((word) =>
            `${p.name} ${p.category}`.toLowerCase().includes(word),
          ),
        )
        .map((p) => ({
          ...p,
          attribution: "Fictional demo / sample endpoint",
        })),
    };
  }
  const result = googlePlacesSchema.parse(
    await googlePost(
      "https://places.googleapis.com/v1/places:searchText",
      requireEnv("GOOGLE_MAPS_SERVER_API_KEY"),
      `places.id,places.displayName,places.location,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,${hoursFieldMask
        .split(",")
        .map((field) => `places.${field}`)
        .join(",")}`,
      {
        textQuery: input.query,
        pageSize: 10,
        ...(input.near
          ? {
              locationBias: {
                circle: {
                  center: {
                    latitude: input.near.lat,
                    longitude: input.near.lng,
                  },
                  radius: input.radiusMeters ?? 10000,
                },
              },
            }
          : {}),
        ...(input.budget === "budget"
          ? { priceLevels: ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE"] }
          : input.budget === "moderate"
            ? { priceLevels: ["PRICE_LEVEL_MODERATE"] }
            : input.budget === "premium"
              ? {
                  priceLevels: [
                    "PRICE_LEVEL_EXPENSIVE",
                    "PRICE_LEVEL_VERY_EXPENSIVE",
                  ],
                }
              : {}),
      },
    ),
  );
  return {
    source: "live" as const,
    places: result.places
      .filter((p) => p.location)
      .map((p) =>
        candidatePlaceSchema.parse({
          id: p.id,
          name: p.displayName.text,
          category: input.category,
          location: { lat: p.location!.latitude, lng: p.location!.longitude },
          address: p.formattedAddress,
          rating: p.rating,
          ratingCount: p.userRatingCount,
          priceLevel: p.priceLevel,
          mapsUrl: p.googleMapsUri,
          attribution: "Google Maps",
          openingHours: readOpeningHours(p),
        }),
      ),
  };
}
