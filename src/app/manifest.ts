import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "pathwayve",
    short_name: "pathwayve",
    description: "Plan routes, choose stops, and make time for your day.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffefa",
    theme_color: "#829B55",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
