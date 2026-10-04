import "server-only";
import {
  savedItemSchema,
  savedScheduleSchema,
  type ScheduleDocument,
  type SavedRun,
} from "@/types/schedule";
import type { Database, SqlConnection } from "./server/database";
import { workspaceSchema, type WorkspaceTrip } from "@/types/workspace";

const scheduleColumns = [
  "id",
  "user_id",
  "name",
  "origin_place_id",
  "destination_place_id",
  "starts_at",
  "ends_at",
  "time_zone",
  "transportation",
  "preferences",
  "version",
  "created_at",
  "updated_at",
] as const;
const itemColumns = [
  "id",
  "schedule_id",
  "kind",
  "title",
  "place_id",
  "place_query",
  "duration_minutes",
  "priority",
  "timing_type",
  "fixed_start_at",
  "earliest_start_at",
  "latest_end_at",
  "preferred_sequence",
  "order_locked",
  "requirements",
] as const;
const runColumns = [
  "id",
  "schedule_id",
  "schedule_version",
  "calculated_at",
  "status",
  "result",
] as const;

// Table/column names come ONLY from static application constants, never Gemini.
async function insert(
  connection: SqlConnection,
  table: "schedules" | "schedule_items" | "schedule_runs",
  columns: readonly string[],
  values: unknown[],
) {
  await connection.query(
    `INSERT INTO pathwayve.${table} (${columns.join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})`,
    values.map((value) =>
      value !== null && typeof value === "object"
        ? JSON.stringify(value)
        : value,
    ),
  );
}
export function validateDocument(document: ScheduleDocument) {
  if (
    document.schema_version !== 1 ||
    document.schedules.length !== 1 ||
    document.schedule_runs.length !== 1
  )
    throw new Error("Invalid schedule envelope.");
  const schedule = savedScheduleSchema.parse(document.schedules[0]);
  const items = document.schedule_items.map((item) =>
    savedItemSchema.parse(item),
  );
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some((item) => item.schedule_id !== schedule.id)
  )
    throw new Error("Invalid item references.");
  const run = document.schedule_runs[0];
  if (
    run.schedule_id !== schedule.id ||
    run.schedule_version !== schedule.version
  )
    throw new Error("Invalid run reference.");
  const assignments = [
    ...run.result.placements.map((p) => p.item_id),
    ...run.result.unscheduled_items.map((p) => p.item_id),
  ];
  if (
    assignments.length !== items.length ||
    new Set(assignments).size !== items.length ||
    assignments.some((id) => !items.some((item) => item.id === id))
  )
    throw new Error("Every item must be placed or unscheduled exactly once.");
  for (const [index, placement] of run.result.placements.entries()) {
    const item = items.find((item) => item.id === placement.item_id)!;
    if (
      placement.sequence !== index ||
      placement.place_id !== item.place_id ||
      Date.parse(placement.ends_at) - Date.parse(placement.starts_at) !==
        item.duration_minutes * 60000
    )
      throw new Error("Invalid placement.");
  }
  if (
    run.status === "feasible" &&
    (run.result.unscheduled_items.some((missing) =>
      items.some(
        (item) =>
          item.id === missing.item_id &&
          (item.priority === "required" || item.order_locked),
      ),
    ) ||
      !run.result.destination_arrival_at ||
      Date.parse(run.result.destination_arrival_at) >
        Date.parse(schedule.ends_at))
  )
    throw new Error(
      "Required activities and destination must fit a feasible plan.",
    );
}
export async function saveSchedule(
  database: Database,
  document: ScheduleDocument,
  requestId: string,
  workspace: WorkspaceTrip | null = null,
): Promise<void> {
  validateDocument(document);
  await database.transaction(async (connection) => {
    const schedule = document.schedules[0];
    await insert(
      connection,
      "schedules",
      [...scheduleColumns, "request_id"],
      [...scheduleColumns.map((column) => schedule[column]), requestId],
    );
    if (workspace)
      await connection.query(
        "UPDATE pathwayve.schedules SET workspace = $1 WHERE id = $2 AND user_id = $3",
        [
          JSON.stringify(workspaceSchema.parse(workspace)),
          schedule.id,
          schedule.user_id,
        ],
      );
    for (const item of document.schedule_items)
      await insert(
        connection,
        "schedule_items",
        itemColumns,
        itemColumns.map((column) => item[column]),
      );
    const run = document.schedule_runs[0];
    await insert(
      connection,
      "schedule_runs",
      runColumns,
      runColumns.map((column) => run[column]),
    );
  });
}
export async function readWorkspace(
  database: SqlConnection,
  owner: string,
  id: string,
) {
  const result = await database.query<{ workspace: unknown }>(
    "SELECT workspace FROM pathwayve.schedules WHERE id = $1 AND user_id = $2",
    [id, owner],
  );
  return result.rows[0]?.workspace
    ? workspaceSchema.parse(result.rows[0].workspace)
    : null;
}
export async function findByRequest(
  database: SqlConnection,
  owner: string,
  requestId: string,
) {
  const result = await database.query<{ id: string }>(
    "SELECT id FROM pathwayve.schedules WHERE user_id = $1 AND request_id = $2",
    [owner, requestId],
  );
  return result.rows[0]?.id;
}
export async function listSchedules(database: SqlConnection, owner: string) {
  const result = await database.query(
    "SELECT s.id, s.name, s.starts_at, s.ends_at, s.updated_at, r.status FROM pathwayve.schedules s LEFT JOIN LATERAL (SELECT status FROM pathwayve.schedule_runs WHERE schedule_id = s.id ORDER BY calculated_at DESC LIMIT 1) r ON true WHERE s.user_id = $1 ORDER BY s.updated_at DESC LIMIT 30",
    [owner],
  );
  return result.rows;
}
export async function readSchedule(
  database: SqlConnection,
  owner: string,
  id: string,
): Promise<ScheduleDocument | null> {
  const result = await database.query<{ schedule: unknown }>(
    "SELECT to_jsonb(s) - 'request_id' AS schedule FROM pathwayve.schedules s WHERE id = $1 AND user_id = $2",
    [id, owner],
  );
  if (!result.rows[0]) return null;
  const schedule = savedScheduleSchema.parse(result.rows[0].schedule);
  const items = await database.query<{ item: unknown }>(
    "SELECT to_jsonb(i) AS item FROM pathwayve.schedule_items i WHERE schedule_id = $1 ORDER BY preferred_sequence NULLS LAST, id",
    [id],
  );
  const runs = await database.query<{ run: SavedRun }>(
    "SELECT to_jsonb(r) AS run FROM pathwayve.schedule_runs r WHERE schedule_id = $1 ORDER BY calculated_at DESC LIMIT 1",
    [id],
  );
  return {
    schema_version: 1,
    schedules: [schedule],
    schedule_items: items.rows.map((row) => savedItemSchema.parse(row.item)),
    schedule_runs: runs.rows.map((row) => row.run),
  };
}

export async function deleteSchedule(
  database: SqlConnection,
  owner: string,
  id: string,
) {
  const result = await database.query(
    "DELETE FROM pathwayve.schedules WHERE id = $1 AND user_id = $2 RETURNING id",
    [id, owner],
  );
  return result.rows.length > 0;
}
