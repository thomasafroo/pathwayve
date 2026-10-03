import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
};
export default config;
