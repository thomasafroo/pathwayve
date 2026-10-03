/** Reserved contract for TransLink GTFS-Realtime integration. */
export interface TransitDelay {
  routeId: string;
  delayMinutes: number;
  observedAt: string;
  source: "translink";
}
