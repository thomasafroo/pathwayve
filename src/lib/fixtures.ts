import type { CandidatePlace, TripRequest } from "@/types/trip";

export const endpoints = [
  { name: "SFU Burnaby", location: { lat: 49.2781, lng: -122.9199 } },
  { name: "Downtown Vancouver", location: { lat: 49.2827, lng: -123.1207 } },
  { name: "Waterfront Station", location: { lat: 49.2859, lng: -123.1116 } },
];
// Fictional venues for repeatable, key-free development. Never show as live Places results.
export const demoPlaces: CandidatePlace[] = [
  {
    id: "demo-coffee",
    name: "The Morning Cup",
    category: "coffee",
    location: { lat: 49.281, lng: -123.071 },
  },
  {
    id: "demo-park",
    name: "Harbour Green Break",
    category: "park",
    location: { lat: 49.289, lng: -123.119 },
  },
  {
    id: "demo-bookstore",
    name: "Paper Trail Books",
    category: "bookstore",
    location: { lat: 49.279, lng: -123.103 },
  },
  {
    id: "demo-food",
    name: "Little Noodle Kitchen",
    category: "food",
    location: { lat: 49.28, lng: -123.11 },
  },
  {
    id: "demo-shopping",
    name: "Neighbourhood Market",
    category: "shopping",
    location: { lat: 49.283, lng: -123.108 },
  },
  {
    id: "demo-attraction",
    name: "City Lookout",
    category: "attraction",
    location: { lat: 49.284, lng: -123.113 },
  },
];
export function exampleRequest(): TripRequest {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setSeconds(0, 0);
  return {
    timeZone: "America/Vancouver",
    origin: endpoints[0],
    destination: endpoints[1],
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 7 * 60 * 60 * 1000).toISOString(),
    transportation: "transit",
    activities: ["coffee", "park", "bookstore", "food"],
    preferences: "Local places and inexpensive food",
  };
}
