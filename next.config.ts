import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: [
    "z3-solver",
    "@playwright/test",
    "playwright",
    "playwright-core",
  ],
  outputFileTracingIncludes: {
    "/api/proposal-review": ["./fixtures/proposal-review/*.json"],
    "/proposal-review": ["./fixtures/proposal-review/*.json"],
    "/api/native-browser": [
      "./scripts/local-browser.py",
      "./lib/nativeBrowser/dom-runtime.js",
    ],
    "/api/native-browser/run": [
      "./scripts/local-browser.py",
      "./lib/nativeBrowser/dom-runtime.js",
    ],
    "/api/solve": [
      "./node_modules/z3-solver/build/**/*",
      "./node_modules/async-mutex/**/*",
    ],
  },
  turbopack: { root: process.cwd() },
  async redirects() {
    return [
      {
        source: "/conversation.html",
        destination: "/conversation",
        permanent: true,
      },
      { source: "/workflow.html", destination: "/workflow", permanent: true },
      {
        source: "/extraction.html",
        destination: "/extraction",
        permanent: true,
      },
    ];
  },
};
export default config;
