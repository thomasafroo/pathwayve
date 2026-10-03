import { replanRequestSchema } from "@/types/trip";
import { replanTrip } from "@/lib/planner";
import { handleApi, readJson } from "@/lib/server/http";
export async function POST(request: Request) {
  return handleApi(async () => {
    const { tripState, event } = replanRequestSchema.parse(
      await readJson(request),
    );
    return replanTrip(tripState, event);
  });
}
