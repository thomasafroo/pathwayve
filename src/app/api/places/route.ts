import { tripRequestSchema } from "@/types/trip";
import { findPlaces } from "@/lib/places";
import { mapsMode } from "@/lib/server/env";
import { handleApi, readJson } from "@/lib/server/http";
export async function POST(request: Request) {
  return handleApi(async () => ({
    places: await findPlaces(tripRequestSchema.parse(await readJson(request))),
    source: mapsMode(),
  }));
}
