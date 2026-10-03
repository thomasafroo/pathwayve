import { tripRequestSchema } from "@/types/trip";
import { planTrip } from "@/lib/planner";
import { handleApi, readJson } from "@/lib/server/http";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  return handleApi(async () =>
    planTrip(tripRequestSchema.parse(await readJson(request))),
  );
}
