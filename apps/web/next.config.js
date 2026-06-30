/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile the workspace packages so Next.js processes their TS source
  transpilePackages: ["@nepal-journey/types"],
};

module.exports = nextConfig;
