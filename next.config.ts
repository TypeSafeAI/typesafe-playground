import type { NextConfig } from "next";
import { legacyRedirects, workspacePath } from "./lib/routes";
const config: NextConfig = {
  serverExternalPackages: [
    "z3-solver",
    "@playwright/test",
    "playwright",
    "playwright-core",
  ],
  outputFileTracingIncludes: {
    "/api/proposal-review": ["./fixtures/proposal-review/*.json"],
    [workspacePath("proposal-review")]: ["./fixtures/proposal-review/*.json"],
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
      // Pre-Next static pages go straight to their current home, skipping
      // the flat-route hop below.
      {
        source: "/conversation.html",
        destination: workspacePath("conversation"),
        permanent: true,
      },
      {
        source: "/workflow.html",
        destination: workspacePath("workflow"),
        permanent: true,
      },
      {
        source: "/extraction.html",
        destination: workspacePath("extraction"),
        permanent: true,
      },
      // Flat workspace routes, such as /jev-chat, now live under a section.
      ...legacyRedirects(),
    ];
  },
};
export default config;
