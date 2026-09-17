import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright / Lighthouse 使用原生 Node API，需避免被打包
  serverExternalPackages: ["playwright", "playwright-core", "lighthouse"],
};

export default nextConfig;
