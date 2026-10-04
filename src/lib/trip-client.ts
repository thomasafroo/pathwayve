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
// Short-lived, tab-local versions; never reuse traffic/transit estimates indefinitely.
const planCache = new Map<string, { trip: TripState; expires: number }>();
const pendingPlans = new Map<string, Promise<TripState>>();
let cacheGeneration = 0;
export function clearPlanCache() {
  cacheGeneration++;
  planCache.clear();
  pendingPlans.clear();
}
export async function cachedPlan(request: TripRequest): Promise<TripState> {
  const generation = cacheGeneration;
  const key = JSON.stringify(request);
  const cached = planCache.get(key);
  if (cached && cached.expires > Date.now())
    return structuredClone(cached.trip);
  const pending = pendingPlans.get(key);
  if (pending) return structuredClone(await pending);
  const work = postTrip("/api/plan", request);
  pendingPlans.set(key, work);
  try {
    const trip = await work;
    if (generation !== cacheGeneration) return trip;
    if (planCache.size >= 20) planCache.delete(planCache.keys().next().value!);
    planCache.set(key, {
      trip: structuredClone(trip),
      expires: Date.now() + 60_000,
    });
    return trip;
  } finally {
    if (pendingPlans.get(key) === work) pendingPlans.delete(key);
  }
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
  plan: cachedPlan,
  replan: (tripState: TripState, event: TripEvent) =>
    postTrip("/api/replan", { tripState, event }),
};
