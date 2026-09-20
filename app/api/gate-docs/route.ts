import { lookupDocumentation } from "../../../lib/gateDocs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 100_000)
      return Response.json(
        { error: "Keep the documentation lookup under 100,000 characters." },
        { status: 413 },
      );
    const { questions } = JSON.parse(body);
    if (
      !Array.isArray(questions) ||
      !questions.length ||
      questions.length > 200 ||
      questions.some(
        (q) => typeof q !== "string" || !q.trim() || q.length > 4000,
      )
    )
      return Response.json(
        { error: "Provide 1–200 questions, each under 4,000 characters." },
        { status: 400 },
      );
    return Response.json(await lookupDocumentation(questions), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Official documentation could not be checked. Retry before routing this question.",
      },
      { status: 503 },
    );
  }
}
