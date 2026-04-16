import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@selfbox/common",
    "@selfbox/database",
    "@selfbox/email",
    "@selfbox/storage",
  ],
  serverExternalPackages: ["re2", "just-bash"],
  allowedDevOrigins: ["selfbox.localhost"],
};

export default nextConfig;
