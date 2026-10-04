import { saveRequestSchema } from "@/types/schedule";
import { ownedSnapshot } from "@/lib/schedule-snapshot";
import {
  findByRequest,
  listSchedules,
  readSchedule,
  readWorkspace,
  saveSchedule,
} from "@/lib/schedule-repository";
import { getDatabase } from "@/lib/server/database";
import { checkOrigin, scheduleOwner } from "@/lib/server/schedule-session";
import { AppError, handleApi, readJson } from "@/lib/server/http";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET() {
  return handleApi(async () => {
    const owner = await scheduleOwner();
    return listSchedules(await getDatabase(), owner);
  });
}
export async function POST(request: Request) {
  return handleApi(async () => {
    checkOrigin(request);
    const owner = await scheduleOwner();
    const input = saveRequestSchema.parse(await readJson(request));
    const db = await getDatabase();
    const previous = await findByRequest(db, owner, input.requestId);
    if (previous)
      return {
        document: await readSchedule(db, owner, previous),
        workspace: await readWorkspace(db, owner, previous),
      };
    const saved = {
      document: ownedSnapshot(input, owner),
      workspace: input.workspace,
    };
    try {
      await saveSchedule(db, saved.document, input.requestId, saved.workspace);
    } catch {
      const concurrent = await findByRequest(db, owner, input.requestId);
      if (concurrent)
        return {
          document: await readSchedule(db, owner, concurrent),
          workspace: await readWorkspace(db, owner, concurrent),
        };
      throw new AppError(
        "SAVE_FAILED",
        "The schedule could not be saved. Retry this prompt; no partial schedule was committed.",
        503,
      );
    }
    return saved;
  });
}
