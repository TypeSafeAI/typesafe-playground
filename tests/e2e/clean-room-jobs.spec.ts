import { test, expect } from "@playwright/test";

test("concurrent demo admission reserves two slots and close is idempotent", async ({
  request,
}) => {
  test.setTimeout(120000);
  const jobs: string[] = [];
  try {
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        request.post("/api/clean-room", {
          data: { demo: "support", mode: "mock" },
        }),
      ),
    );
    const statuses = responses.map((response) => response.status()).sort();
    for (const response of responses) {
      const body = await response.json();
      if (response.ok()) jobs.push(body.id);
      else expect(body.error).toContain("Two rebuilds");
    }
    expect(statuses).toEqual([202, 202, 400]);
    for (const id of jobs) {
      await expect
        .poll(
          async () =>
            (await (await request.get(`/api/clean-room?id=${id}`)).json())
              .status,
          { timeout: 90000 },
        )
        .toBe("passed");
      for (let count = 0; count < 2; count++) {
        const response = await request.delete(`/api/clean-room?id=${id}`);
        expect(response.ok()).toBeTruthy();
        expect((await response.json()).status).toBe("closed");
      }
    }
  } finally {
    for (const id of jobs) {
      await expect
        .poll(
          async () =>
            (await (await request.get(`/api/clean-room?id=${id}`)).json())
              .status,
          { timeout: 90000 },
        )
        .not.toBe("running");
      await request.delete(`/api/clean-room?id=${id}`);
    }
  }
});
