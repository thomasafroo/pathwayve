import { placeDetailsInputSchema } from "@/types/place-search";
import { resolvePlace } from "@/lib/place-autocomplete";
import { handleApi, readJson } from "@/lib/server/http";
export async function POST(request: Request) {
  return handleApi(async () =>
    resolvePlace(placeDetailsInputSchema.parse(await readJson(request))),
  );
}
