import type { NextConfig } from "next";

// Serve the dotted well-known / robots paths via normal route handlers.
const nextConfig: NextConfig = {
  transpilePackages: ["@ail/shared", "@ail/capability-manifest"],
  async rewrites() {
    return [
      { source: "/robots.txt", destination: "/robots-txt" },
      { source: "/.well-known/agent", destination: "/well-known/agent" },
      {
        source: "/.well-known/agent/capabilities/:id",
        destination: "/well-known/agent/capabilities/:id",
      },
    ];
  },
};

export default nextConfig;
