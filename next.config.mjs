/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Playwright runtime-only (prevents bundling its assets in Next build).
  experimental: {
    serverComponentsExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  },
};

export default nextConfig;
