import { autocompleteInputSchema } from "@/types/place-search";
import { autocompletePlaces } from "@/lib/place-autocomplete";
import { handleApi, readJson } from "@/lib/server/http";
export async function POST(request: Request) {
  return handleApi(async () =>
    autocompletePlaces(autocompleteInputSchema.parse(await readJson(request))),
  );
}
