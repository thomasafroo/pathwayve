import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PathWayve — Make a day of it",
  description: "An adaptive AI trip planner built for StormHacks.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
