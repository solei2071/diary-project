/** @type {import("next").NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  output: "export",
  images: {
    unoptimized: true
  }
};

export default nextConfig;
