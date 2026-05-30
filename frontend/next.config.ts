import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // The API backend lives in the repo root; pin the workspace root to this
  // frontend folder so Next doesn't infer the parent lockfile as root.
  turbopack: {
    root: path.join(__dirname),
  },
  // Produce a minimal runtime bundle for Docker. `next start` from a
  // standalone build only ships what was actually imported.
  output: 'standalone',
};

export default nextConfig;
