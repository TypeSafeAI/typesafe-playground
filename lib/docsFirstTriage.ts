import { buildTriagePayload, resolveTriage } from "./classifyQuestionWithJev";
import { rankEvidence, splitDocs, toHistory } from "./matchEvidence";
import { parseTranscript } from "../web/conversation";
import type {
  DocSnippet,
  TriageInput,
  TriageRequest,
  JevResponse,
  EvidenceCandidate,
  ChatMessage,
} from "../types/triage";
export interface DocsFirstResult {
  candidates: EvidenceCandidate[];
  response: JevResponse;
  stage: "docs" | "community" | "no_match";
  docsChecked: number;
}
export async function runDocsFirst(
  input: TriageInput,
  official: DocSnippet[],
  classify: (request: TriageRequest) => Promise<JevResponse>,
  threshold: number,
  priorHistory?: ChatMessage[],
): Promise<DocsFirstResult> {
  const all = [...official, ...splitDocs(input.docs)];
  const ids = new Set(
    rankEvidence(input.question, [], all, 8).map((candidate) => candidate.id),
  );
  const docs = all.filter((doc) => ids.has(doc.id));
  let docsResult: DocsFirstResult | undefined;
  if (docs.length) {
    const request = buildTriagePayload(input.question, [], docs, input.model);
    docsResult = {
      candidates: request.candidates,
      response: await classify(request),
      stage: "docs",
      docsChecked: docs.length,
    };
    const decision = resolveTriage(
      docsResult.response,
      docsResult.candidates,
      threshold,
    );
    if (decision.outcome === "answerable_by_docs") return docsResult;
  }
  const history =
    priorHistory ??
    (input.transcript.trim()
      ? toHistory(
          parseTranscript(input.transcript, input.format).messages,
          input.historyLimit,
        )
      : []);
  if (!history.length) {
    return (
      docsResult ?? {
        candidates: [],
        response: {
          answers: {
            decision: { type: "choice", choice: "needs_human" },
          },
        },
        stage: "no_match",
        docsChecked: 0,
      }
    );
  }
  const request = buildTriagePayload(input.question, history, [], input.model);
  return {
    candidates: request.candidates,
    response: await classify(request),
    stage: "community",
    docsChecked: docs.length,
  };
}
