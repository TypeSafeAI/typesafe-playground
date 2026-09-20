/** Next may canonicalize request.url to localhost; the browser uses the actual Host. */
export function requireLocalRebuild(request: Request) {
  const canonical = new URL(request.url);
  const actual = new URL(
    `${canonical.protocol}//${request.headers.get("host") || canonical.host}`,
  );
  const loopback = (url: URL) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    !url.username &&
    !url.password;
  if (
    process.env.VERCEL ||
    !loopback(canonical) ||
    !loopback(actual) ||
    (request.headers.get("origin") &&
      request.headers.get("origin") !== actual.origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw Error(
      "Clean-room browser runs are available only from this app running on localhost.",
    );
  }
}
