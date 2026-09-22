import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image runs the traced server in .next/standalone, without
  // node_modules. `npm run start` (Render) is unaffected.
  output: "standalone",
  // The Base Account SDK is only ever loaded in the browser, when a user picks
  // it in the wallet list. Its Node entry drags in Coinbase's server SDK and
  // optional payment packages, so keep it out of the server bundle.
  // pg is a plain Node driver (it opens sockets); leave it to Node too.
  serverExternalPackages: ["@base-org/account", "pg"],
  // The legal pages live in the docs tree; these are the short addresses.
  async redirects() {
    return [
      { source: "/privacy", destination: "/docs/legal/privacy", permanent: true },
      { source: "/terms", destination: "/docs/legal/terms", permanent: true },
      { source: "/fairness", destination: "/docs/legal/fairness", permanent: true },
      // The model board moved into the catalog.
      { source: "/models", destination: "/catalog", permanent: true },
    ];
  },
};

export default nextConfig;
