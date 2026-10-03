import { z } from "zod";
import {
  tripStateSchema,
  tripStopSchema,
  type RouteLeg,
  type TripStop,
} from "./trip";

// Additive frontend contract: existing /plan and /replan responses remain valid.
const activityBase = z.object({
  id: z.string().min(1),
  stopId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  durationMinutes: z.number().int().min(5).max(180),
});
export const activitySchema = z.discriminatedUnion("type", [
  activityBase.extend({ type: z.literal("USER_TASK"), completed: z.boolean() }),
  activityBase.extend({
    type: z.literal("AI_TASK"),
    status: z.enum(["pending", "running", "complete", "failed"]),
    result: z.string().max(10000).optional(),
  }),
]);
export const workspaceSchema = z.object({
  version: z.number().int().nonnegative(),
  trip: tripStateSchema,
  activities: z.array(activitySchema).max(30),
});
export const modificationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ADD_STOP"),
    stop: tripStopSchema,
    index: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("REMOVE_STOP"), stopId: z.string() }),
  z.object({
    type: z.literal("MOVE_STOP"),
    stopId: z.string(),
    newIndex: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("CHANGE_DURATION"),
    stopId: z.string(),
    minutes: z.number().int().min(5).max(180),
  }),
  z.object({
    type: z.literal("SET_LOCK"),
    stopId: z.string(),
    locked: z.boolean(),
  }),
  z.object({ type: z.literal("ADD_ACTIVITY"), activity: activitySchema }),
  z.object({ type: z.literal("REMOVE_ACTIVITY"), activityId: z.string() }),
  z.object({
    type: z.literal("COMPLETE_ACTIVITY"),
    activityId: z.string(),
    completed: z.boolean(),
  }),
]);
export const modificationBatchSchema = z.object({
  tripId: z.string(),
  baseVersion: z.number().int().nonnegative(),
  modifications: z.array(modificationSchema).min(1).max(30),
});
export type WorkspaceTrip = z.infer<typeof workspaceSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type TripModification = z.infer<typeof modificationSchema>;
export type ModificationBatch = z.infer<typeof modificationBatchSchema>;
export type ScheduleItem =
  | { type: "PLACE"; id: string; startTime: string; stop: TripStop }
  | { type: "TRANSIT"; id: string; startTime: string; leg: RouteLeg }
  | (Activity & { startTime: string });
