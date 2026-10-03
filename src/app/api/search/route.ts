import { placeSearchSchema, searchPlaces } from "@/lib/place-search";
import { handleApi, readJson } from "@/lib/server/http";
export async function POST(request: Request) {
  return handleApi(async () =>
    searchPlaces(placeSearchSchema.parse(await readJson(request))),
  );
}
