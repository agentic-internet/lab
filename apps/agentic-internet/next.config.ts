import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ail/shared", "@ail/capability-manifest", "@ail/capability-client"],
};

export default nextConfig;
