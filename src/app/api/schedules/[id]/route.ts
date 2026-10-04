import { z } from "zod";
import { readSchedule, readWorkspace } from "@/lib/schedule-repository";
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
    const owner = await scheduleOwner(),
      db = await getDatabase();
    const document = await readSchedule(db, owner, id);
    if (!document)
      throw new AppError(
        "NOT_FOUND",
        "Schedule not found in your account.",
        404,
      );
    return { document, workspace: await readWorkspace(db, owner, id) };
  });
}
