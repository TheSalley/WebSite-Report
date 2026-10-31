import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright / Lighthouse 使用原生 Node API，需避免被打包
  serverExternalPackages: ["playwright", "playwright-core", "lighthouse"],
  // 允许局域网内其他电脑访问 dev 开发服务器（HMR/字体/API 不再被 403/拒绝）
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.10.113"],
};

export default nextConfig;
