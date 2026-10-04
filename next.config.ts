import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
};
export default config;
