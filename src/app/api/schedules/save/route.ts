import { z } from "zod";
import {
  documentSchema,
  copyDocument,
  workspaceDocument,
} from "@/lib/schedule-snapshots";
import { workspaceSchema } from "@/types/workspace";
import { validateWorkspace } from "@/lib/trip-workspace";
import {
  findByRequest,
  readSchedule,
  saveSchedule,
  validateDocument,
} from "@/lib/schedule-repository";
import { getDatabase } from "@/lib/server/database";
import { checkOrigin, scheduleOwner } from "@/lib/server/schedule-session";
import { handleApi, readJson } from "@/lib/server/http";
const schema = z.union([
  z.object({ requestId: z.uuid(), document: documentSchema }),
  z.object({ requestId: z.uuid(), workspace: workspaceSchema }),
]);
export async function POST(request: Request) {
  return handleApi(async () => {
    checkOrigin(request);
    const input = schema.parse(await readJson(request)),
      owner = await scheduleOwner(),
      database = await getDatabase();
    const previous = await findByRequest(database, owner, input.requestId);
    if (previous) return readSchedule(database, owner, previous);
    if ("document" in input) validateDocument(input.document);
    const document =
      "document" in input
        ? copyDocument(input.document, owner)
        : workspaceDocument(validateWorkspace(input.workspace), owner);
    try {
      await saveSchedule(database, document, input.requestId);
    } catch (error) {
      const concurrent = await findByRequest(database, owner, input.requestId);
      if (concurrent) return readSchedule(database, owner, concurrent);
      throw error;
    }
    return document;
  });
}
