import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ail/shared",
    "@ail/capability-manifest",
    "@ail/capability-client",
    "@ail/agent-core",
    "@ail/mcp-servers",
  ],
};

export default nextConfig;
