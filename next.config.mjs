/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Playwright runtime-only (prevents bundling its assets in Next build).
  output: "standalone",
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/report/*/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  turbopack: { root: process.cwd() },
};

export default nextConfig;
