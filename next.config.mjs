/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Playwright runtime-only (prevents bundling its assets in Next build).
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  },
};

export default nextConfig;
