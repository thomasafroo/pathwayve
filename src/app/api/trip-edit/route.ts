import { z } from "zod";
import { workspaceSchema, modificationBatchSchema } from "@/types/workspace";
import { applyModifications, validateWorkspace } from "@/lib/trip-workspace";
import { scheduleTrip } from "@/lib/routes";
import { mapsMode } from "@/lib/server/env";
import { handleApi, readJson, AppError } from "@/lib/server/http";
const schema = z.object({
  state: workspaceSchema,
  batch: modificationBatchSchema,
});
export const maxDuration = 180;
export async function POST(request: Request) {
  return handleApi(async () => {
    const { state, batch } = schema.parse(await readJson(request));
    if (state.trip.source !== mapsMode())
      throw new AppError(
        "MODE_CHANGED",
        "Data mode changed. Create a new trip before editing.",
      );
    let next;
    try {
      next = applyModifications(state, batch, { deferRouting: true });
    } catch (error) {
      throw new AppError(
        "INVALID_MODIFICATION",
        error instanceof Error ? error.message : "Invalid trip modification.",
        422,
      );
    }
    if (
      batch.modifications.some((m) =>
        ["ADD_STOP", "REMOVE_STOP", "MOVE_STOP", "CHANGE_DURATION"].includes(
          m.type,
        ),
      )
    ) {
      const scheduled = await scheduleTrip(next.trip.request, next.trip.stops);
      if (
        Date.parse(scheduled.arrivalTime) >
        Date.parse(next.trip.request.endTime)
      )
        throw new AppError(
          "TIME_WINDOW",
          "This change would finish after your deadline. Shorten a stop or allow more time.",
          422,
        );
      next.trip = { ...next.trip, ...scheduled };
    }
    return validateWorkspace(next);
  });
}
