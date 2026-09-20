import { z } from "zod";
import { readBoundedBody } from "../../../lib/api";
import { requireLocalRebuild } from "../../../src/clean-room/local-only";
import {
  artifact,
  getDemoJob,
  publicJob,
  startDemoJob,
} from "../../../src/clean-room/jobs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const startSchema = z.object({
  demo: z.enum(["catalog", "contacts", "support"]),
  mode: z.enum(["mock", "live"]).default("mock"),
  viewport: z
    .object({
      width: z.number().int().min(320).max(2560),
      height: z.number().int().min(240).max(1800),
    })
    .optional(),
});
export async function POST(request: Request) {
  try {
    requireLocalRebuild(request);
    const input = startSchema.parse(
      JSON.parse(await readBoundedBody(request.body, 2048)),
    );
    return Response.json(
      await startDemoJob(input.demo, input.mode, input.viewport),
      {
        status: 202,
      },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not start rebuild" },
      { status: 400 },
    );
  }
}
export async function GET(request: Request) {
  try {
    requireLocalRebuild(request);
    const params = new URL(request.url).searchParams;
    const id = params.get("id") || "";
    if (params.has("artifact")) {
      const file = await artifact(id, params.get("artifact")!);
      return new Response(new Uint8Array(file.body), {
        headers: {
          "Content-Type": file.type,
          "Content-Disposition": `attachment; filename="${file.name}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return Response.json(publicJob(getDemoJob(id)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Run not found" },
      { status: 400 },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    requireLocalRebuild(request);
    const job = getDemoJob(new URL(request.url).searchParams.get("id") || "");
    if (job.status === "running")
      throw Error("Wait for verification to finish before closing this run.");
    await job.close?.();
    return Response.json(publicJob(job));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not close run" },
      { status: 400 },
    );
  }
}
