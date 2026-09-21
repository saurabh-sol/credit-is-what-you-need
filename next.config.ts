import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image runs the traced server in .next/standalone, without
  // node_modules. `npm run start` (Render) is unaffected.
  output: "standalone",
  // The Base Account SDK is only ever loaded in the browser, when a user picks
  // it in the wallet list. Its Node entry drags in Coinbase's server SDK and
  // optional payment packages, so keep it out of the server bundle.
  serverExternalPackages: ["@base-org/account"],
};

export default nextConfig;
