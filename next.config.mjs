/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Playwright runtime-only (prevents bundling its assets in Next build).
  output: "standalone",
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
