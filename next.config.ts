import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/mcp": ["./src/lib/mcp/skills/**/*", "./public/mcp-icon.png"],
    "/api/mcp/bundles/[target]": ["./src/lib/mcp/skills/**/*", "./public/mcp-icon.png"],
  },
};

export default nextConfig;
