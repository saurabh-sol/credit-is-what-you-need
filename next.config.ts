import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Base Account SDK is only ever loaded in the browser, when a user picks
  // it in the wallet list. Its Node entry drags in Coinbase's server SDK and
  // optional payment packages, so keep it out of the server bundle.
  serverExternalPackages: ["@base-org/account"],

  // Keys are meant to work from any tool, including ones that run in a browser
  // (Postman's web app, a playground on someone's own site), so the API answers
  // cross-origin requests and lets them read the billing headers.
  async headers() {
    return [
      {
        source: "/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Access-Control-Expose-Headers", value: "x-kredit-credits-charged, x-kredit-balance" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
