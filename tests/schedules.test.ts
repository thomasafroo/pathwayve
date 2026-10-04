import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { scheduleIntent, owner } from "./fixtures/schedule";
import { validateIntent } from "@/types/schedule";
import { materializeSchedule } from "@/lib/schedule-planning";
import {
  saveSchedule,
  deleteSchedule,
  readSchedule,
  findByRequest,
} from "@/lib/schedule-repository";
import type { Database } from "@/lib/server/database";
import { computeLeg } from "@/lib/routes";
import { AppError } from "@/lib/server/http";

vi.mock("@/lib/place-search", () => ({
  searchPlaces: vi.fn(async ({ query }: { query: string }) => ({
    source: "demo",
    places:
      query === "Missing"
        ? []
        : [
            {
              id: query,
              name: query,
              category: "coffee",
              location: {
                lat:
                  49.28 +
                  Array.from(query).reduce(
                    (sum, character) => sum + character.charCodeAt(0),
                    0,
                  ) /
                    100000,
                lng: -123.11,
              },
            },
          ],
  })),
}));
vi.mock("@/lib/routes", () => ({
  computeLeg: vi.fn(async (from, to) => ({
    from: from.name,
    to: to.name,
    durationMinutes: 10,
    distanceMeters: 700,
    path: [from.location, to.location],
    mode: "walking",
  })),
}));
let db: PGlite;
let database: Database;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(await readFile("db/migrations/001_schedules.sql", "utf8"));
  database = {
    query: (sql, params) => db.query(sql, params),
    transaction: (work) => db.transaction(work),
  };
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(() => {
  vi.mocked(computeLeg).mockClear();
  vi.stubEnv("MAPS_DATA_MODE", "demo");
});

describe("Gemini schedule validation", () => {
  it("rejects contradictory timing fields before SQL", () => {
    const draft = scheduleIntent();
    draft.schedule_items[0].fixed_start_at = draft.schedules[0].starts_at;
    expect(() => validateIntent(draft)).toThrow("Flexible");
  });
  it("rejects duplicate ordering positions and invalid schedule windows", () => {
    const draft = scheduleIntent();
    draft.schedule_items.push({ ...draft.schedule_items[0] });
    expect(() => validateIntent(draft)).toThrow("Duplicate");
    draft.schedule_items.pop();
    draft.schedules[0].ends_at = draft.schedules[0].starts_at;
    expect(() => validateIntent(draft)).toThrow("finish after");
  });
  it("accepts a clarification without manufacturing a schedule", () => {
    expect(
      validateIntent({
        schema_version: 1,
        clarification: "Where are you starting?",
        schedules: [],
        schedule_items: [],
      }).schedules,
    ).toHaveLength(0);
  });
});

describe("placing saved intentions", () => {
  it("handles an activity at the origin without requesting a route to itself", async () => {
    const draft = scheduleIntent();
    Object.assign(draft.schedule_items[0], {
      place_query: draft.schedules[0].origin_query,
      timing_type: "fixed",
      fixed_start_at: draft.schedules[0].starts_at,
    });
    const { document } = await materializeSchedule(draft, owner);
    expect(document.schedule_runs[0].status).toBe("feasible");
    expect(document.schedule_runs[0].result.placements).toHaveLength(1);
    expect(
      document.schedule_runs[0].result.travel_legs[0].duration_seconds,
    ).toBe(0);
    expect(
      vi
        .mocked(computeLeg)
        .mock.calls.every(([from, to]) => from.name !== to.name),
    ).toBe(true);
  });
  it("handles a destination activity and its final zero-travel leg", async () => {
    const draft = scheduleIntent();
    draft.schedule_items[0].place_query = draft.schedules[0].destination_query;
    const { document } = await materializeSchedule(draft, owner);
    expect(document.schedule_runs[0].status).toBe("feasible");
    expect(
      document.schedule_runs[0].result.travel_legs.at(-1)?.duration_seconds,
    ).toBe(0);
    expect(computeLeg).toHaveBeenCalledTimes(1);
  });
  it("preserves a known route error rather than reporting a generic outage", async () => {
    vi.mocked(computeLeg).mockRejectedValueOnce(
      new AppError(
        "NO_ROUTE",
        "No usable route was found between these stops.",
        422,
      ),
    );
    const { document } = await materializeSchedule(scheduleIntent(), owner);
    expect(document.schedule_runs[0].result.unscheduled_items[0]).toMatchObject(
      { reason_code: "NO_ROUTE" },
    );
    expect(document.schedule_runs[0].result.warnings.join(" ")).toContain(
      "No usable route",
    );
  });
  it("routes later ordered stops when an earlier required activity cannot fit", async () => {
    const draft = scheduleIntent();
    draft.schedule_items[0].place_query = "Missing";
    draft.schedule_items[0].priority = "required";
    draft.schedule_items.push({
      ...draft.schedule_items[0],
      title: "Locked second stop",
      place_query: "Library",
      preferred_sequence: 1,
      order_locked: true,
    });
    const { document } = await materializeSchedule(
      validateIntent(draft),
      owner,
    );
    expect(document.schedule_runs[0].status).toBe("infeasible");
    expect(document.schedule_runs[0].result.placements).toHaveLength(1);
    expect(document.schedule_runs[0].result.unscheduled_items).toHaveLength(1);
    expect(document.schedule_runs[0].result.map_trip?.stops[0].name).toBe(
      "Library",
    );
  });
  it("respects fixed appointments and computes travel independently", async () => {
    const draft = scheduleIntent();
    draft.schedule_items[0].timing_type = "fixed";
    draft.schedule_items[0].fixed_start_at = "2030-10-04T14:00:00-07:00";
    const { document, workspace } = await materializeSchedule(
      validateIntent(draft),
      owner,
    );
    expect(document.schedule_runs[0].result.placements[0].starts_at).toBe(
      "2030-10-04T21:00:00.000Z",
    );
    expect(document.schedule_runs[0].result.destination_arrival_at).toBe(
      "2030-10-04T21:40:00.000Z",
    );
    expect(workspace).toBeNull();
    expect(document.schedule_runs[0].result.map_trip?.legs).toHaveLength(2);
    expect(
      document.schedule_runs[0].result.map_trip?.stops[0].arrivalTime,
    ).toBe("2030-10-04T21:00:00.000Z");
  });
  it("preserves a required task with no place as unscheduled and infeasible", async () => {
    const draft = scheduleIntent();
    draft.schedule_items.push({
      ...draft.schedule_items[0],
      kind: "task",
      title: "Homework",
      place_query: null,
      priority: "required",
      preferred_sequence: 1,
    });
    const { document } = await materializeSchedule(draft, owner);
    expect(document.schedule_items).toHaveLength(2);
    expect(document.schedule_runs[0].status).toBe("infeasible");
    expect(
      document.schedule_runs[0].result.unscheduled_items[0].reason_code,
    ).toBe("NEEDS_PLACE");
  });
  it("does not claim requirements are satisfied from a place search", async () => {
    const draft = scheduleIntent();
    draft.schedule_items[0].kind = "task";
    draft.schedule_items[0].requirements.wifi = true;
    const { document } = await materializeSchedule(draft, owner);
    expect(
      document.schedule_runs[0].result.unscheduled_items[0].reason_code,
    ).toBe("REQUIREMENTS_UNVERIFIED");
  });
  it("keeps a missed appointment and marks the run infeasible", async () => {
    const draft = scheduleIntent();
    Object.assign(draft.schedule_items[0], {
      priority: "required",
      timing_type: "fixed",
      fixed_start_at: draft.schedules[0].starts_at,
    });
    const { document } = await materializeSchedule(draft, owner);
    expect(document.schedule_runs[0].status).toBe("infeasible");
    expect(document.schedule_runs[0].result.placements).toHaveLength(0);
    expect(document.schedule_items).toHaveLength(1);
  });
  it("saves failed routing honestly without inventing a route", async () => {
    vi.mocked(computeLeg).mockRejectedValueOnce(new Error("Unavailable"));
    const { document, workspace } = await materializeSchedule(
      scheduleIntent(),
      owner,
    );
    expect(document.schedule_runs[0].status).toBe("failed");
    expect(document.schedule_runs[0].result.map_trip).toBeUndefined();
    expect(document.schedule_runs[0].result.travel_legs).toHaveLength(0);
    expect(document.schedule_runs[0].result.unscheduled_items).toHaveLength(1);
    expect(workspace).toBeNull();
  });
});

describe("real PostgreSQL storage", () => {
  it("round-trips schedules, activities, and results using parameters", async () => {
    const draft = scheduleIntent();
    draft.schedule_items[0].title =
      "Coffee'); DROP TABLE pathwayve.schedules; --";
    const { document } = await materializeSchedule(draft, owner);
    const requestId = randomUUID();
    await saveSchedule(database, document, requestId);
    const restored = await readSchedule(
      database,
      owner,
      document.schedules[0].id,
    );
    expect(restored?.schedule_items[0].title).toBe(
      draft.schedule_items[0].title,
    );
    expect(restored?.schedule_runs[0].result).toEqual(
      document.schedule_runs[0].result,
    );
    expect(await findByRequest(database, owner, requestId)).toBe(
      document.schedules[0].id,
    );
    expect(
      await readSchedule(database, randomUUID(), document.schedules[0].id),
    ).toBeNull();
  });
  it("rolls back the entire schedule if a SQL constraint fails", async () => {
    const { document } = await materializeSchedule(scheduleIntent(), owner);
    // A database-level CHECK not covered by repository envelope validation.
    document.schedule_items[0].preferred_sequence = -1;
    // Direct transactional insertion demonstrates rollback after the parent was written.
    await expect(
      database.transaction(async (connection) => {
        await connection.query(
          "INSERT INTO pathwayve.schedules (id,user_id,request_id,name,origin_place_id,destination_place_id,starts_at,ends_at,time_zone,transportation,preferences,version,created_at,updated_at) VALUES ($1,$2,$3,'test','a','b',now(),now()+interval '1 hour','UTC','walking','{}',1,now(),now())",
          [document.schedules[0].id, owner, randomUUID()],
        );
        await connection.query(
          "INSERT INTO pathwayve.schedule_runs (id,schedule_id,schedule_version,calculated_at,status,result) VALUES ($1,$2,1,now(),'invalid','{}')",
          [randomUUID(), document.schedules[0].id],
        );
      }),
    ).rejects.toThrow();
    expect(
      await readSchedule(database, owner, document.schedules[0].id),
    ).toBeNull();
  });
  it("deduplicates repeated save requests per owner", async () => {
    const first = await materializeSchedule(scheduleIntent(), owner),
      second = await materializeSchedule(scheduleIntent(), owner);
    const requestId = randomUUID();
    await saveSchedule(database, first.document, requestId);
    await expect(
      saveSchedule(database, second.document, requestId),
    ).rejects.toThrow();
    expect(
      await readSchedule(database, owner, second.document.schedules[0].id),
    ).toBeNull();
  });
});

describe("manual schedule lifecycle", () => {
  it("deletes only the current owner's schedule and cascades its items and runs", async () => {
    const { document } = await materializeSchedule(scheduleIntent(), owner);
    const id = document.schedules[0].id;
    await saveSchedule(database, document, randomUUID());
    expect(await deleteSchedule(database, randomUUID(), id)).toBe(false);
    expect(await readSchedule(database, owner, id)).not.toBeNull();
    expect(await deleteSchedule(database, owner, id)).toBe(true);
    expect(await readSchedule(database, owner, id)).toBeNull();
    expect(
      (
        await database.query(
          "SELECT id FROM pathwayve.schedule_items WHERE schedule_id = $1",
          [id],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await database.query(
          "SELECT id FROM pathwayve.schedule_runs WHERE schedule_id = $1",
          [id],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("copies a draft with fresh IDs and retains its route snapshot", async () => {
    const { ownedSnapshot } = await import("@/lib/schedule-snapshot");
    const { document } = await materializeSchedule(scheduleIntent(), owner);
    const newOwner = randomUUID();
    const copy = ownedSnapshot(
      { requestId: randomUUID(), document, workspace: null },
      newOwner,
    );
    expect(copy.schedules[0].id).not.toBe(document.schedules[0].id);
    expect(copy.schedules[0].user_id).toBe(newOwner);
    await saveSchedule(database, copy, randomUUID());
    const loaded = await readSchedule(database, newOwner, copy.schedules[0].id);
    expect(loaded?.schedule_runs[0].result.map_trip?.stops).toEqual(
      document.schedule_runs[0].result.map_trip?.stops,
    );
    expect(copy.schedule_items[0].id).not.toBe(document.schedule_items[0].id);
  });
});
