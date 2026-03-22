import path from "node:path";

/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "@semaphore-protocol/group",
    "@semaphore-protocol/identity",
    "@semaphore-protocol/proof",
    "snarkjs"
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        "@semaphore-protocol/proof$": path.resolve(
          process.cwd(),
          "node_modules",
          "@semaphore-protocol",
          "proof",
          "dist",
          "index.node.cjs"
        )
      };
    }

    return config;
  }
};

export default nextConfig;
