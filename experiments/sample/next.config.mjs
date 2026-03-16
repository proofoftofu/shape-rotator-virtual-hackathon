/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "@semaphore-protocol/group",
    "@semaphore-protocol/identity",
    "@semaphore-protocol/proof",
    "snarkjs"
  ]
};

export default nextConfig;
