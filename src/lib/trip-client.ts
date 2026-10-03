import { validateWorkspace } from "@/lib/trip-workspace";
import type { ModificationBatch, WorkspaceTrip } from "@/types/workspace";
import {
  tripStateSchema,
  type ApiError,
  type TripEvent,
  type TripRequest,
  type TripState,
} from "@/types/trip";

async function postTrip(path: string, body: unknown): Promise<TripState> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      (result as ApiError).error?.message ||
        "We couldn't update your trip. Please try again.",
    );
  return tripStateSchema.parse(result);
}
// Keep transport outside visual components. Future service adapters belong here.
export const tripClient = {
  edit: async (state: WorkspaceTrip, batch: ModificationBatch) => {
    const response = await fetch("/api/trip-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, batch }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error?.message ?? "Route update failed.");
    return validateWorkspace(result);
  },
  plan: (request: TripRequest) => postTrip("/api/plan", request),
  replan: (tripState: TripState, event: TripEvent) =>
    postTrip("/api/replan", { tripState, event }),
};
