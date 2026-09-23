/** Shared types, with the review payload as the compatibility transport default. */
import type { RunPayload } from "../vendor/jev-harness/src/contract/payload";
import type { JevTransport as SharedJevTransport } from "../vendor/jev-harness/src/contract/types";
export * from "../vendor/jev-harness/src/contract/types";
export type JevTransport<P = RunPayload> = SharedJevTransport<P>;
