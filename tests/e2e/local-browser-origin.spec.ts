import { test, expect } from "@playwright/test";

test("the real Next server accepts its loopback origin without starting a browser", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(
    "/api/local-browser?id=origin-regression-no-session",
    {
      headers: {
        origin: new URL(baseURL!).origin,
        "sec-fetch-site": "same-origin",
      },
    },
  );
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain(
    "Local browser session not found",
  );
});

test("the real Next server refuses cross-origin browser access", async ({
  request,
}) => {
  const response = await request.get(
    "/api/local-browser?id=origin-regression-no-session",
    {
      headers: {
        origin: "https://untrusted.example",
        "sec-fetch-site": "cross-site",
      },
    },
  );
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain(
    "only from this app running on localhost",
  );
});
