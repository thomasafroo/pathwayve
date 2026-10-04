import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./workspace.css";

const manrope = localFont({
  src: "../../public/brand/Manrope-VariableFont_wght.ttf",
  display: "swap",
  variable: "--font-manrope",
  weight: "200 800",
});

export const metadata: Metadata = {
  applicationName: "pathwayve",
  title: "pathwayve | Plan your trip",
  description: "Plan routes, choose stops, and make time for your day.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
