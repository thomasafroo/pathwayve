import { z } from "zod";
import { readSchedule } from "@/lib/schedule-repository";
import { getDatabase } from "@/lib/server/database";
import { scheduleOwner } from "@/lib/server/schedule-session";
import { AppError, handleApi } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApi(async () => {
    const id = z.uuid().parse((await context.params).id);
    const document = await readSchedule(
      await getDatabase(),
      await scheduleOwner(),
      id,
    );
    if (!document)
      throw new AppError(
        "NOT_FOUND",
        "Schedule not found in this browser session.",
        404,
      );
    return document;
  });
}
