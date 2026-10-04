import { z } from "zod";
import {
  locationSchema,
  endpointSchema,
  tripRequestSchema,
} from "@/types/trip";
import { computeLeg } from "@/lib/routes";
import { mapsMode } from "@/lib/server/env";
import { AppError, handleApi, readJson } from "@/lib/server/http";
const input = z.object({
  origin: locationSchema,
  destination: endpointSchema,
  transportation: z.enum(["walking", "driving", "transit"]),
});
export async function POST(request: Request) {
  return handleApi(async () => {
    if (mapsMode() !== "live")
      throw new AppError(
        "DEMO_ROUTE",
        "Navigation needs live Google Routes data.",
        422,
      );
    const value = input.parse(await readJson(request));
    const plan = tripRequestSchema.parse({
      origin: { name: "Your location", location: value.origin },
      destination: value.destination,
      transportation: value.transportation,
      activities: [],
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 24 * 3600000).toISOString(),
      routingPriority: "fastest",
    });
    return computeLeg(plan.origin, plan.destination, plan, plan.startTime);
  });
}
